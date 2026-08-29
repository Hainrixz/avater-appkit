"use client";

import { AppError } from "@/lib/shared/errors";
import type { RequestStatus } from "@/lib/shared/types";
import { pollJob } from "./api";
import {
  RETENTION_MS,
  getState,
  isTerminalPhase,
  jobList,
  patchJob,
  type ClientJob,
  type JobPhase,
} from "./store";

/**
 * UN SOLO setTimeout PARA TODOS LOS TRABAJOS.
 *
 * Con un timer por trabajo, N generaciones son N timers, y el doble montaje de
 * StrictMode en React 19 arrancaría dos bucles. Un scheduler de módulo con una
 * función `ensureRunning()` idempotente evita las dos cosas.
 *
 * El backoff es el que documenta la API: 2000ms, x1.5, tope 10000ms, más jitter de
 * 0-500ms para que varios trabajos no se sincronicen.
 */

const BASE_DELAY = 2_000;
const MAX_DELAY = 10_000;
const FACTOR = 1.5;
const JITTER = 500;
const MAX_CONCURRENT_POLLS = 3;
const TIMEOUT_MS = 5 * 60_000;

export function nextDelay(attempt: number): number {
  return Math.min(MAX_DELAY, BASE_DELAY * Math.pow(FACTOR, attempt)) + Math.random() * JITTER;
}

const STATUS_TO_PHASE: Record<RequestStatus, JobPhase> = {
  queued: "queued",
  in_progress: "in_progress",
  completed: "completed",
  failed: "failed",
  nsfw: "nsfw",
  canceled: "canceled",
};

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;

function pollable(): ClientJob[] {
  return jobList().filter((j) => j.requestId && !isTerminalPhase(j.phase));
}

async function pollOne(job: ClientJob): Promise<void> {
  if (Date.now() - (job.submittedAt ?? job.createdAt) > TIMEOUT_MS) {
    // Nunca se borra la tarjeta: el trabajo puede seguir vivo del otro lado.
    patchJob(job.localId, { phase: "timed_out" });
    return;
  }

  try {
    const res = await pollJob(job.requestId!, job.statusUrl);
    const phase = STATUS_TO_PHASE[res.status] ?? "in_progress";
    const terminal = isTerminalPhase(phase);
    const completedAt = terminal ? Date.now() : undefined;

    patchJob(job.localId, {
      phase,
      images: res.images ?? [],
      videoUrl: res.videoUrl,
      statusUrl: res.statusUrl ?? job.statusUrl,
      cancelUrl: res.cancelUrl ?? job.cancelUrl,
      correlationId: res.correlationId ?? job.correlationId,
      error:
        res.status === "failed"
          ? {
              kind: "server_error",
              message: res.error || "Generation failed.",
              status: undefined,
              correlationId: res.correlationId ?? null,
              retryable: false,
            }
          : undefined,
      pollAttempts: job.pollAttempts + 1,
      nextPollAt: terminal ? Number.MAX_SAFE_INTEGER : Date.now() + nextDelay(job.pollAttempts + 1),
      completedAt,
      expiresAt: completedAt ? completedAt + RETENTION_MS : job.expiresAt,
    });
  } catch (e) {
    // Sólo 401 y 404 son definitivos. Red y 5xx se reintentan: es un GET, es seguro.
    if (e instanceof AppError && (e.kind === "unauthorized" || e.kind === "not_found")) {
      patchJob(job.localId, { phase: "failed", error: e.toPayload() });
      return;
    }
    patchJob(job.localId, {
      pollAttempts: job.pollAttempts + 1,
      nextPollAt: Date.now() + nextDelay(job.pollAttempts + 1),
    });
  }
}

async function tick(): Promise<void> {
  timer = null;
  if (typeof document !== "undefined" && document.hidden) {
    schedule(3_000); // pestaña oculta: no machacar la API
    return;
  }

  const now = Date.now();
  const due = pollable()
    .filter((j) => j.nextPollAt <= now)
    .slice(0, MAX_CONCURRENT_POLLS);

  await Promise.all(due.map(pollOne));

  const remaining = pollable();
  if (remaining.length === 0) {
    running = false;
    return;
  }
  const soonest = Math.min(...remaining.map((j) => j.nextPollAt));
  schedule(Math.max(250, soonest - Date.now()));
}

function schedule(ms: number): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void tick(), ms);
}

/** Idempotente: se puede llamar desde cualquier efecto sin arrancar dos bucles. */
export function ensureRunning(): void {
  if (running) return;
  if (pollable().length === 0) return;
  running = true;
  schedule(0);
}

export function stopRunner(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  running = false;
}

/** Al volver a la pestaña se sondea de inmediato en vez de esperar al backoff. */
export function attachVisibilityResume(): () => void {
  const onVisible = () => {
    if (document.hidden) return;
    for (const j of pollable()) patchJob(j.localId, { nextPollAt: Date.now() });
    ensureRunning();
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => document.removeEventListener("visibilitychange", onVisible);
}

export function hasActiveJobs(): boolean {
  return getState().order.some((id) => {
    const j = getState().jobs[id];
    return j && !isTerminalPhase(j.phase);
  });
}
