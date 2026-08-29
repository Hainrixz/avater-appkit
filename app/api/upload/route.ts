import { AppError } from "@/lib/shared/errors";
import { assertUploadable } from "@/lib/server/sniff";
import { json, withApi } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Sube una foto del usuario y devuelve una URL que Higgsfield puede leer.
 *
 * Es un Route Handler y NO una Server Action a propósito: el límite por defecto de
 * body en Server Actions es 1MB y rechazaría en silencio cualquier foto de móvil.
 *
 * El paso browser -> nuestra ruta -> PUT prefirmado añade un salto, pero en local es
 * loopback y sale gratis, y evita depender del CORS de un bucket que no controlamos.
 * Si alguien despliega esto de verdad, subir directo desde el navegador es un cambio
 * de una función (el PUT no lleva credenciales).
 */
export const POST = withApi(
  async ({ req, provider }) => {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");

    if (!file || typeof file === "string") {
      throw new AppError("invalid_params", "No file in the request.");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentType = assertUploadable(bytes); // tamaño + bytes mágicos

    const asset = await provider.uploadImage({ bytes, contentType });
    return json(asset);
  },
  { mutating: true },
);
