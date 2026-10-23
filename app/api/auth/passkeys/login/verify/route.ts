import { z } from "zod";
import { eq } from "drizzle-orm";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { getDb, schema } from "@/lib/db";
import { body, json, route, HttpError } from "@/lib/http";
import { rp, takeChallenge } from "@/lib/auth/webauthn";
import { createSession } from "@/lib/auth/session";
import { audit } from "@/lib/audit";

export const POST = route(async (req) => {
  const d = await body(req, z.object({ challengeId: z.uuid(), response: z.any() }));
  const ch = await takeChallenge(d.challengeId, "login");
  if (!ch) throw new HttpError(400, "Desafío inválido o vencido");
  const db = getDb();
  const [pk] = await db.select().from(schema.passkeys).where(eq(schema.passkeys.credentialId, d.response?.id ?? ""));
  if (!pk) throw new HttpError(401, "Passkey no reconocida. Usa tu contraseña.");
  const { rpID, origin } = rp();
  const v = await verifyAuthenticationResponse({
    response: d.response, expectedChallenge: ch.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
    credential: { id: pk.credentialId, publicKey: Buffer.from(pk.publicKey, "base64url"), counter: pk.counter, transports: (pk.transports ?? undefined) as never },
  });
  if (!v.verified) throw new HttpError(401, "No se pudo verificar la passkey");
  // userHandle debe corresponder al propietario de la credencial.
  const handle = d.response?.response?.userHandle;
  if (handle && Buffer.from(handle, "base64url").toString() !== pk.userId) throw new HttpError(401, "Passkey no corresponde a la cuenta");
  await db.update(schema.passkeys).set({ counter: v.authenticationInfo.newCounter, lastUsedAt: new Date() }).where(eq(schema.passkeys.id, pk.id));
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, pk.userId));
  await createSession(pk.userId, "passkey", req.headers.get("user-agent"));
  await audit(pk.userId, "auth.login", { method: "passkey" });
  return json({ ok: true, onboarding: !user.onboardingCompletedAt });
});
