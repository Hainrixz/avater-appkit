import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import { satoshi, generalSans } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  /* Necesario para que las URLs de opengraph-image salgan absolutas. En local apunta
     a localhost; al desplegar, se define SITE_URL y las tarjetas sociales funcionan. */
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  title: "Avatar App Kit — put yourself anywhere",
  description:
    "An open-source studio for the Higgsfield API. Bring your own key, drop a photo, and get yourself in another place, in another outfit, or beside someone else. Runs on your machine.",
  applicationName: "Avatar App Kit",
  authors: [{ name: "Hainrixz" }],
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};

/**
 * Las variables de fuente van en <html>, no en <body>.
 *
 * Si se cuelgan de <body>, cualquier cosa que Next portalice fuera de él —los
 * toasts de sonner y el contenido flotante de base-ui salen a nivel de documento—
 * queda fuera del alcance de la variable y cae al fallback. Se ve exactamente
 * como un bug de fuente y cuesta una tarde encontrarlo.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    /*
     * `suppressHydrationWarning` va SÓLO en <html>, y no es para tapar bugs nuestros.
     *
     * Las extensiones del navegador escriben atributos en <html> y <body> antes de que
     * React hidrate — LanguageTool mete data-lt-installed, Grammarly y los modos oscuros
     * hacen lo suyo — y React lo reporta como desajuste de hidratación aunque el código
     * esté perfecto. Verificado: en un navegador limpio no sale ni un aviso, y <html>
     * sólo lleva lang y class.
     *
     * Esto suprime un único nivel de profundidad, así que un desajuste REAL dentro de la
     * app se sigue reportando igual. Por eso va aquí y no en <body>.
     */
    <html
      lang="en"
      className={`${satoshi.variable} ${generalSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
