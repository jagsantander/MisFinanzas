/** Montos exactos: enteros (bigint) en la unidad mínima de cada moneda. Nunca float. */
export const CURRENCY_DIGITS: Record<string, number> = { CLP: 0, USD: 2, EUR: 2, ARS: 2, PEN: 2, MXN: 2, COP: 2, BRL: 2, CLF: 4 };
export const SUPPORTED_CURRENCIES = Object.keys(CURRENCY_DIGITS);

export function digitsFor(currency: string): number {
  return CURRENCY_DIGITS[currency] ?? 2;
}

/**
 * Convierte texto ("$1.650.000", "1650000", "12,50", "US$ 1,234.56") a unidades mínimas.
 * Devuelve null si no es un monto inequívoco.
 */
export function parseAmount(input: string, currency: string): bigint | null {
  if (typeof input !== "string") return null;
  let s = input.trim().replace(/^(CLP|USD|EUR|US\$|\$|CLF|UF)\s*/i, "").replace(/\s|\$/g, "");
  if (s.startsWith("-")) s = s.slice(1);
  if (!/^[0-9.,]+$/.test(s) || !/[0-9]/.test(s)) return null;
  const digits = digitsFor(currency);
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let intPart = s;
  let frac = "";
  if (lastDot >= 0 && lastComma >= 0) {
    const decSep = lastDot > lastComma ? "." : ",";
    const idx = Math.max(lastDot, lastComma);
    intPart = s.slice(0, idx).replace(decSep === "." ? /,/g : /\./g, "");
    if (intPart.includes(decSep)) return null;
    frac = s.slice(idx + 1);
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const parts = s.split(sep);
    const groupsOk = parts.length > 1 && parts.slice(1).every((p) => p.length === 3) && parts[0].length >= 1 && parts[0].length <= 3;
    if (parts.length > 2 && !groupsOk) return null;
    // En es-CL el punto agrupa miles; la coma es decimal.
    if (sep === "." && groupsOk) intPart = parts.join("");
    else if (sep === "," && groupsOk && digits === 0) intPart = parts.join("");
    else if (parts.length === 2) { intPart = parts[0]; frac = parts[1]; }
    else return null;
  }
  if (frac.length > digits) {
    // Fracción con más decimales que la moneda: solo aceptable si son ceros.
    if (/^0+$/.test(frac.slice(digits))) frac = frac.slice(0, digits);
    else return null;
  }
  if (!/^[0-9]+$/.test(intPart || "0")) return null;
  const minor = BigInt(intPart || "0") * 10n ** BigInt(digits) + BigInt((frac + "0".repeat(digits)).slice(0, digits) || "0");
  return minor;
}

export function minorToDecimalString(minor: bigint, currency: string): string {
  const d = digitsFor(currency);
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  if (d === 0) return (neg ? "-" : "") + abs.toString();
  const s = abs.toString().padStart(d + 1, "0");
  return (neg ? "-" : "") + s.slice(0, -d) + "." + s.slice(-d);
}

/** $1.650.000 para CLP; US$12,50 para USD. Formato es-CL. */
export function formatMoney(minor: bigint | string | number, currency = "CLP", opts: { sign?: boolean } = {}): string {
  const m = typeof minor === "bigint" ? minor : BigInt(minor);
  const d = digitsFor(currency);
  const nf = new Intl.NumberFormat("es-CL", {
    style: "currency", currency, minimumFractionDigits: d, maximumFractionDigits: d,
  });
  const abs = m < 0n ? -m : m;
  // Intl acepta cadenas decimales exactas (sin pasar por float).
  const txt = nf.format(minorToDecimalString(abs, currency) as unknown as number);
  if (m < 0n) return "-" + txt;
  return opts.sign && m > 0n ? "+" + txt : txt;
}

/** Porcentaje con una decimal y coma: 106,3% */
export function formatPercent(numerator: bigint, denominator: bigint): string {
  if (denominator === 0n) return "—";
  const tenths = (numerator * 1000n + denominator / 2n) / denominator;
  const s = tenths.toString();
  const intPart = s.length > 1 ? s.slice(0, -1) : "0";
  return `${intPart},${s.slice(-1)}%`;
}

export function percentTenths(numerator: bigint, denominator: bigint): number {
  if (denominator === 0n) return 0;
  return Number((numerator * 1000n) / denominator);
}
