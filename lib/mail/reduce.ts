/**
 * Minimización de datos antes de enviar un correo a la IA:
 * - solo texto (sin HTML, imágenes ni adjuntos);
 * - sin enlaces (no se abren ni se envían);
 * - números largos (tarjetas/cuentas) enmascarados dejando 4 dígitos;
 * - RUT enmascarado; direcciones de correo ocultas;
 * - longitud acotada.
 */
export const MAX_EMAIL_CHARS = 6000;

export function reduceEmailText(text: string, max = MAX_EMAIL_CHARS): string {
  let s = text
    .replace(/https?:\/\/\S+/gi, "[enlace omitido]")
    .replace(/www\.\S+/gi, "[enlace omitido]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[correo omitido]")
    .replace(/\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/g, "[RUT omitido]")
    .replace(/\b(?:\d[ -]?){8,19}\b/g, (m) => {
      const d = m.replace(/\D/g, "");
      return d.length >= 8 ? `••••${d.slice(-4)}` : m;
    });
  // Quita líneas típicas de pie de página/legales que no aportan al movimiento.
  s = s.split("\n").filter((l) => !/^(este correo|no responda|para dejar de recibir|aviso legal|confidencial)/i.test(l.trim())).join("\n");
  s = s.replace(/[ \t ]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
  return s.length > max ? s.slice(0, max) + "\n[texto truncado]" : s;
}

const BANK_DOMAINS = [
  "bancochile.cl", "bancoedwards.cl", "santander.cl", "bci.cl", "bancoestado.cl", "scotiabank.cl", "itau.cl", "bancofalabella.cl",
  "bancoripley.cl", "security.cl", "bice.cl", "consorcio.cl", "bancointernacional.cl", "coopeuch.cl", "tenpo.cl", "machbank.cl",
  "mercadopago.com", "mercadopago.cl", "paypal.com", "cmrfalabella.com", "lider.cl", "tapp.cl", "chek.cl", "fintual.com", "racional.cl",
];
const KEYWORDS = /(compra|transferencia|abono|cargo|pago|comprobante|devoluci[oó]n|reverso|transacci[oó]n|giro|dep[oó]sito|movimiento|tarjeta|cuenta corriente|cuenta vista|boleta|factura|suscripci[oó]n|cobro|rechaz)/i;

export function senderDomain(from: string): string {
  const m = from.match(/@([A-Za-z0-9.-]+)/);
  return (m?.[1] ?? "").toLowerCase();
}

/** Preselección barata (sin IA) de correos posiblemente financieros. */
export function looksFinancial(meta: { from: string; subject: string }, extraSenders: string[] = []): boolean {
  const dom = senderDomain(meta.from);
  const fromLower = meta.from.toLowerCase();
  const senders = [...BANK_DOMAINS, ...extraSenders.map((s) => s.toLowerCase())];
  if (senders.some((d) => dom === d || dom.endsWith("." + d) || fromLower.includes(d))) return true;
  return KEYWORDS.test(meta.subject);
}
