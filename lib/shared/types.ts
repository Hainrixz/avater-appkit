/**
 * Las formas que habla toda la app.
 *
 * `GenerationInput` es deliberadamente ÚNICO: la UI sólo conoce esta forma, y cada
 * modelo la traduce a su propio body en `buildBody`. Ese es todo el truco que hace
 * cierta la promesa de "cambias el modelo arriba y jala igual": los bodies de la API
 * no son uniformes (duration es entero en Kling y en Hailuo, string en Veo; unos
 * aceptan aspect_ratio y otros ni lo tienen), así que la no-uniformidad se absorbe
 * en un solo lugar en vez de filtrarse a los componentes.
 */

export type Capability =
  | "text->image"
  | "image->image"
  | "multi-image->image"
  | "image->video"
  | "text->video";

export type AspectRatio =
  | "9:16"
  | "16:9"
  | "4:3"
  | "3:4"
  | "1:1"
  | "2:3"
  | "3:2"
  | "21:9"
  | "5:4"
  | "4:5";

export type RecipeId = "teleport" | "tryon" | "duo";

/** Estados terminales de la API. `nsfw` NO es un fallo: se reembolsa solo. */
export type RequestStatus =
  | "queued"
  | "in_progress"
  | "nsfw"
  | "failed"
  | "completed"
  | "canceled";

export const TERMINAL_STATUSES: readonly RequestStatus[] = [
  "completed",
  "failed",
  "nsfw",
  "canceled",
] as const;

export function isTerminal(s: RequestStatus): boolean {
  return TERMINAL_STATUSES.includes(s);
}

export interface MediaOutput {
  url: string;
}

/** Respuesta cruda de la API, tanto al enviar como al consultar estado. */
export interface ProviderRequest {
  status: RequestStatus;
  request_id: string;
  status_url?: string;
  cancel_url?: string;
  error?: string | null;
  images?: MediaOutput[];
  video?: MediaOutput;
  audio?: MediaOutput;
  audios?: MediaOutput[];
}

/** Lo que la app usa después de normalizar. */
export interface Job {
  id: string;
  status: RequestStatus;
  statusUrl?: string;
  cancelUrl?: string;
  error?: string | null;
  images: string[];
  videoUrl?: string;
  correlationId?: string | null;
}

export interface GenerationInput {
  modelId: string;
  prompt: string;
  /** Ordenado: [sujeto, prenda] o [sujeto, pareja]. */
  imageUrls: string[];
  endImageUrl?: string;
  aspectRatio?: AspectRatio;
  resolution?: string;
  durationSec?: number;
  /** Se convierte en `batch_size` o en `num_images` según el modelo. */
  batchSize?: number;
  seed?: number;
  negativePrompt?: string;
  cfgScale?: number;
  enhancePrompt?: boolean;
}

export interface Estimate {
  credits: number;
  usd: number;
  /** Los valores originales llegan como strings; se guardan para no mostrar 0.09400000001. */
  raw: { credits: string; usd: string };
}

export interface UploadedAsset {
  url: string;
  contentType: string;
  bytes: number;
}

export interface ModelSupports {
  aspectRatios?: readonly AspectRatio[];
  resolutions?: readonly string[];
  durationsSec?: readonly number[];
  /** Cómo se serializa la duración. Ver types.ts arriba: no es uniforme entre modelos. */
  durationEncoding: "int" | "string" | "none";
  batchSizes?: readonly number[];
  maxBatch?: number;
  seed: boolean;
  negativePrompt: boolean;
  cfgScale: boolean;
  endImage: boolean;
  audio: boolean;
  enhancePrompt: boolean;
}

export interface ModelImageInput {
  field: string;
  mode: "single" | "array" | "none";
  min: number;
  max: number;
}

export interface ModelSpec {
  id: string;
  label: string;
  family: string;
  /** Sirve para POST {path} y para POST /estimate{path}. */
  path: string;
  capability: Capability;
  tier: "curated" | "extended";
  /** Segundos típicos de generación — alimenta la duración del barrido de progreso. */
  medianSeconds: number;
  image: ModelImageInput;
  supports: ModelSupports;
  defaults: Partial<GenerationInput>;
  recipes: readonly RecipeId[];
  buildBody(input: GenerationInput): Record<string, unknown>;
}

/** `buildBody` no serializa: se quita antes de mandar el catálogo al navegador.
 *  Así el cliente es estructuralmente incapaz de armar un body del proveedor. */
export type PublicModelSpec = Omit<ModelSpec, "buildBody">;

export type AvailabilityState = "available" | "unavailable" | "unknown";

export interface ModelAvailability {
  modelId: string;
  state: AvailabilityState;
  reason?: "not_found" | "blocked" | "disabled" | "probe_failed" | "not_probed";
  estimate?: { credits: number; usd: number };
  checkedAt: number;
}

/** Lo que cambió al cambiar de modelo. La UI lo confiesa en vez de coercer en silencio. */
export interface CapabilityChange {
  field: keyof GenerationInput;
  from: unknown;
  to: unknown;
  reason: "unsupported_value" | "field_not_supported";
}
