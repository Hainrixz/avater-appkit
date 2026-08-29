import { AppError } from "@/lib/shared/errors";
import { isAllowedAssetUrl } from "@/lib/server/urls";
import { errorResponse } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ESTA RUTA ES OBLIGATORIA, no un lujo.
 *
 * El atributo `download` de un <a> se IGNORA cuando el href es cross-origin: el
 * navegador abre una pestaña en vez de guardar el archivo. Como los resultados viven
 * en CloudFront y encima se borran a los ~7 días, guardar una copia es una función
 * central del producto, y sólo funciona reenviando el archivo desde nuestro origen
 * con Content-Disposition: attachment.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    const params = new URL(req.url).searchParams;
    const url = params.get("url");
    const filename = (params.get("filename") || "avatar-kit").replace(/[^\w.-]+/g, "-");

    if (!isAllowedAssetUrl(url)) {
      throw new AppError("invalid_params", "That URL isn't a Higgsfield result.");
    }

    const upstream = await fetch(url!, {
      headers: { "User-Agent": "AvatarAppKit/0.1" },
      signal: AbortSignal.timeout(120_000),
    });

    if (!upstream.ok || !upstream.body) {
      throw new AppError(
        "not_found",
        upstream.status === 403 || upstream.status === 404
          ? "Higgsfield has already removed this file. Results expire after about 7 days."
          : `Couldn't fetch that file (${upstream.status}).`,
      );
    }

    const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
    const ext = contentType.includes("mp4")
      ? "mp4"
      : contentType.includes("png")
        ? "png"
        : contentType.includes("webp")
          ? "webp"
          : "jpg";

    return new Response(upstream.body, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}.${ext}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
