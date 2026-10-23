import { z } from "zod";

/** Esquema JSON enviado al proveedor (compatible con modo estricto de OpenAI, Anthropic y Gemini). */
const nullableString = { type: ["string", "null"] };
export const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["message_type", "operations"],
  properties: {
    message_type: { type: "string", enum: ["transaction_notice", "rejected_attempt", "pending_operation", "promotion", "statement_summary", "other"] },
    operations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["status", "kind", "amount_text", "currency", "occurred_date", "occurred_time", "merchant", "counterparty", "bank", "account_mask", "description", "operation_id", "category", "subcategory", "confidence", "ambiguity"],
        properties: {
          status: { type: "string", enum: ["completed", "rejected", "pending"] },
          kind: { type: "string", enum: ["expense", "income", "own_transfer", "card_payment", "refund", "reversal"] },
          amount_text: { type: "string", description: "Monto tal como aparece en el correo, sin calcular" },
          currency: { type: "string", description: "Código ISO 4217, p. ej. CLP o USD" },
          occurred_date: { ...nullableString, description: "YYYY-MM-DD si el correo la indica; null si no" },
          occurred_time: { ...nullableString, description: "HH:MM si el correo la indica; null si no" },
          merchant: nullableString,
          counterparty: nullableString,
          bank: nullableString,
          account_mask: { ...nullableString, description: "Solo últimos 4 dígitos" },
          description: { type: "string" },
          operation_id: nullableString,
          category: nullableString,
          subcategory: nullableString,
          confidence: { type: "number", description: "0 a 1" },
          ambiguity: { ...nullableString, description: "Motivo si hay dudas; null si no" },
        },
      },
    },
  },
} as const;

const op = z.object({
  status: z.enum(["completed", "rejected", "pending"]),
  kind: z.enum(["expense", "income", "own_transfer", "card_payment", "refund", "reversal"]),
  amount_text: z.string().max(40),
  currency: z.string().max(5),
  occurred_date: z.string().max(20).nullable(),
  occurred_time: z.string().max(10).nullable(),
  merchant: z.string().max(120).nullable(),
  counterparty: z.string().max(120).nullable(),
  bank: z.string().max(80).nullable(),
  account_mask: z.string().max(30).nullable(),
  description: z.string().max(300),
  operation_id: z.string().max(80).nullable(),
  category: z.string().max(80).nullable(),
  subcategory: z.string().max(80).nullable(),
  confidence: z.number().min(0).max(1),
  ambiguity: z.string().max(300).nullable(),
});

export const ExtractionResult = z.object({
  message_type: z.enum(["transaction_notice", "rejected_attempt", "pending_operation", "promotion", "statement_summary", "other"]),
  operations: z.array(op).max(20),
});
export type ExtractionResult = z.infer<typeof ExtractionResult>;
export type ExtractedOp = z.infer<typeof op>;
