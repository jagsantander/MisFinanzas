import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb, schema } from "../db";
import type { User } from "../db/schema";
import { randomToken, sha256 } from "../crypto";

export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-mf_session" : "mf_session";
const TTL_DAYS = 30;

export type CurrentSession = { user: User; session: typeof schema.sessions.$inferSelect };

export async function createSession(userId: string, method: "password" | "passkey" | "email_link", userAgent: string | null) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + TTL_DAYS * 86400_000);
  const [s] = await getDb().insert(schema.sessions).values({
    userId, tokenHash: sha256(token), authMethod: method, userAgent: userAgent?.slice(0, 300) ?? null, expiresAt,
  }).returning();
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expiresAt,
  });
  return s;
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

/**
 * Sesión actual desde la cookie. Aplica:
 * - vencimiento y revocación;
 * - bloqueo por inactividad (si el usuario lo activó): marca la sesión como bloqueada
 *   en el servidor, de modo que la API exige desbloqueo aunque el cliente se manipule.
 */
export async function getCurrentSession(): Promise<CurrentSession | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = getDb();
  const rows = await db.select().from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.tokenHash, sha256(token)), isNull(schema.sessions.revokedAt), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  if (!rows[0]) return null;
  let { sessions: session } = rows[0];
  const user = rows[0].users;
  const now = Date.now();
  const idleMs = now - new Date(session.lastSeenAt).getTime();
  const patch: Partial<typeof session> = {};
  if (!session.lockedAt && user.localLockMinutes && idleMs > user.localLockMinutes * 60_000) patch.lockedAt = new Date();
  if (idleMs > 60_000 && !session.lockedAt && !patch.lockedAt) patch.lastSeenAt = new Date();
  if (Object.keys(patch).length) {
    await db.update(schema.sessions).set(patch).where(eq(schema.sessions.id, session.id));
    session = { ...session, ...patch };
  }
  return { user, session };
}

export async function revokeOtherSessions(userId: string, keepSessionId: string | null) {
  const db = getDb();
  const cond = keepSessionId
    ? and(eq(schema.sessions.userId, userId), ne(schema.sessions.id, keepSessionId), isNull(schema.sessions.revokedAt))
    : and(eq(schema.sessions.userId, userId), isNull(schema.sessions.revokedAt));
  const res = await db.update(schema.sessions).set({ revokedAt: new Date() }).where(cond).returning({ id: schema.sessions.id });
  return res.length;
}

export async function unlockSession(sessionId: string) {
  await getDb().update(schema.sessions).set({ lockedAt: null, lastSeenAt: new Date() }).where(eq(schema.sessions.id, sessionId));
}
