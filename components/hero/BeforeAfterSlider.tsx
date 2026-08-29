"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GripVertical } from "lucide-react";

interface BeforeAfterSliderProps {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel?: string;
  afterLabel?: string;
}

/**
 * Comparador con clip-path.
 *
 * Tres decisiones que hacen que se sienta bien y no sólo que funcione:
 *
 *  1. `clipPath` se escribe DIRECTAMENTE sobre el elemento recortado, nunca como
 *     variable CSS en el padre. Una custom property en el padre hereda, y el
 *     navegador recalcula estilos de todos los hijos en cada pixel de arrastre.
 *  2. Durante el arrastre NO hay transición: tiene que seguir al puntero 1:1. La
 *     transición sólo se activa al soltar, para el asentamiento.
 *  3. Captura de puntero, así que sacar el dedo del elemento no rompe el gesto.
 *
 * La demo automática se cancela al primer contacto y no existe con movimiento reducido.
 */
export function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  beforeLabel = "Your photo",
  afterLabel = "Generated",
}: BeforeAfterSliderProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<Animation | null>(null);
  const [pct, setPct] = useState(50);
  const dragging = useRef(false);

  const apply = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(100, next));
    if (topRef.current) {
      topRef.current.style.clipPath = `inset(0 ${100 - clamped}% 0 0)`;
    }
    if (handleRef.current) {
      handleRef.current.style.left = `${clamped}%`;
    }
    setPct(clamped);
  }, []);

  const stopAuto = useCallback(() => {
    animRef.current?.cancel();
    animRef.current = null;
  }, []);

  const fromEvent = useCallback((clientX: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return 50;
    return ((clientX - rect.left) / rect.width) * 100;
  }, []);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !topRef.current) return;

    animRef.current = topRef.current.animate(
      [{ clipPath: "inset(0 62% 0 0)" }, { clipPath: "inset(0 38% 0 0)" }],
      {
        duration: 3600,
        direction: "alternate",
        iterations: Infinity,
        easing: "cubic-bezier(0.77, 0, 0.175, 1)",
      },
    );
    return () => animRef.current?.cancel();
  }, []);

  return (
    <div
      ref={rootRef}
      className="relative aspect-3/4 w-full select-none overflow-hidden rounded-xl border border-frame-line bg-frame"
      onPointerDown={(e) => {
        stopAuto();
        dragging.current = true;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        if (topRef.current) topRef.current.style.transition = "none";
        apply(fromEvent(e.clientX));
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        apply(fromEvent(e.clientX));
      }}
      onPointerUp={() => {
        dragging.current = false;
        if (topRef.current) {
          topRef.current.style.transition = "clip-path 220ms var(--ease-out)";
        }
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
    >
      <img src={afterSrc} alt={afterLabel} className="absolute inset-0 size-full object-cover" />

      <div ref={topRef} className="absolute inset-0" style={{ clipPath: "inset(0 50% 0 0)" }}>
        <img
          src={beforeSrc}
          alt={beforeLabel}
          className="absolute inset-0 size-full object-cover"
        />
      </div>

      {/* Las etiquetas NO se mueven con el tirador: son referencias, no parte del gesto. */}
      <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/55 px-2.5 py-1 text-micro text-ink backdrop-blur-[8px]">
        {beforeLabel}
      </span>
      <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/55 px-2.5 py-1 text-micro text-ink backdrop-blur-[8px]">
        {afterLabel}
      </span>

      <div
        ref={handleRef}
        role="slider"
        tabIndex={0}
        aria-label="Compare the original photo with the generated one"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") { stopAuto(); apply(pct - 4); }
          if (e.key === "ArrowRight") { stopAuto(); apply(pct + 4); }
          if (e.key === "Home") { stopAuto(); apply(0); }
          if (e.key === "End") { stopAuto(); apply(100); }
        }}
        className="absolute inset-y-0 z-10 -ml-4 w-8 cursor-ew-resize touch-none"
        style={{ left: "50%" }}
      >
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/70" />
        <span className="absolute left-1/2 top-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-black shadow-lg">
          <GripVertical className="size-4" />
        </span>
      </div>
    </div>
  );
}
