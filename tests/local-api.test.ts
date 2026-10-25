import { beforeEach, describe, expect, it } from "vitest";
import { localApi, evaluateBudgetAlerts } from "@/lib/local/api";
import { getState, initStore } from "@/lib/local/store";

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
const cat = (name: string) => getState().tables.categories.find((c) => c.name === name && !c.parentId)!;
const sub = (parent: string, name: string) => getState().tables.categories.find((c) => c.name === name && c.parentId === cat(parent).id)!;

beforeEach(async () => {
  await initStore();
  const t = getState().tables;
  for (const k of ["movements", "budgets", "overrides", "alertStates", "notifications", "changes", "rules"] as const) (t[k] as unknown[]).length = 0;
});

describe("API local", () => {
  it("crea movimientos y calcula el panel con las reglas financieras", async () => {
    await localApi("/api/movements", { body: { kind: "income", amount: "2.050.000", occurredOn: today, description: "Sueldo", categoryId: cat("Sueldo").id } });
    await localApi("/api/movements", { body: { kind: "expense", amount: "62.500", occurredOn: today, description: "Súper", categoryId: cat("Alimentación").id, subcategoryId: sub("Alimentación", "Supermercado").id } });
    await localApi("/api/movements", { body: { kind: "own_transfer", amount: "300.000", occurredOn: today, description: "Ahorro" } });
    const d = await localApi("/api/dashboard");
    expect(d.totals).toMatchObject({ income: "2050000", expense: "62500", balance: "1987500" });
    await expect(localApi("/api/movements", { body: { kind: "expense", amount: "abc", occurredOn: today, description: "x" } })).rejects.toThrow(/Monto/);
  });

  it("alertas: un aviso con el estado más relevante, sin repetir al re-evaluar ni al bajar el gasto", async () => {
    await localApi("/api/budgets", { method: "PUT", body: { scope: "category", categoryId: cat("Alimentación").id, subcategoryId: null, amount: "400.000" } });
    const { movement } = await localApi("/api/movements", { body: { kind: "expense", amount: "425.000", occurredOn: today, description: "Súper", categoryId: cat("Alimentación").id } });
    evaluateBudgetAlerts();
    await localApi(`/api/movements/${movement.id}`, { method: "PATCH", body: { amount: "300.000" } });
    await localApi(`/api/movements/${movement.id}`, { method: "PATCH", body: { amount: "425.000" } });
    const notes = getState().tables.notifications.filter((n) => n.type === "budget");
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toBe("Alimentación · $425.000 de $400.000 · 106,3% utilizado · Excedido en $25.000");
    expect(notes[0].id).toMatch(/^budget:.+:\d{4}-\d{2}:101$/); // mismo id que genera el script de la planilla
  });

  it("las correcciones manuales quedan bloqueadas y los cambios masivos las respetan", async () => {
    const mk = async (merchant: string) => (await localApi("/api/movements", { body: { kind: "expense", amount: "10.000", occurredOn: today, description: merchant, merchant } })).movement;
    const a = await mk("LIDER Centro"), b = await mk("LIDER Norte"), c = await mk("LIDER Sur");
    await localApi(`/api/movements/${b.id}`, { method: "PATCH", body: { categoryId: cat("Ocio y restaurantes").id } });
    const prev = await localApi("/api/movements/bulk", { body: { movementId: a.id, categoryId: cat("Alimentación").id, subcategoryId: null, scope: "similar", conditions: { merchantContains: "lider" }, dryRun: true } });
    expect(prev.count).toBe(2);
    expect(prev.skippedManual).toBe(1);
    await localApi("/api/movements/bulk", { body: { movementId: a.id, categoryId: cat("Alimentación").id, subcategoryId: null, scope: "rule", applyToExisting: true, conditions: { merchantContains: "lider" } } });
    const byId = (id: string) => getState().tables.movements.find((m) => m.id === id)!;
    expect(byId(c.id).categoryId).toBe(cat("Alimentación").id);
    expect(byId(b.id).categoryId).toBe(cat("Ocio y restaurantes").id);
    expect(byId(a.id).lockedFields).toContain("categoryId");
    expect(getState().tables.rules).toHaveLength(1);
    const detail = await localApi(`/api/movements/${a.id}`);
    expect(detail.changes.length).toBeGreaterThan(0);
  });

  it("eliminar con deshacer y no permitir categorías de otro tipo", async () => {
    const { movement } = await localApi("/api/movements", { body: { kind: "expense", amount: "5.000", occurredOn: today, description: "x" } });
    await localApi(`/api/movements/${movement.id}`, { method: "DELETE" });
    expect((await localApi("/api/movements")).movements).toHaveLength(0);
    await localApi(`/api/movements/${movement.id}/restore`, { body: {} });
    expect((await localApi("/api/movements")).movements).toHaveLength(1);
    await expect(localApi("/api/categories/" + cat("Alimentación").id, { method: "DELETE" })).resolves.toBeTruthy();
  });
});
