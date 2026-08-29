import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import type { ProviderCredentials } from "@/lib/provider";

export const KEY_COOKIE = "hf_key";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * LA LLAVE ES DEL USUARIO Y VIVE EN UNA COOKIE httpOnly.
 *
 * No en localStorage. Razón concreta, no dogma: en localStorage la llave es legible
 * por cualquier script inyectado, y obliga a pasar la cabecera de auth a mano en cada
 * fetch del cliente — basta olvidarlo en un sitio para que acabe en un breadcrumb de
 * Sentry o en un console.log del estado. Este kit está hecho para que la gente lo
 * forkee y le enchufe analítica; ahí es donde una llave en JS se filtra.
 *
 * Con cookie httpOnly hay UN solo camino (se adjunta sola a nuestras rutas) y es la
 * única opción que sigue siendo correcta si alguien despliega esto fuera de localhost.
 *
 * Honestidad sobre el límite: en local esto no protege frente a malware — quien
 * corre como tu usuario lee el cookie jar igual que leería un .env. Lo que sí hace es
 * sacar la llave del alcance de JS y no convertirse en vulnerabilidad al desplegar.
 *
 * `.env.local` queda como respaldo OPCIONAL para quien prefiera no pegarla cada vez.
 * El repo nunca lleva ninguna llave: .env.example va vacío.
 */
export async function getCredentials(): Promise<ProviderCredentials | null> {
  const jar = await cookies();
  const fromCookie = jar.get(KEY_COOKIE)?.value;
  if (fromCookie) return { token: fromCookie };

  const fromEnv = process.env.HIGGSFIELD_API_KEY;
  if (fromEnv) return { token: fromEnv };

  return null;
}

export async function setCredentialCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(KEY_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearCredentialCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(KEY_COOKIE);
}

/** Índice estable para cachés. Nunca se registra ni se cachea el token en claro. */
export function fingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

const KEY_RE = /^[^:\s]+:[^:\s]+$/;

export function parseToken(raw: unknown): string {
  const token = typeof raw === "string" ? raw.trim() : "";
  if (!KEY_RE.test(token)) {
    throw new Error("Expected the KEY_ID:KEY_SECRET format.");
  }
  return token;
}

/** Lo único de la llave que puede volver al navegador. */
export function describeToken(token: string): { keyId: string; secretHint: string } {
  const [keyId = "", secret = ""] = token.split(":");
  return { keyId, secretHint: `••••${secret.slice(-4)}` };
}

/** Quita cualquier cosa con forma de credencial antes de que llegue a stdout. */
export function redact(text: string): string {
  return text.replace(/[A-Za-z0-9-]{8,}:[A-Za-z0-9]{16,}/g, "«redacted»");
}
