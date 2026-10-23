import { and, eq, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import type { DB } from "../db";
import { schema } from "../db";

export type NotifyInput = {
  type: string;
  severity?: "info" | "warning" | "danger" | "success";
  title: string;
  body: string;
  /** Texto sin datos financieros, usado en push si el usuario oculta información sensible. */
  publicTitle: string;
  link?: string;
  dedupeKey?: string;
};

/** Momento de entrega externa respetando el horario de silencio (en la zona del usuario). */
export function deliveryTime(now: Date, tz: string, quietStart: string, quietEnd: string): Date {
  const local = DateTime.fromJSDate(now).setZone(tz);
  const [sh, sm] = quietStart.split(":").map(Number);
  const [eh, em] = quietEnd.split(":").map(Number);
  const mins = local.hour * 60 + local.minute;
  const s = sh * 60 + sm, e = eh * 60 + em;
  if (s === e) return now;
  const inQuiet = s < e ? mins >= s && mins < e : mins >= s || mins < e;
  if (!inQuiet) return now;
  let end = local.set({ hour: eh, minute: em, second: 0, millisecond: 0 });
  if (end <= local) end = end.plus({ days: 1 }).set({ hour: eh, minute: em });
  return end.toJSDate();
}

/**
 * Registra el aviso en la app de inmediato; push/correo quedan programados según
 * preferencias y horario de silencio. Idempotente con dedupeKey.
 */
export async function notify(db: DB, userId: string, n: NotifyInput) {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user) return null;
  const [{ subs }] = await db.select({ subs: sql<number>`count(*)::int` }).from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, userId));
  const ch = user.notifyChannels;
  const [row] = await db.insert(schema.notifications).values({
    userId, type: n.type, severity: n.severity ?? "info", title: n.title, body: n.body, publicTitle: n.publicTitle,
    link: n.link ?? null, dedupeKey: n.dedupeKey ?? null,
    deliverAfter: deliveryTime(new Date(), user.timezone, user.quietStart, user.quietEnd),
    pushStatus: ch.push && subs > 0 ? "pending" : "skip",
    emailStatus: ch.email ? "pending" : "skip",
  }).onConflictDoNothing().returning();
  return row ?? null;
}

export async function unreadCount(db: DB, userId: string) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.notifications)
    .where(and(eq(schema.notifications.userId, userId), sql`${schema.notifications.readAt} is null`));
  return r.n;
}
