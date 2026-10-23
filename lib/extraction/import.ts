import { eq } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { firstMatchingRule } from "../movements/rules";
import { findDuplicate, findOriginalExpense, logChange } from "../movements/service";
import type { ValidatedOp } from "./validate";

export type ImportOutcome = "created" | "created_review" | "duplicate" | "already_imported";

/**
 * Persiste una operación validada. Prioridad de clasificación:
 * 1) corrección manual (los movimientos existentes nunca se sobrescriben), 2) reglas del usuario, 3) IA.
 */
export async function importOperation(db: DB, p: {
  userId: string; connectionId: string; messageId: string; index: number; receivedAt: Date; senderDomain: string; runId: string | null; op: ValidatedOp;
}): Promise<ImportOutcome> {
  const { op } = p;
  const dup = await findDuplicate(db, p.userId, { ...op, kind: op.kind });
  if (dup.kind === "duplicate") {
    await db.insert(schema.movementSources).values({ movementId: dup.existing.id, userId: p.userId, messageId: p.messageId, receivedAt: p.receivedAt }).onConflictDoNothing();
    return "duplicate";
  }
  const reasons = [...op.reviewReasons];
  let status = op.status;
  if (dup.kind === "possible") { reasons.push(dup.reason); if (status === "confirmed") status = "review"; }

  let categoryId = op.categoryId, subcategoryId = op.subcategoryId;
  let categorySource: "rule" | "ai" | "none" = categoryId ? "ai" : "none";
  let ruleId: string | null = null;
  const rules = await db.select().from(schema.rules).where(eq(schema.rules.userId, p.userId));
  const rule = firstMatchingRule(rules, { ...op, senderDomain: p.senderDomain });
  if (rule && (op.kind === "expense" || op.kind === "income")) {
    categoryId = rule.categoryId; subcategoryId = rule.subcategoryId; categorySource = "rule"; ruleId = rule.id;
  }

  let relatedMovementId: string | null = null;
  if (op.kind === "refund" || op.kind === "reversal") {
    const orig = await findOriginalExpense(db, p.userId, op);
    if (orig) { relatedMovementId = orig.id; categoryId = orig.categoryId; subcategoryId = orig.subcategoryId; categorySource = "rule"; }
    else reasons.push("No se encontró el gasto original de esta devolución");
  }
  if ((op.kind === "expense" || op.kind === "income") && !categoryId) reasons.push("Sin categoría asignada");
  if (reasons.length && status === "confirmed") status = "review";

  const [m] = await db.insert(schema.movements).values({
    userId: p.userId, kind: op.kind, status, amountMinor: op.amountMinor, currency: op.currency,
    occurredOn: op.occurredOn, occurredTime: op.occurredTime, receivedAt: p.receivedAt,
    description: op.description, merchant: op.merchant, counterparty: op.counterparty, bank: op.bank, accountMask: op.accountMask,
    operationRef: op.operationRef, categoryId, subcategoryId, categorySource, ruleId, suggestedCategory: op.suggestedCategory,
    reviewReason: reasons.length ? reasons.join(" · ") : null, source: "email", sourceConnectionId: p.connectionId,
    sourceMessageId: p.messageId, sourceIndex: p.index, senderDomain: p.senderDomain, confidence: op.confidence, runId: p.runId,
    relatedMovementId, possibleDuplicateOf: dup.kind === "possible" ? dup.existing.id : null,
  }).onConflictDoNothing().returning();
  if (!m) return "already_imported"; // lápida: ya se importó (o el usuario lo eliminó)
  await db.insert(schema.movementSources).values({ movementId: m.id, userId: p.userId, messageId: p.messageId, receivedAt: p.receivedAt }).onConflictDoNothing();
  await logChange(db, m, "sync", "imported", { categorySource: { from: null, to: categorySource } });
  return status === "confirmed" ? "created" : "created_review";
}
