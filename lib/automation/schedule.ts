import { DateTime } from "luxon";

/**
 * Próxima ejecución a la hora local indicada en la zona del usuario, considerando horario de verano.
 * - Si la hora no existe ese día (salto adelante), Luxon la desplaza a la siguiente hora válida.
 * - Si la hora se repite (salto atrás), se usa la primera ocurrencia.
 * La clave del cupo (slotKey) es la FECHA LOCAL: un día local = una ejecución programada como máximo.
 */
export function nextRunAfter(after: Date, time: string, tz: string): { at: Date; slotKey: string } {
  const [h, m] = time.split(":").map(Number);
  const local = DateTime.fromJSDate(after).setZone(tz);
  let day = local.startOf("day");
  for (let i = 0; i < 3; i++) {
    const cand = DateTime.fromObject({ year: day.year, month: day.month, day: day.day, hour: h, minute: m }, { zone: tz });
    if (cand.toMillis() > after.getTime()) return { at: cand.toJSDate(), slotKey: day.toISODate()! };
    day = day.plus({ days: 1 });
  }
  throw new Error("No se pudo calcular la próxima ejecución");
}

export function slotKeyFor(at: Date, tz: string): string {
  return DateTime.fromJSDate(at).setZone(tz).toISODate()!;
}
