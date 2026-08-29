import { AppError } from "@/lib/shared/errors";
import { isProviderUrl } from "@/lib/server/urls";
import { json, withApi } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sólo funciona mientras la petición siga en cola; una vez procesando devuelve 400. */
export const POST = withApi(
  async ({ req, provider }) => {
    const body = (await req.json()) as { requestId?: string; cancelUrl?: string };
    if (!body.requestId) throw new AppError("invalid_params", "Missing requestId.");

    await provider.cancel({
      id: body.requestId,
      cancelUrl: isProviderUrl(body.cancelUrl) ? body.cancelUrl : undefined,
    });
    return json({ status: "canceled" });
  },
  { mutating: true },
);
