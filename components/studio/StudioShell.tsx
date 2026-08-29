"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Film, Image as ImageIcon, Loader2, LogOut, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppError } from "@/lib/shared/errors";
import type { GenerationInput, PublicModelSpec, RecipeId } from "@/lib/shared/types";
import { RECIPE_LIST, getRecipe, type Recipe } from "@/lib/recipes";
import { formatCredits, formatUsd } from "@/lib/format";
import * as api from "@/lib/client/api";
import {
  isActivePhase,
  jobList,
  rehydrate,
  useAppState,
  setState,
  type ClientJob,
} from "@/lib/client/store";
import { attachVisibilityResume, ensureRunning } from "@/lib/client/job-runner";
import { recheckJob, resubmitJob, submitStill, submitVideo } from "@/lib/client/actions";
import { describeChange, diffCapabilities, snapEnum } from "@/lib/provider/higgsfield/normalize";
import { ApiKeyGate } from "./ApiKeyGate";
import { ModelSwitcher } from "./ModelSwitcher";
import { SlotDropzone } from "@/components/upload/SlotDropzone";
import type { SlotValue } from "@/components/upload/DropSlot";
import { ResultsGrid } from "@/components/results/ResultsGrid";

const stillOf = (m: PublicModelSpec) =>
  m.capability !== "image->video" && m.capability !== "text->video";

/** El precio depende del modelo y los ajustes, no del contenido de la foto, así que
 *  presupuestar antes de subir nada es correcto y además instantáneo. */
const PRICE_PROBE_URL = "https://cdn.example.com/probe.jpg";

/**
 * Construir la entrada es una función PURA fuera del componente, no un useCallback.
 *
 * Next 16 trae el React Compiler, que memoiza solo; una memoización manual que no
 * puede preservar es un error de lint, no una optimización. Sacando esto del cuerpo
 * del componente desaparece el problema y además el efecto de presupuesto puede
 * depender sólo de primitivos, que es lo que de verdad evita que se re-dispare.
 */
function makeStillInput(args: {
  modelId: string;
  recipe: Recipe;
  userPrompt: string;
  count: number;
  resolution?: string;
  imageUrls: string[];
}): GenerationInput {
  return {
    modelId: args.modelId,
    prompt: args.recipe.buildPrompt(args.userPrompt),
    imageUrls: args.imageUrls,
    aspectRatio: args.recipe.aspectRatio,
    batchSize: args.count,
    resolution: args.resolution,
  };
}

export function StudioShell() {
  const state = useAppState((s) => s);
  const [slots, setSlots] = useState<Record<string, SlotValue | null>>({});
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(4);
  const [estimating, setEstimating] = useState(false);
  const [estimate, setEstimate] = useState<{ credits: number; usd: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /* La duración PREFERIDA del usuario, no la efectiva. Se conserva al cambiar de
     modelo para que el ajuste sea visible: si pide 5s y pasa a Hailuo, que sólo hace
     6 y 10, la app usa 6 y lo dice, en vez de fingir que el usuario pidió 6. */
  const [preferredDuration, setPreferredDuration] = useState(5);
  /* El presupuesto del vídeo lleva pegado a qué modelo y duración corresponde. Sin eso,
     al cambiar de modelo se enseñaría el precio anterior durante el rebote de 250ms —
     un total equivocado en el botón, que es justo lo que no puede pasar. */
  const [videoEstimate, setVideoEstimate] = useState<
    { credits: number; usd: number; modelId: string; durationSec: number } | null
  >(null);
  const estimateAbort = useRef<AbortController | null>(null);
  const videoEstimateAbort = useRef<AbortController | null>(null);

  const recipe = getRecipe(state.recipe);
  const jobs = useAppState(() => jobList());

  /* ---------------- arranque ---------------- */

  async function probe(force: boolean) {
    setState({ probing: true });
    try {
      // "all" y no "curated": con sólo los curados, los modelos extendidos salían
      // con un guión mudo en el selector. 15 modelos tardan ~7s en segundo plano,
      // mientras el usuario suelta la foto, y a cambio cada fila dice un precio real
      // o un motivo real. Un guión no informa de nada.
      const res = await api.probeModels("all", force);
      setState((s) => ({ availability: { ...s.availability, ...res.availability } }));
    } catch (e) {
      if (e instanceof AppError && e.kind === "unauthorized") {
        setState({ key: { connected: false } });
      }
    } finally {
      setState({ probing: false });
    }
  }

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
  }, []);

  /* ---------------- selección de modelo ---------------- */

  const stillModels = state.models.filter(
    (m) => stillOf(m) && m.recipes.includes(state.recipe),
  );
  const videoModels = state.models.filter(
    (m) => !stillOf(m) && m.recipes.includes(state.recipe),
  );

  const stillModelId = state.stillModelByRecipe[state.recipe] ?? recipe.stillModelId;
  const videoModelId = state.videoModelByRecipe[state.recipe] ?? recipe.videoModelId;
  const stillModel = state.models.find((m) => m.id === stillModelId);
  const videoModel = state.models.find((m) => m.id === videoModelId);

  const videoDurations = videoModel?.supports.durationsSec ?? [];
  const effectiveDuration = videoDurations.length
    ? snapEnum(preferredDuration, videoDurations, videoDurations[0]!)
    : preferredDuration;
  /* Se compara contra la preferencia del usuario Y contra la relación de aspecto
     de la receta: ningún modelo de vídeo verificado acepta aspect_ratio, así que
     esa línea sale siempre y explica de dónde la hereda. */
  const videoWarnings = videoModel
    ? diffCapabilities(videoModel, {
        durationSec: preferredDuration,
        aspectRatio: recipe.aspectRatio,
      })
    : [];

  /* ---------------- entrada actual ---------------- */

  const wantsVideo = state.outputMode === "video";
  /* En modo vídeo se genera UNA sola foto: es la que se va a animar, y pagar cuatro
     para tirar tres sería cobrarle al usuario por nada. */
  const effectiveCount = wantsVideo ? 1 : count;

  const filled = recipe.slots.map((s) => slots[s.id]).filter(Boolean) as SlotValue[];
  const ready =
    state.key.connected &&
    filled.length === recipe.slots.length &&
    (!recipe.promptRequired || prompt.trim().length > 0);

  const stillResolution = stillModel?.defaults.resolution;
  const keyConnected = state.key.connected;
  const recipeId = state.recipe;

  /**
   * El presupuesto se pide SIEMPRE antes de enviar.
   *
   * No hay endpoint de saldo, así que un 403 por créditos insuficientes sólo se
   * descubre al enviar. El /estimate es lo único que impide que el coste sea una
   * sorpresa, y es gratis. Se pide con URLs de marcador: el precio depende del modelo
   * y los ajustes, no del contenido de la foto.
   */
  useEffect(() => {
    if (!keyConnected || !stillModelId) return;
    estimateAbort.current?.abort();
    const ctrl = new AbortController();
    estimateAbort.current = ctrl;

    const id = setTimeout(async () => {
      setEstimating(true);
      try {
        const r = getRecipe(recipeId);
        const est = await api.estimate(
          makeStillInput({
            modelId: stillModelId,
            recipe: r,
            userPrompt: prompt,
            count: effectiveCount,
            resolution: stillResolution,
            imageUrls: r.slots.map(() => PRICE_PROBE_URL),
          }),
          ctrl.signal,
        );
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
  }, [keyConnected, stillModelId, effectiveCount, recipeId, prompt, stillResolution]);

  /* Segundo presupuesto: la etapa de vídeo. Se pide aparte porque es otro escalón de
     precio, y el usuario tiene que ver el TOTAL antes de pulsar Generate. */
  useEffect(() => {
    if (!keyConnected || !wantsVideo || !videoModelId) return;
    videoEstimateAbort.current?.abort();
    const ctrl = new AbortController();
    videoEstimateAbort.current = ctrl;

    const id = setTimeout(async () => {
      try {
        const est = await api.estimate(
          {
            modelId: videoModelId,
            prompt: "x",
            imageUrls: [PRICE_PROBE_URL],
            durationSec: effectiveDuration,
          },
          ctrl.signal,
        );
        setVideoEstimate({
          credits: est.credits,
          usd: est.usd,
          modelId: videoModelId,
          durationSec: effectiveDuration,
        });
      } catch {
        setVideoEstimate(null);
      }
    }, 250);

    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [keyConnected, wantsVideo, videoModelId, effectiveDuration]);

  /* Sólo cuenta si es el presupuesto de ESTE modelo y ESTA duración. */
  const liveVideoEstimate =
    wantsVideo &&
    videoEstimate &&
    videoEstimate.modelId === videoModelId &&
    videoEstimate.durationSec === effectiveDuration
      ? videoEstimate
      : null;

  const totalCredits = (estimate?.credits ?? 0) + (liveVideoEstimate?.credits ?? 0);
  const totalUsd = (estimate?.usd ?? 0) + (liveVideoEstimate?.usd ?? 0);
  const priceReady = Boolean(estimate) && (!wantsVideo || Boolean(liveVideoEstimate));

  /* ---------------- generar ---------------- */

  async function generate() {
    if (!ready || submitting) return;
    const localId = crypto.randomUUID();
    /* Se congela lo que se envía en este instante, para poder comparar después. */
    const slotFilesAtSubmit = recipe.slots.map((sl) => slots[sl.id]!);
    setSubmitting(true);
    try {
      await submitStill({
        localId,
        recipe,
        model: stillModel,
        modelId: stillModelId,
        userPrompt: prompt,
        count: effectiveCount,
        slotFiles: slotFilesAtSubmit,
        estimate: estimate ?? undefined,
        autoAnimate: wantsVideo
          ? { modelId: videoModelId, durationSec: effectiveDuration, userPrompt: prompt }
          : undefined,
        /* La URL subida se escribe SÓLO si la ranura sigue teniendo el mismo archivo.
           Si el usuario cambia la foto mientras la anterior aún se sube, escribir por
           índice le pegaría la URL vieja a la foto nueva, y el siguiente Generate
           usaría en silencio la imagen que ya descartó. */
        onUploaded: (i, url) => {
          const slotId = recipe.slots[i]!.id;
          const sent = slotFilesAtSubmit[i];
          setSlots((prev) => {
            const current = prev[slotId];
            if (!current || !sent || current.file !== sent.file) return prev;
            return { ...prev, [slotId]: { ...current, remoteUrl: url } };
          });
        },
      });
    } catch (e) {
      toast.error(e instanceof AppError ? e.message : "Generation failed.");
    } finally {
      setSubmitting(false);
    }
  }

  /* ---------------- etapa 2: animar ---------------- */

  async function animate(parent: ClientJob, imageUrl: string) {
    try {
      await submitVideo({
        localId: crypto.randomUUID(),
        parentLocalId: parent.localId,
        recipe,
        model: videoModel,
        modelId: videoModelId,
        userPrompt: prompt,
        imageUrl,
        durationSec: effectiveDuration,
        warnings: videoWarnings,
      });
    } catch (e) {
      toast.error(e instanceof AppError ? e.message : "Generation failed.");
    }
  }

  async function retry(job: ClientJob) {
    /* Reintentar reenvía de verdad. Las imágenes ya están subidas, así que no se
       vuelve a subir nada y no se pide otra confirmación de precio: es el mismo
       trabajo, al mismo coste que ya se mostró. */
    try {
      await resubmitJob(job);
    } catch (e) {
      toast.error(e instanceof AppError ? e.message : "Couldn't retry.");
    }
  }

  function checkAgain(job: ClientJob) {
    recheckJob(job.localId);
  }

  async function disconnect() {
    await api.disconnectKey();
    setState({ key: { connected: false }, availability: {} });
  }

  /* ---------------- render ---------------- */

  const locked = state.ready && !state.key.connected;
  const activeCount = jobs.filter((j) => isActivePhase(j.phase)).length;

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
          /* React 19 tipa `inert` como boolean de verdad. Pasarle "" era un truco de
             React 18 y ahora se interpreta como false, o sea que el estudio quedaba
             accesible por teclado detrás de la puerta de la llave. */
          inert={locked}
        >
          {/* El raíl es pegajoso PERO con scroll propio: en una pantalla de portátil el
              panel es más alto que el viewport, y sin esto el botón Generate queda
              debajo del borde y no hay forma de alcanzarlo. */}
          <div className="sticky top-[88px] flex max-h-[calc(100dvh-104px)] flex-col gap-5 overflow-y-auto overscroll-contain rounded-xl border border-hairline bg-panel p-5">
            {/*
              LO PRIMERO ES QUÉ QUIERES, NO QUÉ MODELO.
              El usuario probó la app y dijo "no puedo elegir si quiero imágenes o video,
              sólo me muestra los modelos". Tenía razón: el flujo obligaba a generar una
              foto y recién después aparecía un botón Animate en cada resultado. Por dentro
              siguen siendo dos llamadas —todos los modelos de vídeo exigen imagen de
              entrada— pero eso es arquitectura nuestra, no una decisión suya.
            */}
            <div className="flex flex-col gap-2">
              <span className="text-meta font-medium text-ink-muted">I want</span>
              <div
                role="radiogroup"
                aria-label="Output type"
                className="grid grid-cols-2 gap-1 rounded-lg bg-canvas p-1"
              >
                {(
                  [
                    { id: "image", label: "Photos", icon: ImageIcon },
                    { id: "video", label: "Video", icon: Film },
                  ] as const
                ).map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={state.outputMode === id}
                    onClick={() => setState({ outputMode: id })}
                    className={
                      state.outputMode === id
                        ? "flex items-center justify-center gap-2 rounded-md bg-panel-raised py-2 text-ui font-semibold text-ink"
                        : "flex items-center justify-center gap-2 rounded-md py-2 text-ui text-ink-muted hover:text-ink"
                    }
                  >
                    <Icon className="size-4" />
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-micro tracking-normal text-ink-faint">
                {wantsVideo
                  ? "One photo is generated first, then animated. Both steps are priced below."
                  : "Stills you can download. You can animate any of them afterwards."}
              </p>
            </div>

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
              disabled={submitting}
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

            {/* El segundo selector es el que de verdad importa: la etapa de imagen
                suele tener un solo motor sensato, mientras que animar tiene una
                docena. Cambiar aquí de Kling a Hailuo o a Wan no toca nada más del
                flujo — el normalizador traduce el body y la app dice qué ajustó. */}
            {recipe.canAnimate && videoModels.length > 0 ? (
              <div className="flex flex-col gap-2">
                <span className="text-meta font-medium text-ink-muted">
                  Animate with
                </span>
                <ModelSwitcher
                  label="Animate model"
                  models={videoModels}
                  availability={state.availability}
                  value={videoModelId}
                  probing={state.probing}
                  onChange={(id) =>
                    setState((s) => ({
                      videoModelByRecipe: { ...s.videoModelByRecipe, [s.recipe]: id },
                    }))
                  }
                />

                {videoDurations.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <span className="text-meta text-ink-muted">Clip</span>
                    <div className="flex gap-1">
                      {videoDurations.map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setPreferredDuration(d)}
                          aria-pressed={effectiveDuration === d}
                          className={
                            effectiveDuration === d
                              ? "rounded-md bg-panel-raised px-2.5 py-1 text-meta font-semibold text-ink"
                              : "rounded-md px-2.5 py-1 text-meta text-ink-muted hover:text-ink"
                          }
                        >
                          {d}s
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* La confesión. Coercionar en silencio es un bug desde el asiento
                    del usuario: si pidió 5s tiene derecho a saber que salieron 6. */}
                {videoWarnings.length > 0 ? (
                  <p className="rounded-md border border-hairline bg-panel-raised/40 px-2.5 py-2 text-micro leading-relaxed tracking-normal text-ink-muted">
                    {videoWarnings.map((w) => describeChange(videoModel?.label ?? "This model", w)).join(" ")}
                  </p>
                ) : null}

                <p className="text-micro tracking-normal text-ink-faint">
                  Used when you animate a still. Charged separately.
                </p>
              </div>
            ) : null}

            {recipe.counts.length > 1 && !wantsVideo ? (
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
                  {wantsVideo ? "Generate video" : "Generate"}
                  {priceReady ? (
                    <span className="ml-1 font-normal opacity-90 tnum">
                      · {formatCredits(totalCredits)} · {formatUsd(totalUsd)}
                    </span>
                  ) : estimating ? (
                    <span className="ml-1 opacity-70">· pricing…</span>
                  ) : null}
                </>
              )}
            </Button>

            {wantsVideo && priceReady ? (
              <p className="-mt-2 text-center text-micro tracking-normal text-ink-faint tnum">
                photo {formatUsd(estimate!.usd)} + video {formatUsd(liveVideoEstimate!.usd)}
              </p>
            ) : null}
          </div>
        </div>

        <div data-surface="stage" className="min-w-0 rounded-xl p-4">
          <ResultsGrid
            jobs={jobs}
            canAnimate={recipe.canAnimate && videoModels.length > 0}
            onAnimate={(job, url) => void animate(job, url)}
            onRetry={(job) => void retry(job)}
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
