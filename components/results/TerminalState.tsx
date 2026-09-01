"use client";

import { useState } from "react";
import { RotateCcw, ShieldCheck, TriangleAlert, Clock, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCredits } from "@/lib/format";
import type { ClientJob } from "@/lib/client/store";

interface TerminalStateProps {
  job: ClientJob;
  onRetry: () => void;
  onCheckAgain: () => void;
}

/**
 * Los estados terminales que NO son una imagen.
 *
 * `nsfw` es el caso que casi todo el mundo hace mal. NO es un fallo: la API lo trata
 * como estado propio y lo reembolsa automáticamente. Por eso aquí no hay ni un pixel
 * rojo, no hay triángulo de advertencia, y el reembolso abre el renglón que va justo
 * debajo del titular — porque esa es la pregunta real del usuario. Un banner rojo haría cerrar la app a
 * alguien que no ha perdido nada.
 *
 * Y como el rosa ES la acción primaria de la app, los errores de verdad van en ámbar:
 * una tarjeta de error roja competiría con el botón Generate.
 */
export function TerminalState({ job, onRetry, onCheckAgain }: TerminalStateProps) {
  const [showDetail, setShowDetail] = useState(false);
  const refunded = job.estimate ? formatCredits(job.estimate.credits) : "Your credits";

  if (job.phase === "nsfw") {
    return (
      <div className="flex h-full flex-col justify-center gap-2.5 bg-frame p-4">
        <ShieldCheck className="size-5 text-ink-muted" aria-hidden />
        <p className="font-display text-ui font-semibold text-ink">
          This one didn&apos;t pass the safety filter.
        </p>
        <p className="text-meta leading-relaxed text-ink-muted">
          <strong className="font-semibold text-ink">
            {refunded} went back to your balance
          </strong>{" "}
          — you weren&apos;t charged. Try a different photo, or soften the wording.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="mt-1 w-fit border-hairline text-ink"
        >
          <RotateCcw className="size-3.5" />
          Try again
        </Button>
      </div>
    );
  }

  if (job.phase === "timed_out") {
    return (
      <div className="flex h-full flex-col justify-center gap-2.5 bg-frame p-4">
        <Clock className="size-5 text-ink-muted" aria-hidden />
        <p className="font-display text-ui font-semibold text-ink">
          Still working after 5 minutes.
        </p>
        <p className="text-meta leading-relaxed text-ink-muted">
          The queue is probably long. It may still land — we kept the job.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={onCheckAgain}
          className="mt-1 w-fit border-hairline text-ink"
        >
          Check again
        </Button>
      </div>
    );
  }

  if (job.phase === "canceled") {
    return (
      <div className="flex h-full flex-col justify-center gap-2.5 bg-frame p-4 opacity-60">
        <Ban className="size-5 text-ink-muted" aria-hidden />
        <p className="font-display text-ui font-semibold text-ink">Canceled.</p>
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="mt-1 w-fit border-hairline text-ink"
        >
          Run again
        </Button>
      </div>
    );
  }

  if (job.phase === "unknown_submit") {
    return (
      <div className="flex h-full flex-col justify-center gap-2.5 bg-frame p-4">
        <TriangleAlert className="size-5 text-warn" aria-hidden />
        <p className="font-display text-ui font-semibold text-ink">
          We lost the connection mid-send.
        </p>
        {/* Honestidad obligada: la API no tiene endpoint para listar peticiones, así
            que no podemos reconciliar. Reintentar en silencio podría cobrar dos veces. */}
        <p className="text-meta leading-relaxed text-ink-muted">
          It may already be running. Check your Higgsfield dashboard before generating
          again, so you don&apos;t pay twice.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col justify-center gap-2.5 bg-frame p-4">
      <TriangleAlert className="size-5 text-warn" aria-hidden />
      <p className="font-display text-ui font-semibold text-ink">Generation failed.</p>
      <p className="text-meta leading-relaxed text-ink-muted">
        {job.error?.message ?? "Higgsfield didn't say why."}
      </p>

      <div className="mt-1 flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="border-hairline text-ink"
        >
          <RotateCcw className="size-3.5" />
          Retry
        </Button>
        {job.correlationId ? (
          <button
            type="button"
            onClick={() => setShowDetail((v) => !v)}
            className="text-micro tracking-normal text-ink-faint underline-offset-2 hover:text-ink-muted hover:underline"
          >
            {showDetail ? "Hide" : "Show"} technical detail
          </button>
        ) : null}
      </div>

      {showDetail ? (
        <p className="mt-1 break-all font-mono text-micro tracking-normal text-ink-faint">
          job {job.requestId ?? "—"}
          <br />
          ref {job.correlationId}
        </p>
      ) : null}
    </div>
  );
}
