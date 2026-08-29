import { AppError } from "@/lib/shared/errors";
import { HF_BASE } from "@/lib/provider/higgsfield/client";

/**
 * Guardia anti-SSRF.
 *
 * `status_url` y `cancel_url` nacen en una respuesta del proveedor, pero llegan al
 * servidor A TRAVÉS DEL CLIENTE, así que desde el punto de vista del servidor son
 * texto controlable por un atacante. Sin esta comprobación, /api/status se convierte
 * en un proxy que pide cualquier URL que le manden, incluida 169.254.169.254.
 */
const ALLOWED_ORIGINS = new Set<string>([new URL(HF_BASE).origin]);

/** Hosts desde los que se sirven los resultados generados (CloudFront). */
const ALLOWED_ASSET_HOST_SUFFIXES = [".cloudfront.net", ".amazonaws.com", ".higgsfield.ai"];

export function isProviderUrl(raw: string | undefined | null): boolean {
  if (!raw) return false;
  try {
    return ALLOWED_ORIGINS.has(new URL(raw).origin);
  } catch {
    return false;
  }
}

export function assertProviderUrl(raw: string): string {
  if (!isProviderUrl(raw)) {
    throw new AppError("invalid_params", "That URL isn't a Higgsfield API URL.");
  }
  return raw;
}

export function isAllowedAssetUrl(raw: string | undefined | null): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    return ALLOWED_ASSET_HOST_SUFFIXES.some(
      (s) => u.hostname === s.slice(1) || u.hostname.endsWith(s),
    );
  } catch {
    return false;
  }
}
