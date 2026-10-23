import { eq } from "drizzle-orm";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { getDb, schema } from "@/lib/db";
import { json, requireUser, route } from "@/lib/http";
import { rp, saveChallenge } from "@/lib/auth/webauthn";

export const POST = route(async () => {
  const { user, session } = await requireUser({ requireVerified: true });
  const existing = await getDb().select().from(schema.passkeys).where(eq(schema.passkeys.userId, user.id));
  const { rpID, rpName } = rp();
  const options = await generateRegistrationOptions({
    rpName, rpID, userName: user.email, userDisplayName: user.name,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none", // no pedimos datos del dispositivo ni biometría
    excludeCredentials: existing.map((k) => ({ id: k.credentialId, transports: k.transports ?? undefined })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  const challengeId = await saveChallenge("register", options.challenge, user.id, session.id);
  return json({ options, challengeId });
});
