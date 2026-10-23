import ExcelJS from "exceljs";
import type { Movement } from "./db/schema";
import { minorToDecimalString } from "./money";

const KIND: Record<string, string> = { expense: "Gasto", income: "Ingreso", own_transfer: "Transferencia propia", card_payment: "Pago de tarjeta", refund: "Devolución", reversal: "Reverso" };
const STATUS: Record<string, string> = { confirmed: "Confirmado", review: "Por revisar", pending: "Pendiente" };

export const EXPORT_HEADERS = ["Fecha", "Hora", "Tipo", "Estado", "Monto", "Moneda", "Descripción", "Comercio/contraparte", "Banco", "Cuenta", "Categoría", "Subcategoría", "Origen", "Clasificación", "Excluido", "Notas", "Id operación"];

export function exportRows(rows: Movement[], catName: (id: string | null) => string) {
  return rows.map((m) => [
    m.occurredOn, m.occurredTime ?? "", KIND[m.kind] ?? m.kind, STATUS[m.status] ?? m.status,
    // Signo contable: gastos negativos, ingresos/devoluciones positivos; transferencias propias sin signo.
    (m.kind === "expense" ? "-" : "") + minorToDecimalString(m.amountMinor, m.currency), m.currency,
    m.description, m.merchant ?? m.counterparty ?? "", m.bank ?? "", m.accountMask ?? "", catName(m.categoryId), catName(m.subcategoryId),
    m.source === "email" ? "Correo" : "Manual", { manual: "Manual", rule: "Regla", ai: "IA", none: "" }[m.categorySource] ?? "",
    m.excluded ? "Sí" : "No", m.notes ?? "", m.operationRef ?? "",
  ]);
}

/** CSV RFC 4180 con BOM (Excel en español lo abre bien) y protección contra inyección de fórmulas. */
export function toCsv(rows: (string | number)[][]): string {
  const cell = (v: string | number) => {
    let s = String(v);
    if (/^[=+@\t\r]/.test(s) || (/^-/.test(s) && !/^-[\d.]+$/.test(s))) s = "'" + s;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [EXPORT_HEADERS, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
}

export async function toXlsx(rows: (string | number)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "MisFinanzas";
  const ws = wb.addWorksheet("Movimientos");
  ws.addRow(EXPORT_HEADERS).font = { bold: true };
  for (const r of rows) {
    const row = r.map((v, i) => (i === 4 ? Number(v) : typeof v === "string" && /^[=+@-]/.test(v) && i !== 4 ? "'" + v : v));
    ws.addRow(row);
  }
  ws.getColumn(5).numFmt = "#,##0.##";
  ws.columns.forEach((c) => { c.width = 16; });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
