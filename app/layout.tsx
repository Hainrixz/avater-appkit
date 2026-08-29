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
    <html
      lang="en"
      className={`${satoshi.variable} ${generalSans.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
