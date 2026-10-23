import { and, eq, gt } from "drizzle-orm";
import { getDb, schema } from "../db";
import { appUrl } from "../http";

export function rp() {
  const url = new URL(appUrl());
  return { rpID: process.env.WEBAUTHN_RP_ID ?? url.hostname, rpName: "MisFinanzas", origin: url.origin };
}

export async function saveChallenge(purpose: "register" | "login" | "unlock", challenge: string, userId: string | null, sessionId: string | null) {
  const [row] = await getDb().insert(schema.webauthnChallenges).values({
    purpose, challenge, userId, sessionId, expiresAt: new Date(Date.now() + 5 * 60_000),
  }).returning();
  return row.id;
}

/** Recupera y elimina el desafío (un solo uso). */
export async function takeChallenge(id: string, purpose: string) {
  const [row] = await getDb().delete(schema.webauthnChallenges)
    .where(and(eq(schema.webauthnChallenges.id, id), eq(schema.webauthnChallenges.purpose, purpose), gt(schema.webauthnChallenges.expiresAt, new Date())))
    .returning();
  return row ?? null;
}

/** Nombre legible del dispositivo a partir del user-agent (solo informativo). */
export function deviceLabel(ua: string | null): string {
  if (!ua) return "Dispositivo";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Dispositivo";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return br ? `${os} · ${br}` : os;
}
