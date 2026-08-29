import { AppError } from "@/lib/shared/errors";

/**
 * Detecta el tipo real por bytes mágicos en vez de fiarse de `file.type`.
 *
 * Un archivo mal etiquetado no falla aquí: falla más tarde, en el PUT prefirmado,
 * con un error de firma de S3 que no hay quien lea. Mejor rechazarlo antes.
 */
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AcceptedImageType = (typeof ACCEPTED_IMAGE_TYPES)[number];

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function sniffImageType(bytes: Uint8Array): AcceptedImageType | null {
  if (bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  // WebP: "RIFF" .... "WEBP"
  const ascii = (i: number) => String.fromCharCode(bytes[i]!);
  const riff = ascii(0) + ascii(1) + ascii(2) + ascii(3);
  const webp = ascii(8) + ascii(9) + ascii(10) + ascii(11);
  if (riff === "RIFF" && webp === "WEBP") return "image/webp";

  return null;
}

export function assertUploadable(bytes: Uint8Array): AcceptedImageType {
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new AppError(
      "file_too_large",
      `That image is ${(bytes.byteLength / 1024 / 1024).toFixed(1)}MB. The limit is 10MB.`,
    );
  }
  const type = sniffImageType(bytes);
  if (!type) {
    throw new AppError(
      "unsupported_file",
      "That file isn't a JPEG, PNG or WebP. Drop one of those.",
    );
  }
  return type;
}
