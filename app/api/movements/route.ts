import { z } from "zod";
import { desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { body, json, requireUser, route, HttpError } from "@/lib/http";
import { MovementFilters, whereFor } from "@/lib/movements/query";
import { computeTotals } from "@/lib/movements/totals";
import { parseAmount, SUPPORTED_CURRENCIES } from "@/lib/money";
import { assertCategoryPair } from "@/lib/categories/service";
import { logChange } from "@/lib/movements/service";
import { evaluateBudgetAlerts } from "@/lib/budgets/alerts";

export const GET = route(async (req) => {
  const { user } = await requireUser();
  const f = MovementFilters.parse(Object.fromEntries(req.nextUrl.searchParams));
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 500), 2000);
  const db = getDb();
  const rows = await db.select().from(schema.movements).where(whereFor(user.id, f))
    .orderBy(desc(schema.movements.occurredOn), desc(schema.movements.occurredTime), desc(schema.movements.createdAt)).limit(limit);
  const t = computeTotals(rows, user.currency);
  const accounts = [...new Set(rows.map((r) => r.accountMask).filter(Boolean))];
  return json({ movements: rows, totals: { income: t.income, expense: t.expense, balance: t.balance, reviewCount: t.reviewCount, otherCurrencies: t.otherCurrencies }, accounts, truncated: rows.length === limit });
});

const MovementInput = z.object({
  kind: z.enum(["expense", "income", "own_transfer", "card_payment", "refund", "reversal"]),
  amount: z.string().min(1).max(30),
  currency: z.enum(SUPPORTED_CURRENCIES as [string, ...string[]]).default("CLP"),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  occurredTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  description: z.string().trim().min(1, "Agrega una descripción").max(300),
  merchant: z.string().trim().max(120).nullable().optional(),
  accountMask: z.string().trim().max(30).nullable().optional(),
  categoryId: z.uuid().nullable().optional(),
  subcategoryId: z.uuid().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const POST = route(async (req) => {
  const { user } = await requireUser();
  const d = await body(req, MovementInput);
  const amount = parseAmount(d.amount, d.currency);
  if (amount === null || amount <= 0n) throw new HttpError(400, "Monto inválido");
  const db = getDb();
  try { await assertCategoryPair(db, user.id, d.categoryId ?? null, d.subcategoryId ?? null); } catch (e) { throw new HttpError(400, (e as Error).message); }
  const [m] = await db.insert(schema.movements).values({
    userId: user.id, kind: d.kind, amountMinor: amount, currency: d.currency, occurredOn: d.occurredOn, occurredTime: d.occurredTime ?? null,
    description: d.description, merchant: d.merchant ?? null, accountMask: d.accountMask ?? null,
    categoryId: d.categoryId ?? null, subcategoryId: d.subcategoryId ?? null, categorySource: d.categoryId ? "manual" : "none",
    notes: d.notes ?? null, source: "manual", status: "confirmed", reviewedAt: new Date(),
    lockedFields: ["kind", "amountMinor", "occurredOn", "categoryId", "description"],
  }).returning();
  await logChange(db, m, "user", "created");
  await evaluateBudgetAlerts(db, user.id);
  return json({ ok: true, movement: m }, 201);
});

export const dynamic = "force-dynamic";
