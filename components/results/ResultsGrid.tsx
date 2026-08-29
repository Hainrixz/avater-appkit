"use client";

import { Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCredits, formatUsd } from "@/lib/format";
import { describeChange } from "@/lib/provider/higgsfield/normalize";
import { getRecipe } from "@/lib/recipes";
import { isActivePhase, type ClientJob } from "@/lib/client/store";
import { GenerationProgress } from "./GenerationProgress";
import { TerminalState } from "./TerminalState";
import { ResultCard } from "./ResultCard";

interface ResultsGridProps {
  jobs: ClientJob[];
  onAnimate: (job: ClientJob, imageUrl: string) => void;
  onRetry: (job: ClientJob) => void;
  onCheckAgain: (job: ClientJob) => void;
  canAnimate: boolean;
}

export function ResultsGrid({
  jobs,
  onAnimate,
  onRetry,
  onCheckAgain,
  canAnimate,
}: ResultsGridProps) {
  if (jobs.length === 0) {
    return (
      <div className="grid min-h-[420px] place-items-center rounded-xl border border-dashed border-frame-line">
        <div className="max-w-[280px] text-center">
          <Sparkles className="mx-auto mb-3 size-5 text-ink-faint" aria-hidden />
          <p className="font-display text-ui font-semibold text-ink">
            Nothing generated yet.
          </p>
          <p className="mt-1 text-meta leading-relaxed text-ink-muted">
            Drop a photo, say where you want to be, and hit Generate. Results land here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {jobs.map((job) => {
        const recipe = getRecipe(job.recipe);
        const running = isActivePhase(job.phase);
        const failedish =
          job.phase === "failed" ||
          job.phase === "nsfw" ||
          job.phase === "canceled" ||
          job.phase === "timed_out" ||
          job.phase === "unknown_submit";

        // Se reserva sitio al enviar: los huecos ya tienen el aspect ratio final,
        // así que nada de lo que hay debajo se mueve cuando llega el resultado.
        const slots = running
          ? Array.from({ length: job.expectedCount })
          : failedish
            ? [null]
            : job.videoUrl
              ? [job.videoUrl]
              : job.images;

        return (
          <section key={job.localId} className="flex flex-col gap-3">
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate font-display text-ui font-semibold text-ink">
                  {recipe.label}
                  {job.stage === "video" ? " · video" : ""}
                </h3>
                <p className="truncate text-meta text-ink-muted">
                  {job.modelLabel}
                  {job.input.prompt ? ` · ${job.input.prompt}` : ""}
                </p>
              </div>
              {job.estimate ? (
                <span className="shrink-0 text-meta text-ink-faint tnum">
                  {formatCredits(job.estimate.credits)} · {formatUsd(job.estimate.usd)}
                </span>
              ) : null}
            </header>

            {job.warnings.length > 0 ? (
              <p className="rounded-md border border-hairline bg-panel px-3 py-2 text-meta text-ink-muted">
                {job.warnings.map((w) => describeChange(job.modelLabel, w)).join(" ")}
              </p>
            ) : null}

            <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
              {slots.map((url, i) => (
                <div
                  key={`${job.localId}-${i}`}
                  className="aspect-9/16 overflow-hidden rounded-lg border border-frame-line"
                >
                  {running ? (
                    <GenerationProgress job={job} />
                  ) : failedish ? (
                    <TerminalState
                      job={job}
                      onRetry={() => onRetry(job)}
                      onCheckAgain={() => onCheckAgain(job)}
                    />
                  ) : (
                    <ResultCard
                      url={url as string}
                      isVideo={Boolean(job.videoUrl)}
                      expiresAt={job.expiresAt}
                      filename={`${recipe.id}-${job.input.prompt || job.modelId}-${i + 1}`}
                      index={i}
                      animateIn
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Etapa 2: animar una foto ya aprobada. Es más barato equivocarse en la
                imagen que en el vídeo, así que primero se aprueba y luego se paga. */}
            {!running && !failedish && !job.videoUrl && canAnimate && job.images.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {job.images.map((url, i) => (
                  <Button
                    key={url}
                    variant="outline"
                    size="sm"
                    onClick={() => onAnimate(job, url)}
                    className="border-hairline text-ink"
                  >
                    <Wand2 className="size-3.5" />
                    Animate {job.images.length > 1 ? `#${i + 1}` : "this"}
                  </Button>
                ))}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
