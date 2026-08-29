"use client";

import { useEffect, useState } from "react";
import { formatElapsed } from "@/lib/format";
import type { ClientJob } from "@/lib/client/store";

/**
 * DOS ANIMACIONES POR GENERACIÓN, NO DOCE.
 *
 * El sondeo late entre 6 y 12 veces en un trabajo normal. Según la regla de
 * frecuencia, algo que ocurre decenas de veces al día se anima poco o nada, así que
 * NADA aquí se reinicia con cada respuesta del sondeo:
 *
 *   - El barrido arranca UNA vez, con --eta fijado al enviar desde la mediana del
 *     modelo. No se reinicia nunca.
 *   - El texto de estado cambia como nodo de texto, sin transición.
 *   - El contador de tiempo va con su propio intervalo de 1s, no con el sondeo, y
 *     sólo aparece a los 8 segundos para no ser ruido en un trabajo rápido.
 *
 * El único momento animado de verdad es la ENTRADA al estado terminal.
 *
 * De fondo va la propia foto del usuario, desenfocada. No cuesta red —ya está en
 * memoria— y responde "¿qué está haciendo?" mejor que cualquier spinner.
 */
export function GenerationProgress({ job }: { job: ClientJob }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = job.submittedAt ?? job.createdAt;
    const id = setInterval(() => setElapsed(Date.now() - start), 1000);
    return () => clearInterval(id);
  }, [job.submittedAt, job.createdAt]);

  const statusText =
    job.phase === "uploading"
      ? "Uploading"
      : job.phase === "submitting"
        ? "Sending"
        : job.phase === "queued"
          ? "Queued"
          : "Rendering";

  return (
    <div className="relative h-full w-full overflow-hidden bg-frame">
      {job.sourcePreview ? (
        <img
          src={job.sourcePreview}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover opacity-[0.18] blur-[12px] saturate-[0.4]"
        />
      ) : null}

      <span
        aria-hidden
        data-motion="essential"
        data-progress
        className="pointer-events-none absolute inset-x-0 top-0 h-[45%] animate-sweep"
        style={{
          ["--eta" as string]: `${job.etaSeconds}s`,
          background:
            "linear-gradient(180deg, transparent, rgb(99 102 241 / 0.22), transparent)",
        }}
      />

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 p-3">
        <span className="text-meta font-medium text-ink" aria-live="polite">
          {statusText}
        </span>
        {elapsed > 8000 ? (
          <span className="text-meta text-ink-muted tnum">{formatElapsed(elapsed)}</span>
        ) : null}
      </div>
    </div>
  );
}
