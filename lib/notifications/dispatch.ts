import { and, eq, lte } from "drizzle-orm";
import webpush from "web-push";
import type { DB } from "../db";
import { schema } from "../db";
import { sendEmail } from "../email/send";
import { appUrl } from "../http";
import { log, safeErrorMessage } from "../log";

export function pushConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/** Envía push y correos pendientes cuya hora de entrega ya llegó. Lo ejecuta el worker. */
export async function dispatchPending(db: DB, now = new Date()) {
  if (pushConfigured()) webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:soporte@localhost", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  const pendingPush = await db.select().from(schema.notifications)
    .where(and(eq(schema.notifications.pushStatus, "pending"), lte(schema.notifications.deliverAfter, now))).limit(100);
  for (const n of pendingPush) {
    if (!pushConfigured()) { await db.update(schema.notifications).set({ pushStatus: "failed" }).where(eq(schema.notifications.id, n.id)); continue; }
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, n.userId));
    const subs = await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, n.userId));
    const payload = JSON.stringify(user?.hideSensitiveInPush
      ? { title: "MisFinanzas", body: n.publicTitle, url: n.link ?? "/notificaciones" }
      : { title: n.title, body: n.body, url: n.link ?? "/notificaciones" });
    let ok = false;
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 12 * 3600 });
        ok = true;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, s.id));
        log.warn("push.failed", { status });
      }
    }
    await db.update(schema.notifications).set({ pushStatus: ok ? "sent" : "failed" }).where(eq(schema.notifications.id, n.id));
  }

  const pendingEmail = await db.select().from(schema.notifications)
    .where(and(eq(schema.notifications.emailStatus, "pending"), lte(schema.notifications.deliverAfter, now))).limit(100);
  for (const n of pendingEmail) {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, n.userId));
    try {
      await sendEmail(user.email, `MisFinanzas: ${n.title}`, `${n.body}\n\nVer en la app: ${appUrl()}${n.link ?? "/notificaciones"}`);
      await db.update(schema.notifications).set({ emailStatus: "sent" }).where(eq(schema.notifications.id, n.id));
    } catch (e) {
      log.warn("email.notification_failed", { error: safeErrorMessage(e) });
      await db.update(schema.notifications).set({ emailStatus: "failed" }).where(eq(schema.notifications.id, n.id));
    }
  }
}
