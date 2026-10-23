import { and, eq, inArray } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { formatMoney, formatPercent } from "../money";
import { notify } from "../notifications";
import { budgetStatuses } from "./compute";

export const EXCEEDED = 101; // código interno para "superado"

/**
 * Evalúa alertas del período ACTUAL (nunca de meses históricos).
 * - Cada (presupuesto, período, umbral) se avisa una sola vez.
 * - Si se cruzan varios umbrales a la vez, se envía un único aviso con el más relevante.
 * - Si el gasto baja, no se borran estados: no se repiten avisos ya enviados.
 * Sin llamadas a IA.
 */
export async function evaluateBudgetAlerts(db: DB, userId: string) {
  const { period, statuses, user } = await budgetStatuses(db, userId);
  const cats = await db.select().from(schema.categories).where(eq(schema.categories.userId, userId));
  const nameOf = (id: string | null) => cats.find((c) => c.id === id)?.name ?? "";
  const sent: string[] = [];
  for (const s of statuses) {
    if (!s.active || s.limit <= 0n) continue;
    const crossed = [...user.budgetThresholds.filter((t) => s.spent * 100n >= s.limit * BigInt(t))];
    if (s.spent > s.limit) crossed.push(EXCEEDED);
    if (!crossed.length) continue;
    const existing = await db.select().from(schema.budgetAlertStates).where(and(
      eq(schema.budgetAlertStates.budgetId, s.budgetId), eq(schema.budgetAlertStates.periodKey, period.key), inArray(schema.budgetAlertStates.threshold, crossed)));
    const fresh = crossed.filter((t) => !existing.some((e) => e.threshold === t));
    if (!fresh.length) continue;
    const inserted = await db.insert(schema.budgetAlertStates)
      .values(fresh.map((t) => ({ userId, budgetId: s.budgetId, periodKey: period.key, threshold: t })))
      .onConflictDoNothing().returning();
    if (!inserted.length) continue; // otra ejecución ya lo registró
    const top = Math.max(...inserted.map((i) => i.threshold));
    const name = s.scope === "total" ? "Gasto total" : s.subcategoryId ? `${nameOf(s.categoryId)} › ${nameOf(s.subcategoryId)}` : nameOf(s.categoryId);
    const detail = `${name} · ${formatMoney(s.spent, user.currency)} de ${formatMoney(s.limit, user.currency)} · ${formatPercent(s.spent, s.limit)} utilizado`;
    const [title, severity] = top === EXCEEDED ? [`Presupuesto excedido: ${name}`, "danger" as const]
      : top >= 100 ? [`Límite alcanzado: ${name}`, "danger" as const]
      : [`Cerca del límite: ${name}`, "warning" as const];
    await notify(db, userId, {
      type: "budget", severity, title,
      body: top === EXCEEDED ? `${detail} · Excedido en ${formatMoney(s.excess, user.currency)}` : detail,
      publicTitle: "Tienes un aviso de presupuesto", link: "/categorias?vista=presupuestos",
      dedupeKey: `budget:${s.budgetId}:${period.key}:${top}`,
    });
    sent.push(s.budgetId);
  }
  return sent;
}
