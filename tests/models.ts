/**
 * EL CONTRATO DEL NORMALIZADOR.
 *
 * Un solo GenerationInput pasa por varios modelos y se comprueba que cada uno emite
 * SU forma: mismo concepto, campos distintos, dominios distintos. Si este test pasa,
 * "cambias el modelo arriba y jala igual" es cierto; si falla, la app manda 422.
 *
 * Correr con: npm run check:models
 */
import { getModel } from "../lib/provider/higgsfield/models";
import { diffCapabilities, describeChange } from "../lib/provider/higgsfield/normalize";
import type { GenerationInput } from "../lib/shared/types";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}\n       expected ${e}\n       actual   ${a}`);
  }
}

function body(modelId: string, input: Omit<GenerationInput, "modelId">) {
  const m = getModel(modelId);
  if (!m) throw new Error(`no model ${modelId}`);
  return m.buildBody({ ...input, modelId });
}

const IMG = "https://cdn.example.com/a.jpg";
const IMG2 = "https://cdn.example.com/b.jpg";

console.log("\nEtapa A — imagen: el mismo batchSize va a campos distintos");
check(
  "soul-reference usa batch_size con enum 1|4",
  body("soul-reference", {
    prompt: "tokyo at night",
    imageUrls: [IMG],
    batchSize: 4,
    aspectRatio: "9:16",
    resolution: "1080p",
  }),
  {
    prompt: "tokyo at night",
    image_reference_url: IMG,
    batch_size: 4,
    resolution: "1080p",
    aspect_ratio: "9:16",
    enhance_prompt: true,
  },
);

check(
  "soul-reference ajusta batchSize 3 (no permitido) al más cercano",
  (body("soul-reference", { prompt: "x", imageUrls: [IMG], batchSize: 3 }) as Record<string, unknown>)
    .batch_size,
  4,
);

check(
  "popcorn usa num_images (1..8) y acepta dos referencias",
  body("popcorn-auto", {
    prompt: "the two of them",
    imageUrls: [IMG, IMG2],
    batchSize: 2,
    aspectRatio: "9:16",
    resolution: "720p",
  }),
  {
    prompt: "the two of them",
    image_urls: [IMG, IMG2],
    num_images: 2,
    resolution: "720p",
    aspect_ratio: "9:16",
  },
);

console.log("\nEtapa B — vídeo: un mismo input, tres bodies distintos");
const videoInput = {
  prompt: "she turns to camera",
  imageUrls: [IMG],
  durationSec: 5,
  aspectRatio: "9:16" as const,
  resolution: "1080p",
};

check(
  "kling: duration entero, SIN aspect_ratio ni resolution",
  body("kling-2.5-turbo-pro-i2v", videoInput),
  { prompt: "she turns to camera", image_url: IMG, duration: 5, cfg_scale: 0.5 },
);

check(
  "hailuo: 5s no existe (6|10) -> se ajusta a 6",
  body("hailuo-2.3-standard-i2v", videoInput),
  { prompt: "she turns to camera", image_url: IMG, duration: 6 },
);

check(
  "wan: conserva resolution, duration entero",
  body("wan-25-preview-i2v", videoInput),
  { prompt: "she turns to camera", image_url: IMG, duration: 5, resolution: "1080p" },
);

check(
  "veo: única familia con duration STRING, y pide array de urls",
  body("veo31-reference-to-video", { ...videoInput, durationSec: 8 }),
  {
    prompt: "she turns to camera",
    image_urls: [IMG],
    duration: "8",
    resolution: "720",
    aspect_ratio: "9:16",
    generate_audio: true,
  },
);

console.log("\nLa UI confiesa lo que cambió");
const changes = diffCapabilities(getModel("hailuo-2.3-standard-i2v")!, {
  modelId: "hailuo-2.3-standard-i2v",
  prompt: "x",
  imageUrls: [IMG],
  durationSec: 5,
  aspectRatio: "9:16",
});
check(
  "5s -> 6s se reporta",
  changes.find((c) => c.field === "durationSec")?.to,
  6,
);
check(
  "aspectRatio se reporta como no soportado",
  changes.find((c) => c.field === "aspectRatio")?.reason,
  "field_not_supported",
);
console.log(
  "  copy:",
  changes.map((c) => describeChange("Hailuo 2.3", c)).join(" / "),
);

console.log(
  failures === 0 ? "\nPASS — el contrato se sostiene\n" : `\n${failures} FAILED\n`,
);
process.exit(failures === 0 ? 0 : 1);
