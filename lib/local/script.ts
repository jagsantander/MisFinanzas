import type { Connection } from "./types";

/**
 * Cliente del script de la planilla (Google Apps Script).
 * - Solo acepta direcciones oficiales de Apps Script, para que el token no pueda enviarse a otro sitio.
 * - Usa POST con text/plain (sin preflight CORS) y el token en el cuerpo, nunca en la URL.
 */
const SCRIPT_URL = /^https:\/\/script\.google\.com\/(a\/macros\/[A-Za-z0-9.-]+|macros)\/s\/[A-Za-z0-9_-]{20,}\/exec$/;

export function validScriptUrl(url: string) {
  return SCRIPT_URL.test(url.trim());
}

export class ScriptError extends Error {
  constructor(message: string, public code?: string) { super(message); }
}

export async function callScript<T = any>(conn: Connection, action: string, payload: Record<string, unknown> = {}, timeoutMs = 60_000): Promise<T> {
  if (!validScriptUrl(conn.url)) throw new ScriptError("La dirección del script no es una dirección de Google Apps Script válida", "bad_url");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(conn.url, {
      method: "POST", redirect: "follow", signal: ctrl.signal, credentials: "omit",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ ...payload, action, token: conn.token }),
    });
  } catch (e) {
    throw new ScriptError((e as Error).name === "AbortError" ? "La planilla tardó demasiado en responder" : "No se pudo contactar a tu planilla. Revisa tu conexión.", "network");
  } finally {
    clearTimeout(timer);
  }
  let data: any;
  try { data = await res.json(); } catch {
    throw new ScriptError("La planilla respondió algo inesperado. ¿Implementaste el script como «Aplicación web» con acceso «Cualquier usuario»?", "bad_response");
  }
  if (!data?.ok) throw new ScriptError(data?.error ?? "Error de la planilla", data?.code);
  return data as T;
}
