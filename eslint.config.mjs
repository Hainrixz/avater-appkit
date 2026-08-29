import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    rules: {
      /*
       * `next/image` está desactivado A PROPÓSITO en este proyecto.
       *
       * Casi todas las imágenes que se pintan aquí son resultados del proveedor,
       * servidos desde CloudFront y BORRADOS a los ~7 días. Usar next/image
       * significaría mantener `remotePatterns` cada vez que cambie el host, y pagar
       * una optimización de assets que caducan en una semana. Encima el optimizador
       * se interpone entre el usuario y la descarga, que es una función central.
       *
       * Las otras son object URLs locales (previsualizaciones), que next/image
       * tampoco puede optimizar.
       */
      "@next/next/no-img-element": "off",

      /*
       * La llave del usuario NUNCA puede acabar en el bundle del cliente. Cualquier
       * NEXT_PUBLIC_*KEY / *SECRET / *TOKEN se inlinea en el JavaScript que se sirve
       * al navegador, así que esto lo corta de raíz para quien forkee el kit.
       */
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'] > Identifier[name=/^NEXT_PUBLIC_.*(KEY|SECRET|TOKEN)/]",
          message:
            "Never expose an API key through NEXT_PUBLIC_*. Read it server-side in lib/server/credentials.ts instead.",
        },
      ],
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
