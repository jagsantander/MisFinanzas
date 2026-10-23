import { z } from "zod";
import { createHash } from "node:crypto";
import { getDb, schema } from "@/lib/db";
import { appUrl, body, json, requireUser, route, HttpError } from "@/lib/http";
import { CONNECTORS } from "@/lib/mail";
import { randomToken } from "@/lib/crypto";

/** Inicia OAuth (con PKCE). Requiere consentimiento explícito para leer avisos financieros. */
export const POST = route(async (req) => {
  const { user } = await requireUser({ requireVerified: true });
  const d = await body(req, z.object({
    provider: z.enum(["gmail", "outlook"]),
    consent: z.literal(true, { error: "Debes autorizar la lectura de avisos financieros" }),
    returnTo: z.enum(["/conexiones", "/bienvenida"]).default("/conexiones"),
  }));
  const c = CONNECTORS[d.provider];
  if (!c.configured()) throw new HttpError(503, `${c.label} no está configurado en este servidor. El administrador debe definir las credenciales OAuth (ver README).`, "not_configured");
  const state = randomToken(24);
  const verifier = randomToken(48);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  await getDb().insert(schema.oauthStates).values({ state, userId: user.id, provider: d.provider, codeVerifier: verifier, returnTo: d.returnTo, expiresAt: new Date(Date.now() + 10 * 60_000) });
  return json({ url: c.authUrl({ state, codeChallenge: challenge, redirectUri: `${appUrl()}/api/connections/mail/callback` }) });
});
