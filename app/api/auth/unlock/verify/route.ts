import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { getDb, schema } from "@/lib/db";
import { body, json, requireUser, route, HttpError } from "@/lib/http";
import { rp, takeChallenge } from "@/lib/auth/webauthn";
import { unlockSession } from "@/lib/auth/session";

export const POST = route(async (req) => {
  const { user, session } = await requireUser({ allowLocked: true });
  const d = await body(req, z.object({ challengeId: z.uuid(), response: z.any() }));
  const ch = await takeChallenge(d.challengeId, "unlock");
  if (!ch || ch.userId !== user.id || ch.sessionId !== session.id) throw new HttpError(400, "Desafío inválido o vencido");
  const db = getDb();
  const [pk] = await db.select().from(schema.passkeys).where(and(eq(schema.passkeys.credentialId, d.response?.id ?? ""), eq(schema.passkeys.userId, user.id)));
  if (!pk) throw new HttpError(400, "Passkey no reconocida");
  const { rpID, origin } = rp();
  const v = await verifyAuthenticationResponse({
    response: d.response, expectedChallenge: ch.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
    credential: { id: pk.credentialId, publicKey: Buffer.from(pk.publicKey, "base64url"), counter: pk.counter, transports: (pk.transports ?? undefined) as never },
  });
  if (!v.verified) throw new HttpError(401, "No se pudo verificar");
  await db.update(schema.passkeys).set({ counter: v.authenticationInfo.newCounter, lastUsedAt: new Date() }).where(eq(schema.passkeys.id, pk.id));
  await unlockSession(session.id);
  return json({ ok: true });
});
