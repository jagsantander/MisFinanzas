import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { body, json, requireUser, route, HttpError } from "@/lib/http";
import { pushConfigured } from "@/lib/notifications/dispatch";

export const POST = route(async (req) => {
  const { user } = await requireUser();
  if (!pushConfigured()) throw new HttpError(503, "Las notificaciones push no están configuradas en este servidor (VAPID).");
  const d = await body(req, z.object({ endpoint: z.url().max(1000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) }));
  const db = getDb();
  await db.insert(schema.pushSubscriptions).values({ userId: user.id, endpoint: d.endpoint, p256dh: d.keys.p256dh, auth: d.keys.auth, userAgent: req.headers.get("user-agent")?.slice(0, 200) })
    .onConflictDoUpdate({ target: schema.pushSubscriptions.endpoint, set: { userId: user.id, p256dh: d.keys.p256dh, auth: d.keys.auth } });
  await db.update(schema.users).set({ notifyChannels: { ...user.notifyChannels, push: true } }).where(eq(schema.users.id, user.id));
  return json({ ok: true });
});

export const DELETE = route(async (req) => {
  const { user } = await requireUser();
  const d = await body(req, z.object({ endpoint: z.string().max(1000) }));
  await getDb().delete(schema.pushSubscriptions).where(and(eq(schema.pushSubscriptions.userId, user.id), eq(schema.pushSubscriptions.endpoint, d.endpoint)));
  return json({ ok: true });
});
