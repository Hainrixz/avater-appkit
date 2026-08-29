import type {
  Estimate,
  GenerationInput,
  Job,
  ModelAvailability,
  ModelSpec,
  PublicModelSpec,
  UploadedAsset,
} from "@/lib/shared/types";

/**
 * LA COSTURA INTERCAMBIABLE.
 *
 * Sólo tres cosas generalizan de verdad entre APIs de generación, y son justo las
 * que vale la pena abstraer:
 *   1. el ciclo de vida: enviar -> id opaco -> sondear -> estado terminal -> URLs,
 *   2. el límite de credenciales: algo que se adjunta por petición, sólo en servidor,
 *   3. la taxonomía de errores: un conjunto cerrado de `kind` sobre el que conmuta la UI.
 *
 * Todo lo demás vive DENTRO del adaptador: la forma de los bodies, el baile de subida
 * en dos pasos, la convención de /estimate, el User-Agent que exige Cloudflare.
 *
 * En concreto, la subida NO se abstrae en dos pasos. La costura es
 * `uploadImage(bytes, contentType) -> { url }`. Si mañana otro proveedor pide un POST
 * multipart directo, o base64, eso es el cuerpo de UNA función, no un cambio de interfaz.
 */

export interface ProviderCredentials {
  /** Opaco para quien llama. En Higgsfield: `${keyId}:${keySecret}`. */
  readonly token: string;
}

export interface Provider {
  readonly id: string;
  readonly label: string;

  /** Catálogo estático y declarativo. Nunca hace red. */
  listModels(opts?: { tier?: "curated" | "all" }): PublicModelSpec[];
  getModel(modelId: string): ModelSpec | undefined;

  uploadImage(args: {
    bytes: Uint8Array;
    contentType: string;
    signal?: AbortSignal;
  }): Promise<UploadedAsset>;

  /** Gratis. Mismo body que submit(). */
  estimate(input: GenerationInput, signal?: AbortSignal): Promise<Estimate>;

  /** NUNCA se reintenta solo: no existe idempotency key upstream. */
  submit(input: GenerationInput, signal?: AbortSignal): Promise<Job>;

  poll(job: { id: string; statusUrl?: string }, signal?: AbortSignal): Promise<Job>;

  cancel(job: { id: string; cancelUrl?: string }, signal?: AbortSignal): Promise<void>;

  /** Un modelo. La concurrencia y la caché viven por encima, en lib/server/availability. */
  probe(
    modelId: string,
    probeImageUrl: string | undefined,
    signal?: AbortSignal,
  ): Promise<ModelAvailability>;

  /** Verifica credenciales con coste cero y sin efectos secundarios. */
  verifyCredentials(signal?: AbortSignal): Promise<boolean>;
}

export type ProviderFactory = (creds: ProviderCredentials) => Provider;
