"use client";
/**
 * Inicio de sesión con Google (Google Identity Services, flujo de token en el navegador).
 * Permisos: drive.file (solo los archivos que crea MiSaldo) y el correo de la cuenta. Sin servidor no hay
 * token de renovación: el permiso dura una hora y se renueva con un toque (sin pedir nada si la sesión de
 * Google sigue abierta). El token vive solo en esta pestaña.
 */
import { GOOGLE_CLIENT_ID } from "../config";

export const GOOGLE_SCOPES = "https://www.googleapis.com/auth/drive.file openid email";
/**
 * Solo para «Activar lectura de correos»: crear el script en la planilla del usuario e implementarlo.
 * MiSaldo nunca pide permiso de Gmail: lo pide el script del propio usuario, que corre en su cuenta.
 */
export const SCRIPT_SCOPES = "https://www.googleapis.com/auth/script.projects https://www.googleapis.com/auth/script.deployments";
const TOKEN_KEY = "mf-google-token";

type TokenResponse = { access_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };
type TokenClient = { requestAccessToken: (o?: { prompt?: string; login_hint?: string }) => void };
type Gis = { accounts: { oauth2: { initTokenClient: (c: Record<string, unknown>) => TokenClient; revoke: (t: string, cb?: () => void) => void } } };

export class GoogleAuthError extends Error {
  constructor(message: string, public code: "cancelled" | "unavailable" | "denied" | "expired") { super(message); }
}

export const googleSignInAvailable = () => Boolean(GOOGLE_CLIENT_ID);

let gisPromise: Promise<Gis> | null = null;
function loadGis(): Promise<Gis> {
  const w = window as unknown as { google?: Gis };
  if (w.google?.accounts?.oauth2) return Promise.resolve(w.google);
  gisPromise ??= new Promise<Gis>((ok, fail) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => (w.google?.accounts?.oauth2 ? ok(w.google) : fail(new GoogleAuthError("No se pudo cargar el inicio de sesión de Google", "unavailable")));
    s.onerror = () => { gisPromise = null; fail(new GoogleAuthError("No se pudo cargar el inicio de sesión de Google. Revisa tu conexión.", "unavailable")); };
    document.head.appendChild(s);
  });
  return gisPromise;
}

/** Token vigente (con un minuto de margen) o null. Con `scopes`, solo si el token incluye esos permisos. */
export function currentToken(scopes?: string): string | null {
  try {
    const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? "null") as { token: string; exp: number; scope?: string } | null;
    if (!t || t.exp - 60_000 <= Date.now()) return null;
    if (scopes && !scopes.split(" ").every((s) => (t.scope ?? "").split(" ").includes(s))) return null;
    return t.token;
  } catch { return null; }
}

/**
 * Pide un token a Google. Debe llamarse desde un toque del usuario (abre una ventana de Google).
 * Con prompt "" y la sesión abierta, la ventana se cierra sola sin pedir nada.
 */
export async function requestToken(opts: { prompt?: "" | "consent" | "select_account"; hint?: string; scopes?: string } = {}): Promise<string> {
  if (!GOOGLE_CLIENT_ID) throw new GoogleAuthError("El inicio de sesión con Google aún no está configurado en esta app", "unavailable");
  const gis = await loadGis();
  return new Promise<string>((ok, fail) => {
    const client = gis.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: opts.scopes ? `${GOOGLE_SCOPES} ${opts.scopes}` : GOOGLE_SCOPES,
      include_granted_scopes: true,
      callback: (r: TokenResponse) => {
        if (!r.access_token) return fail(new GoogleAuthError(r.error === "access_denied" ? "No diste permiso a MiSaldo para usar tu planilla" : r.error_description || "Google no entregó el permiso", "denied"));
        if (opts.scopes && !opts.scopes.split(" ").every((s) => (r.scope ?? "").split(" ").includes(s))) {
          return fail(new GoogleAuthError("Falta marcar los permisos para instalar el script en tu planilla. Inténtalo de nuevo y marca todas las casillas.", "denied"));
        }
        try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token: r.access_token, exp: Date.now() + (r.expires_in ?? 3600) * 1000, scope: r.scope ?? GOOGLE_SCOPES })); } catch { /* sin almacenamiento */ }
        ok(r.access_token);
      },
      error_callback: (e: { type?: string }) => fail(new GoogleAuthError(
        e?.type === "popup_closed" ? "Cerraste la ventana de Google antes de terminar" : e?.type === "popup_failed_to_open" ? "El navegador bloqueó la ventana de Google. Permite ventanas emergentes e inténtalo de nuevo." : "No se pudo iniciar sesión con Google",
        "cancelled")),
    });
    client.requestAccessToken({ prompt: opts.prompt ?? "", login_hint: opts.hint });
  });
}

export function forgetToken() {
  const t = currentToken();
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* sin almacenamiento */ }
  const w = window as unknown as { google?: Gis };
  if (t && w.google?.accounts?.oauth2) w.google.accounts.oauth2.revoke(t);
}
