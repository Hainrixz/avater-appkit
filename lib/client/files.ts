"use client";

/** Validación y reducción de fotos antes de subirlas. */

export const ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp"];
export const ACCEPTED_EXTRA_MIME = ["image/heic", "image/heif"];
export const MAX_BYTES = 10 * 1024 * 1024;
export const MIN_SHORT_EDGE = 512;
const TARGET_LONG_EDGE = 2048;

export interface FileProblem {
  code: "type" | "size" | "dimensions" | "decode";
  message: string;
}

export function checkType(file: File): FileProblem | null {
  const ok = [...ACCEPTED_MIME, ...ACCEPTED_EXTRA_MIME].includes(file.type);
  if (ok) return null;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "file";
  return {
    code: "type",
    message: `That's a .${ext}. Drop a JPEG, PNG, WebP or HEIC.`,
  };
}

export function checkSize(file: File): FileProblem | null {
  if (file.size <= MAX_BYTES) return null;
  return {
    code: "size",
    message: `${(file.size / 1024 / 1024).toFixed(1)} MB is over the 10 MB limit. Export it smaller.`,
  };
}

async function loadBitmap(file: File): Promise<ImageBitmap> {
  const isHeic =
    ACCEPTED_EXTRA_MIME.includes(file.type) || /\.hei[cf]$/i.test(file.name);

  if (isHeic) {
    // Safari decodifica HEIC; el resto de navegadores no muestran nada. El decodificador
    // se importa dinámicamente para que sus ~200KB no entren nunca en el bundle principal.
    try {
      const mod = (await import("heic2any")) as unknown as {
        default: (o: { blob: Blob; toType?: string; quality?: number }) => Promise<Blob | Blob[]>;
      };
      const out = await mod.default({ blob: file, toType: "image/jpeg", quality: 0.92 });
      const blob = Array.isArray(out) ? out[0]! : out;
      return await createImageBitmap(blob);
    } catch {
      // Si el decodificador no está instalado, se intenta nativo (Safari lo logra).
      return await createImageBitmap(file);
    }
  }

  return await createImageBitmap(file);
}

export interface PreparedFile {
  file: File;
  previewUrl: string;
  width: number;
  height: number;
}

/**
 * Reduce a 2048px de lado largo antes de subir.
 *
 * Una foto de 12MP pasa de ~5MB a ~600KB, lo que convierte una subida de 9 segundos
 * en menos de uno. Además esquiva el límite de 10MB sin tener que rechazar la foto.
 */
export async function prepareImage(file: File): Promise<PreparedFile> {
  const bitmap = await loadBitmap(file);
  const { width, height } = bitmap;

  if (Math.min(width, height) < MIN_SHORT_EDGE) {
    bitmap.close?.();
    throw {
      code: "dimensions",
      message: `That image is ${Math.min(width, height)}px on its short edge. Faces need at least ${MIN_SHORT_EDGE}px.`,
    } satisfies FileProblem;
  }

  const longEdge = Math.max(width, height);
  const scale = longEdge > TARGET_LONG_EDGE ? TARGET_LONG_EDGE / longEdge : 1;
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    throw { code: "decode", message: "Couldn't read that image." } satisfies FileProblem;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.9),
  );
  if (!blob) {
    throw { code: "decode", message: "Couldn't process that image." } satisfies FileProblem;
  }

  const out = new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
    type: "image/jpeg",
  });

  return { file: out, previewUrl: URL.createObjectURL(out), width: w, height: h };
}
