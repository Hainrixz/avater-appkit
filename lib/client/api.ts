import type {
  Estimate,
  GenerationInput,
  Job,
  ModelAvailability,
  PublicModelSpec,
  UploadedAsset,
} from "@/lib/shared/types";
import { AppError, type AppErrorPayload } from "@/lib/shared/errors";

/** Cabecera anti-CSRF: obliga a un preflight que un atacante cross-origin no puede pasar. */
const APP_HEADER = { "x-avatar-kit": "1" } as const;

async function unwrap<T>(res: Response): Promise<T> {
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const e = (data as { error?: AppErrorPayload } | null)?.error;
    throw new AppError(e?.kind ?? "server_error", e?.message ?? `Request failed (${res.status})`, {
      status: res.status,
      correlationId: e?.correlationId ?? null,
      retryable: e?.retryable ?? false,
    });
  }
  return data as T;
}

export async function connectKey(token: string) {
  return unwrap<{ ok: true; keyId: string; secretHint: string }>(
    await fetch("/api/key", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...APP_HEADER },
      body: JSON.stringify({ token }),
    }),
  );
}

export async function keyStatus() {
  return unwrap<{ connected: boolean; keyId?: string; secretHint?: string }>(
    await fetch("/api/key", { cache: "no-store" }),
  );
}

export async function disconnectKey() {
  return unwrap<{ ok: true }>(await fetch("/api/key", { method: "DELETE" }));
}

export async function fetchModels() {
  return unwrap<{
    providerId: string;
    models: PublicModelSpec[];
    availability: Record<string, ModelAvailability> | null;
  }>(await fetch("/api/models", { cache: "no-store" }));
}

export async function probeModels(tier: "curated" | "all" = "curated", force = false) {
  return unwrap<{
    availability: Record<string, ModelAvailability>;
    probedAt: number;
    durationMs: number;
  }>(
    await fetch("/api/models/probe", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...APP_HEADER },
      body: JSON.stringify({ tier, force }),
    }),
  );
}

export async function uploadImage(file: File, signal?: AbortSignal) {
  const form = new FormData();
  form.append("file", file);
  return unwrap<UploadedAsset>(
    await fetch("/api/upload", {
      method: "POST",
      headers: APP_HEADER,
      body: form,
      signal,
    }),
  );
}

export async function estimate(input: GenerationInput, signal?: AbortSignal) {
  return unwrap<Estimate>(
    await fetch("/api/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...APP_HEADER },
      body: JSON.stringify({ input }),
      signal,
    }),
  );
}

export async function submit(input: GenerationInput, idempotencyKey: string) {
  return unwrap<Job>(
    await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        ...APP_HEADER,
      },
      body: JSON.stringify({ input }),
    }),
  );
}

export async function pollJob(requestId: string, statusUrl?: string) {
  const qs = statusUrl ? `?statusUrl=${encodeURIComponent(statusUrl)}` : "";
  return unwrap<Job>(await fetch(`/api/status/${requestId}${qs}`, { cache: "no-store" }));
}

export async function cancelJob(requestId: string, cancelUrl?: string) {
  return unwrap<{ status: string }>(
    await fetch("/api/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...APP_HEADER },
      body: JSON.stringify({ requestId, cancelUrl }),
    }),
  );
}

export function downloadUrl(url: string, filename: string): string {
  return `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
}
