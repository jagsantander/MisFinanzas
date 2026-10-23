import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { json, requireUser, route } from "@/lib/http";

export const GET = route(async () => {
  const { user } = await requireUser();
  const rows = await getDb().select().from(schema.passkeys).where(eq(schema.passkeys.userId, user.id)).orderBy(desc(schema.passkeys.createdAt));
  return json({ passkeys: rows.map((p) => ({ id: p.id, name: p.name, createdAt: p.createdAt, lastUsedAt: p.lastUsedAt, backedUp: p.backedUp, deviceType: p.deviceType })) });
});
