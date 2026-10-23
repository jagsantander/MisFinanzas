/**
 * Precios ESTIMADOS por millón de tokens (USD), para mostrar costos aproximados y aplicar el
 * límite técnico de MisFinanzas. No reemplazan la facturación del proveedor.
 * Ajustables con AI_PRICING_JSON='{"modelo":{"in":1.0,"out":4.0}}'.
 * Si un modelo no está aquí, el costo se muestra como "no disponible" y el límite se aplica por tokens.
 */
const DEFAULTS: Record<string, { in: number; out: number }> = {
  "claude-haiku-5-5": { in: 1, out: 5 },
  "claude-sonnet-5-5": { in: 3, out: 15 },
  "claude-opus-5-5": { in: 5, out: 25 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gpt-4.1-mini": { in: 0.4, out: 1.6 },
  "gemini-2.5-flash": { in: 0.3, out: 2.5 },
};

function table(): Record<string, { in: number; out: number }> {
  try { return { ...DEFAULTS, ...JSON.parse(process.env.AI_PRICING_JSON ?? "{}") }; } catch { return DEFAULTS; }
}

export function priceFor(model: string) {
  const t = table();
  if (t[model]) return t[model];
  const key = Object.keys(t).find((k) => model.startsWith(k));
  return key ? t[key] : null;
}

/** Costo estimado en micro-USD (enteros). null si no hay precio conocido. */
export function estimateCostMicros(model: string, inTok: number | null, outTok: number | null): bigint | null {
  const p = priceFor(model);
  if (!p || inTok == null || outTok == null) return null;
  return BigInt(Math.ceil(inTok * p.in + outTok * p.out)); // (tok/1e6)*USD*1e6 micro = tok*USD
}
