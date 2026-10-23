import { z } from "zod";
import { sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { body, clientIp, json, route, HttpError } from "@/lib/http";
import { DUMMY_HASH, verifyPassword } from "@/lib/auth/password";
import { loginBlockedFor, recordLoginAttempt } from "@/lib/auth/rate-limit";
import { createSession } from "@/lib/auth/session";
import { pseudonymize } from "@/lib/crypto";
import { audit } from "@/lib/audit";

export const POST = route(async (req) => {
  const { email, password } = await body(req, z.object({
    email: z.string().trim().toLowerCase().max(200), password: z.string().max(200),
  }));
  const keys = { account: pseudonymize(email), ip: pseudonymize(clientIp(req)) };
  const wait = await loginBlockedFor(keys);
  if (wait > 0) throw new HttpError(429, `Demasiados intentos fallidos. Intenta nuevamente en ${Math.ceil(wait / 60)} min o recupera tu contraseña.`, "rate_limited");

  const [user] = await getDb().select().from(schema.users).where(sql`lower(${schema.users.email}) = ${email}`).limit(1);
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    await recordLoginAttempt(keys, false);
    throw new HttpError(401, "Correo o contraseña incorrectos");
  }
  if (!user.emailVerifiedAt) throw new HttpError(403, "Debes verificar tu correo antes de entrar.", "email_unverified");
  await recordLoginAttempt(keys, true);
  await createSession(user.id, "password", req.headers.get("user-agent"));
  await audit(user.id, "auth.login", { method: "password" });
  return json({ ok: true, onboarding: !user.onboardingCompletedAt });
});
