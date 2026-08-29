import { AppError, mapHttpError } from "@/lib/shared/errors";

export const HF_BASE = "https://api.higgsfield.ai";

/**
 * CLOUDFLARE BLOQUEA POR USER-AGENT. Esto no está documentado en ningún lado.
 *
 * Durante la investigación, las 48 rutas devolvieron `403 error code: 1010` desde
 * Python urllib, y exactamente las mismas peticiones devolvieron 200 desde curl y
 * desde fetch de Node con un User-Agent explícito. 1010 es el código de Cloudflare
 * para "firma de navegador baneada".
 *
 * O sea: si esta cabecera se cae, la app entera devuelve 403 y parece un problema
 * de credenciales cuando no lo es. Va en UNA sola función, y también en el PUT
 * prefirmado. No la quites.
 */
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 AvatarAppKit/0.1";

const DEFAULT_TIMEOUT_MS = 30_000;

export interface HfResult<T> {
  data: T;
  correlationId: string | null;
  status: number;
}

function joinSignals(signal?: AbortSignal, timeoutMs = DEFAULT_TIMEOUT_MS): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export interface HfFetchOptions {
  path?: string;
  /** URL absoluta (status_url / cancel_url de la propia API). Validar antes con isProviderUrl. */
  url?: string;
  method: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function hfFetch<T>(token: string, opts: HfFetchOptions): Promise<HfResult<T>> {
  const url = opts.url ?? `${HF_BASE}${opts.path ?? ""}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method,
      headers: {
        Authorization: `Key ${token}`,
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: joinSignals(opts.signal, opts.timeoutMs),
      cache: "no-store",
    });
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    throw new AppError(
      "network",
      aborted ? "The request to Higgsfield timed out." : "Couldn't reach Higgsfield.",
      { retryable: opts.method === "GET" },
    );
  }

  // Se registra en éxito y en fallo: es el identificador que pide su soporte.
  const correlationId = res.headers.get("X-Correlation-ID");
  const body = await readBody(res);

  if (!res.ok) {
    const detail =
      body && typeof body === "object" && "detail" in body
        ? (body as { detail: unknown }).detail
        : body;
    throw mapHttpError(res.status, detail, correlationId);
  }

  return { data: body as T, correlationId, status: res.status };
}

/* ------------------------------------------------------------------ */
/* Subida en dos pasos                                                 */
/* ------------------------------------------------------------------ */

interface PresignResponse {
  public_url: string;
  upload_url: string;
  content_type: string;
  upload_headers?: Record<string, string>;
}

export const UPLOAD_CONTENT_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
] as const;

/**
 * Sube bytes y devuelve una URL pública que Higgsfield puede leer.
 *
 * Esto es lo que hace posible una app en localhost: sus servidores tienen que
 * descargar la imagen de entrada por internet, y `localhost` no existe para ellos.
 *
 * Dos trampas verificadas a mano:
 *   - Las `upload_headers` se reenvían TAL CUAL. No normalizar mayúsculas, no
 *     recalcular Content-Type desde el archivo, no añadir nada: cualquier cambio
 *     rompe la firma de S3 y el PUT falla con un error ilegible.
 *   - Al PUT prefirmado NO se le mandan credenciales de Higgsfield. La doc lo dice
 *     explícitamente y además no hacen falta: la firma va en la query string.
 */
export async function hfUpload(
  token: string,
  bytes: Uint8Array | ArrayBuffer,
  contentType: string,
  signal?: AbortSignal,
): Promise<{ url: string; contentType: string; bytes: number }> {
  const presign = await hfFetch<PresignResponse>(token, {
    path: "/files/generate-upload-url",
    method: "POST",
    body: { content_type: contentType },
    signal,
  });

  const { public_url, upload_url, upload_headers } = presign.data;
  if (!public_url || !upload_url) {
    throw new AppError("server_error", "Higgsfield returned no upload URL.", {
      correlationId: presign.correlationId,
    });
  }

  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

  let put: Response;
  try {
    put = await fetch(upload_url, {
      method: "PUT",
      // Se itera lo que venga: la doc dice "every header returned in upload_headers"
      // y el conjunto no está garantizado (hoy: Content-Type y x-amz-tagging).
      headers: { ...(upload_headers ?? {}), "User-Agent": USER_AGENT },
      body: buf as unknown as BodyInit,
      signal: joinSignals(signal, 120_000),
    });
  } catch {
    throw new AppError("network", "The upload didn't reach storage.");
  }

  if (!put.ok) {
    throw new AppError("server_error", `Upload failed (${put.status}).`);
  }

  return { url: public_url, contentType, bytes: buf.byteLength };
}

/* ------------------------------------------------------------------ */
/* Validación de credenciales — gratis y sin efectos                   */
/* ------------------------------------------------------------------ */

const NIL_REQUEST_ID = "00000000-0000-4000-8000-000000000000";

/**
 * Verifica una llave sin gastar un crédito ni crear nada.
 *
 * Se apoya en una asimetría medida: con llave válida, consultar el estado de un
 * request_id inexistente devuelve 404 {"detail":"Not found"}; sin llave devuelve
 * 401 {"detail":"Invalid credentials"}. Es decir, un 404 PRUEBA que la llave sirve.
 * No hay endpoint /me, así que esta es la forma barata de validar.
 */
export async function hfVerifyCredentials(
  token: string,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    await hfFetch(token, {
      path: `/requests/${NIL_REQUEST_ID}/status`,
      method: "GET",
      signal,
      timeoutMs: 15_000,
    });
    return true; // improbable, pero un 200 también es válido
  } catch (e) {
    if (e instanceof AppError) {
      if (e.kind === "not_found") return true;
      if (e.kind === "unauthorized") return false;
    }
    throw e;
  }
}
