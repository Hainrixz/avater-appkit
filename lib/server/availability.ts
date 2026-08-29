import { AppError } from "@/lib/shared/errors";
import type { ModelAvailability } from "@/lib/shared/types";
import type { Provider } from "@/lib/provider";
import { listModels } from "@/lib/provider/higgsfield/models";
import { providerSemaphore } from "./semaphore";

/**
 * SONDEO DE DISPONIBILIDAD.
 *
 * La disponibilidad de modelos es una propiedad de LA CUENTA, no del producto: sobre
 * una llave medida, 26 de 48 endpoints respondían y el resto daba 404/423/503. Quien
 * clone este repo tendrá otro plan y otro reparto. Por eso el catálogo se sondea en
 * runtime en vez de venir en una constante — y de paso convierte la limitación en la
 * mejor función del kit: precios y disponibilidad en vivo, con tu propia llave.
 *
 * Se cachea en memoria por huella de credencial. No se escribe a disco: un archivo con
 * los resultados filtraría la forma del plan de quien lo generó, y alguien acabaría
 * commiteándolo.
 */

const TTL_MS = 12 * 60 * 60 * 1000; // la disponibilidad cambia en días, no en minutos
const STAGGER_MS = 120;
const PROBE_RETRIES = 2;

interface CacheEntry {
  map: Record<string, ModelAvailability>;
  probedAt: number;
  probeImageUrl?: string;
}

const cache = new Map<string, CacheEntry>();

/** PNG transparente de 1x1. Se sube una vez por sesión para tener una URI válida
 *  de verdad con la que sondear; así un 404 significa "no está en tu plan" y no
 *  "tu URL inventada no pasó la validación". */
const PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function ensureProbeImage(
  provider: Provider,
  entry: CacheEntry | undefined,
): Promise<string | undefined> {
  if (entry?.probeImageUrl) return entry.probeImageUrl;
  try {
    const bytes = Uint8Array.from(Buffer.from(PIXEL_PNG_BASE64, "base64"));
    const asset = await provider.uploadImage({ bytes, contentType: "image/png" });
    return asset.url;
  } catch {
    // Sin imagen de sondeo se sigue adelante: los modelos de sólo texto igual responden,
    // y los demás caerán a "unknown", que la UI deja seleccionables.
    return undefined;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function probeWithRetry(
  provider: Provider,
  modelId: string,
  probeImageUrl: string | undefined,
): Promise<ModelAvailability> {
  for (let attempt = 0; attempt <= PROBE_RETRIES; attempt++) {
    const result = await providerSemaphore.run(() =>
      provider.probe(modelId, probeImageUrl),
    );
    // Un 400 de concurrencia durante el sondeo significa "vuelve a encolarlo", NUNCA
    // "no disponible": marcar muerto un modelo que funciona es el peor resultado posible.
    if (result.state !== "unknown" || result.reason !== "probe_failed") return result;
    if (attempt < PROBE_RETRIES) await sleep(1500 * (attempt + 1));
  }
  return {
    modelId,
    state: "unknown",
    reason: "probe_failed",
    checkedAt: Date.now(),
  };
}

export async function getAvailability(
  fp: string,
  provider: Provider,
  opts: { tier?: "curated" | "all"; force?: boolean } = {},
): Promise<{ availability: Record<string, ModelAvailability>; probedAt: number }> {
  const tier = opts.tier ?? "curated";
  const now = Date.now();
  const cached = cache.get(fp);

  if (!opts.force && cached && now - cached.probedAt < TTL_MS) {
    const wanted = listModels(tier).map((m) => m.id);
    const covered = wanted.every((id) => cached.map[id]);
    if (covered) return { availability: cached.map, probedAt: cached.probedAt };
  }

  const probeImageUrl = await ensureProbeImage(provider, cached);
  const models = listModels(tier);
  const map: Record<string, ModelAvailability> = { ...(cached?.map ?? {}) };

  const tasks = models.map(async (model, i) => {
    // Escalonar el arranque además del semáforo: aplana la ráfaga contra Cloudflare.
    await sleep(i * STAGGER_MS);
    try {
      map[model.id] = await probeWithRetry(provider, model.id, probeImageUrl);
    } catch (e) {
      if (e instanceof AppError && e.kind === "unauthorized") throw e;
      map[model.id] = {
        modelId: model.id,
        state: "unknown",
        reason: "probe_failed",
        checkedAt: Date.now(),
      };
    }
  });

  await Promise.all(tasks);

  const probedAt = Date.now();
  cache.set(fp, { map, probedAt, probeImageUrl });
  return { availability: map, probedAt };
}

export function peekAvailability(fp: string): Record<string, ModelAvailability> | null {
  const entry = cache.get(fp);
  if (!entry) return null;
  if (Date.now() - entry.probedAt > TTL_MS) return null;
  return entry.map;
}

export function forgetAvailability(fp: string): void {
  cache.delete(fp);
}
