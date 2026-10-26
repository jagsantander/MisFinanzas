"use client";
import { DEFAULT_EXPENSE, DEFAULT_INCOME } from "../categories/defaults";
import { idbClear, idbGet, idbSet } from "./idb";
import { callScript, ScriptError } from "./script";
import {
  DEFAULT_SETTINGS, isScript, isSheets, SYNCED_TABLES, type AutomationView, type Category, type Connection, type ScriptConnection, type Settings,
  type SheetsConnection, type TableName, type Tables,
} from "./types";
import { currentToken, forgetToken, GoogleAuthError, requestToken, SCRIPT_SCOPES } from "../google/auth";
import { accountEmail, createSpreadsheet, findSpreadsheet, pushChanges, readAll, writeSettings } from "../google/sheets";
import { installScript, savedScriptConnection, ScriptSetupError } from "../google/appsScript";
import { getDeviceAi } from "../ai/receipt";

/**
 * Estado de la app en el navegador (local primero):
 * - Todo se guarda en IndexedDB y funciona sin conexión.
 * - Si hay una planilla conectada, los cambios se envían en segundo plano y se reciben los de la
 *   actualización nocturna y de otros dispositivos (gana la versión más reciente de cada registro).
 * - La planilla puede estar conectada de dos formas: directo con Google (la app usa la API de Sheets) o
 *   con el script de Apps Script (necesario para la lectura nocturna de Gmail).
 */
export type Pending = { table: TableName; record: { id: string; updatedAt: string } & Record<string, unknown> };
export type State = {
  loaded: boolean; tables: Tables; settings: Settings; automation: AutomationView | null; connection: Connection | null;
  account: string | null; lastSyncAt: string | null; pending: Pending[]; syncing: boolean; syncError: string | null;
  /** Ajustes cambiados aquí que aún no llegan a la planilla (conexión directa con Google). */
  settingsPending: boolean;
  /** Conexión directa con Google sin permiso vigente: hay que tocar «Sincronizar con Google». */
  needsGoogle: boolean;
  /** Script recién instalado por la app que espera el permiso de Gmail del usuario («Activar lectura de correos»). */
  scriptSetup: ScriptConnection | null;
};

const emptyTables = (): Tables => ({ movements: [], categories: [], rules: [], budgets: [], overrides: [], alertStates: [], notifications: [], changes: [], runs: [] });
let state: State = { loaded: false, tables: emptyTables(), settings: DEFAULT_SETTINGS, automation: null, connection: null, account: null, lastSyncAt: null, pending: [], syncing: false, syncError: null, settingsPending: false, needsGoogle: false, scriptSetup: null };
const listeners = new Set<() => void>();
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let initPromise: Promise<void> | null = null;

export const getState = () => state;
export function subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
function emit() { listeners.forEach((f) => f()); }
function set(patch: Partial<State>) { state = { ...state, ...patch }; emit(); void persist(); }

async function persist() {
  const { tables, settings, automation, connection, account, lastSyncAt, pending, settingsPending, scriptSetup } = state;
  await idbSet("state", { tables, settings, automation, connection, account, lastSyncAt, pending, settingsPending, scriptSetup });
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
    state = { ...next, loaded: true, syncing: false, needsGoogle: false };
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

/** Combina lo leído de la planilla con lo pendiente de este dispositivo (gana el updatedAt más reciente). */
function withPending(remote: Tables, pending: Pending[]): Tables {
  const tables = { ...emptyTables(), ...remote };
  for (const p of pending) {
    const list = tables[p.table] as Pending["record"][];
    const i = list.findIndex((x) => x.id === p.record.id);
    if (i < 0) list.push(p.record); else if (String(list[i].updatedAt) < p.record.updatedAt) list[i] = p.record;
  }
  return tables;
}

/** Envía lo pendiente y trae lo último de la planilla. */
export async function sync() {
  const conn = state.connection;
  if (!conn || state.syncing) return;
  if (isSheets(conn)) return syncSheets(conn);
  set({ syncing: true });
  try {
    const sending = state.pending;
    if (sending.length) {
      for (let i = 0; i < sending.length; i += 500) await callScript(conn, "push", { changes: sending.slice(i, i + 500) });
      set({ pending: state.pending.filter((p) => !sending.includes(p)) });
    }
    const data = await callScript<{ tables: Tables; settings: Settings; automation: AutomationView }>(conn, "pull");
    const tables = withPending(data.tables, state.pending);
    set({ tables, settings: { ...DEFAULT_SETTINGS, ...data.settings }, automation: data.automation, account: data.automation?.account ?? state.account, lastSyncAt: nowIso(), syncError: null, syncing: false });
  } catch (e) {
    set({ syncing: false, syncError: (e as Error).message });
  }
}

/** Sincronización directa con Google Sheets. Sin permiso vigente no abre ventanas: avisa con needsGoogle. */
async function syncSheets(conn: SheetsConnection) {
  const token = currentToken();
  if (!token) { set({ needsGoogle: true }); return; }
  set({ syncing: true });
  try {
    const remote = await readAll(token, conn.spreadsheetId);
    const sending = state.pending;
    if (sending.length) {
      await pushChanges(token, conn.spreadsheetId, remote, sending);
      set({ pending: state.pending.filter((p) => !sending.includes(p)) });
    }
    const wroteSettings = state.settingsPending || !remote.settings;
    if (wroteSettings) {
      await writeSettings(token, conn.spreadsheetId, state.settings);
      set({ settingsPending: false });
    }
    const tables = withPending(withPending(remote.tables, sending), state.pending);
    // Los ajustes de este dispositivo ganan si se acaban de subir o si cambiaron durante la sincronización.
    const settings = wroteSettings || state.settingsPending ? state.settings : { ...DEFAULT_SETTINGS, ...remote.settings };
    set({ tables, settings, lastSyncAt: nowIso(), syncError: null, syncing: false, needsGoogle: false });
  } catch (e) {
    if (e instanceof GoogleAuthError) { forgetToken(); set({ syncing: false, needsGoogle: true }); return; }
    set({ syncing: false, syncError: (e as Error).message });
  }
}

/** Renueva el permiso de Google (desde un toque) y sincroniza. */
export async function resumeGoogle() {
  const conn = state.connection;
  if (!isSheets(conn)) return;
  await requestToken({ hint: conn.email });
  set({ needsGoogle: false });
  await sync();
  if (state.syncError) throw new Error(state.syncError);
}

/**
 * «Continuar con Google»: pide permiso, busca la planilla de MiSaldo de esa cuenta (o la crea) y la conecta.
 * Si la planilla no tiene datos, sube los de este dispositivo; si ya tiene, se usan los de la planilla.
 */
export async function connectGoogle() {
  const token = await requestToken({ prompt: "select_account" });
  const email = await accountEmail(token);
  const id = (await findSpreadsheet(token))?.id ?? (await createSpreadsheet(token));
  // Si en otro dispositivo ya se activó la lectura de correos, este se conecta al mismo script, sin pasos extra.
  const saved = await savedScriptConnection(token, id).catch(() => null);
  if (saved) {
    try { await callScript(saved, "ping", {}, 30_000); await connect(saved); return; } catch { /* sigue con la conexión directa */ }
  }
  const remote = await readAll(token, id);
  const local = state.tables;
  const localHasData = local.movements.length + local.budgets.length + local.rules.length > 0;
  const remoteHasData = remote.tables.movements.length + remote.tables.budgets.length + remote.tables.rules.length > 0;
  let pending: Pending[] = [];
  let tables = emptyTables();
  if (!remoteHasData && (localHasData || remote.tables.categories.length === 0)) {
    const now = nowIso();
    const keep = new Set(local.categories.map((c) => c.id));
    const drop = remote.tables.categories.filter((c) => !keep.has(c.id)).map((c) => ({ table: "categories" as const, record: { ...c, deletedAt: now, updatedAt: now } }));
    pending = [...drop, ...SYNCED_TABLES.flatMap((t) => (local[t] as Pending["record"][]).map((record) => ({ table: t, record: { ...record, updatedAt: now } })))];
    tables = local;
  }
  const settings = remote.settings ? { ...DEFAULT_SETTINGS, ...remote.settings, onboardingDone: Boolean(remote.settings.onboardingDone || state.settings.onboardingDone) } : state.settings;
  set({ connection: { kind: "sheets", spreadsheetId: id, email }, account: email, automation: null, pending, tables, settings, settingsPending: !remote.settings, needsGoogle: false, syncError: null });
  await sync();
  if (state.syncError) throw new Error(state.syncError);
}

/**
 * Conecta la planilla. Si la planilla está vacía y este navegador ya tiene datos, los sube
 * (reemplazando las categorías iniciales de la planilla). Si la planilla ya tiene datos, se usan esos.
 */
export async function connect(conn: ScriptConnection) {
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
  // Al pasar de la conexión directa con Google al script (misma planilla), no se pierde lo pendiente.
  if (isSheets(state.connection)) pending = [...pending, ...state.pending];
  // Planilla recién creada: conserva las preferencias elegidas en este dispositivo.
  if (!remote.settings?.onboardingDone && !remote.settings?.name) await callScript(conn, "saveSettings", { settings: state.settings });
  set({ connection: conn, account: ping.account, pending, settingsPending: false, needsGoogle: false, ...(localHasData && !remoteHasData ? {} : { tables: emptyTables() }) });
  await sync();
  if (state.syncError) throw new ScriptError(state.syncError);
}

export function disconnect() {
  if (isSheets(state.connection)) forgetToken();
  set({ connection: null, pending: [], automation: null, account: null, syncError: null, settingsPending: false, needsGoogle: false, scriptSetup: null });
}

/**
 * «Activar lectura de correos», paso 1 (desde un toque): MiSaldo instala el script en la planilla del usuario y lo
 * implementa como aplicación web. Queda esperando el permiso de Gmail (paso 2), que el usuario da en Google.
 */
export async function startGmailSetup() {
  const conn = state.connection;
  if (!isSheets(conn)) throw new Error("Conecta primero tu planilla con «Continuar con Google»");
  const token = currentToken(SCRIPT_SCOPES) ?? await requestToken({ scopes: SCRIPT_SCOPES, hint: conn.email });
  try {
    set({ scriptSetup: await installScript(token, conn.spreadsheetId) });
  } catch (e) {
    if (e instanceof ScriptSetupError && e.code === "expired") forgetToken();
    throw e;
  }
}

/**
 * Paso 2, al volver de la pantalla de permisos de Google: si el script ya responde, la app pasa a usarlo
 * (misma planilla, sin perder lo pendiente), deja la actualización en modo manual y reutiliza la clave de Gemini
 * de este dispositivo, si la hay.
 */
export async function finishGmailSetup() {
  const conn = state.scriptSetup;
  if (!conn) return;
  try {
    await callScript(conn, "ping", {}, 30_000);
  } catch (e) {
    if (e instanceof ScriptError && e.code === "unauthorized") { set({ scriptSetup: null }); throw new ScriptError("El script de tu planilla no reconoció este dispositivo. Pulsa «Activar lectura de correos» otra vez.", "unauthorized"); }
    throw new ScriptError("Aún no llega el permiso de Google. Pulsa «Dar permiso a Gmail» y termina con «Permitir».", "needs_auth");
  }
  await connect(conn);
  set({ scriptSetup: null });
  try {
    if (state.automation?.mode === "none" || !state.automation) await script("setPrefs", { mode: "manual" });
    const ai = await getDeviceAi();
    if (ai && !state.automation?.hasAiKey) {
      await script("setAiKey", { provider: "gemini", apiKey: ai.key });
      await script("setAi", { model: ai.model });
    }
  } catch { /* se puede completar en «Correos del banco» */ }
}

export function cancelGmailSetup() { set({ scriptSetup: null }); }

/** «Actualizar»: lee ahora los correos nuevos desde la actualización anterior. */
export async function updateFromGmail() {
  return script<{ run: { movementsCreated: number; movementsReview: number; messagesAnalyzed: number; messagesFailed: number; duplicatesSkipped: number; note: string | null; error: string | null; status: string } }>("runNow", {}, 360_000);
}

/** Borra todos los datos de este dispositivo (la planilla no se toca). */
export async function forgetDevice() {
  await idbClear();
  try { localStorage.removeItem("mf-theme"); } catch { /* sin almacenamiento */ }
}

export async function saveSettings(patch: Partial<Settings>) {
  const settings = { ...state.settings, ...patch };
  set({ settings });
  if (isSheets(state.connection)) { set({ settingsPending: true }); schedulePush(); return; }
  if (state.connection) {
    try { await callScript(state.connection, "saveSettings", { settings }); } catch (e) { set({ syncError: (e as Error).message }); throw e; }
  }
}

/** Acción del script (IA, actualización nocturna). Actualiza el estado si la respuesta trae la automatización. */
export async function script<T = any>(action: string, payload: Record<string, unknown> = {}, timeoutMs?: number): Promise<T> {
  if (!state.connection) throw new ScriptError("Conecta tu planilla primero", "not_connected");
  if (!isScript(state.connection)) throw new ScriptError("Esta función necesita el script de tu planilla (Actualización nocturna)", "no_script");
  const res = await callScript<T & { automation?: AutomationView }>(state.connection, action, payload, timeoutMs);
  if (res.automation) set({ automation: res.automation });
  // Acciones que agregan datos en la planilla (p. ej. «Ejecutar ahora»): traerlos de inmediato.
  if (['runNow', 'approve', 'resume'].includes(action)) await sync();
  return res;
}
