import { z } from "zod";
import { and, eq, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { body, json, requireUser, route, HttpError } from "@/lib/http";
import { CATEGORY_ICONS } from "@/lib/categories/defaults";
import { logChange } from "@/lib/movements/service";
import { evaluateBudgetAlerts } from "@/lib/budgets/alerts";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>(async (req, { params }) => {
  const { user } = await requireUser();
  const { id } = await params;
  const d = await body(req, z.object({
    name: z.string().trim().min(2).max(40), icon: z.enum(CATEGORY_ICONS as [string, ...string[]]), color: z.string().regex(/^#[0-9a-f]{6}$/i),
    archived: z.boolean(), sortOrder: z.number().int(),
  }).partial());
  const set: Record<string, unknown> = { ...d };
  delete set.archived;
  if (d.archived !== undefined) set.archivedAt = d.archived ? new Date() : null;
  const [c] = await getDb().update(schema.categories).set(set).where(and(eq(schema.categories.id, id), eq(schema.categories.userId, user.id))).returning();
  if (!c) throw new HttpError(404, "Categoría no encontrada");
  return json({ ok: true, category: c });
});

/**
 * Eliminar: si tiene movimientos, exige reasignarlos antes (reassignTo).
 * Los presupuestos y reglas asociados se eliminan; las subcategorías se reasignan o eliminan.
 */
export const DELETE = route<Ctx>(async (req, { params }) => {
  const { user } = await requireUser();
  const { id } = await params;
  const reassignTo = req.nextUrl.searchParams.get("reassignTo");
  const db = getDb();
  const [cat] = await db.select().from(schema.categories).where(and(eq(schema.categories.id, id), eq(schema.categories.userId, user.id)));
  if (!cat) throw new HttpError(404, "Categoría no encontrada");
  const m = schema.movements;
  const usedBy = cat.parentId ? eq(m.subcategoryId, id) : or(eq(m.categoryId, id), eq(m.subcategoryId, id))!;
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(m).where(and(eq(m.userId, user.id), usedBy));
  if (n > 0 && !reassignTo) return json({ error: `Esta categoría tiene ${n} movimientos. Elige a qué categoría reasignarlos.`, code: "needs_reassign", count: n }, 409);
  await db.transaction(async (tx) => {
    if (n > 0 && reassignTo) {
      const [target] = await tx.select().from(schema.categories).where(and(eq(schema.categories.id, reassignTo), eq(schema.categories.userId, user.id)));
      if (!target || target.id === id || target.kind !== cat.kind) throw new HttpError(400, "Categoría de destino inválida");
      const newCat = target.parentId ?? target.id, newSub = target.parentId ? target.id : null;
      const rows = await tx.select().from(m).where(and(eq(m.userId, user.id), usedBy));
      for (const r of rows) {
        await tx.update(m).set({ categoryId: newCat, subcategoryId: newSub, categorySource: "manual", updatedAt: new Date() }).where(eq(m.id, r.id));
        await logChange(tx as never, r, "user", "category_reassigned", { categoryId: { from: r.categoryId, to: newCat } });
      }
    }
    await tx.delete(schema.rules).where(and(eq(schema.rules.userId, user.id), or(eq(schema.rules.categoryId, id), eq(schema.rules.subcategoryId, id))));
    await tx.delete(schema.budgets).where(and(eq(schema.budgets.userId, user.id), or(eq(schema.budgets.categoryId, id), eq(schema.budgets.subcategoryId, id))));
    await tx.delete(schema.categories).where(and(eq(schema.categories.userId, user.id), or(eq(schema.categories.id, id), eq(schema.categories.parentId, id))));
  });
  await evaluateBudgetAlerts(db, user.id);
  return json({ ok: true });
});
