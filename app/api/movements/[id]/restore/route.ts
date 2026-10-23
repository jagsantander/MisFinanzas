import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { json, requireUser, route, HttpError } from "@/lib/http";
import { logChange } from "@/lib/movements/service";
import { evaluateBudgetAlerts } from "@/lib/budgets/alerts";

export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const { user } = await requireUser();
  const { id } = await params;
  const db = getDb();
  const [m] = await db.update(schema.movements).set({ deletedAt: null, updatedAt: new Date() })
    .where(and(eq(schema.movements.id, id), eq(schema.movements.userId, user.id))).returning();
  if (!m) throw new HttpError(404, "Movimiento no encontrado");
  await logChange(db, m, "user", "restored");
  await evaluateBudgetAlerts(db, user.id);
  return json({ ok: true });
});
