"use client";

import { Plus } from "lucide-react";
import type { Recipe } from "@/lib/recipes";
import { DropSlot, type SlotValue } from "./DropSlot";

interface SlotDropzoneProps {
  recipe: Recipe;
  values: Record<string, SlotValue | null>;
  onChange: (slotId: string, value: SlotValue | null) => void;
  disabled?: boolean;
}

/**
 * Un solo componente para todas las recetas: la aridad sale de `recipe.slots`, así
 * que añadir una receta de tres fotos no toca nada de aquí.
 *
 * Con dos ranuras aparece un "+" entre ellas. Ese signo es lo que hace legible en un
 * cuarto de segundo que la receta combina dos imágenes, sin una línea de copy.
 */
export function SlotDropzone({ recipe, values, onChange, disabled }: SlotDropzoneProps) {
  const slots = recipe.slots;

  if (slots.length === 1) {
    const slot = slots[0]!;
    return (
      <DropSlot
        label={slot.label}
        hint={slot.hint}
        value={values[slot.id] ?? null}
        onChange={(v) => onChange(slot.id, v)}
        disabled={disabled}
      />
    );
  }

  return (
    <div className="grid grid-cols-[1fr_28px_1fr] items-center gap-0 max-[640px]:grid-cols-1 max-[640px]:grid-rows-[1fr_28px_1fr]">
      <DropSlot
        label={slots[0]!.label}
        hint={slots[0]!.hint}
        value={values[slots[0]!.id] ?? null}
        onChange={(v) => onChange(slots[0]!.id, v)}
        disabled={disabled}
      />

      <div
        aria-hidden
        className="flex items-center justify-center max-[640px]:flex-col"
        title="Both images are combined into one result"
      >
        <span className="h-px w-2 bg-hairline max-[640px]:h-2 max-[640px]:w-px" />
        <Plus className="size-3.5 shrink-0 text-ink-faint" />
        <span className="h-px w-2 bg-hairline max-[640px]:h-2 max-[640px]:w-px" />
      </div>

      <DropSlot
        label={slots[1]!.label}
        hint={slots[1]!.hint}
        value={values[slots[1]!.id] ?? null}
        onChange={(v) => onChange(slots[1]!.id, v)}
        disabled={disabled}
      />
    </div>
  );
}
