import { AppError } from "@/lib/shared/errors";
import type {
  Estimate,
  GenerationInput,
  Job,
  ModelAvailability,
  ProviderRequest,
} from "@/lib/shared/types";
import type { Provider, ProviderCredentials } from "../provider";
import { hfFetch, hfUpload, hfVerifyCredentials } from "./client";
import { getModel, listModels, toPublic } from "./models";

function toJob(r: ProviderRequest, correlationId?: string | null): Job {
  return {
    id: r.request_id,
    status: r.status,
    statusUrl: r.status_url,
    cancelUrl: r.cancel_url,
    error: r.error ?? null,
    images: (r.images ?? []).map((m) => m.url),
    videoUrl: r.video?.url,
    correlationId: correlationId ?? null,
  };
}

/** Los importes llegan como STRING. Se parsean a número pero se guarda el original
 *  para no acabar enseñando 0.09400000000001 en un botón. */
function toEstimate(raw: { credits?: string; usd?: string }): Estimate {
  const credits = Number.parseFloat(raw.credits ?? "0");
  const usd = Number.parseFloat(raw.usd ?? "0");
  return {
    credits: Number.isFinite(credits) ? credits : 0,
    usd: Number.isFinite(usd) ? usd : 0,
    raw: { credits: raw.credits ?? "0", usd: raw.usd ?? "0" },
  };
}

function bodyFor(input: GenerationInput) {
  const model = getModel(input.modelId);
  if (!model) {
    throw new AppError("invalid_params", `Unknown model: ${input.modelId}`);
  }
  return { model, body: model.buildBody(input) };
}

export function createHiggsfieldProvider(creds: ProviderCredentials): Provider {
  const token = creds.token;

  return {
    id: "higgsfield",
    label: "Higgsfield",

    listModels(opts) {
      return listModels(opts?.tier ?? "all").map(toPublic);
    },

    getModel(modelId) {
      return getModel(modelId);
    },

    async uploadImage({ bytes, contentType, signal }) {
      return hfUpload(token, bytes, contentType, signal);
    },

    async estimate(input, signal) {
      const { model, body } = bodyFor(input);
      const res = await hfFetch<{ credits?: string; usd?: string }>(token, {
        path: `/estimate${model.path}`,
        method: "POST",
        body,
        signal,
      });
      return toEstimate(res.data ?? {});
    },

    async submit(input, signal) {
      const { model, body } = bodyFor(input);
      const res = await hfFetch<ProviderRequest>(token, {
        path: model.path,
        method: "POST",
        body,
        signal,
      });
      return toJob(res.data, res.correlationId);
    },

    async poll(job, signal) {
      const res = await hfFetch<ProviderRequest>(token, {
        // La doc pide usar la URL que devuelve la API en vez de construirla.
        ...(job.statusUrl
          ? { url: job.statusUrl }
          : { path: `/requests/${job.id}/status` }),
        method: "GET",
        signal,
      });
      return toJob(res.data, res.correlationId);
    },

    async cancel(job, signal) {
      await hfFetch(token, {
        ...(job.cancelUrl ? { url: job.cancelUrl } : { path: `/requests/${job.id}/cancel` }),
        method: "POST",
        signal,
      });
    },

    /**
     * Sondea un modelo con /estimate, que es gratis.
     *
     * Se le pasa una URL de imagen REAL (un PNG de 1x1 subido una vez por sesión) en
     * vez de inventarse una: así un 404 significa de verdad "este modelo no está en tu
     * plan" y no "el validador rechazó tu URL falsa".
     */
    async probe(modelId, probeImageUrl, signal) {
      const model = getModel(modelId);
      const now = Date.now();
      if (!model) {
        return { modelId, state: "unknown", reason: "not_probed", checkedAt: now };
      }

      const urls = probeImageUrl ? Array(model.image.max || 1).fill(probeImageUrl) : [];
      const input: GenerationInput = {
        modelId,
        prompt: "a person standing in a city at night",
        imageUrls: urls,
        ...model.defaults,
      };

      try {
        const est = await this.estimate(input, signal);
        return {
          modelId,
          state: "available",
          estimate: { credits: est.credits, usd: est.usd },
          checkedAt: now,
        };
      } catch (e) {
        if (e instanceof AppError) {
          switch (e.kind) {
            case "not_found":
              return { modelId, state: "unavailable", reason: "not_found", checkedAt: now };
            case "model_blocked":
              return { modelId, state: "unavailable", reason: "blocked", checkedAt: now };
            case "model_disabled":
              return { modelId, state: "unavailable", reason: "disabled", checkedAt: now };
            case "unauthorized":
              throw e; // credenciales malas: que suba, no es asunto del modelo
            default:
              // Un 400 de concurrencia o de validación NO prueba que el modelo falte.
              // Marcarlo como no disponible escondería un modelo que sí funciona.
              return {
                modelId,
                state: "unknown",
                reason: "probe_failed",
                checkedAt: now,
              } satisfies ModelAvailability;
          }
        }
        return { modelId, state: "unknown", reason: "probe_failed", checkedAt: now };
      }
    },

    async verifyCredentials(signal) {
      return hfVerifyCredentials(token, signal);
    },
  };
}
