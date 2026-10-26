import { describe, expect, it } from "vitest";
import { parseNotice } from "../lib/capture/parse";

describe("lector de avisos del banco", () => {
  const cases: [string, Partial<ReturnType<typeof parseNotice>> | null][] = [
    ["Compra por $12.990 en LIDER EXPRESS con tu tarjeta terminada en 1234", { kind: "expense", amountMinor: "12990", merchant: "LIDER EXPRESS", accountMask: "••••1234" }],
    ["Banco de Chile: Se realizó una compra por $45.000 en COPEC el 25/10/2026", { kind: "expense", amountMinor: "45000", merchant: "COPEC" }],
    ["Recibiste una transferencia de $250.000 de Juan Pérez", { kind: "income", amountMinor: "250000", merchant: "Juan Pérez" }],
    ["Transferiste $10.000 a María Soto", { kind: "expense", amountMinor: "10000", merchant: "María Soto" }],
    ["Abono de remuneraciones por $1.650.000", { kind: "income", amountMinor: "1650000" }],
    ["Pagaste US$ 12,50 en NETFLIX.COM", { kind: "expense", amountMinor: "1250", currency: "USD", merchant: "NETFLIX" }],
    ["Devolución de $5.990 de FALABELLA", { kind: "refund", amountMinor: "5990" }],
    ["Pago de tarjeta de crédito por $300.000 recibido", { kind: "card_payment", amountMinor: "300000" }],
    ["Tu compra por $99.000 fue rechazada", null],
    ["Hola, ¿nos juntamos mañana?", null],
    ["Oferta: 20% de descuento en tu próxima compra", null],
  ];
  it.each(cases)("%s", (text, want) => {
    const r = parseNotice(text);
    if (want === null) expect(r).toBeNull();
    else expect(r).toMatchObject(want);
  });
});

import { beforeEach } from "vitest";
import { getState, initStore, mutate } from "../lib/local/store";
import { importMovements, importNotices } from "../lib/capture/import";

describe("importación de avisos capturados", () => {
  beforeEach(async () => {
    await initStore();
    const t = getState().tables;
    for (const k of ["movements", "rules", "changes"] as const) (t[k] as unknown[]).length = 0;
  });
  const n = (id: string, text: string) => ({ id, source: "notification" as const, text, app: "cl.bancochile.mbanking", postedAt: new Date().toISOString() });

  it("crea movimientos, aplica reglas y no repite el mismo aviso", () => {
    const ali = getState().tables.categories.find((c) => c.name === "Alimentación" && !c.parentId)!;
    mutate("rules", [{ id: "r1", priority: 1, name: "Líder", conditions: { merchantContains: "lider" }, categoryId: ali.id, subcategoryId: null, active: true, updatedAt: new Date().toISOString() }]);
    const r = importNotices([n("a1", "Compra por $12.990 en LIDER EXPRESS con tu tarjeta terminada en 1234"), n("a2", "Hola, ¿cómo estás?")]);
    expect(r).toMatchObject({ created: 1, review: 0, unrecognized: 1 });
    const m = getState().tables.movements[0];
    expect(m).toMatchObject({ kind: "expense", amountMinor: "12990", merchant: "LIDER EXPRESS", source: "notification", categoryId: ali.id, categorySource: "rule", status: "confirmed" });
    expect(importNotices([n("a1", "Compra por $12.990 en LIDER EXPRESS")])).toMatchObject({ created: 0, skipped: 1 });
    getState().tables.movements[0].deletedAt = new Date().toISOString();
    expect(importNotices([n("a1", "Compra por $12.990 en LIDER EXPRESS")]).skipped).toBe(1); // lo eliminado no vuelve
  });

  it("lo que parece repetido (otra fuente, mismo monto y comercio) queda por revisar", () => {
    importNotices([n("b1", "Compra por $45.000 en COPEC")]);
    const r = importMovements([{ id: "cartola:x", source: "statement", kind: "expense", amountMinor: "45000", currency: "CLP", merchant: "COPEC ESTACION", description: "COPEC ESTACION" }]);
    expect(r).toMatchObject({ created: 0, review: 1 });
    const dup = getState().tables.movements.find((m) => m.source === "statement")!;
    expect(dup.possibleDuplicateOf).toBe(getState().tables.movements.find((m) => m.source === "notification")!.id);
  });
});

import { vi } from "vitest";
import { readStatement } from "../lib/capture/statement";

describe("cartola leída con la IA", () => {
  it("valida montos y fechas, distingue cargos de abonos y da ids estables", async () => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
    let sent: any;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      const movements = [
        { date: today, description: "COMPRA LIDER", amount_text: "$12.990", direction: "cargo" },
        { date: today, description: "COMPRA LIDER", amount_text: "$12.990", direction: "cargo" },
        { date: today, description: "ABONO REMUNERACIONES", amount_text: "1.650.000", direction: "abono" },
        { date: "1990-01-01", description: "MUY ANTIGUO", amount_text: "$1.000", direction: "cargo" },
        { date: today, description: "SALDO", amount_text: "abc", direction: "abono" },
      ];
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ movements }) }] }, finishReason: "STOP" }] }), { status: 200 });
    }));
    const file = new File(["Fecha;Detalle;Cargo;Abono\n..."], "cartola.csv", { type: "text/csv" });
    const rows = await readStatement({ key: "AIzaPRUEBA0000000000000000000000000", model: "gemini-2.5-flash" }, file, "CLP", "America/Santiago");
    vi.unstubAllGlobals();
    expect(sent.contents[0].parts[0].text).toContain("Fecha;Detalle");
    expect(rows.map((r) => [r.kind, r.amountMinor, r.description])).toEqual([["expense", "12990", "COMPRA LIDER"], ["expense", "12990", "COMPRA LIDER"], ["income", "1650000", "ABONO REMUNERACIONES"]]);
    expect(rows[0].id).not.toBe(rows[1].id); // dos compras iguales el mismo día son dos movimientos
    const again = rows.map((r) => r.id);
    expect(again[0]).toBe(`cartola:${today}|12990|expense|compra lider|1`);
  });
});
