import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { body, json, route, HttpError } from "@/lib/http";
import { consumeToken } from "@/lib/auth/tokens";
import { createSession } from "@/lib/auth/session";
import { audit } from "@/lib/audit";

export const POST = route(async (req) => {
  const { token } = await body(req, z.object({ token: z.string().min(20).max(200) }));
  const t = await consumeToken(token, "verify_email");
  if (!t) throw new HttpError(400, "El enlace no es válido o ya venció. Solicita uno nuevo.");
  await getDb().update(schema.users).set({ emailVerifiedAt: new Date() }).where(eq(schema.users.id, t.userId));
  await createSession(t.userId, "email_link", req.headers.get("user-agent"));
  await audit(t.userId, "auth.email_verified");
  return json({ ok: true });
});
