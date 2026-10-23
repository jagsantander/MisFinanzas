import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { body, json, requireUser, route, HttpError } from "@/lib/http";
import { evaluateBudgetAlerts } from "@/lib/budgets/alerts";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>(async (req, { params }) => {
  const { user } = await requireUser();
  const { id } = await params;
  const { active } = await body(req, z.object({ active: z.boolean() }));
  const db = getDb();
  const [b] = await db.update(schema.budgets).set({ active, updatedAt: new Date() }).where(and(eq(schema.budgets.id, id), eq(schema.budgets.userId, user.id))).returning();
  if (!b) throw new HttpError(404, "Presupuesto no encontrado");
  await evaluateBudgetAlerts(db, user.id);
  return json({ ok: true });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const { user } = await requireUser();
  const { id } = await params;
  await getDb().delete(schema.budgets).where(and(eq(schema.budgets.id, id), eq(schema.budgets.userId, user.id)));
  return json({ ok: true });
});
