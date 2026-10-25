import type { NextConfig } from "next";

/**
 * Exportación estática para GitHub Pages (sin servidor).
 * NEXT_PUBLIC_BASE_PATH = "/MisFinanzas" al publicar en https://<usuario>.github.io/MisFinanzas/
 * Las cabeceras de seguridad (CSP) se inyectan como <meta> en scripts/postbuild-csp.mjs.
 */
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const config: NextConfig = {
  output: "export",
  basePath: base || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};
export default config;
