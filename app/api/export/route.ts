import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { requireUser, route } from "@/lib/http";
import { MovementFilters, whereFor } from "@/lib/movements/query";
import { exportRows, toCsv, toXlsx } from "@/lib/export";
import { audit } from "@/lib/audit";

/** Exporta la planilla (con los filtros aplicados) a CSV o Excel. No incluye credenciales ni contenido de correos. */
export const GET = route(async (req) => {
  const { user } = await requireUser();
  const fmt = req.nextUrl.searchParams.get("format");
  if (fmt === "json") return fullBackup(user.id);
  const format = fmt === "xlsx" ? "xlsx" : "csv";
  const f = MovementFilters.parse(Object.fromEntries([...req.nextUrl.searchParams].filter(([k]) => k !== "format")));
  const db = getDb();
  const rows = await db.select().from(schema.movements).where(whereFor(user.id, f)).orderBy(asc(schema.movements.occurredOn));
  const cats = await db.select().from(schema.categories).where(eq(schema.categories.userId, user.id));
  const data = exportRows(rows, (id) => cats.find((c) => c.id === id)?.name ?? "");
  await audit(user.id, "export", { format, rows: rows.length });
  const name = `misfinanzas-movimientos-${new Date().toISOString().slice(0, 10)}`;
  if (format === "xlsx") {
    return new NextResponse(new Uint8Array(await toXlsx(data)), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${name}.xlsx"`, "cache-control": "no-store" } });
  }
  return new NextResponse(toCsv(data), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}.csv"`, "cache-control": "no-store" } });
});

/** Copia completa de los datos del usuario (sin credenciales, tokens ni contenido de correos). */
async function fullBackup(userId: string) {
  const db = getDb();
  const [categories, rules, budgets, overrides, movements] = await Promise.all([
    db.select().from(schema.categories).where(eq(schema.categories.userId, userId)),
    db.select().from(schema.rules).where(eq(schema.rules.userId, userId)),
    db.select().from(schema.budgets).where(eq(schema.budgets.userId, userId)),
    db.select().from(schema.budgetOverrides).where(eq(schema.budgetOverrides.userId, userId)),
    db.select().from(schema.movements).where(eq(schema.movements.userId, userId)),
  ]);
  await audit(userId, "export", { format: "json" });
  const body = JSON.stringify({ format: "misfinanzas-backup", version: 1, exportedAt: new Date().toISOString(), categories, rules, budgets, overrides, movements },
    (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2);
  return new NextResponse(body, { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="misfinanzas-copia-${new Date().toISOString().slice(0, 10)}.json"`, "cache-control": "no-store" } });
}
