"use client";

import { useEffect, useState } from "react";
import { formatElapsed } from "@/lib/format";
import type { ClientJob } from "@/lib/client/store";

/**
 * DOS ANIMACIONES POR GENERACIÓN, NO DOCE — Y UN SOLO ESTADO, NO CUATRO.
 *
 * El sondeo late entre 6 y 12 veces por trabajo. Según la regla de frecuencia, algo
 * que ocurre decenas de veces al día se anima poco o nada, así que nada aquí se
 * reinicia con cada respuesta: el barrido arranca UNA vez, con --eta fijado al enviar
 * desde la mediana del modelo.
 *
 * El fallo que esto arregla: al pedir 4 salidas se dibujaban 4 tarjetas de progreso
 * independientes, cada una con su "Rendering", su cronómetro y su región aria-live.
 * Pero es UNA sola generación. Cuatro copias del mismo estado no informan de nada —
 * se leen como si algo estuviera roto, y un lector de pantalla anunciaba "Rendering"
 * cuatro veces.
 *
 * Ahora el estado vive una sola vez, en la cabecera del trabajo (JobStatusLine), y
 * las casillas son mudas: reservan el sitio y llevan el barrido, nada más.
 */

/** La casilla. Sólo reserva espacio y da señal de actividad. Sin texto ni contador. */
export function GenerationProgress({ job }: { job: ClientJob }) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-frame" aria-hidden>
      {job.sourcePreview ? (
        // La propia foto del usuario, desenfocada: no cuesta red —ya está en memoria—
        // y responde "¿qué está haciendo?" mejor que cualquier spinner.
        <img
          src={job.sourcePreview}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-[0.18] blur-[12px] saturate-[0.4]"
        />
      ) : null}

      <span
        data-motion="essential"
        data-progress
        className="pointer-events-none absolute inset-x-0 top-0 h-[45%] animate-sweep"
        style={{
          ["--eta" as string]: `${job.etaSeconds}s`,
          background:
            "linear-gradient(180deg, transparent, rgb(99 102 241 / 0.22), transparent)",
        }}
      />
    </div>
  );
}

/** El estado, UNA vez por trabajo, en la cabecera. */
export function JobStatusLine({ job }: { job: ClientJob }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = job.submittedAt ?? job.createdAt;
    const tick = () => setElapsed(Date.now() - start);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [job.submittedAt, job.createdAt]);

  const label =
    job.phase === "uploading"
      ? "Uploading"
      : job.phase === "submitting"
        ? "Sending"
        : job.phase === "queued"
          ? "Queued"
          : "Rendering";

  return (
    <span className="flex shrink-0 items-center gap-2 text-meta text-ink-muted">
      {/* El texto cambia como nodo de texto, sin transición: el sondeo lo toca
          muchas veces y animarlo sería justo el ruido que la regla de frecuencia
          manda quitar. */}
      <span aria-live="polite">{label}</span>
      {job.expectedCount > 1 ? (
        <span className="text-ink-faint">· {job.expectedCount} images</span>
      ) : null}
      {/* El cronómetro sólo aparece a los 8s, para no ser ruido en algo rápido. */}
      {elapsed > 8000 ? <span className="tnum">{formatElapsed(elapsed)}</span> : null}
    </span>
  );
}
