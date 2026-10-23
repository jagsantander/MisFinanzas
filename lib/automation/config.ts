import { eq } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import type { AutomationPrefs } from "../db/schema";
import { maskEmail, sha256 } from "../crypto";
import { getActiveAiConnection } from "../ai";
import { getActiveMailConnection } from "../mail";
import { z } from "zod";

export const TEMPLATE_VERSION = "mf-nightly-v1";

export const MOVEMENT_TYPES: Record<string, string> = {
  purchase: "Compras con tarjeta de débito o crédito",
  transfer_in: "Transferencias recibidas y abonos",
  transfer_out: "Transferencias enviadas",
  service_charge: "Cargos y pagos de servicios",
  refund: "Devoluciones y reversos",
  fee: "Comisiones e intereses",
  salary: "Remuneraciones y honorarios",
  card_payment: "Pagos de tarjeta de crédito",
};

export const DEFAULT_PREFS = (tz = "America/Santiago"): AutomationPrefs => ({
  scheduleTime: "03:00", timezone: tz, initialPeriodDays: 30, overlapHours: 48,
  movementTypes: Object.keys(MOVEMENT_TYPES), notifyChannels: ["in_app"], maxMessagesPerRun: 150, extraHints: "", bankSenders: [],
});

/** Preferencias editables por el usuario. Validadas: no pueden eliminar restricciones de seguridad. */
export const PrefsSchema = z.object({
  scheduleTime: z.string().regex(/^([01]\d|2[0-3]):(00|15|30|45)$/, "Hora inválida (usa intervalos de 15 min)"),
  timezone: z.string().refine((tz) => { try { new Intl.DateTimeFormat("es", { timeZone: tz }); return true; } catch { return false; } }, "Zona horaria inválida"),
  initialPeriodDays: z.number().int().refine((n) => [7, 30, 60, 90, 180].includes(n), "Período inicial inválido"),
  overlapHours: z.number().int().min(24).max(96),
  movementTypes: z.array(z.enum(Object.keys(MOVEMENT_TYPES) as [string, ...string[]])).min(1, "Elige al menos un tipo"),
  notifyChannels: z.array(z.enum(["in_app", "push", "email"])).min(1).refine((c) => c.includes("in_app"), "Los avisos dentro de la app no se pueden desactivar"),
  maxMessagesPerRun: z.number().int().min(10).max(500),
  extraHints: z.string().max(500).refine((s) => !/(ignora|olvida|anula|omite).{0,40}(instrucci|regla|restricci)|https?:\/\/|api[_ -]?key|contraseña|password|token/i.test(s),
    "Las indicaciones no pueden pedir ignorar reglas, incluir enlaces ni credenciales"),
  bankSenders: z.array(z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "Dominio inválido")).max(20),
});

/** Datos que se envían al proveedor de IA en cada análisis (se muestran antes de aprobar). */
export const DATA_SENT_TO_AI = [
  "Remitente (nombre y dominio) y asunto de cada aviso financiero seleccionado",
  "Fecha de recepción",
  "Texto del aviso reducido: sin enlaces, sin adjuntos, sin imágenes, con números de tarjeta/cuenta y RUT enmascarados, máximo 6.000 caracteres",
  "Lista de nombres de tus categorías (sin montos)",
];

/**
 * Configuración que cubre la autorización. Cualquier cambio en proveedor, modelo, cuenta de correo,
 * permisos, destino de datos, horario o alcance cambia el hash y exige nueva validación.
 * NO incluye reglas, categorías ni presupuestos (previstos en la autorización original).
 */
export async function currentConfig(db: DB, userId: string) {
  const [auto] = await db.select().from(schema.automations).where(eq(schema.automations.userId, userId));
  const ai = await getActiveAiConnection(db, userId);
  const mail = await getActiveMailConnection(db, userId);
  if (!auto) return null;
  const p = auto.prefs;
  const snapshot = {
    templateVersion: TEMPLATE_VERSION,
    executionMode: "server" as const,
    executionPlace: "Servidor de MisFinanzas (proceso de tareas programadas). No se crea ninguna tarea dentro del proveedor de IA.",
    ai: ai ? { connectionId: ai.id, provider: ai.provider, model: ai.model } : null,
    mail: mail ? { connectionId: mail.id, provider: mail.provider, account: maskEmail(mail.accountEmail), scopes: mail.scopes } : null,
    schedule: { time: p.scheduleTime, timezone: p.timezone },
    search: { initialPeriodDays: p.initialPeriodDays, overlapHours: p.overlapHours, maxMessagesPerRun: p.maxMessagesPerRun, bankSenders: [...p.bankSenders].sort() },
    scope: { movementTypes: [...p.movementTypes].sort(), extraHints: p.extraHints.trim() },
    notifications: [...p.notifyChannels].sort(),
    dataDestination: { aiProvider: ai?.provider ?? null, dataSentToAi: DATA_SENT_TO_AI, storage: "Base de datos de MisFinanzas" },
  };
  return { automation: auto, ai, mail, snapshot, hash: sha256(stableStringify(snapshot)) };
}

export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stableStringify((v as Record<string, unknown>)[k])).join(",")}}`;
  return JSON.stringify(v);
}
