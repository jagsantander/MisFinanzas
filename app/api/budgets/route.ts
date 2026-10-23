import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { body, json, requireUser, route, HttpError } from "@/lib/http";
import { budgetStatuses } from "@/lib/budgets/compute";
import { evaluateBudgetAlerts } from "@/lib/budgets/alerts";
import { parseAmount } from "@/lib/money";
import { assertCategoryPair } from "@/lib/categories/service";

export const GET = route(async (req) => {
  const { user } = await requireUser();
  const r = await budgetStatuses(getDb(), user.id, req.nextUrl.searchParams.get("period") ?? undefined);
  return json({ period: r.period, statuses: r.statuses, daysRemaining: r.daysRemaining, totalExpense: r.totals.expense, thresholds: r.user.budgetThresholds });
});

/** Crea o actualiza el presupuesto (renovación automática mensual). */
export const PUT = route(async (req) => {
  const { user } = await requireUser();
  const d = await body(req, z.object({ scope: z.enum(["total", "category", "subcategory"]), categoryId: z.uuid().nullable(), subcategoryId: z.uuid().nullable(), amount: z.string().max(30), active: z.boolean().default(true) }));
  const amount = parseAmount(d.amount, user.currency);
  if (amount === null || amount <= 0n) throw new HttpError(400, "Monto inválido");
  const db = getDb();
  let scopeKey = "total", categoryId: string | null = null, subcategoryId: string | null = null;
  if (d.scope !== "total") {
    try { await assertCategoryPair(db, user.id, d.categoryId, d.scope === "subcategory" ? d.subcategoryId : null); } catch (e) { throw new HttpError(400, (e as Error).message); }
    categoryId = d.categoryId;
    if (d.scope === "subcategory") { if (!d.subcategoryId) throw new HttpError(400, "Falta la subcategoría"); subcategoryId = d.subcategoryId; scopeKey = `sub:${subcategoryId}`; }
    else scopeKey = `cat:${categoryId}`;
  }
  const [b] = await db.insert(schema.budgets).values({ userId: user.id, scopeKey, categoryId, subcategoryId, amountMinor: amount, currency: user.currency, active: d.active })
    .onConflictDoUpdate({ target: [schema.budgets.userId, schema.budgets.scopeKey], set: { amountMinor: amount, active: d.active, updatedAt: new Date() } }).returning();
  await evaluateBudgetAlerts(db, user.id);
  return json({ ok: true, budget: b });
});
