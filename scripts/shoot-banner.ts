/**
 * Captura la portada del README a partir de la app REAL.
 *
 * Se commitea el script junto al PNG que produce, y eso es lo que lo convierte en un
 * kit: alguien cambia la paleta en globals.css, corre `npm run banner`, y su README
 * se actualiza solo. Un PNG hecho a mano se pudre en cuanto alguien toca un color.
 *
 * Por qué PNG y no SVG: GitHub pasa las imágenes del README por Camo, que sanea el
 * SVG y hace poco fiable el @font-face embebido — o sea que un banner en SVG
 * enseñaría Satoshi en una fuente de reserva justo donde se forma la primera
 * impresión. Rasterizado, ese problema desaparece.
 *
 * Uso:
 *   npm run dev            (en otra terminal)
 *   npm run banner
 */
import { chromium } from "playwright";

const BASE = process.env.BANNER_URL ?? "http://localhost:3000";
const OUT = process.env.BANNER_OUT ?? ".github/banner.jpg";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    // Ratio 1.905 (el de OG) pero más grande, para que los CTAs entren sin recortarse.
    viewport: { width: 1440, height: 756 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
    // Sin esto, la entrada escalonada del hero sale congelada a medias.
    reducedMotion: "reduce",
  });

  await page.goto(BASE, { waitUntil: "networkidle" });

  // El indicador de dev de Next sale en la captura si no se esconde.
  await page.addStyleTag({
    content: "#__next-dev-overlay, nextjs-portal, [data-nextjs-dev-tools-button] { display: none !important }",
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);

  // JPEG y no PNG: el banner es fotográfico, y un PNG a 2x pesaba 2.5MB — demasiado
  // para un README que se carga en cada visita al repo.
  await page.screenshot({ path: OUT, type: "jpeg", quality: 84 });
  await browser.close();
  console.log(`wrote ${OUT} at 2880x1512`);
}

main().catch((e) => {
  console.error("banner failed:", e instanceof Error ? e.message : e);
  console.error("is the dev server running? BANNER_URL defaults to http://localhost:3000");
  process.exit(1);
});
