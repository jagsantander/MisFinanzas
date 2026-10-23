import { z } from "zod";
import { and, eq, inArray, isNull, max } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { body, json, requireUser, route, HttpError } from "@/lib/http";
import { assertCategoryPair } from "@/lib/categories/service";
import { updateMovementByUser } from "@/lib/movements/service";
import { ruleMatches } from "@/lib/movements/rules";
import { evaluateBudgetAlerts } from "@/lib/budgets/alerts";

/**
 * Reclasificación con alcance:
 * - "only": solo este movimiento;
 * - "similar": también movimientos similares existentes (requiere vista previa: dryRun);
 * - "rule": crea una regla para futuros movimientos (opcionalmente también aplica a similares).
 */
const Input = z.object({
  movementId: z.uuid(),
  categoryId: z.uuid(),
  subcategoryId: z.uuid().nullable(),
  scope: z.enum(["only", "similar", "rule"]),
  applyToExisting: z.boolean().default(false),
  conditions: z.object({
    merchantContains: z.string().trim().max(60).optional(),
    senderContains: z.string().trim().max(60).optional(),
    descriptionContains: z.string().trim().max(60).optional(),
    accountMask: z.string().trim().max(30).optional(),
    kind: z.enum(["expense", "income"]).optional(),
  }).optional(),
  dryRun: z.boolean().default(false),
});

export const POST = route(async (req) => {
  const { user } = await requireUser();
  const d = await body(req, Input);
  const db = getDb();
  try { await assertCategoryPair(db, user.id, d.categoryId, d.subcategoryId); } catch (e) { throw new HttpError(400, (e as Error).message); }
  const [m] = await db.select().from(schema.movements).where(and(eq(schema.movements.id, d.movementId), eq(schema.movements.userId, user.id)));
  if (!m) throw new HttpError(404, "Movimiento no encontrado");
  const conditions = d.conditions ?? { merchantContains: m.merchant ?? undefined, kind: m.kind === "income" ? "income" : "expense" };
  if (d.scope !== "only" && !Object.values(conditions).some((v) => v)) throw new HttpError(400, "Define al menos un criterio para los movimientos similares");

  let affected: typeof m[] = [m];
  if (d.scope === "similar" || (d.scope === "rule" && d.applyToExisting)) {
    const all = await db.select().from(schema.movements).where(and(eq(schema.movements.userId, user.id), isNull(schema.movements.deletedAt), inArray(schema.movements.kind, ["expense", "income"])));
    affected = all.filter((x) => x.id === m.id || ruleMatches({ id: "preview", priority: 0, active: true, conditions, categoryId: d.categoryId, subcategoryId: d.subcategoryId }, x));
  }
  // Las correcciones manuales previas de OTROS movimientos no se pisan en cambios masivos.
  const willChange = affected.filter((x) => x.id === m.id || !x.lockedFields.includes("categoryId"));
  const skippedManual = affected.length - willChange.length;
  if (d.dryRun) {
    return json({ preview: willChange.slice(0, 200).map((x) => ({ id: x.id, occurredOn: x.occurredOn, description: x.description, merchant: x.merchant, amountMinor: x.amountMinor, currency: x.currency, categoryId: x.categoryId })), count: willChange.length, skippedManual });
  }
  for (const x of willChange) await updateMovementByUser(db, user.id, x.id, { categoryId: d.categoryId, subcategoryId: d.subcategoryId });
  let ruleId: string | null = null;
  if (d.scope === "rule") {
    const [{ p }] = await db.select({ p: max(schema.rules.priority) }).from(schema.rules).where(eq(schema.rules.userId, user.id));
    const [r] = await db.insert(schema.rules).values({
      userId: user.id, priority: (p ?? 0) + 10, name: conditions.merchantContains ? `Comercio contiene “${conditions.merchantContains}”` : "Regla personalizada",
      conditions, categoryId: d.categoryId, subcategoryId: d.subcategoryId,
    }).returning();
    ruleId = r.id;
  }
  await evaluateBudgetAlerts(db, user.id);
  return json({ ok: true, updated: willChange.length, skippedManual, ruleId });
});
