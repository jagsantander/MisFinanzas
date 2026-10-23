import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { body, json, route, HttpError } from "@/lib/http";
import { consumeToken } from "@/lib/auth/tokens";
import { audit } from "@/lib/audit";

export const POST = route(async (req) => {
  const { token } = await body(req, z.object({ token: z.string().min(20).max(200) }));
  const t = await consumeToken(token, "change_email");
  if (!t?.newEmail) throw new HttpError(400, "El enlace no es válido o ya venció.");
  const db = getDb();
  const [taken] = await db.select({ id: schema.users.id }).from(schema.users).where(sql`lower(${schema.users.email}) = ${t.newEmail}`).limit(1);
  if (taken) throw new HttpError(409, "Ese correo ya está en uso.");
  await db.update(schema.users).set({ email: t.newEmail, emailVerifiedAt: new Date() }).where(eq(schema.users.id, t.userId));
  await audit(t.userId, "auth.email_changed");
  return json({ ok: true });
});
