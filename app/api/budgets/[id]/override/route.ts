import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { body, json, requireUser, route, HttpError } from "@/lib/http";
import { parseAmount } from "@/lib/money";
import { evaluateBudgetAlerts } from "@/lib/budgets/alerts";

type Ctx = { params: Promise<{ id: string }> };

/** Excepción de monto para un mes específico (periodKey YYYY-MM). amount=null elimina la excepción. */
export const PUT = route<Ctx>(async (req, { params }) => {
  const { user } = await requireUser();
  const { id } = await params;
  const d = await body(req, z.object({ periodKey: z.string().regex(/^\d{4}-\d{2}$/), amount: z.string().max(30).nullable() }));
  const db = getDb();
  const [b] = await db.select().from(schema.budgets).where(and(eq(schema.budgets.id, id), eq(schema.budgets.userId, user.id)));
  if (!b) throw new HttpError(404, "Presupuesto no encontrado");
  if (d.amount === null) {
    await db.delete(schema.budgetOverrides).where(and(eq(schema.budgetOverrides.budgetId, id), eq(schema.budgetOverrides.periodKey, d.periodKey)));
  } else {
    const amount = parseAmount(d.amount, b.currency);
    if (amount === null || amount <= 0n) throw new HttpError(400, "Monto inválido");
    await db.insert(schema.budgetOverrides).values({ budgetId: id, userId: user.id, periodKey: d.periodKey, amountMinor: amount })
      .onConflictDoUpdate({ target: [schema.budgetOverrides.budgetId, schema.budgetOverrides.periodKey], set: { amountMinor: amount } });
  }
  await evaluateBudgetAlerts(db, user.id);
  return json({ ok: true });
});
