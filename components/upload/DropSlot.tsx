"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  checkSize,
  checkType,
  prepareImage,
  type FileProblem,
  type PreparedFile,
} from "@/lib/client/files";

export interface SlotValue extends PreparedFile {
  /** URL pública tras subir. Se rellena en el momento de generar. */
  remoteUrl?: string;
}

interface DropSlotProps {
  /** Una sola ranura ocupa todo el ancho del raíl, así que 3:4 la haría enorme. */
  compact?: boolean;
  label: string;
  hint?: string;
  value: SlotValue | null;
  onChange: (v: SlotValue | null) => void;
  disabled?: boolean;
}

type SlotState = "idle" | "over" | "invalid" | "busy" | "filled";

export function DropSlot({ compact, label, hint, value, onChange, disabled }: DropSlotProps) {
  /* El estado se DERIVA: la interacción manda mientras dura, y si no, la verdad
     es si hay foto o no. Sincronizarlo con un efecto provocaba renders en cascada. */
  const [interaction, setInteraction] = useState<Exclude<SlotState, "filled">>("idle");
  const state: SlotState = interaction !== "idle" ? interaction : value ? "filled" : "idle";
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * EL CONTADOR DE PROFUNDIDAD.
   *
   * `dragenter` y `dragleave` se disparan por CADA hijo que cruza el puntero, así que
   * un booleano hace parpadear el borde sin parar. Con un contador, el estado sólo
   * cambia al entrar de verdad y al salir del todo. Es el bug clásico de los dropzones
   * hechos a mano, y es exactamente el caso "se redispara rápido" para el que las
   * transiciones CSS son obligatorias frente a los keyframes.
   */
  const depth = useRef(0);

  const accept = useCallback(
    async (file: File | undefined) => {
      if (!file || disabled) return;
      setError(null);

      const problem = checkType(file) ?? checkSize(file);
      if (problem) {
        setInteraction("invalid");
        setError(problem.message);
        return;
      }

      setInteraction("busy");
      try {
        const prepared = await prepareImage(file);
        onChange(prepared);
        setInteraction("idle");
      } catch (e) {
        const p = e as FileProblem;
        setInteraction("invalid");
        setError(p?.message ?? "Couldn't read that image.");
      }
    },
    [disabled, onChange],
  );

  const clear = useCallback(() => {
    if (value?.previewUrl) URL.revokeObjectURL(value.previewUrl);
    onChange(null);
    setError(null);
    setInteraction("idle");
    if (inputRef.current) inputRef.current.value = "";
  }, [onChange, value]);

  // Pegar desde el portapapeles: en una app de fotos es la mitad de los aportes.
  useEffect(() => {
    if (disabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
        i.type.startsWith("image/"),
      );
      const file = item?.getAsFile();
      if (file) void accept(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [accept, disabled]);

  return (
    <div className="flex flex-col gap-2">
      <div
        data-dropslot
        data-state={state}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={`${label} — drop, paste or browse for an image`}
        aria-disabled={disabled || undefined}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          if (disabled) return;
          depth.current += 1;
          if (depth.current === 1) setInteraction("over");
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          e.preventDefault();
          if (disabled) return;
          depth.current -= 1;
          if (depth.current === 0) setInteraction("idle");
        }}
        onDrop={(e) => {
          e.preventDefault();
          depth.current = 0;
          void accept(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "group relative w-full overflow-hidden rounded-[14px]",
          compact ? "aspect-4/3" : "aspect-3/4",
          "border-[1.5px] border-dashed bg-panel",
          "flex flex-col items-center justify-center gap-1.5 text-center",
          "transition-[border-color,background-color,transform] duration-[140ms] ease-out",
          "border-hairline data-[state=over]:border-solid data-[state=over]:border-edge",
          "data-[state=over]:bg-edge/[0.06] data-[state=over]:scale-[1.012]",
          "data-[state=invalid]:border-warn data-[state=invalid]:bg-warn/[0.05]",
          "data-[state=filled]:border-solid data-[state=filled]:border-hairline",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        )}
      >
        {value ? (
          <img
            src={value.previewUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            style={{ animation: "settle 180ms var(--ease-out) both" }}
          />
        ) : state === "busy" ? (
          <>
            <Loader2
              className="size-5 animate-spin text-ink-faint"
              data-motion="essential"
            />
            <span className="text-meta text-ink-faint">Reading…</span>
          </>
        ) : (
          <>
            <ImagePlus className="size-[22px] text-ink-faint" aria-hidden />
            <span className="font-display text-ui font-semibold text-ink">{label}</span>
            {hint ? <span className="px-3 text-meta text-ink-faint">{hint}</span> : null}
            <span className="text-meta text-ink-muted">Drop, paste, or browse</span>
          </>
        )}

        {value ? (
          /* Siempre visible, nunca al hover: en táctil un control con hover no existe,
             y esto es una app de fotos de móvil. */
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              clear();
            }}
            aria-label={`Remove ${label}`}
            className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-black/55 text-ink backdrop-blur-[8px] hover:bg-black/75"
          >
            <X className="size-3.5" />
          </button>
        ) : null}

        {value ? (
          <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-[3px] text-micro font-medium tracking-normal text-ink backdrop-blur-[8px]">
            {label}
          </span>
        ) : null}

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="sr-only"
          onChange={(e) => void accept(e.target.files?.[0])}
          tabIndex={-1}
        />
      </div>

      {error ? (
        <p role="alert" className="text-meta text-warn">
          {error}
        </p>
      ) : null}
    </div>
  );
}
