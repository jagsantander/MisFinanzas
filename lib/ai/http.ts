import { AiError } from "./types";

export async function aiFetch(url: string, init: RequestInit & { timeoutMs?: number }): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 60_000);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new AiError("Tiempo de espera agotado con el proveedor de IA", "timeout");
    throw new AiError("No se pudo contactar al proveedor de IA", "unavailable");
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let body: unknown = null;
  try { body = JSON.parse(text); } catch { /* respuesta no JSON */ }
  if (!res.ok) {
    const msg = extractMessage(body) ?? `HTTP ${res.status}`;
    const lower = msg.toLowerCase();
    if (res.status === 401 || res.status === 403) throw new AiError(`Credencial rechazada por el proveedor: ${msg}`, "auth", res.status);
    if (res.status === 402 || lower.includes("quota") || lower.includes("insufficient") || lower.includes("credit balance") || lower.includes("billing"))
      throw new AiError(`Saldo o cuota agotada en la cuenta del proveedor: ${msg}`, "quota", res.status);
    if (res.status === 429) throw new AiError(`Límite de solicitudes del proveedor: ${msg}`, "rate_limit", res.status);
    if (res.status >= 500 || res.status === 529) throw new AiError(`Proveedor no disponible: ${msg}`, "unavailable", res.status);
    throw new AiError(`Solicitud rechazada: ${msg}`, "invalid_request", res.status);
  }
  return body;
}

function extractMessage(body: unknown): string | null {
  const b = body as { error?: { message?: string } | string; message?: string } | null;
  if (!b) return null;
  if (typeof b.error === "string") return b.error.slice(0, 200);
  return (b.error?.message ?? b.message ?? null)?.slice(0, 200) ?? null;
}

export function parseJsonOutput(text: string | undefined | null): unknown {
  if (!text) throw new AiError("El proveedor no devolvió contenido", "bad_output");
  try { return JSON.parse(text); } catch { throw new AiError("La respuesta de la IA no es JSON válido", "bad_output"); }
}
