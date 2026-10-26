"use client";
/**
 * Instala el script de MiSaldo en la planilla del usuario sin que tenga que abrir el editor:
 * crea el proyecto ligado a la planilla, sube Code.gs y el manifiesto, crea una versión y lo implementa como
 * aplicación web (API de Apps Script, con permiso del usuario).
 *
 * MiSaldo no recibe permiso de Gmail: el script corre en la cuenta del usuario y es él quien le da permiso de
 * solo lectura en la pantalla de Google. Por eso no hace falta la auditoría que Google exige a las apps que leen Gmail.
 *
 * El token con que la app habla con el script se genera aquí; en el código solo se escribe su huella SHA-256.
 */
import type { ScriptConnection } from "../local/types";
import { readAppProps, writeAppProps } from "./sheets";

const API = "https://script.googleapis.com/v1";
export const APPS_SCRIPT_SETTINGS_URL = "https://script.google.com/home/usersettings";
const BOOT_PLACEHOLDER = "var BOOT_TOKEN_HASH = '';";

export class ScriptSetupError extends Error {
  constructor(message: string, public code: "api_disabled" | "failed" | "expired") { super(message); }
}

async function api<T = any>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) } });
  } catch {
    throw new ScriptSetupError("No se pudo contactar a Google. Revisa tu conexión.", "failed");
  }
  const body = await res.json().catch(() => null);
  if (res.ok) return body as T;
  const msg = String(body?.error?.message ?? `error ${res.status}`);
  if (res.status === 401) throw new ScriptSetupError("El permiso de Google venció. Vuelve a intentarlo.", "expired");
  if (res.status === 403 && /Apps Script API|usersettings|not enabled|no ha habilitado/i.test(msg)) {
    throw new ScriptSetupError("Falta activar la API de Apps Script en tu cuenta de Google (un interruptor, una sola vez).", "api_disabled");
  }
  throw new ScriptSetupError(`Google no pudo instalar el script: ${msg.slice(0, 200)}`, "failed");
}

const hex = (buf: ArrayBuffer | Uint8Array) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
export const newAppToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export const sha256Hex = async (s: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));

/** Inserta la huella del token en el código. Falla si el código no tiene el marcador (script antiguo). */
export function withBootHash(code: string, hash: string) {
  if (!code.includes(BOOT_PLACEHOLDER)) throw new ScriptSetupError("El código del script no admite la instalación automática", "failed");
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new ScriptSetupError("Huella inválida", "failed");
  return code.replace(BOOT_PLACEHOLDER, `var BOOT_TOKEN_HASH = '${hash}';`);
}

export const webAppUrl = (deploymentId: string) => `https://script.google.com/macros/s/${deploymentId}/exec`;

/** La conexión guardada en la planilla por otro dispositivo, si existe. */
export async function savedScriptConnection(token: string, spreadsheetId: string): Promise<ScriptConnection | null> {
  const p = await readAppProps(token, spreadsheetId);
  return p.msDeploy && p.msToken ? { url: webAppUrl(p.msDeploy), token: p.msToken } : null;
}

async function fetchText(path: string) {
  const r = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`, { cache: "no-store" });
  if (!r.ok) throw new ScriptSetupError("No se pudo leer el código del script", "failed");
  return r.text();
}

type Deployment = { deploymentId: string; entryPoints?: { entryPointType: string; webApp?: { url?: string } }[] };

/**
 * Instala (o actualiza) el script en la planilla e implementa la aplicación web. Idempotente: si la planilla ya
 * tiene un script instalado por MiSaldo, lo actualiza y conserva su dirección.
 */
export async function installScript(token: string, spreadsheetId: string): Promise<ScriptConnection> {
  const saved = await readAppProps(token, spreadsheetId);
  const [code, manifest] = await Promise.all([fetchText("/apps-script/Code.gs"), fetchText("/apps-script/appsscript.json")]);
  const appToken = saved.msToken && saved.msToken.length === 64 ? saved.msToken : newAppToken();
  const source = withBootHash(code, await sha256Hex(appToken));

  let scriptId = saved.msScript;
  if (scriptId) {
    // Puede haberse borrado a mano: si ya no existe, se crea otro.
    try { await api(token, `/projects/${scriptId}`); } catch (e) { if ((e as ScriptSetupError).code !== "failed") throw e; scriptId = undefined; }
  }
  if (!scriptId) {
    const p = await api<{ scriptId: string }>(token, "/projects", { method: "POST", body: JSON.stringify({ title: "MiSaldo", parentId: spreadsheetId }) });
    scriptId = p.scriptId;
    await writeAppProps(token, spreadsheetId, { msScript: scriptId, msDeploy: "", msToken: "" });
  }
  await api(token, `/projects/${scriptId}/content`, {
    method: "PUT",
    body: JSON.stringify({ scriptId, files: [{ name: "Code", type: "SERVER_JS", source }, { name: "appsscript", type: "JSON", source: manifest }] }),
  });
  const v = await api<{ versionNumber: number }>(token, `/projects/${scriptId}/versions`, { method: "POST", body: JSON.stringify({ description: "MiSaldo" }) });
  const config = { scriptId, versionNumber: v.versionNumber, manifestFileName: "appsscript", description: "MiSaldo" };
  let dep: Deployment | null = null;
  if (saved.msDeploy && saved.msScript === scriptId) {
    try { dep = await api<Deployment>(token, `/projects/${scriptId}/deployments/${saved.msDeploy}`, { method: "PUT", body: JSON.stringify({ deploymentConfig: config }) }); }
    catch (e) { if ((e as ScriptSetupError).code !== "failed") throw e; }
  }
  dep ??= await api<Deployment>(token, `/projects/${scriptId}/deployments`, { method: "POST", body: JSON.stringify(config) });
  const url = dep.entryPoints?.find((e) => e.entryPointType === "WEB_APP")?.webApp?.url ?? webAppUrl(dep.deploymentId);
  await writeAppProps(token, spreadsheetId, { msScript: scriptId, msDeploy: dep.deploymentId, msToken: appToken });
  return { url, token: appToken };
}
