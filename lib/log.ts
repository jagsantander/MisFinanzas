/**
 * Logs estructurados sin datos sensibles. Las claves conocidas se redactan siempre.
 */
const REDACT = /(token|secret|password|key|authorization|cookie|code|body|content|email|amount)/i;

function clean(meta?: Record<string, unknown>) {
  if (!meta) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) out[k] = REDACT.test(k) ? "[redactado]" : v;
  return out;
}

function emit(level: string, event: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...clean(meta) });
  if (level === "error") console.error(line); else console.log(line);
}

export const log = {
  info: (e: string, m?: Record<string, unknown>) => emit("info", e, m),
  warn: (e: string, m?: Record<string, unknown>) => emit("warn", e, m),
  error: (e: string, m?: Record<string, unknown>) => emit("error", e, m),
};

/** Mensaje de error seguro para guardar/mostrar (sin secretos ni contenido). */
export function safeErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/(sk-[A-Za-z0-9_-]{6,}|AIza[0-9A-Za-z_-]{10,}|Bearer\s+[A-Za-z0-9._-]+|ya29\.[A-Za-z0-9._-]+)/g, "[redactado]").slice(0, 300);
}
