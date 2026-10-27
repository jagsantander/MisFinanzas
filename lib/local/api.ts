"use client";
/**
 * «Servidor» dentro del navegador: atiende las rutas /api/* que usan las pantallas, sobre los datos
 * locales (que se sincronizan con la planilla). Todo el cálculo de totales, presupuestos y alertas
 * se hace con código, sin IA.
 */
import { CATEGORY_ICONS } from "../categories/defaults";
import { formatMoney, formatPercent, parseAmount, SUPPORTED_CURRENCIES } from "../money";
import { computeTotals } from "../movements/totals";
import { ruleMatches } from "../movements/rules";
import { daysRemaining, periodByKey, periodForDate, shiftPeriod, todayIn, type Period } from "../period";
import { getState, mutate, newId, nowIso, saveSettings } from "./store";
import type { Budget, Category, Change, Kind, Movement, Notice, Rule } from "./types";

export class LocalApiError extends Error {
  constructor(message: string, public status = 400, public code?: string, public data?: unknown) { super(message); }
}
const fail = (msg: string, status = 400, code?: string, data?: unknown): never => { throw new LocalApiError(msg, status, code, data); };

const KINDS: Kind[] = ["expense", "income", "own_transfer", "card_payment", "refund", "reversal"];
const live = <T extends { deletedAt?: string | null }>(xs: T[]) => xs.filter((x) => !x.deletedAt);
const T = () => getState().tables;
const S = () => getState().settings;

// ───────────────────────── Presupuestos ─────────────────────────

export type BudgetStatus = {
  budgetId: string; scope: "total" | "category" | "subcategory"; categoryId: string | null; subcategoryId: string | null;
  limit: bigint; spent: bigint; available: bigint; excess: bigint; pctTenths: number; level: "ok" | "near" | "reached" | "exceeded"; isOverride: boolean; active: boolean;
};

/** Categorías y subcategorías siempre en orden alfabético (sin distinguir mayúsculas ni tildes). */
const byName = (x: { name: string }, y: { name: string }) => x.name.localeCompare(y.name, "es", { sensitivity: "base" });

function levelFor(spent: bigint, limit: bigint, thresholds: number[]): BudgetStatus["level"] {
  if (limit <= 0n) return spent > 0n ? "exceeded" : "ok";
  if (spent > limit) return "exceeded";
  if (spent === limit) return "reached";
  const near = Math.min(...thresholds.filter((t) => t < 100), 100);
  return spent * 100n >= limit * BigInt(near) ? "near" : "ok";
}

function periodMovements(p: Period) {
  return live(T().movements).filter((m) => m.occurredOn >= p.start && m.occurredOn < p.end);
}

export function budgetStatuses(periodKey?: string) {
  const s = S();
  const period = periodKey ? periodByKey(periodKey, s.monthStartDay) : periodForDate(todayIn(s.timezone), s.monthStartDay);
  const totals = computeTotals(periodMovements(period), s.currency);
  const overrides = live(T().overrides).filter((o) => o.periodKey === period.key);
  const statuses: BudgetStatus[] = live(T().budgets).map((b) => {
    const ov = overrides.find((o) => o.budgetId === b.id);
    const limit = BigInt(ov ? ov.amountMinor : b.amountMinor);
    const raw = b.scopeKey === "total" ? totals.expense : b.subcategoryId ? (totals.bySubcategory.get(b.subcategoryId) ?? 0n) : (totals.byCategory.get(b.categoryId!) ?? 0n);
    const spent = raw < 0n ? 0n : raw;
    return {
      budgetId: b.id, scope: b.scopeKey === "total" ? "total" : b.subcategoryId ? "subcategory" : "category", categoryId: b.categoryId, subcategoryId: b.subcategoryId,
      limit, spent, available: limit > spent ? limit - spent : 0n, excess: spent > limit ? spent - limit : 0n,
      pctTenths: limit > 0n ? Number((spent * 1000n) / limit) : 0, level: levelFor(spent, limit, s.budgetThresholds), isOverride: Boolean(ov), active: b.active,
    };
  });
  return { period, statuses, totals, daysRemaining: daysRemaining(period, todayIn(s.timezone)) };
}

/**
 * Avisos de presupuesto del período actual. Los ids son deterministas (iguales a los del script),
 * así que no se duplican entre dispositivos ni con la actualización nocturna.
 */
export function evaluateBudgetAlerts() {
  const s = S();
  const { period, statuses } = budgetStatuses();
  const known = new Set(T().alertStates.map((a) => a.id));
  const cats = T().categories;
  const nameOf = (id: string | null) => cats.find((c) => c.id === id)?.name ?? "";
  const states: { id: string; budgetId: string; periodKey: string; threshold: number; updatedAt: string }[] = [];
  const notices: Notice[] = [];
  for (const b of statuses) {
    if (!b.active || b.limit <= 0n) continue;
    const crossed = s.budgetThresholds.filter((t) => b.spent * 100n >= b.limit * BigInt(t));
    if (b.spent > b.limit) crossed.push(101);
    const fresh = crossed.filter((t) => !known.has(`${b.budgetId}:${period.key}:${t}`));
    if (!fresh.length) continue;
    const now = nowIso();
    fresh.forEach((t) => states.push({ id: `${b.budgetId}:${period.key}:${t}`, budgetId: b.budgetId, periodKey: period.key, threshold: t, updatedAt: now }));
    const top = Math.max(...fresh);
    const name = b.scope === "total" ? "Gasto total" : b.subcategoryId ? `${nameOf(b.categoryId)} › ${nameOf(b.subcategoryId)}` : nameOf(b.categoryId);
    const detail = `${name} · ${formatMoney(b.spent, s.currency)} de ${formatMoney(b.limit, s.currency)} · ${formatPercent(b.spent, b.limit)} utilizado`;
    const id = `budget:${b.budgetId}:${period.key}:${top}`;
    if (T().notifications.some((n) => n.id === id)) continue;
    notices.push({
      id, type: "budget", severity: top >= 100 ? "danger" : "warning",
      title: top === 101 ? `Presupuesto excedido: ${name}` : top >= 100 ? `Límite alcanzado: ${name}` : `Cerca del límite: ${name}`,
      body: top === 101 ? `${detail} · Excedido en ${formatMoney(b.excess, s.currency)}` : detail,
      link: "/categorias?vista=presupuestos", readAt: null, createdAt: now, updatedAt: now, emailStatus: "skip",
    });
  }
  mutate("alertStates", states);
  mutate("notifications", notices);
}

// ───────────────────────── Movimientos ─────────────────────────

function logChange(movementId: string, action: string, changes?: Change["changes"]) {
  mutate("changes", [{ id: newId(), movementId, actor: "user", action, changes: changes ?? null, createdAt: nowIso(), updatedAt: nowIso() }]);
}

function getMovement(id: string) {
  return T().movements.find((m) => m.id === id) ?? fail("Movimiento no encontrado", 404);
}

function assertCategoryPair(categoryId: string | null, subcategoryId: string | null, kind?: "expense" | "income") {
  if (!categoryId) { if (subcategoryId) fail("Subcategoría sin categoría"); return null; }
  const cats = live(T().categories);
  const cat = cats.find((c) => c.id === categoryId && !c.parentId) ?? fail("Categoría no encontrada");
  if (kind && cat.kind !== kind) fail("La categoría no corresponde al tipo de movimiento");
  if (subcategoryId && !cats.some((c) => c.id === subcategoryId && c.parentId === categoryId)) fail("Subcategoría no corresponde a la categoría");
  return cat;
}

const EDITABLE = ["kind", "amountMinor", "currency", "occurredOn", "occurredTime", "description", "merchant", "accountMask", "categoryId", "subcategoryId", "notes", "excluded", "status"] as const;

/** Edición manual: registra cambios y BLOQUEA los campos tocados (la sincronización no los sobrescribe). */
function updateByUser(id: string, patch: Partial<Movement>) {
  const m = getMovement(id);
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const next: Movement = { ...m };
  for (const k of EDITABLE) {
    if (!(k in patch)) continue;
    const nv = patch[k];
    if (String(nv ?? "") !== String(m[k] ?? "")) { changes[k] = { from: m[k] ?? null, to: nv ?? null }; (next as Record<string, unknown>)[k] = nv; }
  }
  if (!Object.keys(changes).length) return m;
  const locked = new Set(m.lockedFields ?? []);
  Object.keys(changes).forEach((k) => locked.add(k === "subcategoryId" ? "categoryId" : k));
  if ("categoryId" in changes || "subcategoryId" in changes) { next.categorySource = "manual"; next.ruleId = null; }
  next.lockedFields = [...locked];
  next.updatedAt = nowIso();
  mutate("movements", [next]);
  logChange(id, "edit", changes);
  return next;
}

type Filters = Record<string, string | undefined>;
function filterMovements(f: Filters) {
  const like = f.q?.toLowerCase();
  return T().movements.filter((m) => {
    if (f.deleted ? !m.deletedAt : m.deletedAt) return false;
    if (f.from && m.occurredOn < f.from) return false;
    if (f.to && m.occurredOn >= f.to) return false;
    if (f.kind && m.kind !== f.kind) return false;
    if (f.type === "ingresos" && m.kind !== "income") return false;
    if (f.type === "gastos" && !["expense", "refund", "reversal"].includes(m.kind)) return false;
    if (f.categoryId && m.categoryId !== f.categoryId) return false;
    if (f.subcategoryId && m.subcategoryId !== f.subcategoryId) return false;
    if (f.account && m.accountMask !== f.account) return false;
    if (f.source && m.source !== f.source) return false;
    if (f.revision === "pendiente" && m.status !== "review") return false;
    if (f.revision === "revisado" && !m.reviewedAt) return false;
    if (like && ![m.description, m.merchant, m.counterparty, m.notes, m.bank].some((v) => v?.toLowerCase().includes(like))) return false;
    return true;
  }).sort((a, b) => (a.occurredOn === b.occurredOn ? String(b.occurredTime ?? "").localeCompare(String(a.occurredTime ?? "")) || b.createdAt.localeCompare(a.createdAt) : b.occurredOn.localeCompare(a.occurredOn)));
}

function parseMoney(text: unknown, currency: string) {
  const a = typeof text === "string" ? parseAmount(text, currency) : null;
  if (a === null || a <= 0n) fail("Monto inválido");
  return a!.toString();
}

// ───────────────────────── Router ─────────────────────────

type Req = { method: string; path: string[]; query: Filters; body: any };

export async function localApi(url: string, opts: { method?: string; body?: unknown } = {}) {
  const u = new URL(url, "http://local");
  const req: Req = {
    method: (opts.method ?? (opts.body !== undefined ? "POST" : "GET")).toUpperCase(),
    path: u.pathname.replace(/^\/api\//, "").split("/").filter(Boolean),
    query: Object.fromEntries(u.searchParams),
    body: opts.body ?? {},
  };
  return JSON.parse(JSON.stringify(route(req), (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
}

function route({ method, path, query, body }: Req): unknown {
  const [a, b, c] = path;
  const s = S();
  switch (a) {
    case "me": {
      if (method === "PATCH") { void saveSettings(body); return { ok: true }; }
      const st = getState();
      return {
        user: { ...s, email: st.account ?? "", onboardingCompleted: s.onboardingDone, emailVerified: true },
        unread: T().notifications.filter((n) => !n.readAt).length,
        connected: Boolean(st.connection),
      };
    }

    case "dashboard": {
      const key = query.period ?? periodForDate(todayIn(s.timezone), s.monthStartDay).key;
      const { period, statuses, totals, daysRemaining: days } = budgetStatuses(key);
      const prev = shiftPeriod(key, -1, s.monthStartDay);
      const prevTotals = computeTotals(periodMovements(prev), s.currency);
      const cats = T().categories.filter((x) => !x.deletedAt);
      const catRow = (cat: Category, map: Map<string, bigint>, prevMap: Map<string, bigint>) => ({
        id: cat.id, name: cat.name, icon: cat.icon, color: cat.color, kind: cat.kind, archived: Boolean(cat.archivedAt),
        amount: map.get(cat.id) ?? 0n, previous: prevMap.get(cat.id) ?? 0n,
        budget: statuses.find((x) => x.scope === "category" && x.categoryId === cat.id) ?? null,
        subs: cats.filter((x) => x.parentId === cat.id).sort(byName).map((x) => ({ id: x.id, name: x.name, amount: totals.bySubcategory.get(x.id) ?? 0n, budget: statuses.find((y) => y.scope === "subcategory" && y.subcategoryId === x.id) ?? null })),
      });
      const parents = cats.filter((x) => !x.parentId).sort(byName);
      const assigned = [...totals.byCategory.entries()].filter(([id]) => parents.some((p) => p.id === id && p.kind === "expense")).reduce((acc, [, v]) => acc + v, 0n);
      const auto = getState().automation;
      const lr = auto?.lastRun;
      return {
        period, previousPeriod: prev, daysRemaining: days,
        totals: { income: totals.income, expense: totals.expense, balance: totals.balance, otherCurrencies: totals.otherCurrencies },
        previousTotals: { income: prevTotals.income, expense: prevTotals.expense },
        uncategorizedExpense: totals.expense - assigned,
        expenseCategories: parents.filter((x) => x.kind === "expense").map((x) => catRow(x, totals.byCategory, prevTotals.byCategory)),
        incomeCategories: parents.filter((x) => x.kind === "income").map((x) => catRow(x, totals.byCategory, prevTotals.byCategory)),
        totalBudget: statuses.find((x) => x.scope === "total") ?? null,
        alerts: statuses.filter((x) => x.active && x.level !== "ok"),
        latest: filterMovements({}).slice(0, 5),
        reviewCount: live(T().movements).filter((m) => m.status === "review" && !m.excluded).length,
        automation: auto ? { status: auto.status, mode: auto.mode, nextRunAt: auto.nextRunAt, pausedReason: auto.pausedReason,
          lastRun: lr ? { status: lr.status, finishedAt: lr.finishedAt, createdAt: lr.finishedAt, movementsCreated: lr.created, movementsReview: lr.review, error: lr.error } : null } : null,
        currency: s.currency, name: s.name,
      };
    }

    case "categories": {
      if (!b) {
        if (method === "GET") return { categories: T().categories.filter((x) => !x.deletedAt && (query.archived === "1" || !x.archivedAt)).sort(byName), icons: CATEGORY_ICONS };
        const name = String(body.name ?? "").trim();
        if (name.length < 2 || name.length > 40) fail("El nombre debe tener entre 2 y 40 caracteres");
        if (!["expense", "income"].includes(body.kind)) fail("Tipo inválido");
        if (body.parentId) { const p = live(T().categories).find((x) => x.id === body.parentId && !x.parentId) ?? fail("Categoría principal no encontrada"); if (p.kind !== body.kind) fail("La subcategoría debe ser del mismo tipo"); }
        const cat: Category = { id: newId(), kind: body.kind, parentId: body.parentId ?? null, name, icon: CATEGORY_ICONS.includes(body.icon) ? body.icon : "dots",
          color: /^#[0-9a-f]{6}$/i.test(body.color) ? body.color : "#0f7d70", sortOrder: T().categories.length + 1, archivedAt: null, updatedAt: nowIso() };
        mutate("categories", [cat]);
        return { ok: true, category: cat };
      }
      const cat = T().categories.find((x) => x.id === b && !x.deletedAt) ?? fail("Categoría no encontrada", 404);
      if (method === "PATCH") {
        const next = { ...cat, updatedAt: nowIso() };
        if (body.name !== undefined) { const n = String(body.name).trim(); if (n.length < 2 || n.length > 40) fail("Nombre inválido"); next.name = n; }
        if (body.icon !== undefined && CATEGORY_ICONS.includes(body.icon)) next.icon = body.icon;
        if (body.color !== undefined && /^#[0-9a-f]{6}$/i.test(body.color)) next.color = body.color;
        if (body.archived !== undefined) next.archivedAt = body.archived ? nowIso() : null;
        mutate("categories", [next]);
        return { ok: true, category: next };
      }
      if (method === "DELETE") {
        const used = live(T().movements).filter((m) => (cat.parentId ? m.subcategoryId === cat.id : m.categoryId === cat.id || m.subcategoryId === cat.id));
        if (used.length && !query.reassignTo) fail(`Esta categoría tiene ${used.length} movimientos. Elige a qué categoría reasignarlos.`, 409, "needs_reassign", { count: used.length });
        const now = nowIso();
        if (used.length) {
          const target = live(T().categories).find((x) => x.id === query.reassignTo) ?? fail("Categoría de destino inválida");
          if (target.id === cat.id || target.kind !== cat.kind) fail("Categoría de destino inválida");
          const newCat = target.parentId ?? target.id, newSub = target.parentId ? target.id : null;
          mutate("movements", used.map((m) => ({ ...m, categoryId: newCat, subcategoryId: newSub, categorySource: "manual" as const, updatedAt: now })));
          used.forEach((m) => logChange(m.id, "category_reassigned", { categoryId: { from: m.categoryId, to: newCat } }));
        }
        const gone = (id: string | null) => id === cat.id || T().categories.some((x) => x.id === id && x.parentId === cat.id);
        mutate("rules", T().rules.filter((r) => !r.deletedAt && (gone(r.categoryId) || gone(r.subcategoryId))).map((r) => ({ ...r, deletedAt: now, updatedAt: now })));
        mutate("budgets", T().budgets.filter((x) => !x.deletedAt && (gone(x.categoryId) || gone(x.subcategoryId))).map((x) => ({ ...x, deletedAt: now, updatedAt: now })));
        mutate("categories", T().categories.filter((x) => x.id === cat.id || x.parentId === cat.id).map((x) => ({ ...x, deletedAt: now, updatedAt: now })));
        evaluateBudgetAlerts();
        return { ok: true };
      }
      break;
    }

    case "movements": {
      if (!b) {
        if (method === "GET") {
          const rows = filterMovements(query);
          const limit = Math.min(Number(query.limit ?? 500), 2000);
          const t = computeTotals(rows, s.currency);
          return { movements: rows.slice(0, limit), totals: { income: t.income, expense: t.expense, balance: t.balance, reviewCount: t.reviewCount, otherCurrencies: t.otherCurrencies },
            accounts: [...new Set(rows.map((r) => r.accountMask).filter(Boolean))], truncated: rows.length > limit };
        }
        if (!KINDS.includes(body.kind)) fail("Tipo inválido");
        const currency = SUPPORTED_CURRENCIES.includes(body.currency) ? body.currency : s.currency;
        const amountMinor = parseMoney(body.amount, currency);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(body.occurredOn ?? "")) fail("Fecha inválida");
        const description = String(body.description ?? "").trim();
        if (!description) fail("Agrega una descripción");
        assertCategoryPair(body.categoryId ?? null, body.subcategoryId ?? null);
        const now = nowIso();
        const m: Movement = {
          id: newId(), kind: body.kind, status: "confirmed", amountMinor, currency, occurredOn: body.occurredOn, occurredTime: body.occurredTime || null,
          description: description.slice(0, 300), merchant: body.merchant || null, accountMask: body.accountMask || null,
          categoryId: body.categoryId ?? null, subcategoryId: body.subcategoryId ?? null, categorySource: body.categoryId ? "manual" : "none",
          notes: body.notes || null, reviewedAt: now, excluded: false, source: "manual", lockedFields: body.categoryId ? ["categoryId"] : [],
          deletedAt: null, createdAt: now, updatedAt: now,
        };
        mutate("movements", [m]);
        logChange(m.id, "created");
        evaluateBudgetAlerts();
        return { ok: true, movement: m };
      }
      if (b === "bulk") return bulkReclassify(body);
      const m = getMovement(b);
      if (c === "restore") { mutate("movements", [{ ...m, deletedAt: null, updatedAt: nowIso() }]); logChange(m.id, "restored"); evaluateBudgetAlerts(); return { ok: true }; }
      if (c === "merge") {
        const into = getMovement(body.intoId);
        if (into.id === m.id) fail("No se puede fusionar consigo mismo");
        mutate("movements", [{ ...m, deletedAt: nowIso(), possibleDuplicateOf: into.id, updatedAt: nowIso() }]);
        logChange(m.id, "merged_into", { mergedInto: { from: null, to: into.id } });
        logChange(into.id, "merged_from", { mergedFrom: { from: null, to: m.id } });
        evaluateBudgetAlerts();
        return { ok: true };
      }
      if (method === "GET") {
        const st = getState();
        const byId = (id?: string | null) => (id ? T().movements.find((x) => x.id === id) ?? null : null);
        return {
          movement: m,
          changes: T().changes.filter((x) => x.movementId === m.id).sort((x, y) => y.createdAt.localeCompare(x.createdAt)),
          sources: m.sourceMessageId ? [{ messageId: m.sourceMessageId, receivedAt: m.receivedAt ?? null }] : [],
          connection: m.source === "email" ? { provider: "gmail", account: st.automation?.snapshot?.mailAccount ?? st.account ?? "" } : null,
          rule: m.ruleId ? (T().rules.find((r) => r.id === m.ruleId) ?? null) : null,
          related: byId(m.relatedMovementId), duplicateOf: byId(m.possibleDuplicateOf),
        };
      }
      if (method === "DELETE") { mutate("movements", [{ ...m, deletedAt: nowIso(), updatedAt: nowIso() }]); logChange(m.id, "deleted"); evaluateBudgetAlerts(); return { ok: true }; }
      if (method === "PATCH") {
        if (m.deletedAt) fail("Movimiento no encontrado", 404);
        const patch: Partial<Movement> = {};
        for (const k of ["kind", "currency", "occurredOn", "occurredTime", "description", "merchant", "accountMask", "notes", "excluded"] as const) if (k in body) (patch as Record<string, unknown>)[k] = body[k];
        if (patch.kind && !KINDS.includes(patch.kind)) fail("Tipo inválido");
        if (body.amount !== undefined) patch.amountMinor = parseMoney(body.amount, body.currency ?? m.currency);
        if ("categoryId" in body || "subcategoryId" in body) {
          const cat = body.categoryId !== undefined ? body.categoryId : m.categoryId;
          const sub = body.subcategoryId !== undefined ? body.subcategoryId : body.categoryId !== undefined && body.categoryId !== m.categoryId ? null : m.subcategoryId;
          assertCategoryPair(cat, sub);
          patch.categoryId = cat; patch.subcategoryId = sub;
        }
        let updated = updateByUser(m.id, patch);
        if (body.reviewed && updated.status !== "confirmed") {
          updated = { ...updated, status: "confirmed", reviewedAt: nowIso(), reviewReason: null, updatedAt: nowIso() };
          mutate("movements", [updated]);
          logChange(m.id, "reviewed");
        }
        evaluateBudgetAlerts();
        return { ok: true, movement: updated };
      }
      break;
    }

    case "budgets": {
      if (!b) {
        if (method === "GET") {
          const r = budgetStatuses(query.period);
          return { period: r.period, statuses: r.statuses, daysRemaining: r.daysRemaining, totalExpense: r.totals.expense, thresholds: s.budgetThresholds };
        }
        const amountMinor = parseMoney(body.amount, s.currency);
        let scopeKey = "total", categoryId: string | null = null, subcategoryId: string | null = null;
        if (body.scope !== "total") {
          assertCategoryPair(body.categoryId, body.scope === "subcategory" ? body.subcategoryId : null);
          categoryId = body.categoryId;
          if (body.scope === "subcategory") { if (!body.subcategoryId) fail("Falta la subcategoría"); subcategoryId = body.subcategoryId; scopeKey = `sub:${subcategoryId}`; }
          else scopeKey = `cat:${categoryId}`;
        }
        const existing = live(T().budgets).find((x) => x.scopeKey === scopeKey);
        const rec: Budget = { id: existing?.id ?? newId(), scopeKey, categoryId, subcategoryId, amountMinor, currency: s.currency, active: body.active !== false, updatedAt: nowIso() };
        mutate("budgets", [rec]);
        evaluateBudgetAlerts();
        return { ok: true, budget: rec };
      }
      const bud = live(T().budgets).find((x) => x.id === b) ?? fail("Presupuesto no encontrado", 404);
      if (c === "override") {
        const ov = live(T().overrides).find((o) => o.budgetId === bud.id && o.periodKey === body.periodKey);
        if (body.amount === null) { if (ov) mutate("overrides", [{ ...ov, deletedAt: nowIso(), updatedAt: nowIso() }]); }
        else mutate("overrides", [{ id: ov?.id ?? `${bud.id}:${body.periodKey}`, budgetId: bud.id, periodKey: String(body.periodKey), amountMinor: parseMoney(body.amount, bud.currency), updatedAt: nowIso() }]);
        evaluateBudgetAlerts();
        return { ok: true };
      }
      if (method === "PATCH") { mutate("budgets", [{ ...bud, active: Boolean(body.active), updatedAt: nowIso() }]); evaluateBudgetAlerts(); return { ok: true }; }
      if (method === "DELETE") { mutate("budgets", [{ ...bud, deletedAt: nowIso(), updatedAt: nowIso() }]); return { ok: true }; }
      break;
    }

    case "rules": {
      if (!b) {
        if (method === "GET") return { rules: live(T().rules).sort((x, y) => x.priority - y.priority) };
        const rule = validateRule({ id: newId(), priority: Math.max(0, ...live(T().rules).map((r) => r.priority)) + 10, active: true, ...body });
        mutate("rules", [rule]);
        return { ok: true, rule };
      }
      if (b === "reorder") {
        const ids: string[] = body.ids ?? [];
        mutate("rules", ids.map((id, i) => { const r = T().rules.find((x) => x.id === id) ?? fail("Regla no encontrada"); return { ...r, priority: (i + 1) * 10, updatedAt: nowIso() }; }));
        return { ok: true };
      }
      const rule = live(T().rules).find((r) => r.id === b) ?? fail("Regla no encontrada", 404);
      if (method === "DELETE") { mutate("rules", [{ ...rule, deletedAt: nowIso(), updatedAt: nowIso() }]); return { ok: true }; }
      const next = validateRule({ ...rule, ...body });
      mutate("rules", [next]);
      return { ok: true, rule: next };
    }

    case "notifications": {
      if (b === "read") {
        const ids: string[] | undefined = body.ids;
        mutate("notifications", T().notifications.filter((n) => !n.readAt && (!ids || ids.includes(n.id))).map((n) => ({ ...n, readAt: nowIso(), updatedAt: nowIso() })));
        return { ok: true };
      }
      return { notifications: [...T().notifications].sort((x, y) => y.createdAt.localeCompare(x.createdAt)).slice(0, 100) };
    }
  }
  return fail("Ruta no encontrada", 404);
}

function validateRule(r: Rule & Record<string, unknown>): Rule {
  const name = String(r.name ?? "").trim();
  if (name.length < 2 || name.length > 80) fail("El nombre debe tener entre 2 y 80 caracteres");
  const c = r.conditions ?? {};
  const conditions = Object.fromEntries(Object.entries(c).filter(([k, v]) => ["merchantContains", "senderContains", "descriptionContains", "accountMask", "kind"].includes(k) && v).map(([k, v]) => [k, String(v).slice(0, 60)]));
  if (!Object.keys(conditions).length) fail("Define al menos un criterio");
  assertCategoryPair(r.categoryId, r.subcategoryId ?? null);
  return { id: r.id, priority: r.priority, name, conditions, categoryId: r.categoryId, subcategoryId: r.subcategoryId ?? null, active: r.active !== false, updatedAt: nowIso() };
}

/** Reclasificación con alcance y vista previa (las correcciones manuales de otros movimientos se respetan). */
function bulkReclassify(body: any) {
  assertCategoryPair(body.categoryId, body.subcategoryId ?? null);
  const m = getMovement(body.movementId);
  const conditions = body.conditions ?? { merchantContains: m.merchant ?? undefined, kind: m.kind === "income" ? "income" : "expense" };
  if (body.scope !== "only" && !Object.values(conditions).some(Boolean)) fail("Define al menos un criterio para los movimientos similares");
  let affected: Movement[] = [m];
  if (body.scope === "similar" || (body.scope === "rule" && body.applyToExisting)) {
    const probe = { id: "preview", priority: 0, active: true, conditions, categoryId: body.categoryId, subcategoryId: body.subcategoryId };
    affected = live(T().movements).filter((x) => x.id === m.id || ((x.kind === "expense" || x.kind === "income") && ruleMatches(probe, { ...x, senderDomain: x.senderDomain ?? null, counterparty: x.counterparty ?? null })));
  }
  const willChange = affected.filter((x) => x.id === m.id || !(x.lockedFields ?? []).includes("categoryId"));
  const skippedManual = affected.length - willChange.length;
  if (body.dryRun) return { preview: willChange.slice(0, 200), count: willChange.length, skippedManual };
  willChange.forEach((x) => updateByUser(x.id, { categoryId: body.categoryId, subcategoryId: body.subcategoryId ?? null }));
  let ruleId: string | null = null;
  if (body.scope === "rule") {
    const rule = validateRule({ id: newId(), priority: Math.max(0, ...live(T().rules).map((r) => r.priority)) + 10, active: true,
      name: conditions.merchantContains ? `Comercio contiene “${conditions.merchantContains}”` : "Regla personalizada", conditions, categoryId: body.categoryId, subcategoryId: body.subcategoryId ?? null, updatedAt: "" });
    mutate("rules", [rule]);
    ruleId = rule.id;
  }
  evaluateBudgetAlerts();
  return { ok: true, updated: willChange.length, skippedManual, ruleId };
}

/** Exporta los movimientos (con los filtros aplicados) a CSV, Excel o PDF. */
export async function exportData(format: "csv" | "xlsx" | "pdf", filters: Filters = {}) {
  const { downloadBlob, exportRows, toCsv, toPdf, toXlsx } = await import("../export");
  const stamp = new Date().toISOString().slice(0, 10);
  const rows = filterMovements(filters).reverse();
  const cats = T().categories;
  const data = exportRows(rows, (id) => cats.find((c) => c.id === id)?.name ?? "");
  if (format === "pdf") downloadBlob(await toPdf(data, `MiSaldo · movimientos al ${stamp}`), "application/pdf", `misaldo-movimientos-${stamp}.pdf`);
  else if (format === "xlsx") downloadBlob(await toXlsx(data), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `misfinanzas-movimientos-${stamp}.xlsx`);
  else downloadBlob(toCsv(data), "text/csv;charset=utf-8", `misfinanzas-movimientos-${stamp}.csv`);
}
