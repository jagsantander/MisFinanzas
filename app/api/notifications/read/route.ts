import { z } from "zod";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { body, json, requireUser, route } from "@/lib/http";

export const POST = route(async (req) => {
  const { user } = await requireUser();
  const { ids } = await body(req, z.object({ ids: z.array(z.uuid()).max(200).optional() }));
  const n = schema.notifications;
  await getDb().update(n).set({ readAt: new Date() })
    .where(and(eq(n.userId, user.id), isNull(n.readAt), ids ? inArray(n.id, ids) : undefined));
  return json({ ok: true });
});
