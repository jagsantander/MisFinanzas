import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { clientIp, json, route, HttpError } from "@/lib/http";
import { rp, saveChallenge } from "@/lib/auth/webauthn";
import { hitRateLimit } from "@/lib/auth/rate-limit";
import { pseudonymize } from "@/lib/crypto";

/** Passkeys detectables: el usuario elige su cuenta en el diálogo del sistema. */
export const POST = route(async (req) => {
  if (await hitRateLimit(`pk-login:${pseudonymize(clientIp(req))}`, 30, 15)) throw new HttpError(429, "Demasiados intentos");
  const options = await generateAuthenticationOptions({ rpID: rp().rpID, userVerification: "required" });
  const challengeId = await saveChallenge("login", options.challenge, null, null);
  return json({ options, challengeId });
});
