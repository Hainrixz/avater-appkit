"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, LogOut, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppError } from "@/lib/shared/errors";
import type { GenerationInput, PublicModelSpec, RecipeId } from "@/lib/shared/types";
import { RECIPE_LIST, getRecipe } from "@/lib/recipes";
import { formatCredits, formatUsd } from "@/lib/format";
import * as api from "@/lib/client/api";
import {
  hashInput,
  isTerminalPhase,
  jobList,
  patchJob,
  rehydrate,
  upsertJob,
  useAppState,
  setState,
  type ClientJob,
} from "@/lib/client/store";
import { attachVisibilityResume, ensureRunning } from "@/lib/client/job-runner";
import { ApiKeyGate } from "./ApiKeyGate";
import { ModelSwitcher } from "./ModelSwitcher";
import { SlotDropzone } from "@/components/upload/SlotDropzone";
import type { SlotValue } from "@/components/upload/DropSlot";
import { ResultsGrid } from "@/components/results/ResultsGrid";

const stillOf = (m: PublicModelSpec) =>
  m.capability !== "image->video" && m.capability !== "text->video";

export function StudioShell() {
  const state = useAppState((s) => s);
  const [slots, setSlots] = useState<Record<string, SlotValue | null>>({});
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(4);
  const [estimating, setEstimating] = useState(false);
  const [estimate, setEstimate] = useState<{ credits: number; usd: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const estimateAbort = useRef<AbortController | null>(null);

  const recipe = getRecipe(state.recipe);
  const jobs = useAppState(() => jobList());

  /* ---------------- arranque ---------------- */

  const probe = useCallback(async (force: boolean) => {
    setState({ probing: true });
    try {
      const res = await api.probeModels("curated", force);
      setState((s) => ({ availability: { ...s.availability, ...res.availability } }));
    } catch (e) {
      if (e instanceof AppError && e.kind === "unauthorized") {
        setState({ key: { connected: false } });
      }
    } finally {
      setState({ probing: false });
    }
  }, []);

  useEffect(() => {
    rehydrate();
    let alive = true;

    (async () => {
      try {
        const [k, m] = await Promise.all([api.keyStatus(), api.fetchModels()]);
        if (!alive) return;
        setState({
          ready: true,
          key: k.connected
            ? { connected: true, keyId: k.keyId, secretHint: k.secretHint }
            : { connected: false },
          models: m.models,
          availability: m.availability ?? {},
        });
        if (k.connected) void probe(false);
      } catch {
        if (alive) setState({ ready: true });
      }
    })();

    const detach = attachVisibilityResume();
    ensureRunning();
    return () => {
      alive = false;
      detach();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- selección de modelo ---------------- */

  const stillModels = useMemo(
    () => state.models.filter((m) => stillOf(m) && m.recipes.includes(state.recipe)),
    [state.models, state.recipe],
  );
  const videoModels = useMemo(
    () => state.models.filter((m) => !stillOf(m) && m.recipes.includes(state.recipe)),
    [state.models, state.recipe],
  );

  const stillModelId = state.stillModelByRecipe[state.recipe] ?? recipe.stillModelId;
  const videoModelId = state.videoModelByRecipe[state.recipe] ?? recipe.videoModelId;
  const stillModel = state.models.find((m) => m.id === stillModelId);

  /* ---------------- entrada actual ---------------- */

  const filled = recipe.slots.map((s) => slots[s.id]).filter(Boolean) as SlotValue[];
  const ready =
    state.key.connected &&
    filled.length === recipe.slots.length &&
    (!recipe.promptRequired || prompt.trim().length > 0);

  const buildInput = useCallback(
    (imageUrls: string[]): GenerationInput => ({
      modelId: stillModelId,
      prompt: recipe.buildPrompt(prompt),
      imageUrls,
      aspectRatio: recipe.aspectRatio,
      batchSize: count,
      resolution: stillModel?.defaults.resolution,
    }),
    [stillModelId, recipe, prompt, count, stillModel],
  );

  /**
   * El presupuesto se pide SIEMPRE antes de enviar.
   *
   * No hay endpoint de saldo, así que un 403 por créditos insuficientes sólo se
   * descubre al enviar. El /estimate es lo único que impide que el coste sea una
   * sorpresa, y es gratis. Se pide con URLs de marcador: el precio depende del modelo
   * y los ajustes, no del contenido de la foto.
   */
  useEffect(() => {
    if (!state.key.connected || !stillModelId) return;
    estimateAbort.current?.abort();
    const ctrl = new AbortController();
    estimateAbort.current = ctrl;

    const id = setTimeout(async () => {
      setEstimating(true);
      try {
        const placeholder = recipe.slots.map(() => "https://cdn.example.com/probe.jpg");
        const est = await api.estimate(buildInput(placeholder), ctrl.signal);
        setEstimate({ credits: est.credits, usd: est.usd });
      } catch {
        setEstimate(null);
      } finally {
        setEstimating(false);
      }
    }, 250);

    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [state.key.connected, stillModelId, count, recipe, buildInput]);

  /* ---------------- generar ---------------- */

  const generate = useCallback(async () => {
    if (!ready || submitting) return;

    const localId = crypto.randomUUID();
    const sourcePreview = filled[0]?.previewUrl;

    const draft: ClientJob = {
      localId,
      modelId: stillModelId,
      modelLabel: stillModel?.label ?? stillModelId,
      recipe: state.recipe,
      stage: "still",
      input: buildInput([]),
      inputHash: "",
      previews: filled.map((f) => f.previewUrl),
      sourcePreview,
      phase: "uploading",
      images: [],
      warnings: [],
      createdAt: Date.now(),
      pollAttempts: 0,
      nextPollAt: Number.MAX_SAFE_INTEGER,
      expectedCount: count,
      etaSeconds: stillModel?.medianSeconds ?? 10,
      estimate: estimate
        ? { credits: estimate.credits, usd: estimate.usd, raw: { credits: "", usd: "" } }
        : undefined,
    };

    setSubmitting(true);
    upsertJob(draft);

    try {
      const uploaded = await Promise.all(
        recipe.slots.map(async (s) => {
          const v = slots[s.id];
          if (!v) throw new AppError("invalid_params", `Missing ${s.label}.`);
          if (v.remoteUrl) return v.remoteUrl;
          const asset = await api.uploadImage(v.file);
          setSlots((prev) => ({
            ...prev,
            [s.id]: prev[s.id] ? { ...prev[s.id]!, remoteUrl: asset.url } : prev[s.id]!,
          }));
          return asset.url;
        }),
      );

      const input = buildInput(uploaded);
      patchJob(localId, { phase: "submitting", input, inputHash: hashInput(input) });

      // La clave de idempotencia es NUESTRA, generada antes de enviar: dos clics
      // seguidos comparten la misma promesa y producen un solo POST upstream.
      const job = await api.submit(input, localId);

      patchJob(localId, {
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
      const err = e instanceof AppError ? e : new AppError("server_error", "Failed.");
      // Un fallo de red DESPUÉS de enviar es ambiguo: no se reintenta nunca solo.
      patchJob(localId, {
        phase: err.kind === "network" ? "unknown_submit" : "failed",
        error: err.toPayload(),
      });
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }, [
    ready,
    submitting,
    filled,
    stillModelId,
    stillModel,
    state.recipe,
    buildInput,
    count,
    estimate,
    recipe.slots,
    slots,
  ]);

  /* ---------------- etapa 2: animar ---------------- */

  const animate = useCallback(
    async (parent: ClientJob, imageUrl: string) => {
      const model = state.models.find((m) => m.id === videoModelId);
      const localId = crypto.randomUUID();

      const input: GenerationInput = {
        modelId: videoModelId,
        prompt: recipe.buildVideoPrompt(prompt),
        imageUrls: [imageUrl],
        durationSec: model?.defaults.durationSec,
        resolution: model?.defaults.resolution,
      };

      upsertJob({
        localId,
        modelId: videoModelId,
        modelLabel: model?.label ?? videoModelId,
        recipe: state.recipe,
        stage: "video",
        parentLocalId: parent.localId,
        input,
        inputHash: hashInput(input),
        previews: [],
        sourcePreview: imageUrl,
        phase: "submitting",
        images: [],
        warnings: [],
        createdAt: Date.now(),
        pollAttempts: 0,
        nextPollAt: Number.MAX_SAFE_INTEGER,
        expectedCount: 1,
        etaSeconds: model?.medianSeconds ?? 90,
      });

      try {
        // Se vuelve a pedir presupuesto: el vídeo es otro escalón de precio y
        // reutilizar el de la foto sería mentirle al usuario.
        const est = await api.estimate(input);
        patchJob(localId, { estimate: est });

        const job = await api.submit(input, localId);
        patchJob(localId, {
          phase: job.status === "queued" ? "queued" : "in_progress",
          requestId: job.id,
          statusUrl: job.statusUrl,
          cancelUrl: job.cancelUrl,
          submittedAt: Date.now(),
          nextPollAt: Date.now() + 2000,
        });
        ensureRunning();
      } catch (e) {
        const err = e instanceof AppError ? e : new AppError("server_error", "Failed.");
        patchJob(localId, {
          phase: err.kind === "network" ? "unknown_submit" : "failed",
          error: err.toPayload(),
        });
        toast.error(err.message);
      }
    },
    [state.models, videoModelId, recipe, prompt, state.recipe],
  );

  const retry = useCallback((job: ClientJob) => {
    patchJob(job.localId, {
      phase: "draft",
      error: undefined,
      images: [],
      pollAttempts: 0,
    });
    toast("Inputs kept — adjust and hit Generate.");
  }, []);

  const checkAgain = useCallback((job: ClientJob) => {
    patchJob(job.localId, { phase: "in_progress", nextPollAt: Date.now(), pollAttempts: 0 });
    ensureRunning();
  }, []);

  async function disconnect() {
    await api.disconnectKey();
    setState({ key: { connected: false }, availability: {} });
  }

  /* ---------------- render ---------------- */

  const locked = state.ready && !state.key.connected;
  const activeCount = jobs.filter((j) => !isTerminalPhase(j.phase)).length;

  return (
    <div className="relative min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-hairline bg-black/70 backdrop-blur-[16px] backdrop-saturate-150">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded bg-rose">
              <Sparkles className="size-3.5 text-white" />
            </span>
            <span className="font-display text-ui font-bold tracking-[-0.02em] text-ink">
              Avatar App Kit
            </span>
          </Link>

          <div className="flex items-center gap-2">
            {activeCount > 0 ? (
              <span className="hidden text-meta text-ink-muted sm:inline tnum">
                {activeCount} running
              </span>
            ) : null}
            {state.key.connected ? (
              <>
                <button
                  onClick={() => void probe(true)}
                  disabled={state.probing}
                  className="grid size-8 place-items-center rounded-md text-ink-faint hover:text-ink"
                  aria-label="Re-check which models your key can run"
                >
                  {state.probing ? (
                    <Loader2 className="size-4 animate-spin" data-motion="essential" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                </button>
                <span className="hidden rounded-full border border-hairline px-2.5 py-1 font-mono text-micro tracking-normal text-ink-muted sm:inline">
                  {state.key.keyId?.slice(0, 8)}… {state.key.secretHint}
                </span>
                <button
                  onClick={() => void disconnect()}
                  className="grid size-8 place-items-center rounded-md text-ink-faint hover:text-ink"
                  aria-label="Disconnect key"
                >
                  <LogOut className="size-4" />
                </button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <main
        data-surface="atmos"
        className="mx-auto grid max-w-[1440px] gap-6 px-6 py-6 lg:grid-cols-[420px_1fr]"
      >
        {/* El estudio se dibuja siempre, atenuado e inert hasta que hay llave:
            ver lo que vas a desbloquear vale más que un texto de onboarding. */}
        <div
          className={locked ? "pointer-events-none select-none opacity-35" : undefined}
          {...(locked ? { inert: "" as unknown as boolean } : {})}
        >
          <div className="sticky top-[88px] flex flex-col gap-5 rounded-xl border border-hairline bg-panel p-5">
            <Tabs
              value={state.recipe}
              onValueChange={(v) => {
                setState({ recipe: v as RecipeId });
                setSlots({});
                setEstimate(null);
              }}
            >
              <TabsList className="w-full">
                {RECIPE_LIST.map((r) => (
                  <TabsTrigger key={r.id} value={r.id} className="flex-1">
                    {r.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <p className="-mt-2 text-meta text-ink-muted">{recipe.blurb}</p>

            <SlotDropzone
              recipe={recipe}
              values={slots}
              onChange={(id, v) => setSlots((prev) => ({ ...prev, [id]: v }))}
            />

            <div className="flex flex-col gap-2">
              <label htmlFor="prompt" className="text-meta font-medium text-ink-muted">
                {recipe.promptRequired ? "Where do you want to be?" : "Setting (optional)"}
              </label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={recipe.promptPlaceholder}
                rows={2}
                className="w-full resize-none rounded-md border border-hairline bg-canvas px-3 py-2 text-ui text-ink placeholder:text-ink-faint focus-visible:border-edge"
              />
              <div className="flex flex-wrap gap-1.5">
                {recipe.presets.slice(0, 3).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPrompt(p)}
                    className="rounded-full border border-hairline px-2.5 py-1 text-micro tracking-normal text-ink-muted hover:border-edge hover:text-ink"
                  >
                    {p.split(",")[0]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-meta font-medium text-ink-muted">Model</span>
              <ModelSwitcher
                models={stillModels}
                availability={state.availability}
                value={stillModelId}
                probing={state.probing}
                onChange={(id) =>
                  setState((s) => ({
                    stillModelByRecipe: { ...s.stillModelByRecipe, [s.recipe]: id },
                  }))
                }
              />
              {/* La relación de aspecto se decide AQUÍ: ningún modelo de vídeo
                  verificado acepta aspect_ratio, lo hereda de la imagen de origen. */}
              <p className="text-micro tracking-normal text-ink-faint">
                {recipe.aspectRatio} · video inherits this from the still
              </p>
            </div>

            {recipe.counts.length > 1 ? (
              <div className="flex items-center gap-2">
                <span className="text-meta font-medium text-ink-muted">Outputs</span>
                <div className="flex gap-1">
                  {recipe.counts.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCount(c)}
                      aria-pressed={count === c}
                      className={
                        count === c
                          ? "rounded-md bg-panel-raised px-3 py-1 text-meta font-semibold text-ink"
                          : "rounded-md px-3 py-1 text-meta text-ink-muted hover:text-ink"
                      }
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <Button
              onClick={() => void generate()}
              disabled={!ready || submitting}
              className="h-12 bg-rose text-[15px] font-semibold text-white shadow-[var(--shadow-cta)] hover:bg-rose-hover disabled:opacity-40"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" data-motion="essential" />
                  Sending…
                </>
              ) : (
                <>
                  Generate
                  {estimate ? (
                    <span className="ml-1 font-normal opacity-90 tnum">
                      · {formatCredits(estimate.credits)} · {formatUsd(estimate.usd)}
                    </span>
                  ) : estimating ? (
                    <span className="ml-1 opacity-70">· pricing…</span>
                  ) : null}
                </>
              )}
            </Button>
          </div>
        </div>

        <div data-surface="stage" className="min-w-0 rounded-xl p-4">
          <ResultsGrid
            jobs={jobs}
            canAnimate={recipe.canAnimate && videoModels.length > 0}
            onAnimate={(job, url) => void animate(job, url)}
            onRetry={retry}
            onCheckAgain={checkAgain}
          />
        </div>
      </main>

      {locked ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/55 p-6 backdrop-blur-[2px]">
          <ApiKeyGate
            onConnected={(info) => {
              setState({ key: { connected: true, ...info } });
              void probe(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
