"use client";
import { Icon } from "./Icon";

/** Selector de mes (período según el día de inicio configurado). */
export function PeriodPicker({ label, onPrev, onNext, canNext = true }: { label: string; onPrev: () => void; onNext: () => void; canNext?: boolean }) {
  return (
    <div className="card row" style={{ padding: 4, gap: 0, borderRadius: 14 }}>
      <button className="btn ghost sm" onClick={onPrev} aria-label="Mes anterior"><Icon name="chevronLeft" /></button>
      <span style={{ fontWeight: 700, minWidth: 120, textAlign: "center" }} aria-live="polite">{label}</span>
      <button className="btn ghost sm" onClick={onNext} aria-label="Mes siguiente" disabled={!canNext}><Icon name="chevronRight" /></button>
    </div>
  );
}

export function shiftKey(key: string, delta: number) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
