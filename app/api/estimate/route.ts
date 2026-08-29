import { AppError } from "@/lib/shared/errors";
import type { GenerationInput } from "@/lib/shared/types";
import { providerSemaphore } from "@/lib/server/semaphore";
import { json, withApi } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Coste real antes de enviar. Es gratis y es la ÚNICA fuente de precios que hay:
 * no existe tabla pública. Como tampoco hay endpoint de saldo, un 403 por créditos
 * sólo se descubre al enviar — por eso el presupuesto se enseña siempre antes.
 */
export const POST = withApi(
  async ({ req, provider }) => {
    const body = (await req.json()) as { input?: GenerationInput };
    if (!body.input?.modelId) {
      throw new AppError("invalid_params", "Missing model.");
    }
    const estimate = await providerSemaphore.run(() => provider.estimate(body.input!));
    return json(estimate);
  },
  { mutating: true },
);
