"use client";

import { AppError } from "@/lib/shared/errors";
import type { CapabilityChange, GenerationInput, PublicModelSpec } from "@/lib/shared/types";
import type { Recipe } from "@/lib/recipes";
import * as api from "./api";
import { ensureRunning } from "./job-runner";
import {
  hashInput,
  patchJob,
  removeJob,
  upsertJob,
  type AutoAnimate,
  type ClientJob,
} from "./store";

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
  /** En modo vídeo, lo que hay que animar en cuanto la foto esté lista. */
  autoAnimate?: AutoAnimate;
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
    autoAnimate: a.autoAnimate,
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

/**
 * ENCADENADO AUTOMÁTICO foto -> vídeo.
 *
 * Todos los modelos de vídeo verificados exigen una imagen de entrada, así que por
 * dentro esto siempre son dos llamadas. Eso es arquitectura, no una decisión que le
 * toque tomar al usuario: si pidió vídeo, la app hace los dos pasos sola y le cobra
 * el total que ya le enseñó. El botón "Animate" sigue existiendo para el modo foto,
 * cuando uno mira las cuatro tomas y decide cuál merece moverse.
 *
 * Lo dispara el runner de sondeo al ver `completed`, y `chained` evita que dos
 * sondeos casi simultáneos lancen dos vídeos.
 */
export async function runAutoAnimate(
  parent: ClientJob,
  recipe: Recipe,
  model: PublicModelSpec | undefined,
): Promise<void> {
  const plan = parent.autoAnimate;
  const first = parent.images[0];
  if (!plan || !first || parent.chained) return;

  patchJob(parent.localId, { chained: true });

  await submitVideo({
    localId: crypto.randomUUID(),
    parentLocalId: parent.localId,
    recipe,
    model,
    modelId: plan.modelId,
    userPrompt: plan.userPrompt,
    imageUrl: first,
    durationSec: plan.durationSec,
    warnings: [],
  }).catch(() => {
    /* submitVideo ya dejó el trabajo hijo en estado de error y visible en la rejilla. */
  });
}

/**
 * REINTENTAR ES VOLVER A ENVIAR, NO APARCAR EN "draft".
 *
 * La versión anterior hacía `patchJob(id, { phase: "draft" })` y dejaba intactos el
 * `requestId` y el `nextPollAt: Number.MAX_SAFE_INTEGER` que se estampan al llegar a
 * un estado terminal. Eso rompía tres cosas a la vez, y una era grave:
 *
 *  - "draft" no está en TERMINAL_PHASES, así que `pollable()` volvía a aceptar el
 *    trabajo. El planificador calculaba `soonest = 9007199254740991` y se lo pasaba a
 *    setTimeout, que lo trunca a un long de 32 bits: 9007199254740991|0 === -1, o sea
 *    delay negativo, o sea dispara ya. El bucle giraba ~250 veces por segundo durante
 *    toda la vida de la pestaña, y como el trabajo se persistía en localStorage,
 *    volvía a armarse en cada recarga.
 *  - La tarjeta se quedaba en "Rendering" para siempre y sumaba al contador de
 *    "N running", porque ResultsGrid trata cualquier fase no terminal como en curso.
 *  - Al volver a la pestaña, attachVisibilityResume sondeaba el requestId muerto y
 *    revertía la tarjeta a "failed", deshaciendo el reintento en silencio.
 *
 * Además el toast prometía "Inputs kept" y el formulario nunca se rellenaba: mentía.
 *
 * Ahora reintentar hace lo que dice: reenvía la MISMA entrada —las imágenes ya están
 * subidas, así que no se vuelve a subir nada— con una clave de idempotencia nueva, y
 * la tarjeta muerta desaparece. La fase "draft" ya no se le asigna nunca a un trabajo.
 */
export async function resubmitJob(job: ClientJob): Promise<void> {
  const localId = crypto.randomUUID();

  upsertJob({
    ...job,
    localId,
    requestId: undefined,
    statusUrl: undefined,
    cancelUrl: undefined,
    correlationId: undefined,
    error: undefined,
    images: [],
    videoUrl: undefined,
    phase: "submitting",
    createdAt: Date.now(),
    submittedAt: undefined,
    completedAt: undefined,
    expiresAt: undefined,
    pollAttempts: 0,
    nextPollAt: Number.MAX_SAFE_INTEGER,
    chained: false,
  });
  removeJob(job.localId);

  try {
    const res = await api.submit(job.input, localId);
    patchJob(localId, {
      phase: res.status === "queued" ? "queued" : "in_progress",
      requestId: res.id,
      statusUrl: res.statusUrl,
      cancelUrl: res.cancelUrl,
      correlationId: res.correlationId,
      submittedAt: Date.now(),
      nextPollAt: Date.now() + 2000,
    });
    ensureRunning();
  } catch (e) {
    throw finish(localId, e);
  }
}

/**
 * `submittedAt` TIENE que moverse. El presupuesto de 5 minutos en pollOne se mide
 * contra él, así que dejarlo en el envío original hacía que "Check again" volviera a
 * expirar en el primer sondeo — el botón parecía no hacer absolutamente nada.
 */
export function recheckJob(localId: string): void {
  patchJob(localId, {
    phase: "in_progress",
    nextPollAt: Date.now(),
    pollAttempts: 0,
    submittedAt: Date.now(),
  });
  ensureRunning();
}
