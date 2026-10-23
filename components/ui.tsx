"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { formatMoney } from "@/lib/money";

/* ── Toasts con acción (p. ej. Deshacer) ── */
type Toast = { id: number; text: string; action?: { label: string; run: () => void } };
const ToastCtx = createContext<(t: Omit<Toast, "id">) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((t: Omit<Toast, "id">) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ ...t, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), t.action ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toast-wrap" aria-live="polite">
        {toast && (
          <div className="toast" role="status">
            <span className="grow">{toast.text}</span>
            {toast.action && <button onClick={() => { toast.action!.run(); setToast(null); }}>{toast.action.label}</button>}
          </div>
        )}
      </div>
    </ToastCtx.Provider>
  );
}

/* ── Hoja inferior / diálogo accesible ── */
export function Sheet({ open, onClose, title, children, labelledBy }: { open: boolean; onClose: () => void; title: string; children: ReactNode; labelledBy?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; prev?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  const id = labelledBy ?? "sheet-title";
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="grip" aria-hidden />
        <div className="row between" style={{ marginBottom: 8 }}>
          <h2 id={id} style={{ margin: 0, fontSize: 20 }}>{title}</h2>
          <button className="btn ghost sm" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── Confirmación ── */
export function ConfirmSheet({ open, title, body, confirmLabel, danger, onConfirm, onClose, busy }: { open: boolean; title: string; body: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void; busy?: boolean }) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="stack">
        <div>{body}</div>
        <button className={`btn block ${danger ? "danger" : "primary"}`} onClick={onConfirm} disabled={busy}>{busy ? "Procesando…" : confirmLabel}</button>
        <button className="btn block" onClick={onClose}>Cancelar</button>
      </div>
    </Sheet>
  );
}

/* ── Estados ── */
export function Loading({ rows = 3, height = 64 }: { rows?: number; height?: number }) {
  return (
    <div className="stack" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="skeleton" style={{ height }} />)}
    </div>
  );
}
export function ErrorState({ error, retry }: { error: { message: string } | null; retry?: () => void }) {
  return (
    <div className="notice danger" role="alert">
      <Icon name="alert" />
      <div className="grow">
        <p><strong>No pudimos cargar la información.</strong></p>
        <p className="small">{error?.message}</p>
        {retry && <button className="link-btn" onClick={retry}>Reintentar</button>}
      </div>
    </div>
  );
}
export function Empty({ icon = "info", title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <h3>{title}</h3>
      {children}
    </div>
  );
}
export function Notice({ tone = "info", icon, children }: { tone?: "info" | "warn" | "danger" | "ok"; icon?: string; children: ReactNode }) {
  return (
    <div className={`notice ${tone === "info" ? "" : tone}`} role={tone === "danger" ? "alert" : undefined}>
      <Icon name={icon ?? (tone === "ok" ? "check" : tone === "info" ? "info" : "alert")} />
      <div className="grow">{children}</div>
    </div>
  );
}

/* ── Dinero ── */
export function Money({ minor, currency = "CLP", sign, className = "" }: { minor: string | bigint | number; currency?: string; sign?: string; className?: string }) {
  const txt = formatMoney(BigInt(minor), currency);
  return <span className={`amount ${className}`}>{sign && BigInt(minor) !== 0n ? sign : ""}{txt}</span>;
}

/* ── Icono de categoría ── */
export function CatIcon({ icon, color, small }: { icon: string; color: string; small?: boolean }) {
  return (
    <span className={`ico${small ? " sm" : ""}`} style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>
      <Icon name={icon} />
    </span>
  );
}

/* ── Interruptor accesible ── */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <span className="switch">
      <input type="checkbox" role="switch" aria-checked={checked} aria-label={label} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </span>
  );
}

/* ── Barra de presupuesto: color + texto + icono ── */
export function BudgetBar({ pctTenths, level }: { pctTenths: number; level: string }) {
  const pct = Math.min(pctTenths / 10, 100);
  return (
    <div className={`bar ${level}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pctTenths / 10)} aria-label="Porcentaje utilizado">
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}
export const LEVEL: Record<string, { label: string; tone: string; icon: string }> = {
  ok: { label: "Dentro del límite", tone: "ok", icon: "check" },
  near: { label: "Cerca del límite", tone: "warn", icon: "alert" },
  reached: { label: "Límite alcanzado", tone: "danger", icon: "alert" },
  exceeded: { label: "Excedido", tone: "danger", icon: "alert" },
};
export function pctText(tenths: number) {
  return `${Math.floor(tenths / 10)},${tenths % 10}%`;
}

/* ── Donut ── */
export function Donut({ parts, center, label }: { parts: { value: number; color: string; name: string }[]; center: ReactNode; label: string }) {
  const total = parts.reduce((a, p) => a + Math.max(p.value, 0), 0);
  const r = 70, c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div style={{ position: "relative", width: 180, height: 180, flex: "none" }}>
      <svg viewBox="0 0 180 180" width="180" height="180" role="img" aria-label={label}>
        <circle cx="90" cy="90" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="26" />
        {total > 0 && parts.filter((p) => p.value > 0).map((p, i) => {
          const len = (p.value / total) * c;
          const el = <circle key={i} cx="90" cy="90" r={r} fill="none" stroke={p.color} strokeWidth="26" strokeDasharray={`${Math.max(len - 2, 0.5)} ${c}`} strokeDashoffset={-acc} transform="rotate(-90 90 90)" />;
          acc += len;
          return el;
        })}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>{center}</div>
    </div>
  );
}
