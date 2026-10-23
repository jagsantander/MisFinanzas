/**
 * Devuelve una ruta interna segura para redirigir tras iniciar sesión.
 * Rechaza "//x", "/\x", esquemas y cualquier cosa que el navegador resuelva fuera del sitio.
 */
export function safeNextPath(raw: string | null | undefined, fallback = "/"): string {
  if (!raw || !raw.startsWith("/") || /[\\\u0000-\u001f]/.test(raw) || raw.startsWith("//")) return fallback;
  try {
    const base = "https://misfinanzas.invalid";
    const u = new URL(raw, base);
    if (u.origin !== base) return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}
