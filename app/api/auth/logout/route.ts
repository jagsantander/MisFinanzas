import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { json, route } from "@/lib/http";
import { clearSessionCookie, getCurrentSession } from "@/lib/auth/session";

export const POST = route(async () => {
  const cur = await getCurrentSession();
  if (cur) await getDb().update(schema.sessions).set({ revokedAt: new Date() }).where(eq(schema.sessions.id, cur.session.id));
  await clearSessionCookie();
  return json({ ok: true });
});
