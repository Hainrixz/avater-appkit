import { listModels, toPublic } from "@/lib/provider/higgsfield/models";
import { getCredentials, fingerprint } from "@/lib/server/credentials";
import { peekAvailability } from "@/lib/server/availability";
import { json } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * El catálogo, con `buildBody` retirado por `toPublic`.
 *
 * Esa poda es lo que hace que "sólo servidor" sea estructuralmente cierto y no una
 * convención: el navegador nunca recibe la función que arma el body del proveedor.
 */
export async function GET(): Promise<Response> {
  const models = listModels("all").map(toPublic);
  const creds = await getCredentials();
  const availability = creds ? peekAvailability(fingerprint(creds.token)) : null;

  return json({ providerId: "higgsfield", models, availability });
}
