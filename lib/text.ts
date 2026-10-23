/** Normaliza para comparar: minúsculas, sin tildes, sin signos, espacios simples. */
export function norm(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Similitud de comercios (Jaccard de tokens) para detectar posibles duplicados. */
export function similarMerchant(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = new Set(norm(a).split(" ").filter((t) => t.length > 1));
  const tb = new Set(norm(b).split(" ").filter((t) => t.length > 1));
  if (!ta.size || !tb.size) return !ta.size && !tb.size;
  const inter = [...ta].filter((t) => tb.has(t)).length;
  return inter / new Set([...ta, ...tb]).size >= 0.5 || norm(a).includes(norm(b)) || norm(b).includes(norm(a));
}
