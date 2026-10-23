import { DateTime } from "luxon";

/**
 * Período mensual según el día de inicio configurado (1–28; 29–31 se ajusta al último día del mes).
 * Fechas como "YYYY-MM-DD" en la zona del usuario. periodKey = "YYYY-MM" del mes en que inicia.
 */
export type Period = { key: string; start: string; end: string; label: string };

function startFor(year: number, month: number, day: number) {
  const base = DateTime.fromObject({ year, month, day: 1 });
  return base.set({ day: Math.min(day, base.daysInMonth!) });
}

export function periodForDate(isoDate: string, startDay: number): Period {
  const d = DateTime.fromISO(isoDate);
  let s = startFor(d.year, d.month, startDay);
  if (d < s) { const p = d.minus({ months: 1 }); s = startFor(p.year, p.month, startDay); }
  return build(s, startDay);
}

export function periodByKey(key: string, startDay: number): Period {
  const [y, m] = key.split("-").map(Number);
  return build(startFor(y, m, startDay), startDay);
}

function build(s: DateTime, startDay: number): Period {
  const n = s.plus({ months: 1 });
  const e = startFor(n.year, n.month, startDay); // exclusivo
  const label = startDay === 1
    ? capitalize(s.setLocale("es").toFormat("LLLL yyyy"))
    : `${s.setLocale("es").toFormat("d LLL")} – ${e.minus({ days: 1 }).setLocale("es").toFormat("d LLL yyyy")}`;
  return { key: s.toFormat("yyyy-MM"), start: s.toISODate()!, end: e.toISODate()!, label };
}

export function shiftPeriod(key: string, delta: number, startDay: number): Period {
  const [y, m] = key.split("-").map(Number);
  const d = DateTime.fromObject({ year: y, month: m, day: 1 }).plus({ months: delta });
  return periodByKey(d.toFormat("yyyy-MM"), startDay);
}

export function todayIn(tz: string): string {
  return DateTime.now().setZone(tz).toISODate()!;
}

export function daysRemaining(period: Period, today: string): number {
  const t = DateTime.fromISO(today), e = DateTime.fromISO(period.end);
  if (t >= e) return 0;
  return Math.max(0, Math.round(e.diff(t, "days").days));
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
