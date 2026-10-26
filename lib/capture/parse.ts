/**
 * Lee un aviso financiero corto (notificación del banco, texto compartido o pegado) y extrae un movimiento.
 * Sin IA: reglas simples pensadas para los avisos de bancos y billeteras chilenas («Compra por $12.990 en LIDER»).
 * Devuelve null si el texto no parece una operación realizada (sin monto, sin tipo o rechazada).
 */
import { parseAmount } from "../money";
import type { Kind } from "../local/types";

export type ParsedNotice = {
  kind: Kind; amountMinor: string; currency: string; merchant: string | null; accountMask: string | null;
  description: string; confidence: number;
};

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const REJECTED = /(rechazad|no (pudo|fue) (ser )?(realizad|aprobad|procesad)|fallid|declinad|no se (pudo|realizo)|insuficiente)/;
const REFUND = /(devolucion|reverso|reversa|anulacion|reembolso)/;
const CARD_PAYMENT = /(pago (de|a) (tu )?tarjeta|pagaste (tu|la) tarjeta|pago tarjeta de credito)/;
const INCOME = /(abono|recibiste|te transfiri|te envio|transferencia recibida|has recibido|deposito|ingreso a tu cuenta|remuneracion|sueldo|te pagaron)/;
const EXPENSE = /(compra|pagaste|pago|cargo|giro|transferencia (realizada|enviada|exitosa|a terceros)|enviaste|transferiste|debito|cobro|suscripcion|retiro)/;

// Montos: «$12.990», «$ 1.234.567», «CLP 12.990», «US$ 10,50», «USD 10.50».
const AMOUNT = /(US\$|USD|CLP|\$)\s?(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i;

const STOP = /\s+(?:con|por|el|la|desde|a las|tarjeta|cuenta|fecha|hora|monto|n[°º]|nro)\b/i;
function cleanName(s: string | undefined): string | null {
  if (!s) return null;
  let v = s.split(/[,.;:\n(]/)[0];
  const stop = STOP.exec(v);
  if (stop) v = v.slice(0, stop.index);
  v = v.replace(/\s+/g, " ").trim();
  return v.length >= 2 && v.length <= 60 && !/^\d+$/.test(v) ? v : null;
}

export function parseNotice(input: string, defaultCurrency = "CLP"): ParsedNotice | null {
  const text = input.replace(/\s+/g, " ").trim();
  if (!text) return null;
  const f = fold(text);
  if (REJECTED.test(f)) return null;
  const kind: Kind | null = REFUND.test(f) ? "refund" : CARD_PAYMENT.test(f) ? "card_payment" : INCOME.test(f) ? "income" : EXPENSE.test(f) ? "expense" : null;
  const m = AMOUNT.exec(text);
  if (!kind || !m) return null;
  const currency = /^us/i.test(m[1]) ? "USD" : m[1].toUpperCase() === "CLP" ? "CLP" : defaultCurrency;
  const amount = parseAmount(`${m[1]}${m[2]}`, currency);
  if (!amount || amount <= 0n) return null;

  // Comercio: «... en LIDER EXPRESS ...»; contraparte de transferencias: «... a Juan Pérez» / «... de Empresa SpA».
  const after = text.slice((m.index ?? 0) + m[0].length);
  const merchant = cleanName(/\ben\s+(.+)/i.exec(after)?.[1])
    ?? cleanName(/\ben\s+([A-Z0-9][^\n]+)/.exec(text)?.[1])
    ?? (kind === "expense" || kind === "income" ? cleanName(/\b(?:a|de|desde)\s+([A-ZÁÉÍÓÚÑ][^\n]+)/.exec(after)?.[1]) : null);
  const mask = /(?:tarjeta|cuenta|terminada en|terminacion)[^\d]{0,25}(\d{4})\b/i.exec(text)?.[1] ?? null;

  let confidence = 0.6;
  if (merchant) confidence += 0.2;
  if (/(compra|abono|transferencia|pago|cargo|recibiste|enviaste)/.test(f)) confidence += 0.15;
  const label = { expense: "Gasto", income: "Ingreso", refund: "Devolución", card_payment: "Pago de tarjeta", own_transfer: "Transferencia", reversal: "Reverso" }[kind];
  return {
    kind, amountMinor: amount.toString(), currency, merchant, accountMask: mask ? `••••${mask}` : null,
    description: merchant ?? `${label}: ${text.slice(0, 80)}`, confidence: Math.min(1, confidence),
  };
}
