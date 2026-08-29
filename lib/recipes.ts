import type { AspectRatio, RecipeId } from "@/lib/shared/types";

/**
 * Las tres recetas. Fuente única de la aridad: el dropzone se dibuja mapeando
 * `slots`, así que añadir una receta de tres fotos no toca ningún componente.
 */

export interface RecipeSlot {
  id: "subject" | "garment" | "partner";
  label: string;
  hint: string;
}

export interface Recipe {
  id: RecipeId;
  label: string;
  blurb: string;
  slots: RecipeSlot[];
  /** Modelo de etapa A (imagen). */
  stillModelId: string;
  /** Modelo por defecto de etapa B (vídeo), si la receta permite animar. */
  videoModelId: string;
  canAnimate: boolean;
  counts: number[];
  aspectRatio: AspectRatio;
  promptRequired: boolean;
  promptPlaceholder: string;
  presets: string[];
  /** Se antepone al texto del usuario para orientar al modelo. */
  buildPrompt(userPrompt: string): string;
  buildVideoPrompt(userPrompt: string): string;
}

const PLACES = [
  "Tokyo at night, neon reflections on wet asphalt",
  "a Lisbon staircase in golden hour",
  "a snowfield under overcast light",
  "a Paris café terrace in the rain",
  "the Brooklyn Bridge at blue hour",
  "a rooftop in Mexico City at sunset",
];

export const RECIPES: Record<RecipeId, Recipe> = {
  teleport: {
    id: "teleport",
    label: "Teleport",
    blurb: "One photo, anywhere on earth.",
    slots: [
      { id: "subject", label: "You", hint: "A clear, front-facing photo" },
    ],
    // popcorn/auto, NO soul/reference. Verificado a mano y cuesta ~$0.19 en pruebas
    // descubrirlo: soul/reference reproduce la ESCENA de la foto de referencia junto
    // con la cara, así que con un retrato de estudio te devuelve estudio por mucho que
    // el prompt diga Tokio. No es cosa del prompt — se reescribió dos veces y falló
    // igual. popcorn/auto sí compone al sujeto dentro de un escenario nuevo.
    stillModelId: "popcorn-auto",
    videoModelId: "kling-2.5-turbo-pro-i2v",
    canAnimate: true,
    counts: [1, 4],
    aspectRatio: "9:16",
    promptRequired: true,
    promptPlaceholder: "Tokyo at night",
    presets: PLACES,
    buildPrompt: (p) =>
      `The person from the reference image, ${p.trim()}. The scene is visible behind and around them, with its light and colour falling on their face and clothes. Full-body candid photograph. Keep their face and build identical to the reference.`,
    buildVideoPrompt: (p) =>
      `${p.trim() || "the same scene"}. Subtle handheld camera drift, the person stays still and in frame.`,
  },

  tryon: {
    id: "tryon",
    label: "Try-on",
    blurb: "Wear something you don't own.",
    slots: [
      { id: "subject", label: "You", hint: "Half or full body works best" },
      { id: "garment", label: "The outfit", hint: "Flat lay or on a model" },
    ],
    stillModelId: "popcorn-auto",
    videoModelId: "kling-2.5-turbo-pro-i2v",
    canAnimate: true,
    counts: [1, 2, 4],
    aspectRatio: "9:16",
    promptRequired: false,
    promptPlaceholder: "Optional: describe the setting",
    presets: [
      "studio backdrop, soft key light",
      "a city street in daylight",
      "a rooftop at golden hour",
    ],
    buildPrompt: (p) => {
      const scene = p.trim() ? ` Scene: ${p.trim()}.` : "";
      return `The person from the first image wearing the garment from the second image. Keep the person's face and body identical; keep the garment's colour, cut and pattern faithful.${scene} Photographic, full length, natural lighting.`;
    },
    buildVideoPrompt: (p) =>
      `${p.trim() || "The person turns slightly toward the camera"}. The outfit stays consistent, gentle natural motion.`,
  },

  duo: {
    id: "duo",
    label: "Duo",
    blurb: "Two people, one frame.",
    slots: [
      { id: "subject", label: "You", hint: "A clear, front-facing photo" },
      { id: "partner", label: "Your partner", hint: "A clear photo of them" },
    ],
    stillModelId: "popcorn-auto",
    videoModelId: "kling-2.5-turbo-pro-i2v",
    canAnimate: true,
    counts: [1, 2, 4],
    aspectRatio: "9:16",
    promptRequired: false,
    promptPlaceholder: "Optional: where are you two?",
    presets: [
      "on a beach at sunset",
      "a Paris street in the rain",
      "a mountain viewpoint in the morning",
    ],
    buildPrompt: (p) => {
      const scene = p.trim() ? ` Scene: ${p.trim()}.` : " Scene: a warm, natural setting.";
      return `Both people from the reference images together in one frame, standing side by side, both faces clearly visible and faithful to their references.${scene} Photographic, natural lighting.`;
    },
    buildVideoPrompt: (p) =>
      `${p.trim() || "The two of them together"}. Both stay in frame, slow natural movement, subtle camera drift.`,
  },
};

export const RECIPE_LIST: Recipe[] = [RECIPES.teleport, RECIPES.tryon, RECIPES.duo];

export function getRecipe(id: RecipeId): Recipe {
  return RECIPES[id];
}
