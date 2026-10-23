import { and, eq, isNull, ne, sql } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { decryptSecret, encryptSecret } from "../crypto";
import { gmailConnector } from "./gmail";
import { outlookConnector } from "./outlook";
import { MailAuthError, type MailConnector, type MailProvider, type OAuthTokens } from "./types";
import { notify } from "../notifications";

export const CONNECTORS: Record<MailProvider, MailConnector> = { gmail: gmailConnector, outlook: outlookConnector };
export type MailConn = typeof schema.mailConnections.$inferSelect;

const aad = (userId: string, connId: string) => `mail-tokens:${userId}:${connId}`;

export function encryptTokens(userId: string, connId: string, t: OAuthTokens) {
  return encryptSecret(JSON.stringify({ ...t, expiresAt: t.expiresAt.toISOString() }), aad(userId, connId));
}
export function decryptTokens(conn: MailConn): OAuthTokens {
  if (!conn.encryptedTokens) throw new MailAuthError("Correo desconectado");
  const t = JSON.parse(decryptSecret(conn.encryptedTokens, aad(conn.userId, conn.id)));
  return { ...t, expiresAt: new Date(t.expiresAt) };
}

export async function getActiveMailConnection(db: DB, userId: string): Promise<MailConn | null> {
  const [c] = await db.select().from(schema.mailConnections)
    .where(and(eq(schema.mailConnections.userId, userId), isNull(schema.mailConnections.disconnectedAt), ne(schema.mailConnections.status, "disconnected")))
    .orderBy(sql`${schema.mailConnections.createdAt} desc`).limit(1);
  return c ?? null;
}

/** Devuelve un access token válido, renovándolo si está por vencer. Marca "reconectar" si se revocó. */
export async function getAccessToken(db: DB, conn: MailConn): Promise<string> {
  const tokens = decryptTokens(conn);
  if (tokens.expiresAt.getTime() - Date.now() > 120_000) return tokens.accessToken;
  if (!tokens.refreshToken) return markReauth(db, conn, "No hay token de renovación");
  try {
    const fresh = await CONNECTORS[conn.provider as MailProvider].refresh(tokens.refreshToken);
    const merged = { ...fresh, refreshToken: fresh.refreshToken ?? tokens.refreshToken };
    await db.update(schema.mailConnections).set({ encryptedTokens: encryptTokens(conn.userId, conn.id, merged), accessTokenExpiresAt: merged.expiresAt, status: "active", lastError: null })
      .where(eq(schema.mailConnections.id, conn.id));
    return merged.accessToken;
  } catch (e) {
    if (e instanceof MailAuthError) return markReauth(db, conn, e.message);
    throw e;
  }
}

export async function markReauth(db: DB, conn: MailConn, reason: string): Promise<never> {
  await db.update(schema.mailConnections).set({ status: "reauth_required", lastError: reason.slice(0, 200) }).where(eq(schema.mailConnections.id, conn.id));
  await notify(db, conn.userId, {
    type: "mail_reauth", severity: "danger", title: "Vuelve a conectar tu correo",
    body: `La autorización de ${CONNECTORS[conn.provider as MailProvider].label} venció o fue revocada. Las importaciones están detenidas hasta reconectar.`,
    publicTitle: "MisFinanzas necesita que reconectes tu correo", link: "/conexiones", dedupeKey: `mail_reauth:${conn.id}:${new Date().toISOString().slice(0, 10)}`,
  });
  throw new MailAuthError(reason);
}
