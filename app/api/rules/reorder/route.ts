import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { body, json, requireUser, route } from "@/lib/http";

export const POST = route(async (req) => {
  const { user } = await requireUser();
  const { ids } = await body(req, z.object({ ids: z.array(z.uuid()).max(500) }));
  const db = getDb();
  await db.transaction(async (tx) => {
    for (const [i, id] of ids.entries()) await tx.update(schema.rules).set({ priority: (i + 1) * 10 }).where(and(eq(schema.rules.id, id), eq(schema.rules.userId, user.id)));
  });
  return json({ ok: true });
});
