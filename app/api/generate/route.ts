import { AppError } from "@/lib/shared/errors";
import type { GenerationInput } from "@/lib/shared/types";
import { once } from "@/lib/server/idempotency";
import { providerSemaphore } from "@/lib/server/semaphore";
import { json, withApi } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Envía una generación. NUNCA reintenta.
 *
 * La documentación es explícita: los POST de generación no aceptan idempotency key,
 * así que repetir uno tras un timeout ambiguo puede cobrar dos veces. Aquí no hay
 * ninguna lógica de reintento — el reintento sólo existe en la ruta GET de estado.
 * La deduplicación viene de `once()`, que es nuestra idempotencia sintética.
 */
export const POST = withApi(
  async ({ req, provider }) => {
    const idempotencyKey = req.headers.get("idempotency-key");
    if (!idempotencyKey) {
      throw new AppError("invalid_params", "Missing Idempotency-Key header.");
    }

    const body = (await req.json()) as { input?: GenerationInput };
    if (!body.input?.modelId) {
      throw new AppError("invalid_params", "Missing model.");
    }

    const job = await once(idempotencyKey, () =>
      providerSemaphore.run(() => provider.submit(body.input!)),
    );

    return json(job);
  },
  { mutating: true },
);
