import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { body, json, route, HttpError } from "@/lib/http";
import { consumeToken } from "@/lib/auth/tokens";
import { hashPassword, passwordProblem } from "@/lib/auth/password";
import { revokeOtherSessions } from "@/lib/auth/session";
import { audit } from "@/lib/audit";

export const POST = route(async (req) => {
  const d = await body(req, z.object({ token: z.string().min(20).max(200), password: z.string(), passwordConfirm: z.string() }));
  if (d.password !== d.passwordConfirm) throw new HttpError(400, "Las contraseñas no coinciden");
  const problem = passwordProblem(d.password);
  if (problem) throw new HttpError(400, problem);
  const t = await consumeToken(d.token, "reset_password");
  if (!t) throw new HttpError(400, "El enlace no es válido o ya venció. Solicita uno nuevo.");
  const db = getDb();
  // Recibir el enlace demuestra acceso al correo: se considera verificado.
  await db.update(schema.users).set({ passwordHash: await hashPassword(d.password), emailVerifiedAt: new Date() }).where(eq(schema.users.id, t.userId));
  const revoked = await revokeOtherSessions(t.userId, null);
  await audit(t.userId, "auth.password_reset", { sessionsRevoked: revoked });
  return json({ ok: true });
});
