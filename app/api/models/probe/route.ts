import { getAvailability } from "@/lib/server/availability";
import { json, withApi } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const POST = withApi(
  async ({ req, provider, fingerprint }) => {
    const body = (await req.json().catch(() => ({}))) as {
      tier?: "curated" | "all";
      force?: boolean;
    };
    const started = Date.now();
    const { availability, probedAt } = await getAvailability(fingerprint, provider, {
      tier: body.tier ?? "curated",
      force: body.force ?? false,
    });
    return json({ availability, probedAt, durationMs: Date.now() - started });
  },
  { mutating: true },
);
