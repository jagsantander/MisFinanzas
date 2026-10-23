import { and, desc, eq, gte, isNull, lte, ne, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import type { DB } from "../db";
import { schema } from "../db";
import type { Movement } from "../db/schema";
import { similarMerchant } from "../text";

type Change = Record<string, { from: unknown; to: unknown }>;
const ser = (v: unknown) => (typeof v === "bigint" ? v.toString() : v instanceof Date ? v.toISOString() : v);

export async function logChange(db: DB, m: { id: string; userId: string }, actor: "user" | "sync" | "rule" | "system", action: string, changes?: Change) {
  await db.insert(schema.movementChanges).values({ movementId: m.id, userId: m.userId, actor, action, changes: changes ?? null });
}

export const EDITABLE_FIELDS = ["kind", "amountMinor", "currency", "occurredOn", "occurredTime", "description", "merchant", "accountMask", "categoryId", "subcategoryId", "notes", "excluded", "status"] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

/**
 * Edición manual: registra cambios y BLOQUEA los campos tocados para que ninguna
 * sincronización posterior los sobrescriba. La clasificación pasa a "manual".
 */
export async function updateMovementByUser(db: DB, userId: string, id: string, patch: Partial<Pick<Movement, EditableField>>) {
  const [m] = await db.select().from(schema.movements).where(and(eq(schema.movements.id, id), eq(schema.movements.userId, userId)));
  if (!m) return null;
  const changes: Change = {};
  const set: Partial<Movement> = {};
  for (const k of EDITABLE_FIELDS) {
    if (!(k in patch)) continue;
    const nv = patch[k];
    if (ser(nv) !== ser(m[k])) { changes[k] = { from: ser(m[k]), to: ser(nv) }; (set as Record<string, unknown>)[k] = nv; }
  }
  if (!Object.keys(changes).length) return m;
  const locked = new Set(m.lockedFields);
  Object.keys(changes).forEach((k) => locked.add(k === "subcategoryId" ? "categoryId" : k));
  if ("categoryId" in changes || "subcategoryId" in changes) { set.categorySource = "manual"; set.ruleId = null; }
  set.lockedFields = [...locked];
  set.updatedAt = new Date();
  const [updated] = await db.update(schema.movements).set(set).where(eq(schema.movements.id, id)).returning();
  await logChange(db, m, "user", "edit", changes);
  return updated;
}

/** Busca el gasto original de una devolución/reverso (mismo comercio, monto ≥, hasta 120 días antes). */
export async function findOriginalExpense(db: DB, userId: string, refund: Pick<Movement, "merchant" | "amountMinor" | "currency" | "occurredOn" | "accountMask">) {
  const from = DateTime.fromISO(refund.occurredOn).minus({ days: 120 }).toISODate()!;
  const candidates = await db.select().from(schema.movements).where(and(
    eq(schema.movements.userId, userId), eq(schema.movements.kind, "expense"), eq(schema.movements.currency, refund.currency),
    isNull(schema.movements.deletedAt), gte(schema.movements.occurredOn, from), lte(schema.movements.occurredOn, refund.occurredOn),
    gte(schema.movements.amountMinor, refund.amountMinor),
  )).orderBy(desc(schema.movements.occurredOn)).limit(50);
  const exact = candidates.find((c) => c.amountMinor === refund.amountMinor && similarMerchant(c.merchant, refund.merchant));
  return exact ?? candidates.find((c) => similarMerchant(c.merchant, refund.merchant) && (!refund.accountMask || c.accountMask === refund.accountMask)) ?? null;
}

export type DedupeResult =
  | { kind: "new" }
  | { kind: "duplicate"; existing: Movement; reason: string }
  | { kind: "possible"; existing: Movement; reason: string };

/**
 * Deduplicación (incluye movimientos eliminados: una eliminación del usuario se respeta).
 * 1. Mismo identificador de operación + monto → duplicado seguro (se agrega la referencia del correo).
 * 2. Mismo monto, moneda, cuenta, comercio similar y fecha ±1 día → POSIBLE duplicado: se importa
 *    como "Por revisar" para que el usuario decida (nunca se descarta automáticamente).
 */
export async function findDuplicate(db: DB, userId: string, c: Pick<Movement, "operationRef" | "amountMinor" | "currency" | "occurredOn" | "accountMask" | "merchant" | "bank" | "kind">): Promise<DedupeResult> {
  if (c.operationRef) {
    const [ex] = await db.select().from(schema.movements).where(and(
      eq(schema.movements.userId, userId), eq(schema.movements.operationRef, c.operationRef), eq(schema.movements.amountMinor, c.amountMinor)));
    if (ex && (!ex.bank || !c.bank || similarMerchant(ex.bank, c.bank))) return { kind: "duplicate", existing: ex, reason: "Mismo identificador de operación" };
  }
  const d = DateTime.fromISO(c.occurredOn);
  const near = await db.select().from(schema.movements).where(and(
    eq(schema.movements.userId, userId), eq(schema.movements.amountMinor, c.amountMinor), eq(schema.movements.currency, c.currency),
    eq(schema.movements.kind, c.kind),
    gte(schema.movements.occurredOn, d.minus({ days: 1 }).toISODate()!), lte(schema.movements.occurredOn, d.plus({ days: 1 }).toISODate()!),
  ));
  const hit = near.find((n) => (n.accountMask ?? "") === (c.accountMask ?? "") && similarMerchant(n.merchant, c.merchant));
  if (hit) return { kind: "possible", existing: hit, reason: "Mismo monto, fecha, cuenta y comercio que otro movimiento" };
  return { kind: "new" };
}

/** Fusiona un posible duplicado en el original (decisión del usuario). */
export async function mergeDuplicate(db: DB, userId: string, duplicateId: string, intoId: string) {
  const rows = await db.select().from(schema.movements).where(and(eq(schema.movements.userId, userId), sql`${schema.movements.id} in (${duplicateId}, ${intoId})`));
  const dup = rows.find((r) => r.id === duplicateId), into = rows.find((r) => r.id === intoId);
  if (!dup || !into || dup.id === into.id) return false;
  if (dup.sourceMessageId) {
    await db.insert(schema.movementSources).values({ movementId: into.id, userId, messageId: dup.sourceMessageId, receivedAt: dup.receivedAt }).onConflictDoNothing();
  }
  // Se conserva como lápida para que no se vuelva a importar.
  await db.update(schema.movements).set({ deletedAt: new Date(), possibleDuplicateOf: into.id, updatedAt: new Date() }).where(eq(schema.movements.id, dup.id));
  await logChange(db, dup, "user", "merged_into", { mergedInto: { from: null, to: into.id } });
  await logChange(db, into, "user", "merged_from", { mergedFrom: { from: null, to: dup.id } });
  return true;
}

export async function reviewCount(db: DB, userId: string) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.movements)
    .where(and(eq(schema.movements.userId, userId), eq(schema.movements.status, "review"), isNull(schema.movements.deletedAt), ne(schema.movements.excluded, true)));
  return r.n;
}
