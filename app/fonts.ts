import localFont from "next/font/local";

/**
 * FUENTES AUTOALOJADAS, NO CDN.
 *
 * Fontshare sirve estas familias por CDN, pero un `@import` dentro de globals.css
 * encadena DNS -> TLS -> CSS -> woff2 en la ruta crítica, y el salto de fuente cae
 * justo sobre el H1 del hero, que es el peor lugar posible para un layout shift.
 * `next/font/local` inyecta el @font-face en el HTML inicial y precarga el archivo.
 *
 * `adjustFontFallback: "Arial"` NO es elegir Arial como tipografía. Arial nunca se
 * dibuja: Next lee sus métricas para sintetizar un fallback con `size-adjust` que
 * ocupa la misma caja que Satoshi durante los ~80ms previos. Es un mecanismo anti-CLS.
 * No lo "arregles" quitándolo.
 *
 * Fontshare entrega pesos estáticos, no variables, así que aquí se declara sólo lo
 * que la app realmente usa: 4 pesos de display y 3 de texto (~180KB en total).
 */

export const satoshi = localFont({
  src: [
    { path: "./fonts/Satoshi-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Satoshi-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/Satoshi-700.woff2", weight: "700", style: "normal" },
    { path: "./fonts/Satoshi-900.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-satoshi",
  display: "swap",
  preload: true,
  fallback: ["Helvetica Neue", "Helvetica", "sans-serif"],
  adjustFontFallback: "Arial",
});

export const generalSans = localFont({
  src: [
    { path: "./fonts/GeneralSans-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/GeneralSans-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/GeneralSans-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-general-sans",
  display: "swap",
  preload: true,
  fallback: ["Helvetica Neue", "Helvetica", "sans-serif"],
  adjustFontFallback: "Arial",
});
