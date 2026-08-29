"use client";

import { ChevronDown, CircleAlert, Loader2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatCredits, formatUsd } from "@/lib/format";
import type { ModelAvailability, PublicModelSpec } from "@/lib/shared/types";

const REASON_LABEL: Record<string, string> = {
  not_found: "Not on your plan",
  blocked: "Blocked for your account",
  disabled: "Disabled by the provider",
  probe_failed: "Couldn't check",
  not_probed: "Not checked yet",
};

const REASON_TOOLTIP: Record<string, string> = {
  not_found: "Higgsfield doesn't offer this model to your account or plan.",
  blocked: "Your account is blocked from this model right now.",
  disabled: "Higgsfield has this model temporarily disabled for everyone.",
  probe_failed: "The availability check didn't complete. It may still work.",
  not_probed: "Not checked yet.",
};

interface ModelSwitcherProps {
  models: PublicModelSpec[];
  availability: Record<string, ModelAvailability>;
  value: string;
  onChange: (modelId: string) => void;
  probing?: boolean;
  label?: string;
}

export function ModelSwitcher({
  models,
  availability,
  value,
  onChange,
  probing,
  label = "Model",
}: ModelSwitcherProps) {
  const selected = models.find((m) => m.id === value);
  const selectedAvail = availability[value];

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-md border border-hairline bg-panel px-3",
          "text-ui text-ink hover:border-edge/60",
        )}
        aria-label={`${label}: ${selected?.label ?? "none"}`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{selected?.label ?? "Pick a model"}</span>
          {selectedAvail?.estimate ? (
            // El coste en el disparador cerrado es lo que hace útil el control sin abrirlo.
            <span className="shrink-0 text-meta text-ink-muted tnum">
              · {formatCredits(selectedAvail.estimate.credits)}
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {probing ? (
            <Loader2 className="size-3.5 animate-spin text-ink-faint" data-motion="essential" />
          ) : null}
          <ChevronDown className="size-4 text-ink-faint" />
        </span>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-[380px] max-w-[calc(100vw-2rem)] border-hairline bg-popover p-1"
        style={{ transformOrigin: "var(--transform-origin)" }}
      >
        <div className="max-h-[420px] overflow-y-auto">
          {models.map((m) => {
            const a = availability[m.id];
            const unavailable = a?.state === "unavailable";
            const unknown = a?.state === "unknown";
            const isSelected = m.id === value;

            const row = (
              <div
                className={cn(
                  "relative flex items-center gap-3 rounded-md px-3 py-2.5",
                  isSelected && "bg-rose/[0.08]",
                  unavailable ? "opacity-40" : "hover:bg-panel-raised",
                )}
              >
                {/* Barra rosa en vez de check: se lee más rápido, y el rosa gasta aquí
                    una de sus dos únicas apariciones permitidas en toda la app. */}
                {isSelected ? (
                  <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-rose" />
                ) : null}

                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-ui font-medium text-ink">
                    {m.label}
                  </span>
                  <span className="block truncate text-meta text-ink-muted">
                    {m.family}
                    {m.supports.durationsSec
                      ? ` · ${m.supports.durationsSec.join("/")}s`
                      : ""}
                  </span>
                </span>

                <span className="shrink-0 text-right">
                  {unavailable || unknown ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-meta",
                        unknown ? "text-warn" : "text-ink-faint",
                      )}
                    >
                      {unknown ? <CircleAlert className="size-3" /> : null}
                      {REASON_LABEL[a?.reason ?? "not_probed"]}
                    </span>
                  ) : a?.estimate ? (
                    <>
                      <span className="block text-ui text-ink tnum">
                        {formatCredits(a.estimate.credits)}
                      </span>
                      <span className="block text-micro tracking-normal text-ink-muted tnum">
                        {formatUsd(a.estimate.usd)}
                      </span>
                    </>
                  ) : (
                    <span className="text-meta text-ink-faint">—</span>
                  )}
                </span>
              </div>
            );

            return (
              <Tooltip key={m.id}>
                <TooltipTrigger
                  render={
                    /* Ojo: nada de pointer-events:none en una fila desactivada — mataría
                       justo el tooltip que explica por qué está desactivada. */
                    <button
                      type="button"
                      disabled={unavailable}
                      aria-disabled={unavailable || undefined}
                      onClick={() => !unavailable && onChange(m.id)}
                      className={cn(
                        "w-full",
                        unavailable ? "cursor-not-allowed" : "cursor-pointer",
                      )}
                    >
                      {row}
                    </button>
                  }
                />
                <TooltipContent side="right" className="max-w-[240px]">
                  {unavailable || unknown
                    ? REASON_TOOLTIP[a?.reason ?? "not_probed"]
                    : `${m.label} — ${m.capability.replace("->", " → ")}`}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
