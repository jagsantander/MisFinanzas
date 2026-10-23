import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { json, requireUser, route } from "@/lib/http";
import { budgetStatuses, periodMovements } from "@/lib/budgets/compute";
import { computeTotals } from "@/lib/movements/totals";
import { periodForDate, shiftPeriod, todayIn } from "@/lib/period";
import { automationView } from "@/lib/views";
import { reviewCount } from "@/lib/movements/service";
import { ensureAutomation } from "@/lib/automation/service";

export const GET = route(async (req) => {
  const { user } = await requireUser();
  const db = getDb();
  const key = req.nextUrl.searchParams.get("period") ?? periodForDate(todayIn(user.timezone), user.monthStartDay).key;
  const { period, statuses, totals, daysRemaining } = await budgetStatuses(db, user.id, key);
  const prev = shiftPeriod(key, -1, user.monthStartDay);
  const prevTotals = computeTotals(await periodMovements(db, user.id, prev), user.currency);
  const cats = await db.select().from(schema.categories).where(eq(schema.categories.userId, user.id));
  const catRow = (c: (typeof cats)[number], map: Map<string, bigint>, prevMap: Map<string, bigint>) => ({
    id: c.id, name: c.name, icon: c.icon, color: c.color, kind: c.kind, archived: Boolean(c.archivedAt),
    amount: map.get(c.id) ?? 0n, previous: prevMap.get(c.id) ?? 0n,
    budget: statuses.find((s) => s.scope === "category" && s.categoryId === c.id) ?? null,
    subs: cats.filter((s) => s.parentId === c.id).map((s) => ({
      id: s.id, name: s.name, amount: totals.bySubcategory.get(s.id) ?? 0n,
      budget: statuses.find((b) => b.scope === "subcategory" && b.subcategoryId === s.id) ?? null,
    })),
  });
  const parents = cats.filter((c) => !c.parentId);
  const latest = await db.select().from(schema.movements).where(and(eq(schema.movements.userId, user.id), isNull(schema.movements.deletedAt)))
    .orderBy(desc(schema.movements.occurredOn), desc(schema.movements.createdAt)).limit(5);
  await ensureAutomation(db, user.id);
  const auto = await automationView(db, user.id);
  // Gasto sin categoría (para no ocultar montos en la distribución).
  const assigned = [...totals.byCategory.entries()].filter(([id]) => parents.some((p) => p.id === id && p.kind === "expense")).reduce((a, [, v]) => a + v, 0n);
  return json({
    period, previousPeriod: prev, daysRemaining,
    totals: { income: totals.income, expense: totals.expense, balance: totals.balance, otherCurrencies: totals.otherCurrencies },
    previousTotals: { income: prevTotals.income, expense: prevTotals.expense },
    uncategorizedExpense: totals.expense - assigned,
    expenseCategories: parents.filter((c) => c.kind === "expense").map((c) => catRow(c, totals.byCategory, prevTotals.byCategory)),
    incomeCategories: parents.filter((c) => c.kind === "income").map((c) => catRow(c, totals.byCategory, prevTotals.byCategory)),
    totalBudget: statuses.find((s) => s.scope === "total") ?? null,
    alerts: statuses.filter((s) => s.active && s.level !== "ok"),
    latest,
    reviewCount: await reviewCount(db, user.id),
    automation: auto && { status: auto.status, nextRunAt: auto.nextRunAt, lastRun: auto.lastRun, pausedReason: auto.pausedReason },
    currency: user.currency, name: user.name,
  });
});
