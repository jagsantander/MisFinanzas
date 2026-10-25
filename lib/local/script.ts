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

/**
 * Código de conexión que muestra la planilla (menú Mi saldo → Conectar con la app): «MS1.» + JSON {u, t} en base64url.
 * Devuelve null si no es válido o si la URL no es de Apps Script.
 */
export function parseConnectionCode(code: string): Connection | null {
  const m = /^MS1\.([A-Za-z0-9_-]+)$/.exec(code.trim());
  if (!m) return null;
  try {
    const b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = new TextDecoder().decode(Uint8Array.from(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0)));
    const d = JSON.parse(json);
    if (typeof d?.u !== "string" || typeof d?.t !== "string" || !validScriptUrl(d.u) || d.t.length < 20) return null;
    return { url: d.u.trim(), token: d.t.trim() };
  } catch {
    return null;
  }
}

/** Código recibido desde el botón de la planilla (#conectar=…). Se guarda solo en esta pestaña hasta que el usuario confirme. */
const PENDING_KEY = "mf-connect-code";
export function captureConnectionHash() {
  const m = /[#&]conectar=([^&]+)/.exec(location.hash);
  if (!m) return;
  try { sessionStorage.setItem(PENDING_KEY, decodeURIComponent(m[1])); } catch { /* sin almacenamiento */ }
  history.replaceState(null, "", location.pathname + location.search); // que el código no quede en el historial
}
export function pendingConnectionCode(): string | null {
  try { return sessionStorage.getItem(PENDING_KEY); } catch { return null; }
}
export function clearPendingConnectionCode() {
  try { sessionStorage.removeItem(PENDING_KEY); } catch { /* sin almacenamiento */ }
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
