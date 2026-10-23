import { DateTime } from "luxon";
import { parseAmount, SUPPORTED_CURRENCIES } from "../money";
import { norm } from "../text";
import type { ExtractedOp } from "./schema";

export type CategoryRef = { id: string; name: string; parentId: string | null; kind: string };

export type ValidatedOp = {
  skip: false;
  kind: ExtractedOp["kind"];
  status: "confirmed" | "review" | "pending";
  amountMinor: bigint;
  currency: string;
  occurredOn: string;
  occurredTime: string | null;
  merchant: string | null;
  counterparty: string | null;
  bank: string | null;
  accountMask: string | null;
  description: string;
  operationRef: string | null;
  categoryId: string | null;
  subcategoryId: string | null;
  suggestedCategory: string | null;
  confidence: number;
  reviewReasons: string[];
};
export type SkippedOp = { skip: true; reason: string };

const digitsOnly = (s: string) => s.replace(/\D/g, "");

/**
 * Validación en servidor de cada operación propuesta por la IA. No inventa datos:
 * - el monto debe poder leerse y debe APARECER en el texto del correo;
 * - la fecha debe ser válida y coherente con la recepción (si falta, se usa la de recepción y se marca);
 * - moneda soportada; categoría existente del usuario;
 * - rechazadas se descartan; pendientes no suman; baja confianza → Por revisar.
 */
export function validateOp(op: ExtractedOp, ctx: { emailText: string; receivedAt: Date; tz: string; defaultCurrency: string; categories: CategoryRef[] }): ValidatedOp | SkippedOp {
  if (op.status === "rejected") return { skip: true, reason: "Operación rechazada (no es un movimiento)" };
  const reasons: string[] = [];
  let currency = (op.currency || ctx.defaultCurrency).toUpperCase().replace("$", "");
  if (currency === "UF") currency = "CLF";
  if (!SUPPORTED_CURRENCIES.includes(currency)) { reasons.push(`Moneda no reconocida (${op.currency})`); currency = ctx.defaultCurrency; }

  const amount = parseAmount(op.amount_text, currency);
  if (amount === null || amount <= 0n) return { skip: true, reason: "Monto no interpretable" };
  const amtDigits = digitsOnly(op.amount_text).replace(/^0+/, "");
  if (!amtDigits || !digitsOnly(ctx.emailText).includes(amtDigits)) reasons.push("El monto no aparece literalmente en el correo");

  const received = DateTime.fromJSDate(ctx.receivedAt).setZone(ctx.tz);
  let occurredOn = received.toISODate()!;
  if (op.occurred_date) {
    const d = DateTime.fromISO(op.occurred_date, { zone: ctx.tz });
    if (!d.isValid) reasons.push("Fecha inválida; se usó la fecha de recepción");
    else if (d > received.plus({ days: 1 }) || d < received.minus({ days: 400 })) reasons.push("Fecha incoherente con la recepción del correo; se usó la fecha de recepción");
    else occurredOn = d.toISODate()!;
  } else reasons.push("El correo no indica fecha; se usó la de recepción");
  const time = op.occurred_time && /^([01]\d|2[0-3]):[0-5]\d$/.test(op.occurred_time) ? op.occurred_time : null;

  if (op.confidence < 0.7) reasons.push(`Confianza baja (${Math.round(op.confidence * 100)}%)`);
  if (op.ambiguity) reasons.push(op.ambiguity);

  // Categoría: solo se acepta si existe entre las del usuario.
  let categoryId: string | null = null, subcategoryId: string | null = null;
  const kindForCat = op.kind === "income" ? "income" : "expense";
  if (op.category && (op.kind === "expense" || op.kind === "income")) {
    const cat = ctx.categories.find((c) => !c.parentId && c.kind === kindForCat && norm(c.name) === norm(op.category));
    if (cat) {
      categoryId = cat.id;
      const sub = op.subcategory ? ctx.categories.find((c) => c.parentId === cat.id && norm(c.name) === norm(op.subcategory)) : null;
      subcategoryId = sub?.id ?? null;
    }
  }

  const mask = op.account_mask ? (digitsOnly(op.account_mask).slice(-4) || null) : null;
  return {
    skip: false,
    kind: op.kind,
    status: op.status === "pending" ? "pending" : reasons.length ? "review" : "confirmed",
    amountMinor: amount, currency, occurredOn, occurredTime: time,
    merchant: op.merchant?.trim() || null, counterparty: op.counterparty?.trim() || null, bank: op.bank?.trim() || null,
    accountMask: mask ? `••••${mask}` : null,
    description: op.description.trim().slice(0, 300),
    operationRef: op.operation_id?.trim() || null,
    categoryId, subcategoryId,
    suggestedCategory: op.category ? `${op.category}${op.subcategory ? " › " + op.subcategory : ""}` : null,
    confidence: op.confidence,
    reviewReasons: op.status === "pending" ? ["Operación pendiente de confirmación", ...reasons] : reasons,
  };
}
