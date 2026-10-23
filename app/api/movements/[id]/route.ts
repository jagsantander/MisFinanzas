import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { body, json, requireUser, route, HttpError } from "@/lib/http";
import { parseAmount, SUPPORTED_CURRENCIES } from "@/lib/money";
import { assertCategoryPair } from "@/lib/categories/service";
import { logChange, updateMovementByUser } from "@/lib/movements/service";
import { evaluateBudgetAlerts } from "@/lib/budgets/alerts";
import { maskEmail } from "@/lib/crypto";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const { user } = await requireUser();
  const { id } = await params;
  const db = getDb();
  const [m] = await db.select().from(schema.movements).where(and(eq(schema.movements.id, id), eq(schema.movements.userId, user.id)));
  if (!m) throw new HttpError(404, "Movimiento no encontrado");
  const changes = await db.select().from(schema.movementChanges).where(eq(schema.movementChanges.movementId, id)).orderBy(desc(schema.movementChanges.createdAt));
  const sources = await db.select().from(schema.movementSources).where(eq(schema.movementSources.movementId, id));
  let connection = null;
  if (m.sourceConnectionId) {
    const [c] = await db.select().from(schema.mailConnections).where(and(eq(schema.mailConnections.id, m.sourceConnectionId), eq(schema.mailConnections.userId, user.id)));
    if (c) connection = { provider: c.provider, account: maskEmail(c.accountEmail) };
  }
  let rule = null;
  if (m.ruleId) [rule] = await db.select({ id: schema.rules.id, name: schema.rules.name }).from(schema.rules).where(eq(schema.rules.id, m.ruleId));
  let related = null;
  if (m.relatedMovementId) [related] = await db.select().from(schema.movements).where(and(eq(schema.movements.id, m.relatedMovementId), eq(schema.movements.userId, user.id)));
  let duplicateOf = null;
  if (m.possibleDuplicateOf) [duplicateOf] = await db.select().from(schema.movements).where(and(eq(schema.movements.id, m.possibleDuplicateOf), eq(schema.movements.userId, user.id)));
  return json({ movement: m, changes, sources, connection, rule, related, duplicateOf });
});

const Patch = z.object({
  kind: z.enum(["expense", "income", "own_transfer", "card_payment", "refund", "reversal"]),
  amount: z.string().max(30),
  currency: z.enum(SUPPORTED_CURRENCIES as [string, ...string[]]),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  occurredTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  description: z.string().trim().min(1).max(300),
  merchant: z.string().trim().max(120).nullable(),
  accountMask: z.string().trim().max(30).nullable(),
  categoryId: z.uuid().nullable(),
  subcategoryId: z.uuid().nullable(),
  notes: z.string().max(1000).nullable(),
  excluded: z.boolean(),
  reviewed: z.literal(true),
}).partial();

export const PATCH = route<Ctx>(async (req, { params }) => {
  const { user } = await requireUser();
  const { id } = await params;
  const d = await body(req, Patch);
  const db = getDb();
  const [m] = await db.select().from(schema.movements).where(and(eq(schema.movements.id, id), eq(schema.movements.userId, user.id)));
  if (!m || m.deletedAt) throw new HttpError(404, "Movimiento no encontrado");
  const patch: Record<string, unknown> = {};
  for (const k of ["kind", "currency", "occurredOn", "occurredTime", "description", "merchant", "accountMask", "notes", "excluded"] as const) if (k in d) patch[k] = d[k];
  if (d.amount !== undefined) {
    const a = parseAmount(d.amount, d.currency ?? m.currency);
    if (a === null || a <= 0n) throw new HttpError(400, "Monto inválido");
    patch.amountMinor = a;
  }
  if ("categoryId" in d || "subcategoryId" in d) {
    const cat = d.categoryId !== undefined ? d.categoryId : m.categoryId;
    const sub = d.subcategoryId !== undefined ? d.subcategoryId : (d.categoryId !== undefined && d.categoryId !== m.categoryId ? null : m.subcategoryId);
    try { await assertCategoryPair(db, user.id, cat, sub); } catch (e) { throw new HttpError(400, (e as Error).message); }
    patch.categoryId = cat; patch.subcategoryId = sub;
  }
  let updated = await updateMovementByUser(db, user.id, id, patch);
  if (d.reviewed && updated && updated.status !== "confirmed") {
    [updated] = await db.update(schema.movements).set({ status: "confirmed", reviewedAt: new Date(), reviewReason: null }).where(eq(schema.movements.id, id)).returning();
    await logChange(db, updated, "user", "reviewed");
  }
  await evaluateBudgetAlerts(db, user.id);
  return json({ ok: true, movement: updated });
});

/** Eliminación con opción de deshacer: se conserva como lápida para no reimportarlo. */
export const DELETE = route<Ctx>(async (_req, { params }) => {
  const { user } = await requireUser();
  const { id } = await params;
  const db = getDb();
  const [m] = await db.update(schema.movements).set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(schema.movements.id, id), eq(schema.movements.userId, user.id))).returning();
  if (!m) throw new HttpError(404, "Movimiento no encontrado");
  await logChange(db, m, "user", "deleted");
  await evaluateBudgetAlerts(db, user.id);
  return json({ ok: true });
});
