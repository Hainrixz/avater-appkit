/** Formateo de créditos, dinero, caducidad y tiempo. */

export function formatCredits(credits: number): string {
  return credits.toFixed(3).replace(/\.?0+$/, "") + " cr";
}

export function formatUsd(usd: number): string {
  if (usd === 0) return "$0";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(usd < 1 ? 3 : 2)}`;
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export interface ExpiryInfo {
  label: string;
  tone: "calm" | "warn";
  expired: boolean;
  title: string;
}

/**
 * La caducidad escala por COLOR y por texto, nunca por animación: una tarjeta que
 * late para avisarte de algo que pasa en 7 días es ruido, no información.
 */
export function describeExpiry(expiresAt: number | undefined, now = Date.now()): ExpiryInfo | null {
  if (!expiresAt) return null;
  const left = expiresAt - now;
  const date = new Date(expiresAt).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });

  if (left <= 0) {
    return {
      label: "Expired",
      tone: "warn",
      expired: true,
      title: `Higgsfield removed this on ${date}.`,
    };
  }

  const hours = left / 3_600_000;
  const title = `Higgsfield deletes results after 7 days. Saved until ${date}. Download to keep it.`;

  if (hours > 48) {
    return { label: `${Math.round(hours / 24)}d`, tone: "calm", expired: false, title };
  }
  return { label: `${Math.round(hours)}h left`, tone: "warn", expired: false, title };
}

export function slugify(text: string, max = 40): string {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max) || "result"
  );
}
