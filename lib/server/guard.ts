import { AppError, HTTP_STATUS_FOR_KIND } from "@/lib/shared/errors";
import { getProvider, type Provider } from "@/lib/provider";
import { fingerprint, getCredentials, redact } from "./credentials";

export interface ApiContext {
  req: Request;
  provider: Provider;
  token: string;
  fingerprint: string;
}

type Handler = (ctx: ApiContext) => Promise<Response>;

export interface GuardOptions {
  /** Rutas que escriben o gastan: exigen la cabecera anti-CSRF y comprueban Origin. */
  mutating?: boolean;
  /** Rutas que funcionan sin llave (p.ej. el catálogo antes de conectar). */
  allowAnonymous?: boolean;
}

const CSRF_HEADER = "x-avatar-kit";

/**
 * Una cookie httpOnly se adjunta sola, así que una página maliciosa podría hacer
 * POST a http://localhost:3000/api/generate y quemarle créditos al usuario.
 * SameSite=Lax ya bloquea el POST de formulario cross-site; esto es el cinturón:
 * una cabecera propia obliga a un preflight CORS que un atacante cross-origin no
 * puede satisfacer. Va aquí y no en middleware.ts porque middleware corre en Edge
 * por defecto y no merece la pena mantener dos runtimes por seis líneas.
 */
function assertSameOrigin(req: Request): void {
  if (req.headers.get(CSRF_HEADER) !== "1") {
    throw new AppError("invalid_params", "Missing app header.");
  }
  const origin = req.headers.get("origin");
  if (!origin) return; // same-origin sin Origin: aceptable
  try {
    const u = new URL(origin);
    const local =
      u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";
    const sameHost = u.host === new URL(req.url).host;
    if (!local && !sameHost) {
      throw new AppError("invalid_params", "Cross-origin request refused.");
    }
  } catch {
    throw new AppError("invalid_params", "Bad Origin header.");
  }
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function errorResponse(e: unknown): Response {
  if (e instanceof AppError) {
    return Response.json(
      { error: e.toPayload() },
      { status: HTTP_STATUS_FOR_KIND[e.kind] ?? 400 },
    );
  }
  const message = e instanceof Error ? redact(e.message) : "Unexpected error";
  console.error("[api]", message);
  return Response.json(
    { error: { kind: "server_error", message, correlationId: null, retryable: false } },
    { status: 500 },
  );
}

export function withApi(handler: Handler, opts: GuardOptions = {}) {
  return async function route(req: Request): Promise<Response> {
    try {
      if (opts.mutating) assertSameOrigin(req);

      const creds = await getCredentials();
      if (!creds) {
        if (!opts.allowAnonymous) {
          throw new AppError("unauthorized", "No API key connected yet.");
        }
        return handler({
          req,
          provider: getProvider("higgsfield", { token: "" }),
          token: "",
          fingerprint: "anon",
        });
      }

      return await handler({
        req,
        provider: getProvider("higgsfield", creds),
        token: creds.token,
        fingerprint: fingerprint(creds.token),
      });
    } catch (e) {
      return errorResponse(e);
    }
  };
}
