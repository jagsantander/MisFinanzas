"use client";
import { DEFAULT_EXPENSE, DEFAULT_INCOME } from "../categories/defaults";
import { idbClear, idbGet, idbSet } from "./idb";
import { callScript, ScriptError } from "./script";
import {
  DEFAULT_SETTINGS, SYNCED_TABLES, type AutomationView, type Category, type Connection, type Settings, type TableName, type Tables,
} from "./types";

/**
 * Estado de la app en el navegador (local primero):
 * - Todo se guarda en IndexedDB y funciona sin conexión.
 * - Si hay una planilla conectada, los cambios se envían en segundo plano y se reciben los de la
 *   actualización nocturna y de otros dispositivos (gana la versión más reciente de cada registro).
 */
export type Pending = { table: TableName; record: { id: string; updatedAt: string } & Record<string, unknown> };
export type State = {
  loaded: boolean; tables: Tables; settings: Settings; automation: AutomationView | null; connection: Connection | null;
  account: string | null; lastSyncAt: string | null; pending: Pending[]; syncing: boolean; syncError: string | null;
};

const emptyTables = (): Tables => ({ movements: [], categories: [], rules: [], budgets: [], overrides: [], alertStates: [], notifications: [], changes: [], runs: [] });
let state: State = { loaded: false, tables: emptyTables(), settings: DEFAULT_SETTINGS, automation: null, connection: null, account: null, lastSyncAt: null, pending: [], syncing: false, syncError: null };
const listeners = new Set<() => void>();
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let initPromise: Promise<void> | null = null;

export const getState = () => state;
export function subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
function emit() { listeners.forEach((f) => f()); }
function set(patch: Partial<State>) { state = { ...state, ...patch }; emit(); void persist(); }

async function persist() {
  const { tables, settings, automation, connection, account, lastSyncAt, pending } = state;
  await idbSet("state", { tables, settings, automation, connection, account, lastSyncAt, pending });
}

export const nowIso = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();

function defaultCategories(): Category[] {
  const out: Category[] = [];
  let order = 0;
  const now = nowIso();
  for (const [kind, list] of [["expense", DEFAULT_EXPENSE], ["income", DEFAULT_INCOME]] as const) {
    for (const c of list) {
      const id = newId();
      out.push({ id, kind, parentId: null, name: c.name, icon: c.icon, color: c.color, sortOrder: order++, archivedAt: null, updatedAt: now });
      (c.subs ?? []).forEach((s, i) => out.push({ id: newId(), kind, parentId: id, name: s, icon: c.icon, color: c.color, sortOrder: i, archivedAt: null, updatedAt: now }));
    }
  }
  return out;
}

export function initStore() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const saved = await idbGet<Partial<State>>("state");
    // Siempre un objeto nuevo: React detecta cambios por referencia.
    let next: State = saved ? { ...state, ...saved, tables: { ...emptyTables(), ...saved.tables }, settings: { ...DEFAULT_SETTINGS, ...saved.settings } } : { ...state };
    if (!next.tables.categories.length && !next.connection) next = { ...next, tables: { ...next.tables, categories: defaultCategories() } };
    state = { ...next, loaded: true, syncing: false };
    emit();
    void persist();
    if (state.connection) void sync();
    if (typeof window !== "undefined") {
      window.addEventListener("focus", () => { if (state.connection) void sync(); });
      setInterval(() => { if (state.connection && document.visibilityState === "visible") void sync(); }, 5 * 60_000);
    }
  })();
  return initPromise;
}

/** Aplica registros nuevos o modificados (con updatedAt) y los deja en cola para la planilla. */
export function mutate(table: TableName, records: Pending["record"][]) {
  if (!records.length) return;
  const list = [...(state.tables[table] as Pending["record"][])];
  for (const r of records) {
    const i = list.findIndex((x) => x.id === r.id);
    if (i >= 0) list[i] = r; else list.push(r);
  }
  const pending = state.connection && SYNCED_TABLES.includes(table)
    ? [...state.pending.filter((p) => !(p.table === table && records.some((r) => r.id === p.record.id))), ...records.map((record) => ({ table, record }))]
    : state.pending;
  set({ tables: { ...state.tables, [table]: list } as Tables, pending });
  schedulePush();
}

function schedulePush() {
  if (!state.connection) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { void sync(); }, 800);
}

/** Envía lo pendiente y trae lo último de la planilla. */
export async function sync() {
  const conn = state.connection;
  if (!conn || state.syncing) return;
  set({ syncing: true });
  try {
    const sending = state.pending;
    if (sending.length) {
      for (let i = 0; i < sending.length; i += 500) await callScript(conn, "push", { changes: sending.slice(i, i + 500) });
      set({ pending: state.pending.filter((p) => !sending.includes(p)) });
    }
    const data = await callScript<{ tables: Tables; settings: Settings; automation: AutomationView }>(conn, "pull");
    const tables = { ...emptyTables(), ...data.tables };
    for (const p of state.pending) {
      const list = tables[p.table] as Pending["record"][];
      const i = list.findIndex((x) => x.id === p.record.id);
      if (i < 0) list.push(p.record); else if (String(list[i].updatedAt) < p.record.updatedAt) list[i] = p.record;
    }
    set({ tables, settings: { ...DEFAULT_SETTINGS, ...data.settings }, automation: data.automation, account: data.automation?.account ?? state.account, lastSyncAt: nowIso(), syncError: null, syncing: false });
  } catch (e) {
    set({ syncing: false, syncError: (e as Error).message });
  }
}

/**
 * Conecta la planilla. Si la planilla está vacía y este navegador ya tiene datos, los sube
 * (reemplazando las categorías iniciales de la planilla). Si la planilla ya tiene datos, se usan esos.
 */
export async function connect(conn: Connection) {
  const ping = await callScript<{ account: string }>(conn, "ping");
  const remote = await callScript<{ tables: Tables; settings: Settings }>(conn, "pull", {}, 90_000);
  const localHasData = state.tables.movements.length + state.tables.budgets.length + state.tables.rules.length > 0;
  const remoteHasData = remote.tables.movements.length + remote.tables.budgets.length + remote.tables.rules.length > 0;
  let pending: Pending[] = [];
  if (localHasData && !remoteHasData) {
    const now = nowIso();
    const keep = new Set(state.tables.categories.map((c) => c.id));
    const drop = remote.tables.categories.filter((c) => !keep.has(c.id)).map((c) => ({ table: "categories" as const, record: { ...c, deletedAt: now, updatedAt: now } }));
    pending = [...drop, ...SYNCED_TABLES.flatMap((t) => (state.tables[t] as Pending["record"][]).map((record) => ({ table: t, record: { ...record, updatedAt: now } })))];
  }
  // Planilla recién creada: conserva las preferencias elegidas en este dispositivo.
  if (!remote.settings?.onboardingDone && !remote.settings?.name) await callScript(conn, "saveSettings", { settings: state.settings });
  set({ connection: conn, account: ping.account, pending, ...(localHasData && !remoteHasData ? {} : { tables: emptyTables() }) });
  await sync();
  if (state.syncError) throw new ScriptError(state.syncError);
}

export function disconnect() {
  set({ connection: null, pending: [], automation: null, account: null, syncError: null });
}

/** Borra todos los datos de este dispositivo (la planilla no se toca). */
export async function forgetDevice() {
  await idbClear();
  try { localStorage.removeItem("mf-theme"); } catch { /* sin almacenamiento */ }
}

export async function saveSettings(patch: Partial<Settings>) {
  const settings = { ...state.settings, ...patch };
  set({ settings });
  if (state.connection) {
    try { await callScript(state.connection, "saveSettings", { settings }); } catch (e) { set({ syncError: (e as Error).message }); throw e; }
  }
}

/** Acción del script (IA, actualización nocturna). Actualiza el estado si la respuesta trae la automatización. */
export async function script<T = any>(action: string, payload: Record<string, unknown> = {}, timeoutMs?: number): Promise<T> {
  if (!state.connection) throw new ScriptError("Conecta tu planilla primero", "not_connected");
  const res = await callScript<T & { automation?: AutomationView }>(state.connection, action, payload, timeoutMs);
  if (res.automation) set({ automation: res.automation });
  // Acciones que agregan datos en la planilla (p. ej. «Ejecutar ahora»): traerlos de inmediato.
  if (['runNow', 'approve', 'resume'].includes(action)) void sync();
  return res;
}
