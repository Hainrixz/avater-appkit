import { AppError } from "@/lib/shared/errors";
import type {
  CapabilityChange,
  GenerationInput,
  ModelSpec,
  ModelSupports,
} from "@/lib/shared/types";

/**
 * El normalizador.
 *
 * Regla única: nunca mandar un valor que el modelo no acepta, nunca omitir uno
 * obligatorio, y nunca mandar un campo que el modelo no declara. Mandarle
 * `aspect_ratio` a Kling es un 422 — no lo tiene.
 */

export function requireOne(urls: string[], modelId: string): string {
  const first = urls[0];
  if (!first) throw new AppError("invalid_params", `${modelId} needs one image.`);
  return first;
}

export function requireMany(
  urls: string[],
  min: number,
  max: number,
  modelId: string,
): string[] {
  if (urls.length < min) {
    throw new AppError(
      "invalid_params",
      `${modelId} needs at least ${min} image${min === 1 ? "" : "s"}.`,
    );
  }
  return urls.slice(0, max);
}

/** Números: cae al permitido más cercano. Strings: cae al fallback. */
export function snapEnum<T extends string | number>(
  value: T | undefined,
  allowed: readonly T[] | undefined,
  fallback: T,
): T {
  if (!allowed || allowed.length === 0) return fallback;
  if (value === undefined || value === null) return fallback;
  if (allowed.includes(value)) return value;
  if (typeof value === "number") {
    const nums = allowed as readonly number[];
    return nums.reduce((a, b) =>
      Math.abs(b - value) < Math.abs(a - value) ? b : a,
    ) as T;
  }
  return fallback;
}

export function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

/** `duration` es entero en Kling/Hailuo/Wan y string en la familia Veo. */
export function encodeDuration(
  supports: ModelSupports,
  seconds: number | undefined,
): number | string | undefined {
  if (supports.durationEncoding === "none") return undefined;
  const allowed = supports.durationsSec;
  if (!allowed || allowed.length === 0) return undefined;
  const snapped = snapEnum(seconds, allowed, allowed[0]);
  return supports.durationEncoding === "string" ? String(snapped) : snapped;
}

/**
 * Qué se pierde al pasar de un modelo a otro.
 *
 * La coerción silenciosa es un bug desde el asiento del usuario: si pide 5s y el
 * modelo sólo hace 6 y 10, tiene derecho a enterarse. La UI muestra esto como
 * nota bajo el selector.
 */
export function diffCapabilities(
  to: ModelSpec,
  input: GenerationInput,
): CapabilityChange[] {
  const changes: CapabilityChange[] = [];
  const s = to.supports;

  if (input.durationSec !== undefined) {
    if (s.durationEncoding === "none" || !s.durationsSec) {
      changes.push({
        field: "durationSec",
        from: input.durationSec,
        to: undefined,
        reason: "field_not_supported",
      });
    } else if (!s.durationsSec.includes(input.durationSec)) {
      changes.push({
        field: "durationSec",
        from: input.durationSec,
        to: snapEnum(input.durationSec, s.durationsSec, s.durationsSec[0]),
        reason: "unsupported_value",
      });
    }
  }

  if (input.aspectRatio !== undefined) {
    if (!s.aspectRatios) {
      changes.push({
        field: "aspectRatio",
        from: input.aspectRatio,
        to: undefined,
        reason: "field_not_supported",
      });
    } else if (!s.aspectRatios.includes(input.aspectRatio)) {
      changes.push({
        field: "aspectRatio",
        from: input.aspectRatio,
        to: s.aspectRatios[0],
        reason: "unsupported_value",
      });
    }
  }

  if (input.resolution !== undefined) {
    if (!s.resolutions) {
      changes.push({
        field: "resolution",
        from: input.resolution,
        to: undefined,
        reason: "field_not_supported",
      });
    } else if (!s.resolutions.includes(input.resolution)) {
      changes.push({
        field: "resolution",
        from: input.resolution,
        to: s.resolutions[0],
        reason: "unsupported_value",
      });
    }
  }

  if (input.batchSize !== undefined && input.batchSize > 1) {
    const max = s.maxBatch ?? (s.batchSizes ? Math.max(...s.batchSizes) : 1);
    if (input.batchSize > max) {
      changes.push({
        field: "batchSize",
        from: input.batchSize,
        to: max,
        reason: "unsupported_value",
      });
    }
  }

  if (input.negativePrompt && !s.negativePrompt) {
    changes.push({
      field: "negativePrompt",
      from: input.negativePrompt,
      to: undefined,
      reason: "field_not_supported",
    });
  }

  return changes;
}

/** Frase legible para la nota del selector. */
export function describeChange(modelLabel: string, c: CapabilityChange): string {
  const name: Record<string, string> = {
    durationSec: "clip length",
    aspectRatio: "aspect ratio",
    resolution: "resolution",
    batchSize: "output count",
    negativePrompt: "negative prompt",
  };
  const label = name[c.field as string] ?? String(c.field);
  if (c.reason === "field_not_supported") {
    if (c.field === "aspectRatio") {
      return `${modelLabel} takes its aspect ratio from the source image.`;
    }
    return `${modelLabel} has no ${label} setting — that's ignored here.`;
  }
  const suffix = c.field === "durationSec" ? "s" : "";
  return `${modelLabel} doesn't do ${c.from}${suffix} ${label} — using ${c.to}${suffix}.`;
}
