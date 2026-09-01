/**
 * Taxonomía de errores.
 *
 * Dos cosas de la API real que obligan a esto y no son evidentes:
 *
 * 1. NO EXISTE EL 429. Quedarse sin concurrencia llega como 400 con el detail
 *    "Maximum number of concurrent requests (4) has been reached", indistinguible
 *    por código de un 400 de validación. Hay que hacer match por string.
 *
 * 2. Ese 400 de concurrencia es el ÚNICO 4xx que se puede reintentar solo, porque
 *    significa que la petición no arrancó: no se generó nada y no se cobró nada.
 *    Es categóricamente distinto de un timeout, donde el POST pudo haber entrado.
 *    Por eso `retryable` nunca debe ser true en ningún otro 4xx.
 */

export type ErrorKind =
  | "unauthorized"
  | "insufficient_credits"
  | "not_found"
  | "model_blocked"
  | "model_disabled"
  | "invalid_params"
  | "concurrency_limit"
  | "server_error"
  | "network"
  | "file_too_large"
  | "unsupported_file"
  | "nsfw_blocked"
  | "ambiguous_submit";

export interface AppErrorMeta {
  status?: number;
  correlationId?: string | null;
  retryable?: boolean;
}

export class AppError extends Error {
  readonly kind: ErrorKind;
  readonly meta: AppErrorMeta;

  constructor(kind: ErrorKind, message: string, meta: AppErrorMeta = {}) {
    super(message);
    this.name = "AppError";
    this.kind = kind;
    this.meta = meta;
  }

  toPayload() {
    return {
      kind: this.kind,
      message: this.message,
      status: this.meta.status,
      correlationId: this.meta.correlationId ?? null,
      retryable: this.meta.retryable ?? false,
    };
  }
}

export type AppErrorPayload = ReturnType<AppError["toPayload"]>;

const CONCURRENCY_RE = /maximum number of concurrent requests|concurrent request/i;

export function isConcurrencyDetail(detail: unknown): boolean {
  return typeof detail === "string" && CONCURRENCY_RE.test(detail);
}

/** `detail` puede ser string o array (errores de validación). No parsear el texto
 *  para decisiones de negocio permanentes — sólo para el caso de concurrencia. */
export function detailToMessage(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        if (typeof d === "string") return d;
        if (d && typeof d === "object" && "msg" in d) {
          const loc = "loc" in d && Array.isArray(d.loc) ? d.loc.join(".") : "";
          return loc ? `${loc}: ${String(d.msg)}` : String(d.msg);
        }
        return JSON.stringify(d);
      })
      .join("; ");
  }
  if (detail == null) return "Unknown error";
  return JSON.stringify(detail);
}

export function mapHttpError(
  status: number,
  detail: unknown,
  correlationId: string | null,
): AppError {
  const msg = detailToMessage(detail);
  const meta = { status, correlationId };

  if (status === 400 && isConcurrencyDetail(detail)) {
    return new AppError("concurrency_limit", msg, { ...meta, retryable: true });
  }

  switch (status) {
    case 400:
    case 422:
      return new AppError("invalid_params", msg, meta);
    case 401:
      return new AppError("unauthorized", msg, meta);
    case 403:
      return new AppError("insufficient_credits", msg, meta);
    case 404:
      return new AppError("not_found", msg, meta);
    case 423:
      return new AppError("model_blocked", msg, meta);
    case 503:
      return new AppError("model_disabled", msg, meta);
    default:
      return new AppError(status >= 500 ? "server_error" : "invalid_params", msg, {
        ...meta,
        retryable: status >= 500,
      });
  }
}

export const HTTP_STATUS_FOR_KIND: Record<ErrorKind, number> = {
  unauthorized: 401,
  insufficient_credits: 403,
  not_found: 404,
  model_blocked: 423,
  model_disabled: 503,
  invalid_params: 400,
  concurrency_limit: 429, // hacia NUESTRO cliente sí usamos 429; la API upstream no lo hace
  server_error: 502,
  network: 502,
  file_too_large: 413,
  unsupported_file: 415,
  nsfw_blocked: 200,
  ambiguous_submit: 502,
};

/** Copy orientado al usuario. El tono importa: en `nsfw` e `insufficient_credits`
 *  el dinero va lo primero del cuerpo, porque es la pregunta real.
 *
 *  PENDIENTE: nadie importa esta constante todavía. Mientras siga así, un límite de
 *  concurrencia se pinta con el texto crudo de la API en vez de con esto. */
export const USER_MESSAGES: Record<ErrorKind, string> = {
  unauthorized:
    "That API key isn't valid. Check the KEY_ID:KEY_SECRET format and paste it again.",
  insufficient_credits:
    "Your Higgsfield account is out of credits. Top up, then hit Retry — you weren't charged for this attempt.",
  not_found: "This model isn't available on your plan.",
  model_blocked: "This model is blocked for your account. Pick another one.",
  model_disabled:
    "Higgsfield has this model temporarily disabled. Try later, or pick another one.",
  invalid_params: "Something in the request was rejected.",
  concurrency_limit:
    "Higgsfield allows a few generations at once. This one is queued — it starts as soon as a slot frees up.",
  server_error: "Higgsfield had a server error.",
  network: "Couldn't reach Higgsfield. Check your connection.",
  file_too_large: "That image is over the size limit.",
  unsupported_file: "That file type isn't supported. Use JPEG, PNG or WebP.",
  nsfw_blocked:
    "The safety filter blocked this one. You weren't charged — those are refunded automatically.",
  ambiguous_submit:
    "We lost the connection right after sending this. It may still be running — check your Higgsfield dashboard before generating again so you don't pay twice.",
};
