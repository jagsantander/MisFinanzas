import type { Movement } from "./local/types";
import { minorToDecimalString } from "./money";

const KIND: Record<string, string> = { expense: "Gasto", income: "Ingreso", own_transfer: "Transferencia propia", card_payment: "Pago de tarjeta", refund: "Devolución", reversal: "Reverso" };
const STATUS: Record<string, string> = { confirmed: "Confirmado", review: "Por revisar", pending: "Pendiente" };

export const EXPORT_HEADERS = ["Fecha", "Hora", "Tipo", "Estado", "Monto", "Moneda", "Descripción", "Comercio/contraparte", "Banco", "Cuenta", "Categoría", "Subcategoría", "Origen", "Clasificación", "Excluido", "Notas", "Id operación"];

export function exportRows(rows: Movement[], catName: (id: string | null | undefined) => string) {
  return rows.map((m) => [
    m.occurredOn, m.occurredTime ?? "", KIND[m.kind] ?? m.kind, STATUS[m.status] ?? m.status,
    // Signo contable: gastos negativos; el resto positivo.
    (m.kind === "expense" ? "-" : "") + minorToDecimalString(BigInt(m.amountMinor), m.currency), m.currency,
    m.description, m.merchant ?? m.counterparty ?? "", m.bank ?? "", m.accountMask ?? "", catName(m.categoryId), catName(m.subcategoryId),
    m.source === "email" ? "Correo" : "Manual", { manual: "Manual", rule: "Regla", ai: "IA", none: "" }[m.categorySource] ?? "",
    m.excluded ? "Sí" : "No", m.notes ?? "", m.operationRef ?? "",
  ]);
}

/** CSV con BOM (Excel en español lo abre bien), separador «;» y protección contra inyección de fórmulas. */
export function toCsv(rows: (string | number)[][]): string {
  const cell = (v: string | number) => {
    let s = String(v);
    if (/^[=+@\t\r]/.test(s) || (/^-/.test(s) && !/^-[\d.]+$/.test(s))) s = "'" + s;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [EXPORT_HEADERS, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
}

export async function toXlsx(rows: (string | number)[][]): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "MiSaldo";
  const ws = wb.addWorksheet("Movimientos");
  ws.addRow(EXPORT_HEADERS).font = { bold: true };
  for (const r of rows) ws.addRow(r.map((v, i) => (i === 4 ? Number(v) : typeof v === "string" && /^[=+@-]/.test(v) ? "'" + v : v)));
  ws.getColumn(5).numFmt = "#,##0.##";
  ws.columns.forEach((c) => { c.width = 16; });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

/** Descarga un archivo generado en el navegador. */
export function downloadBlob(data: BlobPart, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
