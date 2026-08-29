import type { AspectRatio, ModelSpec, PublicModelSpec } from "@/lib/shared/types";
import { clampInt, encodeDuration, requireMany, requireOne, snapEnum } from "./normalize";

/**
 * EL CATÁLOGO.
 *
 * Escrito a mano a propósito. Se podría generar desde openapi.json, pero los bodies
 * son demasiado dispares y además dos endpoints que la app necesita
 * (/files/generate-upload-url y /estimate/*) NO están en el spec: existen sólo en la
 * documentación en prosa. Un generador daría una falsa sensación de completitud.
 *
 * Se incluyen modelos que hoy NO están disponibles en la cuenta de nadie en concreto
 * (veo3.1, sora-2, seedance). Es deliberado: el sondeo de disponibilidad los marca en
 * runtime y la UI los muestra desactivados con su motivo. Esconderlos generaría
 * "¿dónde está Veo?"; mostrarlos apagados explica el plan del usuario.
 */

const SOUL_ASPECTS: readonly AspectRatio[] = [
  "9:16",
  "16:9",
  "4:3",
  "3:4",
  "1:1",
  "2:3",
  "3:2",
];

const POPCORN_ASPECTS: readonly AspectRatio[] = [
  "1:1",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
  "16:9",
  "9:16",
];

const VIDEO_ASPECTS: readonly AspectRatio[] = ["16:9", "9:16"];

export const MODELS: ModelSpec[] = [
  /* ---------------- ETAPA A — imagen ---------------- */
  {
    id: "soul-reference",
    label: "Soul Reference",
    family: "Higgsfield Soul",
    path: "/higgsfield-ai/soul/reference",
    capability: "image->image",
    tier: "curated",
    medianSeconds: 9,
    image: { field: "image_reference_url", mode: "single", min: 1, max: 1 },
    supports: {
      aspectRatios: SOUL_ASPECTS,
      resolutions: ["720p", "1080p"],
      batchSizes: [1, 4],
      maxBatch: 4,
      durationEncoding: "none",
      seed: true,
      negativePrompt: false,
      cfgScale: false,
      endImage: false,
      audio: false,
      enhancePrompt: true,
    },
    defaults: { aspectRatio: "9:16", resolution: "1080p", batchSize: 4, enhancePrompt: true },
    recipes: ["teleport"],
    buildBody(i) {
      const body: Record<string, unknown> = {
        prompt: i.prompt,
        image_reference_url: requireOne(i.imageUrls, this.id),
        batch_size: snapEnum(i.batchSize, [1, 4], 1),
        resolution: snapEnum(i.resolution, ["720p", "1080p"], "720p"),
        aspect_ratio: snapEnum(i.aspectRatio, SOUL_ASPECTS, "4:3"),
        enhance_prompt: i.enhancePrompt ?? true,
      };
      if (i.seed !== undefined) body.seed = clampInt(i.seed, 1, 1_000_000);
      return body;
    },
  },
  {
    id: "popcorn-auto",
    label: "Popcorn",
    family: "Higgsfield Popcorn",
    path: "/higgsfield-ai/popcorn/auto",
    capability: "multi-image->image",
    tier: "curated",
    medianSeconds: 10,
    image: { field: "image_urls", mode: "array", min: 1, max: 8 },
    supports: {
      aspectRatios: POPCORN_ASPECTS,
      resolutions: ["720p", "1600p"],
      maxBatch: 8,
      durationEncoding: "none",
      seed: true,
      negativePrompt: false,
      cfgScale: false,
      endImage: false,
      audio: false,
      enhancePrompt: false,
    },
    defaults: { aspectRatio: "9:16", resolution: "720p", batchSize: 1 },
    recipes: ["tryon", "duo"],
    buildBody(i) {
      // Ojo: el MISMO GenerationInput.batchSize va a `num_images` (1..8) aquí y a
      // `batch_size` (enum 1|4) en soul-reference. Distinto nombre, distinto dominio.
      const body: Record<string, unknown> = {
        prompt: i.prompt,
        image_urls: requireMany(i.imageUrls, 1, 8, this.id),
        num_images: clampInt(i.batchSize ?? 1, 1, 8),
        resolution: snapEnum(i.resolution, ["720p", "1600p"], "720p"),
        aspect_ratio: snapEnum(i.aspectRatio, POPCORN_ASPECTS, "3:4"),
      };
      if (i.seed !== undefined) body.seed = clampInt(i.seed, 1, 1_000_000);
      return body;
    },
  },
  {
    id: "soul-standard",
    label: "Soul (text only)",
    family: "Higgsfield Soul",
    path: "/higgsfield-ai/soul/standard",
    capability: "text->image",
    tier: "extended",
    medianSeconds: 8,
    image: { field: "", mode: "none", min: 0, max: 0 },
    supports: {
      aspectRatios: ["1:1", "4:3", "3:4", "3:2", "2:3", "5:4", "4:5", "16:9", "9:16", "21:9"],
      // OJO: el openapi.json publicado dice ["2K","4K"] y MIENTE. La API en vivo
      // responde: resolution: '2K' is not one of ['720p', '1080p']. Verificado a mano.
      // Es justo el tipo de cosa que caza el sondeo y que un generador de código no.
      resolutions: ["720p", "1080p"],
      maxBatch: 4,
      durationEncoding: "none",
      seed: false,
      negativePrompt: false,
      cfgScale: false,
      endImage: false,
      audio: false,
      enhancePrompt: false,
    },
    defaults: { aspectRatio: "9:16", resolution: "720p", batchSize: 1 },
    recipes: [],
    buildBody(i) {
      return {
        prompt: i.prompt,
        num_images: clampInt(i.batchSize ?? 1, 1, 4),
        resolution: snapEnum(i.resolution, ["720p", "1080p"], "720p"),
        aspect_ratio: snapEnum(i.aspectRatio, this.supports.aspectRatios, "4:3"),
      };
    },
  },

  /* ---------------- ETAPA B — vídeo ---------------- */
  {
    id: "kling-2.5-turbo-pro-i2v",
    label: "Kling 2.5 Turbo Pro",
    family: "Kling",
    path: "/kling-video/v2.5-turbo/pro/image-to-video",
    capability: "image->video",
    tier: "curated",
    medianSeconds: 90,
    image: { field: "image_url", mode: "single", min: 1, max: 1 },
    supports: {
      durationsSec: [5, 10],
      durationEncoding: "int",
      // Sin aspectRatios ni resolutions: este modelo NO tiene esos campos.
      seed: false,
      negativePrompt: true,
      cfgScale: true,
      endImage: false,
      audio: false,
      enhancePrompt: false,
    },
    defaults: { durationSec: 5, cfgScale: 0.5 },
    recipes: ["tryon", "duo", "teleport"],
    buildBody(i) {
      const body: Record<string, unknown> = {
        prompt: i.prompt,
        image_url: requireOne(i.imageUrls, this.id),
        duration: encodeDuration(this.supports, i.durationSec),
        cfg_scale: i.cfgScale ?? 0.5,
      };
      if (i.negativePrompt) body.negative_prompt = i.negativePrompt;
      return body;
    },
  },
  {
    id: "kling-2.5-turbo-standard-i2v",
    label: "Kling 2.5 Turbo",
    family: "Kling",
    path: "/kling-video/v2.5-turbo/standard/image-to-video",
    capability: "image->video",
    tier: "curated",
    medianSeconds: 75,
    image: { field: "image_url", mode: "single", min: 1, max: 1 },
    supports: {
      durationsSec: [5, 10],
      durationEncoding: "int",
      seed: false,
      negativePrompt: true,
      cfgScale: true,
      endImage: false,
      audio: false,
      enhancePrompt: false,
    },
    defaults: { durationSec: 5, cfgScale: 0.5 },
    recipes: ["tryon", "duo", "teleport"],
    buildBody(i) {
      const body: Record<string, unknown> = {
        prompt: i.prompt,
        image_url: requireOne(i.imageUrls, this.id),
        duration: encodeDuration(this.supports, i.durationSec),
        cfg_scale: i.cfgScale ?? 0.5,
      };
      if (i.negativePrompt) body.negative_prompt = i.negativePrompt;
      return body;
    },
  },
  {
    id: "hailuo-2.3-standard-i2v",
    label: "Hailuo 2.3",
    family: "MiniMax",
    path: "/minimax/hailuo-2.3/standard/image-to-video",
    capability: "image->video",
    tier: "curated",
    medianSeconds: 80,
    image: { field: "image_url", mode: "single", min: 1, max: 1 },
    supports: {
      // Ojo: 6 y 10, no 5 y 10. Pedir 5s aquí se ajusta a 6 y la UI lo confiesa.
      durationsSec: [6, 10],
      durationEncoding: "int",
      seed: false,
      negativePrompt: false,
      cfgScale: false,
      endImage: false,
      audio: false,
      enhancePrompt: false,
    },
    defaults: { durationSec: 6 },
    recipes: ["tryon", "duo", "teleport"],
    buildBody(i) {
      return {
        prompt: i.prompt,
        image_url: requireOne(i.imageUrls, this.id),
        duration: encodeDuration(this.supports, i.durationSec),
      };
    },
  },
  {
    id: "hailuo-2.3-fast-standard-i2v",
    label: "Hailuo 2.3 Fast",
    family: "MiniMax",
    path: "/minimax/hailuo-2.3-fast/standard/image-to-video",
    capability: "image->video",
    tier: "curated",
    medianSeconds: 50,
    image: { field: "image_url", mode: "single", min: 1, max: 1 },
    supports: {
      durationsSec: [6, 10],
      durationEncoding: "int",
      seed: false,
      negativePrompt: false,
      cfgScale: false,
      endImage: false,
      audio: false,
      enhancePrompt: false,
    },
    defaults: { durationSec: 6 },
    recipes: ["tryon", "duo", "teleport"],
    buildBody(i) {
      return {
        prompt: i.prompt,
        image_url: requireOne(i.imageUrls, this.id),
        duration: encodeDuration(this.supports, i.durationSec),
      };
    },
  },
  {
    id: "wan-25-preview-i2v",
    label: "Wan 2.5 Preview",
    family: "Wan",
    path: "/wan-25-preview/image-to-video",
    capability: "image->video",
    tier: "curated",
    medianSeconds: 95,
    image: { field: "image_url", mode: "single", min: 1, max: 1 },
    supports: {
      durationsSec: [5, 10],
      durationEncoding: "int",
      resolutions: ["480p", "720p", "1080p"],
      seed: false,
      negativePrompt: false,
      cfgScale: false,
      endImage: false,
      audio: false,
      enhancePrompt: false,
    },
    defaults: { durationSec: 5, resolution: "720p" },
    recipes: ["tryon", "duo", "teleport"],
    buildBody(i) {
      return {
        prompt: i.prompt,
        image_url: requireOne(i.imageUrls, this.id),
        duration: encodeDuration(this.supports, i.durationSec),
        resolution: snapEnum(i.resolution, ["480p", "720p", "1080p"], "720p"),
      };
    },
  },
  {
    id: "dop-lite",
    label: "DoP Lite",
    family: "Higgsfield DoP",
    path: "/higgsfield-ai/dop/lite",
    capability: "image->video",
    tier: "curated",
    medianSeconds: 60,
    image: { field: "image_url", mode: "single", min: 1, max: 1 },
    supports: {
      durationEncoding: "none",
      seed: true,
      negativePrompt: false,
      cfgScale: false,
      endImage: true,
      audio: false,
      enhancePrompt: true,
    },
    defaults: { enhancePrompt: true },
    recipes: ["tryon", "duo", "teleport"],
    buildBody(i) {
      // `motions` se omite a propósito: los UUID de preset no se pueden descubrir
      // desde ningún endpoint público, así que no hay forma de poblarlo bien.
      const body: Record<string, unknown> = {
        prompt: i.prompt,
        image_url: requireOne(i.imageUrls, this.id),
        enhance_prompt: i.enhancePrompt ?? true,
      };
      if (i.endImageUrl) body.end_image_url = i.endImageUrl;
      if (i.seed !== undefined) body.seed = clampInt(i.seed, 1, 1_000_000);
      return body;
    },
  },
  {
    id: "dop-standard",
    label: "DoP Standard",
    family: "Higgsfield DoP",
    path: "/higgsfield-ai/dop/standard",
    capability: "image->video",
    tier: "extended",
    medianSeconds: 110,
    image: { field: "image_url", mode: "single", min: 1, max: 1 },
    supports: {
      durationEncoding: "none",
      seed: true,
      negativePrompt: false,
      cfgScale: false,
      endImage: true,
      audio: false,
      enhancePrompt: true,
    },
    defaults: { enhancePrompt: true },
    recipes: ["tryon", "duo", "teleport"],
    buildBody(i) {
      const body: Record<string, unknown> = {
        prompt: i.prompt,
        image_url: requireOne(i.imageUrls, this.id),
        enhance_prompt: i.enhancePrompt ?? true,
      };
      if (i.endImageUrl) body.end_image_url = i.endImageUrl;
      if (i.seed !== undefined) body.seed = clampInt(i.seed, 1, 1_000_000);
      return body;
    },
  },
  {
    id: "kling-2.1-pro-i2v",
    label: "Kling 2.1 Pro",
    family: "Kling",
    path: "/kling-video/v2.1/pro/image-to-video",
    capability: "image->video",
    tier: "extended",
    medianSeconds: 100,
    image: { field: "image_url", mode: "single", min: 1, max: 1 },
    supports: {
      durationsSec: [5, 10],
      durationEncoding: "int",
      seed: false,
      negativePrompt: true,
      cfgScale: true,
      endImage: false,
      audio: false,
      enhancePrompt: false,
    },
    defaults: { durationSec: 5, cfgScale: 0.5 },
    recipes: ["tryon", "duo", "teleport"],
    buildBody(i) {
      const body: Record<string, unknown> = {
        prompt: i.prompt,
        image_url: requireOne(i.imageUrls, this.id),
        duration: encodeDuration(this.supports, i.durationSec),
        cfg_scale: i.cfgScale ?? 0.5,
      };
      if (i.negativePrompt) body.negative_prompt = i.negativePrompt;
      return body;
    },
  },

  /* --- Modelos que muchas cuentas NO tienen. Se muestran apagados con su motivo. --- */
  {
    id: "veo31-reference-to-video",
    label: "Veo 3.1 (reference)",
    family: "Google Veo",
    path: "/veo3.1/reference-to-video",
    capability: "image->video",
    tier: "extended",
    medianSeconds: 120,
    image: { field: "image_urls", mode: "array", min: 1, max: 3 },
    supports: {
      durationsSec: [4, 6, 8],
      // Única familia donde `duration` viaja como STRING. Por eso existe el encoding.
      durationEncoding: "string",
      resolutions: ["720", "1080"],
      aspectRatios: VIDEO_ASPECTS,
      seed: false,
      negativePrompt: false,
      cfgScale: false,
      endImage: false,
      audio: true,
      enhancePrompt: false,
    },
    defaults: { durationSec: 8, resolution: "720", aspectRatio: "9:16" },
    recipes: ["tryon", "duo"],
    buildBody(i) {
      return {
        prompt: i.prompt,
        image_urls: requireMany(i.imageUrls, 1, 3, this.id),
        duration: encodeDuration(this.supports, i.durationSec),
        resolution: snapEnum(i.resolution, ["720", "1080"], "720"),
        aspect_ratio: snapEnum(i.aspectRatio, VIDEO_ASPECTS, "16:9"),
        generate_audio: true,
      };
    },
  },
  {
    id: "veo31-image-to-video",
    label: "Veo 3.1",
    family: "Google Veo",
    path: "/veo3.1/image-to-video",
    capability: "image->video",
    tier: "extended",
    medianSeconds: 120,
    image: { field: "image_url", mode: "single", min: 1, max: 1 },
    supports: {
      durationsSec: [4, 6, 8],
      durationEncoding: "string",
      resolutions: ["720", "1080"],
      aspectRatios: VIDEO_ASPECTS,
      seed: false,
      negativePrompt: false,
      cfgScale: false,
      endImage: false,
      audio: true,
      enhancePrompt: false,
    },
    defaults: { durationSec: 8, resolution: "720", aspectRatio: "9:16" },
    recipes: ["tryon", "duo", "teleport"],
    buildBody(i) {
      return {
        prompt: i.prompt,
        image_url: requireOne(i.imageUrls, this.id),
        duration: encodeDuration(this.supports, i.durationSec),
        resolution: snapEnum(i.resolution, ["720", "1080"], "720"),
        aspect_ratio: snapEnum(i.aspectRatio, VIDEO_ASPECTS, "16:9"),
        generate_audio: true,
      };
    },
  },
  {
    id: "sora-2-i2v-pro",
    label: "Sora 2 Pro",
    family: "OpenAI Sora",
    path: "/sora-2/image-to-video/pro",
    capability: "image->video",
    tier: "extended",
    medianSeconds: 130,
    image: { field: "image_url", mode: "single", min: 1, max: 1 },
    supports: {
      durationsSec: [4, 8, 12],
      durationEncoding: "int",
      resolutions: ["720p", "1080p"],
      aspectRatios: VIDEO_ASPECTS,
      seed: false,
      negativePrompt: false,
      cfgScale: false,
      endImage: false,
      audio: false,
      enhancePrompt: false,
    },
    defaults: { durationSec: 8, resolution: "720p", aspectRatio: "9:16" },
    recipes: ["tryon", "duo", "teleport"],
    buildBody(i) {
      return {
        prompt: i.prompt,
        image_url: requireOne(i.imageUrls, this.id),
        duration: encodeDuration(this.supports, i.durationSec),
        resolution: snapEnum(i.resolution, ["720p", "1080p"], "720p"),
        aspect_ratio: snapEnum(i.aspectRatio, VIDEO_ASPECTS, "16:9"),
      };
    },
  },
  {
    id: "seedance-pro-fast-i2v",
    label: "Seedance Pro Fast",
    family: "ByteDance",
    path: "/bytedance/seedance/v1/pro/fast/image-to-video",
    capability: "image->video",
    tier: "extended",
    medianSeconds: 70,
    image: { field: "image_url", mode: "single", min: 1, max: 1 },
    supports: {
      durationsSec: [5],
      durationEncoding: "int",
      resolutions: ["480", "720", "1080"],
      aspectRatios: ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"],
      seed: false,
      negativePrompt: false,
      cfgScale: false,
      endImage: false,
      audio: false,
      enhancePrompt: false,
    },
    defaults: { durationSec: 5, resolution: "720", aspectRatio: "9:16" },
    recipes: ["tryon", "duo", "teleport"],
    buildBody(i) {
      return {
        prompt: i.prompt,
        image_url: requireOne(i.imageUrls, this.id),
        duration: encodeDuration(this.supports, i.durationSec),
        resolution: snapEnum(i.resolution, ["480", "720", "1080"], "720"),
        aspect_ratio: snapEnum(
          i.aspectRatio,
          ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"] as const,
          "16:9",
        ),
      };
    },
  },
];

const BY_ID = new Map(MODELS.map((m) => [m.id, m]));

export function getModel(id: string): ModelSpec | undefined {
  return BY_ID.get(id);
}

export function toPublic(m: ModelSpec): PublicModelSpec {
  const { buildBody: _buildBody, ...rest } = m;
  void _buildBody;
  return rest;
}

export function listModels(tier?: "curated" | "all"): ModelSpec[] {
  if (!tier || tier === "all") return MODELS;
  return MODELS.filter((m) => m.tier === "curated");
}

export function stillModels(): ModelSpec[] {
  return MODELS.filter(
    (m) => m.capability !== "image->video" && m.capability !== "text->video",
  );
}

export function videoModels(): ModelSpec[] {
  return MODELS.filter(
    (m) => m.capability === "image->video" || m.capability === "text->video",
  );
}
