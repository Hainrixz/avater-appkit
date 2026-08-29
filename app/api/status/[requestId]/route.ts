import { AppError } from "@/lib/shared/errors";
import { getCredentials } from "@/lib/server/credentials";
import { getProvider } from "@/lib/provider";
import { isProviderUrl } from "@/lib/server/urls";
import { errorResponse, json } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Consulta de estado. El sondeo lo conduce el cliente, así que esta ruta es un proxy
 * puro y sin estado — que es la propiedad más valiosa en un repo que la gente forkea.
 *
 * `statusUrl` viene de una respuesta del proveedor pero llega AQUÍ a través del
 * cliente, o sea que es texto no confiable desde la óptica del servidor. Si no
 * pertenece al origen de la API, se descarta y se reconstruye la ruta.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ requestId: string }> },
): Promise<Response> {
  try {
    const { requestId } = await ctx.params;
    const creds = await getCredentials();
    if (!creds) throw new AppError("unauthorized", "No API key connected.");

    const raw = new URL(req.url).searchParams.get("statusUrl");
    const statusUrl = isProviderUrl(raw) ? raw! : undefined;

    const provider = getProvider("higgsfield", creds);
    const job = await provider.poll({ id: requestId, statusUrl });
    return json(job);
  } catch (e) {
    return errorResponse(e);
  }
}
