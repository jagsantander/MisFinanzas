import { eq } from "drizzle-orm";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { getDb, schema } from "@/lib/db";
import { json, requireUser, route, HttpError } from "@/lib/http";
import { rp, saveChallenge } from "@/lib/auth/webauthn";

export const POST = route(async () => {
  const { user, session } = await requireUser({ allowLocked: true });
  const keys = await getDb().select().from(schema.passkeys).where(eq(schema.passkeys.userId, user.id));
  if (!keys.length) throw new HttpError(400, "No tienes passkeys registradas");
  const options = await generateAuthenticationOptions({
    rpID: rp().rpID, userVerification: "required",
    allowCredentials: keys.map((k) => ({ id: k.credentialId, transports: k.transports ?? undefined })),
  });
  const challengeId = await saveChallenge("unlock", options.challenge, user.id, session.id);
  return json({ options, challengeId });
});
