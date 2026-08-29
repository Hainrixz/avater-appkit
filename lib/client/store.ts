"use client";

import { useSyncExternalStore } from "react";
import type { AppErrorPayload } from "@/lib/shared/errors";
import type {
  CapabilityChange,
  Estimate,
  GenerationInput,
  ModelAvailability,
  PublicModelSpec,
  RecipeId,
} from "@/lib/shared/types";

/**
 * Un store de ~150 líneas en vez de TanStack Query.
 *
 * Query es excelente cacheando recursos del servidor, deduplicando entre componentes
 * y revalidando en segundo plano. Nada de eso es el problema aquí: hay un solo
 * cliente, sin caché compartida, y el objeto central no es un recurso cacheable sino
 * un TRABAJO con ciclo de vida. Se puede doblar `refetchInterval` hasta que sondee,
 * pero luego hay que pelearse con él para parar limpio en estado terminal, para
 * persistir entre recargas, para encadenar foto->vídeo y para el guardia de doble
 * envío. Sería una dependencia contra la que se trabaja.
 *
 * En un kit que la gente forkea, 150 líneas legibles ganan a una librería que hay que
 * aprender. Si esto llegara a tener galería en servidor o historial multiusuario,
 * entonces sí: el store es una costura fina y se cambia.
 */

export type JobPhase =
  | "draft"
  | "uploading"
  | "submitting"
  | "queued"
  | "in_progress"
  | "completed"
  | "failed"
  | "nsfw"
  | "canceled"
  | "timed_out"
  | "unknown_submit";

export const TERMINAL_PHASES: readonly JobPhase[] = [
  "completed",
  "failed",
  "nsfw",
  "canceled",
  "timed_out",
  "unknown_submit",
];

export const isTerminalPhase = (p: JobPhase) => TERMINAL_PHASES.includes(p);

/** Los resultados se borran del servidor a los ~7 días. */
export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** Qué quiere el usuario al final, decidido ANTES de generar. */
export type OutputMode = "image" | "video";

/** Encadenado automático: lo que hay que animar en cuanto la foto quede lista. */
export interface AutoAnimate {
  modelId: string;
  durationSec: number;
  userPrompt: string;
}

export interface ClientJob {
  localId: string;
  requestId?: string;
  modelId: string;
  modelLabel: string;
  recipe: RecipeId;
  stage: "still" | "video";
  parentLocalId?: string;

  input: GenerationInput;
  inputHash: string;
  /** Object URLs de las fotos del usuario. No se persisten: mueren al recargar. */
  previews: string[];
  /** Miniatura del origen, para el placeholder de progreso. */
  sourcePreview?: string;

  phase: JobPhase;
  estimate?: Estimate;
  images: string[];
  videoUrl?: string;
  error?: AppErrorPayload;
  warnings: CapabilityChange[];

  statusUrl?: string;
  cancelUrl?: string;
  correlationId?: string | null;

  createdAt: number;
  submittedAt?: number;
  completedAt?: number;
  expiresAt?: number;
  pollAttempts: number;
  nextPollAt: number;
  expectedCount: number;
  etaSeconds: number;
  /** Sólo en trabajos de foto creados en modo vídeo. El runner lo dispara al terminar. */
  autoAnimate?: AutoAnimate;
  /** Evita encadenar dos veces si llegan dos sondeos casi a la vez. */
  chained?: boolean;
}

export interface AppState {
  ready: boolean;
  key: { connected: boolean; keyId?: string; secretHint?: string };
  models: PublicModelSpec[];
  availability: Record<string, ModelAvailability>;
  probing: boolean;
  jobs: Record<string, ClientJob>;
  order: string[];
  recipe: RecipeId;
  outputMode: OutputMode;
  stillModelByRecipe: Partial<Record<RecipeId, string>>;
  videoModelByRecipe: Partial<Record<RecipeId, string>>;
}

const initial: AppState = {
  ready: false,
  key: { connected: false },
  models: [],
  availability: {},
  probing: false,
  jobs: {},
  order: [],
  recipe: "teleport",
  outputMode: "image",
  stillModelByRecipe: {},
  videoModelByRecipe: {},
};

let state: AppState = initial;
const listeners = new Set<() => void>();

/**
 * La lista derivada se CACHEA, y no es un detalle de rendimiento: es corrección.
 *
 * `useSyncExternalStore` compara el snapshot por identidad. Si el selector construye
 * un array nuevo en cada llamada —que es lo que hacía `jobList()` mapeando `order`—
 * React ve un valor distinto en cada render, vuelve a renderizar, vuelve a construirlo,
 * y entra en bucle hasta "Maximum update depth exceeded".
 *
 * Se recalcula UNA vez por mutación, dentro de emit(), y todo el mundo lee la misma
 * referencia hasta la siguiente.
 */
const EMPTY_JOBS: ClientJob[] = [];
let cachedJobs: ClientJob[] = EMPTY_JOBS;

function recomputeJobs() {
  cachedJobs = state.order
    .map((id) => state.jobs[id])
    .filter(Boolean) as ClientJob[];
}

function emit() {
  recomputeJobs();
  for (const l of listeners) l();
}

export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
  const next = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...next };
  emit();
}

export function getState(): AppState {
  return state;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function upsertJob(job: ClientJob) {
  const exists = job.localId in state.jobs;
  state = {
    ...state,
    jobs: { ...state.jobs, [job.localId]: job },
    order: exists ? state.order : [job.localId, ...state.order],
  };
  emit();
  persist();
}

export function patchJob(localId: string, patch: Partial<ClientJob>) {
  const current = state.jobs[localId];
  if (!current) return;
  state = { ...state, jobs: { ...state.jobs, [localId]: { ...current, ...patch } } };
  emit();
  persist();
}

export function removeJob(localId: string) {
  const jobs = { ...state.jobs };
  delete jobs[localId];
  state = { ...state, jobs, order: state.order.filter((id) => id !== localId) };
  emit();
  persist();
}

/** Referencia estable entre renders. Ver la nota de cachedJobs. */
export function jobList(): ClientJob[] {
  return cachedJobs;
}

/* ---------------- hooks ---------------- */

export function useAppState<T>(selector: (s: AppState) => T): T {
  // `initial` y `cachedJobs` son constantes de módulo, así que el snapshot de
  // servidor es estable y no dispara el aviso de getServerSnapshot.
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(initial),
  );
}

/* ---------------- persistencia ---------------- */

const STORAGE_KEY = "avatar-kit.jobs.v1";

/** Los object URLs mueren al recargar, así que no se guardan: se rehidrata sin ellos. */
function serializable(job: ClientJob): Omit<ClientJob, "previews" | "sourcePreview"> {
  const { previews: _p, sourcePreview: _s, ...rest } = job;
  void _p;
  void _s;
  return rest;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

export function persist() {
  if (typeof window === "undefined") return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      const payload = {
        order: state.order.slice(0, 60),
        jobs: Object.fromEntries(
          state.order.slice(0, 60).map((id) => [id, serializable(state.jobs[id]!)]),
        ),
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* cuota llena o modo privado: la persistencia es una comodidad, no crítica */
    }
  }, 300);
}

export function rehydrate() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as {
      order: string[];
      jobs: Record<string, ClientJob>;
    };
    const jobs: Record<string, ClientJob> = {};
    for (const [id, j] of Object.entries(parsed.jobs ?? {})) {
      jobs[id] = { ...j, previews: [], sourcePreview: undefined };
    }
    state = { ...state, jobs, order: parsed.order ?? [] };
    emit();
  } catch {
    /* JSON corrupto: se ignora en vez de romper el arranque */
  }
}

/* ---------------- hash para deduplicar ---------------- */

export function hashInput(input: GenerationInput): string {
  const canonical = JSON.stringify({
    m: input.modelId,
    p: input.prompt,
    i: input.imageUrls,
    a: input.aspectRatio,
    r: input.resolution,
    d: input.durationSec,
    b: input.batchSize,
  });
  let h = 0;
  for (let i = 0; i < canonical.length; i++) {
    h = (h << 5) - h + canonical.charCodeAt(i);
    h |= 0;
  }
  return String(h >>> 0);
}
