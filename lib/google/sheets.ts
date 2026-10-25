"use client";
/**
 * La planilla del usuario vía API de Google Drive y Sheets, directo desde el navegador (sin script).
 * Con el permiso drive.file, MiSaldo solo ve los archivos que ella misma creó: la planilla se busca por
 * una marca propia (appProperties), así otro dispositivo encuentra la misma planilla.
 */
import type { Settings, TableName, Tables } from "../local/types";
import {
  categoryNames, EXTRA_SHEETS, headersFor, parseSettings, parseTable, planWrites, SETTINGS_HEADERS, SETTINGS_SHEET, SHEET_TABLES,
  type Cell, type PlannedWrites,
} from "./rows";
import { GoogleAuthError } from "./auth";

const SHEET_MIME = "application/vnd.google-apps.spreadsheet";
const MARK = { key: "misaldo", value: "1" };

export class GoogleApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function g<T = any>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers } });
  } catch {
    throw new GoogleApiError("No se pudo contactar a Google. Revisa tu conexión.", 0);
  }
  if (res.status === 401) throw new GoogleAuthError("El permiso de Google venció", "expired");
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new GoogleApiError(body?.error?.message ? `Google: ${body.error.message}` : `Google respondió con error ${res.status}`, res.status);
  return body as T;
}

export async function accountEmail(token: string): Promise<string> {
  const r = await g<{ email?: string }>(token, "https://www.googleapis.com/oauth2/v3/userinfo");
  return r.email ?? "";
}

/** La planilla de MiSaldo de esta cuenta, si ya existe (creada por la app en otro dispositivo o antes). */
export async function findSpreadsheet(token: string): Promise<{ id: string; name: string } | null> {
  const q = encodeURIComponent(`appProperties has { key='${MARK.key}' and value='${MARK.value}' } and mimeType='${SHEET_MIME}' and trashed=false`);
  const r = await g<{ files: { id: string; name: string }[] }>(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&orderBy=createdTime&pageSize=5`);
  return r.files?.[0] ?? null;
}

/** Crea la planilla «MiSaldo» con todas sus hojas y encabezados. */
export async function createSpreadsheet(token: string): Promise<string> {
  const file = await g<{ id: string }>(token, "https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST", body: JSON.stringify({ name: "MiSaldo", mimeType: SHEET_MIME, appProperties: { [MARK.key]: MARK.value } }),
  });
  await ensureSheets(token, file.id);
  return file.id;
}

type SheetMeta = Record<string, number>; // título → sheetId

async function sheetMeta(token: string, id: string): Promise<SheetMeta> {
  const r = await g<{ sheets: { properties: { sheetId: number; title: string } }[] }>(token, `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties(sheetId,title)`);
  return Object.fromEntries(r.sheets.map((s) => [s.properties.title, s.properties.sheetId]));
}

const allSheets = (): [string, string[]][] => [
  ...(Object.keys(SHEET_TABLES) as TableName[]).map((t) => [SHEET_TABLES[t], headersFor(t)] as [string, string[]]),
  ...Object.entries(EXTRA_SHEETS),
  [SETTINGS_SHEET, SETTINGS_HEADERS],
];

/** Agrega las hojas que falten (con encabezado fijo) y quita la hoja vacía inicial. Idempotente. */
export async function ensureSheets(token: string, id: string): Promise<SheetMeta> {
  let meta = await sheetMeta(token, id);
  const missing = allSheets().filter(([title]) => meta[title] === undefined);
  if (!missing.length) return meta;
  const requests: unknown[] = missing.map(([title]) => ({ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } }));
  const r = await g<{ replies: { addSheet?: { properties: { sheetId: number; title: string } } }[] }>(token, `https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests }) });
  for (const rep of r.replies) if (rep.addSheet) meta[rep.addSheet.properties.title] = rep.addSheet.properties.sheetId;
  const headerRequests: unknown[] = missing.map(([title, headers]) => ({
    updateCells: { start: { sheetId: meta[title], rowIndex: 0, columnIndex: 0 }, rows: [{ values: headers.map((h) => ({ userEnteredValue: { stringValue: h }, userEnteredFormat: { textFormat: { bold: true } } })) }], fields: "userEnteredValue,userEnteredFormat.textFormat.bold" },
  }));
  // La hoja inicial («Hoja 1», «Sheet1») sobra si está vacía y no es de MiSaldo.
  const known = new Set(allSheets().map(([t]) => t));
  for (const [title, sheetId] of Object.entries(meta)) if (!known.has(title) && Object.keys(meta).length > 1 && /^(Hoja|Sheet)\s?1$/.test(title)) headerRequests.push({ deleteSheet: { sheetId } });
  await g(token, `https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: headerRequests }) });
  meta = await sheetMeta(token, id);
  return meta;
}

export type RemoteState = {
  tables: Tables; settings: Partial<Settings> | null;
  index: Partial<Record<TableName, Map<string, { row: number; updatedAt: string }>>>; meta: SheetMeta;
};

/** Lee todas las tablas (con lápidas) y los ajustes en una sola llamada. */
export async function readAll(token: string, id: string, meta?: SheetMeta): Promise<RemoteState> {
  meta ??= await ensureSheets(token, id);
  const tables = Object.keys(SHEET_TABLES) as TableName[];
  const ranges = [...tables.map((t) => SHEET_TABLES[t]), SETTINGS_SHEET].map((title) => `ranges=${encodeURIComponent(`'${title}'!A2:Z`)}`).join("&");
  const r = await g<{ valueRanges: { values?: unknown[][] }[] }>(token, `https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchGet?${ranges}&valueRenderOption=UNFORMATTED_VALUE`);
  const out = {} as Tables;
  const index: RemoteState["index"] = {};
  tables.forEach((t, i) => {
    const parsed = parseTable(t, r.valueRanges[i]?.values ?? []);
    (out as Record<string, unknown>)[t] = parsed.records;
    index[t] = parsed.index;
  });
  return { tables: out, settings: parseSettings(r.valueRanges[tables.length]?.values ?? []), index, meta };
}

const cell = (v: Cell) => (typeof v === "number" ? { userEnteredValue: { numberValue: v } } : { userEnteredValue: { stringValue: v } });

/** Sube los cambios pendientes en una sola operación (actualiza filas existentes y agrega las nuevas). */
export async function pushChanges(token: string, id: string, remote: RemoteState, pending: { table: TableName; record: { id: string; updatedAt: string } & Record<string, unknown> }[]): Promise<number> {
  const writes: PlannedWrites = planWrites(remote.index, pending, categoryNames(remote.tables, pending), new Date().toISOString());
  const requests: unknown[] = [
    ...writes.updates.map((w) => ({ updateCells: { start: { sheetId: remote.meta[SHEET_TABLES[w.table]], rowIndex: w.row - 1, columnIndex: 0 }, rows: [{ values: w.values.map(cell) }], fields: "userEnteredValue" } })),
  ];
  const byTable = new Map<TableName, Cell[][]>();
  for (const a of writes.appends) byTable.set(a.table, [...(byTable.get(a.table) ?? []), a.values]);
  for (const [t, rows] of byTable) requests.push({ appendCells: { sheetId: remote.meta[SHEET_TABLES[t]], rows: rows.map((r) => ({ values: r.map(cell) })), fields: "userEnteredValue" } });
  if (requests.length) await g(token, `https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests }) });
  return writes.updates.length + writes.appends.length;
}

export async function writeSettings(token: string, id: string, settings: Settings) {
  await g(token, `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(`'${SETTINGS_SHEET}'!A2:B2`)}?valueInputOption=RAW`, {
    method: "PUT", body: JSON.stringify({ values: [["settings", JSON.stringify(settings)]] }),
  });
}

export const spreadsheetUrl = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;
