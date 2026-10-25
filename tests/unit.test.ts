import { beforeEach, describe, expect, it } from "vitest";
import { formatMoney, formatPercent, parseAmount } from "@/lib/money";
import { firstMatchingRule } from "@/lib/movements/rules";
import { toCsv } from "@/lib/export";
import { periodForDate } from "@/lib/period";
import { computeTotals } from "@/lib/movements/totals";
import { validScriptUrl } from "@/lib/local/script";
import type { Movement } from "@/lib/local/types";

describe("dinero exacto (CLP por defecto)", () => {
  it("formatea como $1.650.000", () => {
    expect(formatMoney(1650000n, "CLP")).toBe("$1.650.000");
    expect(formatMoney(-25000n, "CLP")).toBe("-$25.000");
  });
  it("interpreta formatos chilenos sin usar float", () => {
    expect(parseAmount("$1.650.000", "CLP")).toBe(1650000n);
    expect(parseAmount("62.500", "CLP")).toBe(62500n);
    expect(parseAmount("12,50", "USD")).toBe(1250n);
    expect(parseAmount("US$ 1,234.56", "USD")).toBe(123456n);
    expect(parseAmount("12,5", "CLP")).toBeNull();
    expect(parseAmount("abc", "CLP")).toBeNull();
  });
  it("porcentaje del ejemplo: 425.000 de 400.000 = 106,3%", () => {
    expect(formatPercent(425000n, 400000n)).toBe("106,3%");
  });
});

describe("reglas", () => {
  it("respeta prioridad y solo reglas activas", () => {
    const rules = [
      { id: "r2", priority: 20, active: true, conditions: { merchantContains: "lider" }, categoryId: "B", subcategoryId: null },
      { id: "r1", priority: 10, active: true, conditions: { merchantContains: "lider" }, categoryId: "A", subcategoryId: null },
      { id: "r0", priority: 1, active: false, conditions: { merchantContains: "lider" }, categoryId: "Z", subcategoryId: null },
    ];
    expect(firstMatchingRule(rules, { merchant: "LÍDER Express", description: "", accountMask: null, kind: "expense", senderDomain: null, counterparty: null })?.id).toBe("r1");
  });
});

describe("totales", () => {
  const m = (kind: string, amount: string, extra: Partial<Movement> = {}) => ({ kind, amountMinor: amount, currency: "CLP", status: "confirmed", excluded: false, deletedAt: null, categoryId: "cat", subcategoryId: null, ...extra }) as Movement;
  it("transferencias propias y pago de tarjeta no inflan; devoluciones restan; excluidos y pendientes no cuentan", () => {
    const t = computeTotals([m("income", "1000000"), m("expense", "200000"), m("own_transfer", "500000"), m("card_payment", "200000"), m("refund", "50000"),
      m("expense", "999", { excluded: true }), m("expense", "777", { status: "pending" }), m("expense", "10", { currency: "USD" })], "CLP");
    expect(t.income).toBe(1000000n);
    expect(t.expense).toBe(150000n);
    expect(t.balance).toBe(850000n);
    expect(t.otherCurrencies.USD.expense).toBe(10n);
  });
});

describe("período mensual configurable", () => {
  it("con inicio el día 25", () => {
    expect(periodForDate("2026-10-19", 25)).toMatchObject({ key: "2026-09", start: "2026-09-25", end: "2026-10-25" });
  });
});

describe("exportación", () => {
  it("CSV protege contra fórmulas y conserva montos negativos", () => {
    const csv = toCsv([["2026-10-01", "", "Gasto", "Confirmado", "-62500", "CLP", "=HYPERLINK(\"x\")", "", "", "", "", "", "Manual", "", "No", "", ""]]);
    expect(csv).toMatch(/'=HYPERLINK/);
    expect(csv).toMatch(/;-62500;/);
  });
});

describe("el token de la planilla solo viaja a Google Apps Script", () => {
  it("acepta solo URLs oficiales de aplicaciones web de Apps Script", () => {
    expect(validScriptUrl("https://script.google.com/macros/s/AKfycbx1234567890abcdefghijkl/exec")).toBe(true);
    expect(validScriptUrl("https://script.google.com/a/macros/empresa.cl/s/AKfycbx1234567890abcdefghijkl/exec")).toBe(true);
    for (const bad of ["https://evil.com/macros/s/AKfycbx1234567890abcdefghijkl/exec", "http://script.google.com/macros/s/AKfycbx1234567890abcdefghijkl/exec",
      "https://script.google.com.evil.com/macros/s/AKfycbx1234567890abcdefghijkl/exec", "https://script.google.com/macros/s/AKfycbx1234567890abcdefghijkl/exec?x=https://evil.com"]) {
      expect(validScriptUrl(bad)).toBe(false);
    }
  });
});
