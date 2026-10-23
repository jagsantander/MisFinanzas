import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { body, json, requireUser, route, HttpError } from "@/lib/http";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { revokeOtherSessions } from "@/lib/auth/session";
import { audit } from "@/lib/audit";

export const POST = route(async (req) => {
  const { user, session } = await requireUser();
  const d = await body(req, z.object({ current: z.string(), password: z.string(), passwordConfirm: z.string(), logoutOthers: z.boolean().default(true) }));
  if (!(await verifyPassword(d.current, user.passwordHash))) throw new HttpError(400, "La contraseña actual no es correcta");
  if (d.password !== d.passwordConfirm) throw new HttpError(400, "Las contraseñas no coinciden");
  const problem = passwordProblem(d.password, user);
  if (problem) throw new HttpError(400, problem);
  await getDb().update(schema.users).set({ passwordHash: await hashPassword(d.password) }).where(eq(schema.users.id, user.id));
  const revoked = d.logoutOthers ? await revokeOtherSessions(user.id, session.id) : 0;
  await audit(user.id, "auth.password_changed", { sessionsRevoked: revoked });
  return json({ ok: true, revoked });
});
