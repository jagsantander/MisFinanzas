"use client";
/**
 * Convierte avisos capturados (notificaciones de Android, texto compartido o pegado, Atajos de iPhone, filas de una
 * cartola) en movimientos. Cada aviso tiene un id estable: si ya se importó (aunque luego se haya eliminado), no se
 * vuelve a crear. Lo que se parece a un movimiento existente queda «Por revisar» en vez de duplicarse.
 */
import { evaluateBudgetAlerts } from "../local/api";
import { getState, mutate, newId, nowIso } from "../local/store";
import { firstMatchingRule } from "../movements/rules";
import { todayIn } from "../period";
import { parseNotice } from "./parse";
import type { Kind, Movement } from "../local/types";

export type CaptureSource = "notification" | "shared" | "shortcut" | "statement";
export type CapturedNotice = { id: string; source: CaptureSource; text: string; app?: string | null; postedAt?: string | null };
/** Movimiento ya interpretado (Atajos de iPhone, cartola leída por la IA). */
export type CapturedMovement = {
  id: string; source: CaptureSource; kind: Kind; amountMinor: string; currency: string; occurredOn?: string | null;
  merchant?: string | null; description: string; accountMask?: string | null; app?: string | null; note?: string | null; confidence?: number;
};
export type ImportResult = { created: number; review: number; skipped: number; unrecognized: number };

const sourceKey = (id: string) => `cap:${id}`;
const fold = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");

function localDate(iso: string | null | undefined, tz: string) {
  if (!iso) return todayIn(tz);
  const d = new Date(iso);
  return isNaN(d.getTime()) ? todayIn(tz) : new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
}

/** ¿Hay ya un movimiento igual (mismo tipo y monto, ±1 día, comercio parecido)? Para no contar dos veces. */
function lookalike(all: Movement[], c: { kind: Kind; amountMinor: string; occurredOn: string; merchant: string | null }) {
  const day = new Date(`${c.occurredOn}T12:00:00Z`).getTime();
  return all.find((m) => !m.deletedAt && m.kind === c.kind && m.amountMinor === c.amountMinor
    && Math.abs(new Date(`${m.occurredOn}T12:00:00Z`).getTime() - day) <= 86_400_000
    && (!c.merchant || !m.merchant || fold(m.merchant).includes(fold(c.merchant).slice(0, 6)) || fold(c.merchant).includes(fold(m.merchant).slice(0, 6))));
}

export function importMovements(items: CapturedMovement[]): ImportResult {
  const st = getState();
  const tz = st.settings.timezone;
  const known = new Set(st.tables.movements.map((m) => m.sourceMessageId).filter(Boolean));
  const rules = st.tables.rules.filter((r) => !r.deletedAt);
  const created: Movement[] = [];
  const res: ImportResult = { created: 0, review: 0, skipped: 0, unrecognized: 0 };
  for (const it of items) {
    if (known.has(sourceKey(it.id))) { res.skipped++; continue; }
    known.add(sourceKey(it.id));
    const occurredOn = it.occurredOn && /^\d{4}-\d{2}-\d{2}$/.test(it.occurredOn) ? it.occurredOn : todayIn(tz);
    const dup = lookalike([...st.tables.movements, ...created], { kind: it.kind, amountMinor: it.amountMinor, occurredOn, merchant: it.merchant ?? null });
    const now = nowIso();
    const base: Movement = {
      id: newId(), kind: it.kind, status: "confirmed", amountMinor: it.amountMinor, currency: it.currency, occurredOn, occurredTime: null,
      description: it.description.slice(0, 300), merchant: it.merchant ?? null, accountMask: it.accountMask ?? null,
      categoryId: null, subcategoryId: null, categorySource: "none", notes: it.note ? it.note.slice(0, 300) : null,
      excluded: false, source: it.source, sourceMessageId: sourceKey(it.id), senderDomain: it.app ?? null, confidence: it.confidence ?? null,
      lockedFields: [], deletedAt: null, createdAt: now, updatedAt: now,
    };
    const rule = it.kind === "expense" || it.kind === "income" ? firstMatchingRule(rules, base) : null;
    if (rule) Object.assign(base, { categoryId: rule.categoryId, subcategoryId: rule.subcategoryId, categorySource: "rule", ruleId: rule.id });
    const reasons: string[] = [];
    if (dup) { reasons.push("Parece repetido con otro movimiento"); base.possibleDuplicateOf = dup.id; }
    if ((it.confidence ?? 1) < 0.75) reasons.push("Lectura automática con poca información: revisa el comercio y el tipo");
    if (reasons.length) { base.status = "review"; base.reviewReason = reasons.join(" · "); res.review++; } else res.created++;
    created.push(base);
  }
  if (created.length) {
    mutate("movements", created);
    mutate("changes", created.map((m) => ({ id: newId(), movementId: m.id, actor: "sync", action: "created", changes: null, createdAt: nowIso(), updatedAt: nowIso() })));
    evaluateBudgetAlerts();
  }
  return res;
}

/** Avisos de texto: se leen con parseNotice; los que no parecen operaciones se cuentan como no reconocidos. */
export function importNotices(items: CapturedNotice[]): ImportResult {
  const st = getState();
  const parsed: CapturedMovement[] = [];
  let unrecognized = 0;
  for (const it of items) {
    const p = parseNotice(it.text, st.settings.currency);
    if (!p) { unrecognized++; continue; }
    parsed.push({ id: it.id, source: it.source, kind: p.kind, amountMinor: p.amountMinor, currency: p.currency, occurredOn: localDate(it.postedAt, st.settings.timezone),
      merchant: p.merchant, description: p.description, accountMask: p.accountMask, app: it.app ?? null, note: it.text, confidence: p.confidence });
  }
  const res = importMovements(parsed);
  return { ...res, unrecognized: res.unrecognized + unrecognized };
}
