"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Download, Film } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { describeExpiry, slugify } from "@/lib/format";
import { downloadUrl } from "@/lib/client/api";

interface ResultCardProps {
  url: string;
  isVideo?: boolean;
  expiresAt?: number;
  filename: string;
  index: number;
  /** Sólo la primera aparición escalona; un rerender no repite la entrada. */
  animateIn: boolean;
  onAnimate?: () => void;
  onOpen?: () => void;
}

export function ResultCard({
  url,
  isVideo,
  expiresAt,
  filename,
  index,
  animateIn,
  onAnimate,
  onOpen,
}: ResultCardProps) {
  const [decoded, setDecoded] = useState(isVideo === true);
  const [justSaved, setJustSaved] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const expiry = describeExpiry(expiresAt);

  /**
   * Se espera a `img.decode()` antes de mostrar. Sin esto, el fundido de entrada
   * corre mientras el navegador aún descodifica un JPEG grande y se ve pintar la
   * imagen a medias — justo en el momento en que el hilo principal está más cargado.
   */
  useEffect(() => {
    if (isVideo) return;
    const el = imgRef.current;
    if (!el) return;
    let alive = true;
    el.decode()
      .catch(() => undefined)
      .finally(() => {
        if (alive) setDecoded(true);
      });
    return () => {
      alive = false;
    };
  }, [url, isVideo]);

  return (
    <figure
      className="group relative aspect-9/16 overflow-hidden rounded-lg border border-frame-line bg-frame"
      style={
        animateIn && decoded
          ? {
              animation: `rise var(--dur-reveal) var(--ease-out) ${index * 50}ms both`,
            }
          : undefined
      }
      onAnimationEnd={onAnimate}
    >
      {isVideo ? (
        <video
          src={url}
          controls
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
        />
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="block h-full w-full"
          aria-label="Open result"
        >
          <img
            ref={imgRef}
            src={url}
            alt=""
            className={cn(
              "h-full w-full object-cover transition-opacity duration-[240ms] ease-out",
              decoded ? "opacity-100" : "opacity-0",
            )}
          />
        </button>
      )}

      {/* Siempre visible: el atributo `download` de un <a> cross-origin se ignora,
          así que esto pasa por nuestra ruta /api/download. Y con caducidad de 7 días,
          guardar es una función central, no un extra al hover. */}
      <Tooltip>
        <TooltipTrigger
          render={
            <a
              href={downloadUrl(url, slugify(filename))}
              onClick={() => {
                setJustSaved(true);
                setTimeout(() => setJustSaved(false), 1200);
              }}
              aria-label="Download to your computer"
              className="absolute right-2 top-2 grid size-9 place-items-center rounded-full bg-black/50 text-ink backdrop-blur-[8px] hover:bg-black/75"
            >
              {justSaved ? (
                <Check className="size-4 text-ok" />
              ) : (
                <Download className="size-4" />
              )}
            </a>
          }
        />
        <TooltipContent>Save a copy</TooltipContent>
      </Tooltip>

      {isVideo ? (
        <span className="absolute left-2 top-2 grid size-7 place-items-center rounded-full bg-black/50 backdrop-blur-[8px]">
          <Film className="size-3.5 text-ink" />
        </span>
      ) : null}

      {expiry ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <figcaption
                className={cn(
                  "absolute bottom-2 left-2 rounded-full bg-black/50 px-2 py-[3px] text-micro tracking-normal backdrop-blur-[8px]",
                  expiry.tone === "warn" ? "font-semibold text-warn" : "text-ink-muted",
                )}
              >
                {expiry.label}
              </figcaption>
            }
          />
          <TooltipContent className="max-w-[240px]">{expiry.title}</TooltipContent>
        </Tooltip>
      ) : null}
    </figure>
  );
}
