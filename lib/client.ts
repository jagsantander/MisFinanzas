"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string, public data?: unknown) { super(message); }
}

/** fetch JSON con manejo uniforme: 401 → entrar, 423 → pantalla de bloqueo. */
export async function api<T = any>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: opts.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  if (res.status === 423 && typeof window !== "undefined") window.dispatchEvent(new Event("mf:locked"));
  if (res.status === 401 && typeof window !== "undefined" && !location.pathname.startsWith("/entrar")) {
    location.href = `/entrar?next=${encodeURIComponent(location.pathname + location.search)}`;
  }
  if (!res.ok) throw new ApiError(data?.error ?? "No se pudo completar la acción", res.status, data?.code, data);
  return data as T;
}

/** Hook de lectura con estados de carga/error y recarga manual. */
export function useApi<T = any>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!url) return;
    const n = ++seq.current;
    setLoading(true);
    try {
      const d = await api<T>(url);
      if (n === seq.current) { setData(d); setError(null); }
    } catch (e) {
      if (n === seq.current) setError(e as ApiError);
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [url]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const h = () => load();
    window.addEventListener("mf:refresh", h);
    return () => window.removeEventListener("mf:refresh", h);
  }, [load]);
  return { data, error, loading, reload: load, setData };
}

export const refreshAll = () => window.dispatchEvent(new Event("mf:refresh"));

const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
export function fmtDate(iso: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  if (!iso) return "—";
  const d = typeof iso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + "T12:00:00") : new Date(iso);
  return d.toLocaleDateString("es-CL", opts);
}
export function fmtDateTime(iso: string | Date | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  const today = new Date();
  const time = d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return `hoy, ${time}`;
  const y = new Date(today); y.setDate(today.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `ayer, ${time}`;
  const t = new Date(today); t.setDate(today.getDate() + 1);
  if (d.toDateString() === t.toDateString()) return `mañana, ${time}`;
  return `${d.toLocaleDateString("es-CL", { day: "numeric", month: "short" })}, ${time}`;
}
export function fmtRelative(iso: string | Date) {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return "recién";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}
export function dayHeading(iso: string) {
  const d = new Date(iso + "T12:00:00");
  const today = new Date();
  const label = d.toLocaleDateString("es-CL", { day: "numeric", month: "long" });
  if (d.toDateString() === today.toDateString()) return `Hoy, ${label}`;
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `Ayer, ${label}`;
  return d.getFullYear() === today.getFullYear() ? label : `${label} de ${d.getFullYear()}`;
}

export const KIND_LABEL: Record<string, string> = { expense: "Gasto", income: "Ingreso", own_transfer: "Transferencia propia", card_payment: "Pago de tarjeta", refund: "Devolución", reversal: "Reverso" };
export const AUTOMATION_STATUS: Record<string, { label: string; tone: string }> = {
  pending_approval: { label: "Pendiente de validación", tone: "warn" },
  active: { label: "Activa", tone: "ok" },
  paused: { label: "Pausada", tone: "info" },
  error: { label: "Con error", tone: "danger" },
  cancelled: { label: "Cancelada", tone: "info" },
};
export const RUN_STATUS: Record<string, { label: string; tone: string }> = {
  queued: { label: "En cola", tone: "info" }, running: { label: "En curso", tone: "info" }, succeeded: { label: "Completada", tone: "ok" },
  partial: { label: "Parcial", tone: "warn" }, failed: { label: "Fallida", tone: "danger" }, blocked: { label: "Bloqueada", tone: "warn" },
};

/** Signo y color de un movimiento según su tipo. */
export function movementTone(kind: string): { sign: string; cls: string } {
  if (kind === "income") return { sign: "+", cls: "income" };
  if (kind === "expense") return { sign: "-", cls: "expense" };
  if (kind === "refund" || kind === "reversal") return { sign: "+", cls: "income" };
  return { sign: "", cls: "neutral" };
}
