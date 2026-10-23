import { z } from "zod";
import { body, clientIp, json, requireUser, route, HttpError } from "@/lib/http";
import { verifyPassword } from "@/lib/auth/password";
import { unlockSession } from "@/lib/auth/session";
import { loginBlockedFor, recordLoginAttempt } from "@/lib/auth/rate-limit";
import { pseudonymize } from "@/lib/crypto";

export const POST = route(async (req) => {
  const { user, session } = await requireUser({ allowLocked: true });
  const { password } = await body(req, z.object({ password: z.string().max(200) }));
  const keys = { account: pseudonymize(user.email.toLowerCase()), ip: pseudonymize(clientIp(req)) };
  if (await loginBlockedFor(keys)) throw new HttpError(429, "Demasiados intentos. Espera unos minutos.");
  if (!(await verifyPassword(password, user.passwordHash))) {
    await recordLoginAttempt(keys, false);
    throw new HttpError(401, "Contraseña incorrecta");
  }
  await recordLoginAttempt(keys, true);
  await unlockSession(session.id);
  return json({ ok: true });
});
