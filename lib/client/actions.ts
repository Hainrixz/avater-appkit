"use client";

import { AppError } from "@/lib/shared/errors";
import type { CapabilityChange, GenerationInput, PublicModelSpec } from "@/lib/shared/types";
import type { Recipe } from "@/lib/recipes";
import * as api from "./api";
import { ensureRunning } from "./job-runner";
import { hashInput, patchJob, upsertJob, type ClientJob } from "./store";

/**
 * Las mutaciones viven FUERA del componente.
 *
 * Dos razones, y la segunda importa más que la primera:
 *
 * 1. El React Compiler de Next 16 analiza el cuerpo del componente y marca
 *    `Date.now()` como impuro, porque no puede saber que una función declarada ahí
 *    dentro sólo se llama desde un onClick. Aquí fuera, la pregunta ni se plantea.
 * 2. Esto es la lógica de negocio de la app —subir, presupuestar, enviar, encadenar—
 *    y no tiene nada de React. Sacarla deja StudioShell como un componente
 *    presentacional y hace que este flujo se pueda leer y probar entero de un tirón.
 *
 * El store es de ámbito de módulo, así que estas funciones lo mutan directamente.
 */

export interface SlotFile {
  file: File;
  previewUrl: string;
  remoteUrl?: string;
}

export interface SubmitStillArgs {
  localId: string;
  recipe: Recipe;
  model: PublicModelSpec | undefined;
  modelId: string;
  userPrompt: string;
  count: number;
  /** Ordenadas como recipe.slots. */
  slotFiles: SlotFile[];
  estimate?: { credits: number; usd: number };
  /** Se llama con la URL pública tras subir, para poder cachearla en el formulario. */
  onUploaded?: (slotIndex: number, url: string) => void;
}

function buildStillInput(a: SubmitStillArgs, imageUrls: string[]): GenerationInput {
  return {
    modelId: a.modelId,
    prompt: a.recipe.buildPrompt(a.userPrompt),
    imageUrls,
    aspectRatio: a.recipe.aspectRatio,
    batchSize: a.count,
    resolution: a.model?.defaults.resolution,
  };
}

export async function submitStill(a: SubmitStillArgs): Promise<void> {
  const now = Date.now();

  upsertJob({
    localId: a.localId,
    modelId: a.modelId,
    modelLabel: a.model?.label ?? a.modelId,
    recipe: a.recipe.id,
    stage: "still",
    input: buildStillInput(a, []),
    inputHash: "",
    previews: a.slotFiles.map((f) => f.previewUrl),
    sourcePreview: a.slotFiles[0]?.previewUrl,
    phase: "uploading",
    images: [],
    warnings: [],
    createdAt: now,
    pollAttempts: 0,
    nextPollAt: Number.MAX_SAFE_INTEGER,
    expectedCount: a.count,
    etaSeconds: a.model?.medianSeconds ?? 10,
    estimate: a.estimate
      ? { credits: a.estimate.credits, usd: a.estimate.usd, raw: { credits: "", usd: "" } }
      : undefined,
  } satisfies ClientJob);

  try {
    const uploaded = await Promise.all(
      a.slotFiles.map(async (slot, i) => {
        if (slot.remoteUrl) return slot.remoteUrl;
        const asset = await api.uploadImage(slot.file);
        a.onUploaded?.(i, asset.url);
        return asset.url;
      }),
    );

    const input = buildStillInput(a, uploaded);
    patchJob(a.localId, { phase: "submitting", input, inputHash: hashInput(input) });

    // La clave de idempotencia es nuestra y se genera ANTES de enviar: dos clics
    // seguidos comparten la misma promesa y producen un solo POST upstream.
    const job = await api.submit(input, a.localId);

    patchJob(a.localId, {
      phase: job.status === "queued" ? "queued" : "in_progress",
      requestId: job.id,
      statusUrl: job.statusUrl,
      cancelUrl: job.cancelUrl,
      correlationId: job.correlationId,
      submittedAt: Date.now(),
      nextPollAt: Date.now() + 2000,
    });
    ensureRunning();
  } catch (e) {
    throw finish(a.localId, e);
  }
}

export interface SubmitVideoArgs {
  localId: string;
  parentLocalId: string;
  recipe: Recipe;
  model: PublicModelSpec | undefined;
  modelId: string;
  userPrompt: string;
  imageUrl: string;
  durationSec: number;
  warnings: CapabilityChange[];
}

export async function submitVideo(a: SubmitVideoArgs): Promise<void> {
  const input: GenerationInput = {
    modelId: a.modelId,
    prompt: a.recipe.buildVideoPrompt(a.userPrompt),
    imageUrls: [a.imageUrl],
    durationSec: a.durationSec,
    resolution: a.model?.defaults.resolution,
  };

  upsertJob({
    localId: a.localId,
    modelId: a.modelId,
    modelLabel: a.model?.label ?? a.modelId,
    recipe: a.recipe.id,
    stage: "video",
    parentLocalId: a.parentLocalId,
    input,
    inputHash: hashInput(input),
    previews: [],
    sourcePreview: a.imageUrl,
    phase: "submitting",
    images: [],
    warnings: a.warnings,
    createdAt: Date.now(),
    pollAttempts: 0,
    nextPollAt: Number.MAX_SAFE_INTEGER,
    expectedCount: 1,
    etaSeconds: a.model?.medianSeconds ?? 90,
  } satisfies ClientJob);

  try {
    // Se vuelve a presupuestar en vez de reutilizar el de la foto: el vídeo es otro
    // escalón de precio, y enseñar el de la imagen sería mentirle al usuario.
    const est = await api.estimate(input);
    patchJob(a.localId, { estimate: est });

    const job = await api.submit(input, a.localId);
    patchJob(a.localId, {
      phase: job.status === "queued" ? "queued" : "in_progress",
      requestId: job.id,
      statusUrl: job.statusUrl,
      cancelUrl: job.cancelUrl,
      submittedAt: Date.now(),
      nextPollAt: Date.now() + 2000,
    });
    ensureRunning();
  } catch (e) {
    throw finish(a.localId, e);
  }
}

/**
 * Un fallo de red DESPUÉS de enviar es ambiguo: el POST pudo haber entrado. La API no
 * tiene idempotency key ni endpoint para listar peticiones, así que no se puede
 * reconciliar — y reintentar en silencio podría cobrar dos veces. Por eso ese caso
 * cae en `unknown_submit`, que en pantalla dice exactamente eso.
 */
function finish(localId: string, e: unknown): AppError {
  const err = e instanceof AppError ? e : new AppError("server_error", "Generation failed.");
  patchJob(localId, {
    phase: err.kind === "network" ? "unknown_submit" : "failed",
    error: err.toPayload(),
  });
  return err;
}

export function retryJob(localId: string): void {
  patchJob(localId, { phase: "draft", error: undefined, images: [], pollAttempts: 0 });
}

export function recheckJob(localId: string): void {
  patchJob(localId, { phase: "in_progress", nextPollAt: Date.now(), pollAttempts: 0 });
  ensureRunning();
}
