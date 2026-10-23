import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { body, json, requireUser, route } from "@/lib/http";
import { SUPPORTED_CURRENCIES } from "@/lib/money";
import { unreadCount } from "@/lib/notifications";
import { syncAutomationStatus } from "@/lib/automation/service";
import { emailDeliveryConfigured } from "@/lib/email/send";
import { pushConfigured } from "@/lib/notifications/dispatch";

export const GET = route(async () => {
  const { user, session } = await requireUser({ allowLocked: true });
  const db = getDb();
  return json({
    user: {
      id: user.id, name: user.name, email: user.email, emailVerified: Boolean(user.emailVerifiedAt), currency: user.currency, timezone: user.timezone,
      monthStartDay: user.monthStartDay, theme: user.theme, budgetThresholds: user.budgetThresholds, notifyChannels: user.notifyChannels,
      quietStart: user.quietStart, quietEnd: user.quietEnd, hideSensitiveInPush: user.hideSensitiveInPush, localLockMinutes: user.localLockMinutes,
      onboardingStep: user.onboardingStep, onboardingCompleted: Boolean(user.onboardingCompletedAt), createdAt: user.createdAt,
    },
    session: { locked: Boolean(session.lockedAt), method: session.authMethod },
    unread: session.lockedAt ? 0 : await unreadCount(db, user.id),
    capabilities: { emailDelivery: emailDeliveryConfigured(), push: pushConfigured(), vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? null },
  });
});

const Prefs = z.object({
  name: z.string().trim().min(2).max(80),
  currency: z.enum(SUPPORTED_CURRENCIES as [string, ...string[]]),
  timezone: z.string().refine((tz) => { try { new Intl.DateTimeFormat("es", { timeZone: tz }); return true; } catch { return false; } }, "Zona horaria inválida"),
  monthStartDay: z.number().int().min(1).max(28),
  theme: z.enum(["system", "light", "dark"]),
  budgetThresholds: z.array(z.number().int().min(50).max(100)).min(1).max(3).transform((a) => [...new Set(a)].sort((x, y) => x - y)),
  notifyChannels: z.object({ inApp: z.literal(true), push: z.boolean(), email: z.boolean() }),
  quietStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  quietEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  hideSensitiveInPush: z.boolean(),
  localLockMinutes: z.number().int().min(1).max(240).nullable(),
}).partial();

export const PATCH = route(async (req) => {
  const { user } = await requireUser();
  const data = await body(req, Prefs);
  const db = getDb();
  await db.update(schema.users).set(data).where(eq(schema.users.id, user.id));
  await syncAutomationStatus(db, user.id);
  return json({ ok: true });
});
