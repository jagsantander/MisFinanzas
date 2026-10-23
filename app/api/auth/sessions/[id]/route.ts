import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { json, requireUser, route } from "@/lib/http";

export const DELETE = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const { user } = await requireUser();
  const { id } = await params;
  await getDb().update(schema.sessions).set({ revokedAt: new Date() })
    .where(and(eq(schema.sessions.id, id), eq(schema.sessions.userId, user.id)));
  return json({ ok: true });
});
