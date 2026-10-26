/**
 * Formato de las hojas de la planilla, idéntico al del script (apps-script/Code.gs: TABLES, MOV_HEADERS,
 * movementRow_, upsert_). Así la app puede escribir directo con la API de Sheets y el script opcional de
 * lectura nocturna sigue entendiendo la misma planilla.
 */
import { CURRENCY_DIGITS } from "../money";
import type { Movement, Settings, TableName, Tables } from "../local/types";

export const SHEET_TABLES: Record<TableName, string> = {
  movements: "Movimientos", categories: "Categorías", rules: "Reglas", budgets: "Presupuestos", overrides: "Excepciones",
  alertStates: "EstadosAlerta", notifications: "Avisos", changes: "Cambios", runs: "Ejecuciones",
};
/** Hojas que crea el script y que la app no lee, pero crea para que la planilla quede completa. */
export const EXTRA_SHEETS: Record<string, string[]> = {
  Correos: ["Id", "Actualizado", "Eliminado", "Datos"],
  Instrucciones: ["Versión", "Estado", "Generada", "Aprobada", "Aprobada por", "Hash configuración", "Hash texto", "Modalidad", "Texto"],
};
/** Ajustes de la app cuando no hay script (el script los guarda en sus propiedades). */
export const SETTINGS_SHEET = "Ajustes";
export const SETTINGS_HEADERS = ["Clave", "Valor"];

export const GENERIC_HEADERS = ["Id", "Actualizado", "Eliminado", "Datos"];
export const MOV_HEADERS = ["Id", "Fecha", "Hora", "Tipo", "Estado", "Monto", "Moneda", "Descripción", "Comercio", "Categoría", "Subcategoría",
  "Cuenta", "Banco", "Origen", "Excluido", "Notas", "Id operación", "Id correo", "Actualizado", "Eliminado", "Datos"];

const KIND_LABEL: Record<string, string> = { expense: "Gasto", income: "Ingreso", own_transfer: "Transferencia propia", card_payment: "Pago de tarjeta", refund: "Devolución", reversal: "Reverso" };
const SOURCE_LABEL: Record<string, string> = { email: "Correo", notification: "Notificación", shared: "Compartido", shortcut: "Atajo", statement: "Cartola" };
const STATUS_LABEL: Record<string, string> = { confirmed: "Confirmado", review: "Por revisar", pending: "Pendiente" };

export type Cell = string | number;
type Rec = { id: string; updatedAt?: string; deletedAt?: string | null } & Record<string, unknown>;

export const headersFor = (table: TableName) => (table === "movements" ? MOV_HEADERS : GENERIC_HEADERS);
const updatedCol = (table: TableName) => (table === "movements" ? 18 : 1);

export function movementRow(m: Movement, cats: Record<string, string>, now: string): Cell[] {
  const digits = CURRENCY_DIGITS[m.currency] ?? 2;
  const amount = Number(m.amountMinor) / 10 ** digits;
  const signed = m.kind === "expense" ? -amount : amount;
  return [m.id, m.occurredOn, m.occurredTime || "", KIND_LABEL[m.kind] || m.kind, STATUS_LABEL[m.status] || m.status,
    signed, m.currency, m.description || "", m.merchant || m.counterparty || "", (m.categoryId && cats[m.categoryId]) || "", (m.subcategoryId && cats[m.subcategoryId]) || "",
    m.accountMask || "", m.bank || "", SOURCE_LABEL[m.source] ?? "Manual", m.excluded ? "sí" : "", m.notes || "",
    m.operationRef || "", m.sourceMessageId || "", m.updatedAt || now, m.deletedAt ? "sí" : "", JSON.stringify(m)];
}

export function recordRow(table: TableName, r: Rec, cats: Record<string, string>, now: string): Cell[] {
  return table === "movements" ? movementRow(r as unknown as Movement, cats, now) : [r.id, r.updatedAt || now, r.deletedAt ? "sí" : "", JSON.stringify(r)];
}

/** Filas de una hoja (sin encabezado) → registros, con su número de fila en la hoja (1 = encabezado). */
export function parseTable(table: TableName, rows: unknown[][]): { records: Rec[]; index: Map<string, { row: number; updatedAt: string }> } {
  const width = headersFor(table).length;
  const records: Rec[] = [];
  const index = new Map<string, { row: number; updatedAt: string }>();
  rows.forEach((row, i) => {
    const id = row[0];
    if (id) index.set(String(id), { row: i + 2, updatedAt: String(row[updatedCol(table)] ?? "") });
    const json = row[width - 1];
    if (!json) return;
    try { records.push(JSON.parse(String(json))); } catch { /* fila editada a mano: se ignora, igual que el script */ }
  });
  return { records, index };
}

export function parseSettings(rows: unknown[][]): Partial<Settings> | null {
  const row = rows.find((r) => r[0] === "settings");
  if (!row?.[1]) return null;
  try { return JSON.parse(String(row[1])); } catch { return null; }
}

export type PlannedWrites = { updates: { table: TableName; row: number; values: Cell[] }[]; appends: { table: TableName; values: Cell[] }[] };

/**
 * Qué escribir para subir los cambios pendientes: gana la versión con updatedAt más reciente
 * (last-write-wins), igual que upsert_ del script.
 */
export function planWrites(
  index: Partial<Record<TableName, Map<string, { row: number; updatedAt: string }>>>,
  pending: { table: TableName; record: Rec }[],
  cats: Record<string, string>,
  now: string,
): PlannedWrites {
  const out: PlannedWrites = { updates: [], appends: [] };
  const seen = new Map<string, number>(); // tabla:id → posición en appends (un registro repetido se escribe una vez)
  for (const { table, record } of pending) {
    const cur = index[table]?.get(record.id);
    if (cur && String(record.updatedAt || "") <= cur.updatedAt) continue;
    const values = recordRow(table, record, cats, now);
    const key = `${table}:${record.id}`;
    if (cur) out.updates.push({ table, row: cur.row, values });
    else if (seen.has(key)) out.appends[seen.get(key)!] = { table, values };
    else { seen.set(key, out.appends.length); out.appends.push({ table, values }); }
  }
  return out;
}

/** Nombres de categoría por id (para las columnas legibles de Movimientos). */
export function categoryNames(tables: Pick<Tables, "categories">, extra: { table: TableName; record: Rec }[] = []) {
  const map: Record<string, string> = {};
  for (const c of tables.categories) map[c.id] = c.name;
  for (const p of extra) if (p.table === "categories") map[p.record.id] = String(p.record.name ?? "");
  return map;
}
