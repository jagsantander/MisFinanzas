import { z } from "zod";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { getDb, schema } from "@/lib/db";
import { body, json, requireUser, route, HttpError } from "@/lib/http";
import { deviceLabel, rp, takeChallenge } from "@/lib/auth/webauthn";
import { audit } from "@/lib/audit";

export const POST = route(async (req) => {
  const { user, session } = await requireUser({ requireVerified: true });
  const d = await body(req, z.object({ challengeId: z.uuid(), response: z.any(), name: z.string().trim().max(60).optional() }));
  const ch = await takeChallenge(d.challengeId, "register");
  if (!ch || ch.userId !== user.id || ch.sessionId !== session.id) throw new HttpError(400, "Desafío inválido o vencido");
  const { rpID, origin } = rp();
  const v = await verifyRegistrationResponse({ response: d.response, expectedChallenge: ch.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
  if (!v.verified) throw new HttpError(400, "No se pudo verificar la passkey");
  const info = v.registrationInfo;
  await getDb().insert(schema.passkeys).values({
    userId: user.id,
    credentialId: info.credential.id,
    publicKey: Buffer.from(info.credential.publicKey).toString("base64url"),
    counter: info.credential.counter,
    transports: info.credential.transports ?? null,
    deviceType: info.credentialDeviceType,
    backedUp: info.credentialBackedUp,
    name: d.name || deviceLabel(req.headers.get("user-agent")),
  });
  await audit(user.id, "passkey.registered");
  return json({ ok: true });
});
