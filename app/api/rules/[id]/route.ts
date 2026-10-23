import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { body, json, requireUser, route, HttpError } from "@/lib/http";
import { assertCategoryPair } from "@/lib/categories/service";
import { RuleConditionsSchema } from "@/lib/rules-schema";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>(async (req, { params }) => {
  const { user } = await requireUser();
  const { id } = await params;
  const d = await body(req, z.object({ name: z.string().trim().min(2).max(80), conditions: RuleConditionsSchema, categoryId: z.uuid(), subcategoryId: z.uuid().nullable(), active: z.boolean() }).partial());
  const db = getDb();
  if (d.categoryId) { try { await assertCategoryPair(db, user.id, d.categoryId, d.subcategoryId ?? null); } catch (e) { throw new HttpError(400, (e as Error).message); } }
  const [r] = await db.update(schema.rules).set({ ...d, updatedAt: new Date() }).where(and(eq(schema.rules.id, id), eq(schema.rules.userId, user.id))).returning();
  if (!r) throw new HttpError(404, "Regla no encontrada");
  return json({ ok: true, rule: r });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const { user } = await requireUser();
  const { id } = await params;
  await getDb().delete(schema.rules).where(and(eq(schema.rules.id, id), eq(schema.rules.userId, user.id)));
  return json({ ok: true });
});
