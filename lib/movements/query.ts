import { and, eq, gte, ilike, isNull, isNotNull, lt, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { schema } from "../db";

export const MovementFilters = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // exclusivo
  kind: z.enum(["expense", "income", "own_transfer", "card_payment", "refund", "reversal"]).optional(),
  type: z.enum(["ingresos", "gastos"]).optional(),
  categoryId: z.uuid().optional(),
  subcategoryId: z.uuid().optional(),
  account: z.string().max(30).optional(),
  source: z.enum(["manual", "email"]).optional(),
  revision: z.enum(["pendiente", "revisado"]).optional(),
  q: z.string().max(100).optional(),
  deleted: z.enum(["1"]).optional(),
});
export type MovementFilters = z.infer<typeof MovementFilters>;

export function filterConditions(userId: string, f: MovementFilters): SQL[] {
  const m = schema.movements;
  const c: SQL[] = [eq(m.userId, userId)];
  c.push(f.deleted ? isNotNull(m.deletedAt) : isNull(m.deletedAt));
  if (f.from) c.push(gte(m.occurredOn, f.from));
  if (f.to) c.push(lt(m.occurredOn, f.to));
  if (f.kind) c.push(eq(m.kind, f.kind));
  if (f.type === "ingresos") c.push(eq(m.kind, "income"));
  if (f.type === "gastos") c.push(or(eq(m.kind, "expense"), eq(m.kind, "refund"), eq(m.kind, "reversal"))!);
  if (f.categoryId) c.push(eq(m.categoryId, f.categoryId));
  if (f.subcategoryId) c.push(eq(m.subcategoryId, f.subcategoryId));
  if (f.account) c.push(eq(m.accountMask, f.account));
  if (f.source) c.push(eq(m.source, f.source));
  if (f.revision === "pendiente") c.push(eq(m.status, "review"));
  if (f.revision === "revisado") c.push(isNotNull(m.reviewedAt));
  if (f.q) {
    const like = `%${f.q.replace(/[%_\\]/g, (x) => "\\" + x)}%`;
    c.push(or(ilike(m.description, like), ilike(m.merchant, like), ilike(m.counterparty, like), ilike(m.notes, like), ilike(m.bank, like))!);
  }
  return c;
}

export const whereFor = (userId: string, f: MovementFilters) => and(...filterConditions(userId, f));
