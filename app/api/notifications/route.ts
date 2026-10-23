import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { json, requireUser, route } from "@/lib/http";

export const GET = route(async () => {
  const { user } = await requireUser();
  const rows = await getDb().select({
    id: schema.notifications.id, type: schema.notifications.type, severity: schema.notifications.severity, title: schema.notifications.title,
    body: schema.notifications.body, link: schema.notifications.link, readAt: schema.notifications.readAt, createdAt: schema.notifications.createdAt,
    pushStatus: schema.notifications.pushStatus, emailStatus: schema.notifications.emailStatus, deliverAfter: schema.notifications.deliverAfter,
  }).from(schema.notifications).where(eq(schema.notifications.userId, user.id)).orderBy(desc(schema.notifications.createdAt)).limit(100);
  return json({ notifications: rows });
});
