"use client";
/**
 * Bloqueo local de la app con la huella, el rostro o el PIN del dispositivo (WebAuthn de plataforma).
 * MisFinanzas no recibe ni guarda datos biométricos: el sistema solo confirma que la persona desbloqueó.
 * Límite: sin servidor, es una barrera de uso (frente a miradas casuales), no cifrado de los datos.
 */
const KEY = "mf-lock";
type LockCfg = { credentialId: string; minutes: number };

function read(): LockCfg | null {
  try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v) : null; } catch { return null; }
}
const b64u = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export const lockConfigured = () => Boolean(read());
export const lockMinutes = () => read()?.minutes ?? 0;

export async function lockSupported() {
  try { return Boolean(await window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable?.()); } catch { return false; }
}

export async function enableLock(minutes: number) {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: rand(32), rp: { name: "MisFinanzas", id: location.hostname },
      user: { id: rand(16), name: "misfinanzas-local", displayName: "Bloqueo de MisFinanzas" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
      attestation: "none", timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("No se pudo configurar el bloqueo");
  localStorage.setItem(KEY, JSON.stringify({ credentialId: b64u(cred.rawId), minutes } satisfies LockCfg));
}

export function setLockMinutes(minutes: number) {
  const c = read();
  if (c) localStorage.setItem(KEY, JSON.stringify({ ...c, minutes }));
}

export function disableLock() {
  try { localStorage.removeItem(KEY); } catch { /* nada */ }
}

export async function unlockWithDevice() {
  const c = read();
  if (!c) return;
  try {
    const res = await navigator.credentials.get({
      publicKey: { challenge: rand(32), rpId: location.hostname, allowCredentials: [{ type: "public-key", id: fromB64u(c.credentialId) }], userVerification: "required", timeout: 60_000 },
    });
    if (!res) throw new Error("cancelado");
  } catch (e) {
    const name = (e as { name?: string }).name;
    throw new Error(name === "NotAllowedError" ? "Se canceló la verificación. Inténtalo de nuevo." : "No se pudo verificar con el dispositivo.");
  }
}
