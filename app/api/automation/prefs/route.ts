import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { body, json, requireUser, route } from "@/lib/http";
import { PrefsSchema } from "@/lib/automation/config";
import { ensureAutomation, syncAutomationStatus } from "@/lib/automation/service";

/** Cambiar preferencias que forman parte de la autorización deja la automatización pendiente de validación. */
export const PUT = route(async (req) => {
  const { user } = await requireUser();
  const prefs = await body(req, PrefsSchema);
  const db = getDb();
  const a = await ensureAutomation(db, user.id);
  await db.update(schema.automations).set({ prefs, updatedAt: new Date(), status: a.status === "cancelled" ? "pending_approval" : a.status }).where(eq(schema.automations.id, a.id));
  const status = await syncAutomationStatus(db, user.id);
  return json({ ok: true, status });
});
