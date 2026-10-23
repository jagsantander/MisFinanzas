import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb, schema } from "../db";
import { randomToken, sha256 } from "../crypto";

type Purpose = "verify_email" | "reset_password" | "change_email";
const TTL_MIN: Record<Purpose, number> = { verify_email: 24 * 60, reset_password: 60, change_email: 60 };

/** Enlace de un solo uso con vencimiento. Se guarda solo el hash. */
export async function issueToken(userId: string, purpose: Purpose, newEmail?: string) {
  const db = getDb();
  // Invalida enlaces previos del mismo propósito.
  await db.update(schema.authTokens).set({ usedAt: new Date() })
    .where(and(eq(schema.authTokens.userId, userId), eq(schema.authTokens.purpose, purpose), isNull(schema.authTokens.usedAt)));
  const token = randomToken(32);
  await db.insert(schema.authTokens).values({
    userId, purpose, tokenHash: sha256(token), newEmail: newEmail ?? null,
    expiresAt: new Date(Date.now() + TTL_MIN[purpose] * 60_000),
  });
  return token;
}

/** Consume el token de forma atómica: dos usos simultáneos no pueden tener éxito. */
export async function consumeToken(token: string, purpose: Purpose) {
  const [row] = await getDb().update(schema.authTokens).set({ usedAt: new Date() })
    .where(and(eq(schema.authTokens.tokenHash, sha256(token)), eq(schema.authTokens.purpose, purpose),
      isNull(schema.authTokens.usedAt), gt(schema.authTokens.expiresAt, new Date())))
    .returning();
  return row ?? null;
}
