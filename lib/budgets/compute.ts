import { and, eq, gte, isNull, lt } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { computeTotals } from "../movements/totals";
import { daysRemaining, periodByKey, periodForDate, todayIn, type Period } from "../period";

export type BudgetStatus = {
  budgetId: string;
  scope: "total" | "category" | "subcategory";
  categoryId: string | null;
  subcategoryId: string | null;
  limit: bigint;
  spent: bigint;
  available: bigint;
  excess: bigint;
  pctTenths: number; // 1063 = 106,3 %
  level: "ok" | "near" | "reached" | "exceeded";
  isOverride: boolean;
  active: boolean;
};

export function levelFor(spent: bigint, limit: bigint, thresholds: number[]): BudgetStatus["level"] {
  if (limit <= 0n) return spent > 0n ? "exceeded" : "ok";
  if (spent > limit) return "exceeded";
  if (spent === limit) return "reached";
  const near = Math.min(...thresholds.filter((t) => t < 100), 100);
  return spent * 100n >= limit * BigInt(near) ? "near" : "ok";
}

export async function periodMovements(db: DB, userId: string, p: Period) {
  return db.select().from(schema.movements).where(and(
    eq(schema.movements.userId, userId), isNull(schema.movements.deletedAt),
    gte(schema.movements.occurredOn, p.start), lt(schema.movements.occurredOn, p.end),
  ));
}

/** Estado de todos los presupuestos para un período. El total usa el gasto real, no la suma de límites. */
export async function budgetStatuses(db: DB, userId: string, periodKey?: string) {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  const period = periodKey ? periodByKey(periodKey, user.monthStartDay) : periodForDate(todayIn(user.timezone), user.monthStartDay);
  const rows = await periodMovements(db, userId, period);
  const totals = computeTotals(rows, user.currency);
  const budgets = await db.select().from(schema.budgets).where(eq(schema.budgets.userId, userId));
  const overrides = await db.select().from(schema.budgetOverrides).where(and(eq(schema.budgetOverrides.userId, userId), eq(schema.budgetOverrides.periodKey, period.key)));
  const statuses: BudgetStatus[] = budgets.map((b) => {
    const ov = overrides.find((o) => o.budgetId === b.id);
    const limit = ov ? ov.amountMinor : b.amountMinor;
    const spent = b.scopeKey === "total" ? totals.expense
      : b.subcategoryId ? (totals.bySubcategory.get(b.subcategoryId) ?? 0n)
      : (totals.byCategory.get(b.categoryId!) ?? 0n);
    const s = spent < 0n ? 0n : spent;
    return {
      budgetId: b.id,
      scope: b.scopeKey === "total" ? "total" : b.subcategoryId ? "subcategory" : "category",
      categoryId: b.categoryId, subcategoryId: b.subcategoryId,
      limit, spent: s,
      available: limit > s ? limit - s : 0n,
      excess: s > limit ? s - limit : 0n,
      pctTenths: limit > 0n ? Number((s * 1000n) / limit) : 0,
      level: levelFor(s, limit, user.budgetThresholds),
      isOverride: Boolean(ov), active: b.active,
    };
  });
  return { period, statuses, totals, user, daysRemaining: daysRemaining(period, todayIn(user.timezone)) };
}
