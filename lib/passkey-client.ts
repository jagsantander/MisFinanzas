"use client";
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { api } from "./client";

export const passkeysSupported = () => typeof window !== "undefined" && browserSupportsWebAuthn();

export async function platformAuthenticatorAvailable() {
  try { return Boolean(await window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable?.()); } catch { return false; }
}

/** Inicia sesión con una passkey (huella, rostro o PIN del dispositivo; lo gestiona el sistema). */
export async function loginWithPasskey() {
  const { options, challengeId } = await api("/api/auth/passkeys/login/options", { body: {} });
  const response = await startAuthentication({ optionsJSON: options });
  return api<{ ok: true; onboarding: boolean }>("/api/auth/passkeys/login/verify", { body: { challengeId, response } });
}

export async function registerPasskey(name?: string) {
  const { options, challengeId } = await api("/api/auth/passkeys/register/options", { body: {} });
  const response = await startRegistration({ optionsJSON: options });
  return api("/api/auth/passkeys/register/verify", { body: { challengeId, response, name } });
}

export async function unlockWithPasskey() {
  const { options, challengeId } = await api("/api/auth/unlock/options", { body: {} });
  const response = await startAuthentication({ optionsJSON: options });
  return api("/api/auth/unlock/verify", { body: { challengeId, response } });
}

export function passkeyErrorMessage(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError") return "Se canceló o expiró la verificación del dispositivo.";
  if (name === "InvalidStateError") return "Este dispositivo ya tiene una passkey registrada para tu cuenta.";
  if (name === "NotSupportedError") return "Este navegador o dispositivo no admite passkeys.";
  return (e as Error)?.message ?? "No se pudo usar la passkey.";
}
