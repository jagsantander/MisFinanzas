import { z } from "zod";
import { asc, eq, max } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { body, json, requireUser, route, HttpError } from "@/lib/http";
import { assertCategoryPair } from "@/lib/categories/service";
import { RuleConditionsSchema } from "@/lib/rules-schema";

const Conditions = RuleConditionsSchema;

export const GET = route(async () => {
  const { user } = await requireUser();
  const rows = await getDb().select().from(schema.rules).where(eq(schema.rules.userId, user.id)).orderBy(asc(schema.rules.priority));
  return json({ rules: rows });
});

export const POST = route(async (req) => {
  const { user } = await requireUser();
  const d = await body(req, z.object({ name: z.string().trim().min(2).max(80), conditions: Conditions, categoryId: z.uuid(), subcategoryId: z.uuid().nullable() }));
  const db = getDb();
  try { await assertCategoryPair(db, user.id, d.categoryId, d.subcategoryId); } catch (e) { throw new HttpError(400, (e as Error).message); }
  const [{ p }] = await db.select({ p: max(schema.rules.priority) }).from(schema.rules).where(eq(schema.rules.userId, user.id));
  const [r] = await db.insert(schema.rules).values({ userId: user.id, priority: (p ?? 0) + 10, ...d }).returning();
  return json({ ok: true, rule: r }, 201);
});
