import type { Movement } from "../local/types";

/**
 * Reglas de cómputo (con código, sin IA):
 * - ingresos: kind=income; gastos: kind=expense menos devoluciones/reversos (en su propia fecha);
 * - transferencias propias y pagos de tarjeta NO cuentan (evita doble conteo compra + pago);
 * - excluidos, eliminados y pendientes no cuentan;
 * - solo se suma la moneda base; otras monedas se informan aparte (sin conversión).
 */
export function counts(m: Pick<Movement, "excluded" | "deletedAt" | "status">) {
  return !m.excluded && !m.deletedAt && m.status !== "pending";
}

export type Totals = {
  income: bigint; expense: bigint; balance: bigint;
  byCategory: Map<string, bigint>; bySubcategory: Map<string, bigint>;
  otherCurrencies: Record<string, { income: bigint; expense: bigint }>;
  reviewCount: number;
};

export function computeTotals(rows: Movement[], baseCurrency: string): Totals {
  const t: Totals = { income: 0n, expense: 0n, balance: 0n, byCategory: new Map(), bySubcategory: new Map(), otherCurrencies: {}, reviewCount: 0 };
  const add = (map: Map<string, bigint>, k: string | null, v: bigint) => { if (k) map.set(k, (map.get(k) ?? 0n) + v); };
  for (const m of rows) {
    if (m.status === "review" && !m.deletedAt) t.reviewCount++;
    if (!counts(m)) continue;
    const amt = BigInt(m.amountMinor);
    if (m.currency !== baseCurrency) {
      const o = (t.otherCurrencies[m.currency] ??= { income: 0n, expense: 0n });
      if (m.kind === "income") o.income += amt;
      else if (m.kind === "expense") o.expense += amt;
      else if (m.kind === "refund" || m.kind === "reversal") o.expense -= amt;
      continue;
    }
    if (m.kind === "income" || m.kind === "expense") {
      if (m.kind === "income") t.income += amt; else t.expense += amt;
      add(t.byCategory, m.categoryId, amt);
      add(t.bySubcategory, m.subcategoryId, amt);
    } else if (m.kind === "refund" || m.kind === "reversal") {
      t.expense -= amt;
      add(t.byCategory, m.categoryId, -amt);
      add(t.bySubcategory, m.subcategoryId, -amt);
    }
  }
  t.balance = t.income - t.expense;
  return t;
}
