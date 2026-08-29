import { AppError } from "@/lib/shared/errors";
import { getProvider } from "@/lib/provider";
import {
  clearCredentialCookie,
  describeToken,
  fingerprint,
  getCredentials,
  parseToken,
  setCredentialCookie,
} from "@/lib/server/credentials";
import { forgetAvailability } from "@/lib/server/availability";
import { errorResponse, json } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Conecta una llave. La valida gratis antes de guardarla. */
export async function POST(req: Request): Promise<Response> {
  try {
    if (req.headers.get("x-avatar-kit") !== "1") {
      throw new AppError("invalid_params", "Missing app header.");
    }
    const body = (await req.json()) as { token?: unknown };

    let token: string;
    try {
      token = parseToken(body.token);
    } catch (e) {
      throw new AppError(
        "unauthorized",
        e instanceof Error ? e.message : "Bad key format.",
      );
    }

    const provider = getProvider("higgsfield", { token });
    const ok = await provider.verifyCredentials();
    if (!ok) {
      throw new AppError(
        "unauthorized",
        "Higgsfield rejected that key. Check the KEY_ID:KEY_SECRET pair.",
      );
    }

    await setCredentialCookie(token);
    return json({ ok: true, ...describeToken(token) });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Estado de conexión. Nunca devuelve el secreto. */
export async function GET(): Promise<Response> {
  const creds = await getCredentials();
  if (!creds) return json({ connected: false });
  return json({ connected: true, ...describeToken(creds.token) });
}

export async function DELETE(): Promise<Response> {
  const creds = await getCredentials();
  if (creds) forgetAvailability(fingerprint(creds.token));
  await clearCredentialCookie();
  return json({ ok: true });
}
