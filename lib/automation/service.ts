import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { currentConfig, DEFAULT_PREFS } from "./config";
import { nextRunAfter, slotKeyFor } from "./schedule";
import { limitReached } from "../ai";
import { enqueue } from "../jobs/queue";
import { audit } from "../audit";

export class AutomationError extends Error {
  constructor(message: string, public code: string, public status = 400) { super(message); }
}

export async function ensureAutomation(db: DB, userId: string) {
  const [existing] = await db.select().from(schema.automations).where(eq(schema.automations.userId, userId));
  if (existing) return existing;
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  const [row] = await db.insert(schema.automations).values({ userId, prefs: DEFAULT_PREFS(u.timezone), status: "pending_approval" })
    .onConflictDoNothing().returning();
  return row ?? (await db.select().from(schema.automations).where(eq(schema.automations.userId, userId)))[0];
}

export async function approvedVersion(db: DB, automation: typeof schema.automations.$inferSelect) {
  if (!automation.approvedVersionId) return null;
  const [v] = await db.select().from(schema.instructionVersions).where(eq(schema.instructionVersions.id, automation.approvedVersionId));
  return v ?? null;
}

/**
 * Verificación previa a cualquier ejecución (programada o manual). Devuelve el motivo de bloqueo o null.
 */
export async function preflight(db: DB, userId: string, opts: { manual: boolean }) {
  const ctx = await currentConfig(db, userId);
  if (!ctx) return { blocked: "No hay automatización configurada", ctx: null, version: null };
  const a = ctx.automation;
  if (a.status === "cancelled") return { blocked: "La automatización fue cancelada", ctx, version: null };
  if (!opts.manual && a.status !== "active") return { blocked: "La automatización no está activa", ctx, version: null };
  const v = await approvedVersion(db, a);
  if (!v || v.status !== "approved") return { blocked: "No existe una instrucción aprobada", ctx, version: null };
  if (v.configHash !== ctx.hash) return { blocked: "La configuración cambió desde la aprobación. Revisa y valida la nueva versión.", ctx, version: v, code: "config_changed" };
  if (!ctx.mail || ctx.mail.status !== "active" || !ctx.mail.encryptedTokens) return { blocked: "El correo no está conectado o requiere reconexión", ctx, version: v };
  if (!ctx.ai?.encryptedKey) return { blocked: "La IA no está conectada", ctx, version: v };
  if (ctx.ai.status === "error") return { blocked: "La credencial de IA fue rechazada; actualízala", ctx, version: v };
  const lim = await limitReached(db, ctx.ai);
  if (lim) return { blocked: lim, ctx, version: v, code: "limit" };
  return { blocked: null, ctx, version: v };
}

/** Si la configuración vigente difiere de la aprobada, bloquea la ejecución automática. */
export async function syncAutomationStatus(db: DB, userId: string) {
  const ctx = await currentConfig(db, userId);
  if (!ctx) return null;
  const a = ctx.automation;
  const v = await approvedVersion(db, a);
  if ((a.status === "active" || a.status === "paused") && (!v || v.configHash !== ctx.hash)) {
    await db.update(schema.automations).set({ status: "pending_approval", nextRunAt: null, pausedReason: "La configuración cambió y requiere nueva validación", updatedAt: new Date() })
      .where(eq(schema.automations.id, a.id));
    return "pending_approval";
  }
  return a.status;
}

/**
 * Validación explícita del usuario. Solo aprueba si la versión es la propuesta vigente y su
 * configuración coincide EXACTAMENTE con la configuración actual.
 */
export async function approveVersion(db: DB, userId: string, versionId: string, meta: { userAgent: string | null; confirmed: boolean }) {
  if (meta.confirmed !== true) throw new AutomationError("Debes confirmar explícitamente la autorización", "not_confirmed");
  const ctx = await currentConfig(db, userId);
  if (!ctx) throw new AutomationError("No hay automatización", "missing");
  const [v] = await db.select().from(schema.instructionVersions)
    .where(and(eq(schema.instructionVersions.id, versionId), eq(schema.instructionVersions.userId, userId)));
  if (!v || v.status !== "proposed") throw new AutomationError("Esta versión ya no está vigente. Genera una nueva.", "stale_version", 409);
  if (v.configHash !== ctx.hash) throw new AutomationError("La configuración cambió después de generar esta versión. Regenera la instrucción.", "config_changed", 409);
  if (!ctx.mail || !ctx.ai?.model) throw new AutomationError("Faltan conexiones", "missing_connections");
  const now = new Date();
  const next = nextRunAfter(now, ctx.automation.prefs.scheduleTime, ctx.automation.prefs.timezone);
  await db.transaction(async (tx) => {
    await tx.update(schema.instructionVersions).set({ status: "superseded" })
      .where(and(eq(schema.instructionVersions.automationId, ctx.automation.id), eq(schema.instructionVersions.status, "approved")));
    await tx.update(schema.instructionVersions).set({ status: "approved", approvedAt: now, approvedBy: userId, approvalUserAgent: meta.userAgent?.slice(0, 300) ?? null })
      .where(eq(schema.instructionVersions.id, v.id));
    await tx.update(schema.automations).set({
      status: "active", mode: "server", approvedVersionId: v.id, nextRunAt: next.at, pausedReason: null, updatedAt: now,
      aiConnectionId: ctx.ai!.id, mailConnectionId: ctx.mail!.id,
    }).where(eq(schema.automations.id, ctx.automation.id));
  });
  await audit(userId, "automation.approved", { version: v.version, configHash: v.configHash });
  return { nextRunAt: next.at };
}

export async function pauseAutomation(db: DB, userId: string, reason = "Pausada por el usuario") {
  await db.update(schema.automations).set({ status: "paused", pausedReason: reason, nextRunAt: null, updatedAt: new Date() })
    .where(and(eq(schema.automations.userId, userId), inArray(schema.automations.status, ["active", "error"])));
  await audit(userId, "automation.paused", { reason });
}

/** Reanuda SOLO si existe una aprobación que coincide con la configuración actual. */
export async function resumeAutomation(db: DB, userId: string) {
  const ctx = await currentConfig(db, userId);
  if (!ctx) throw new AutomationError("No hay automatización", "missing");
  const v = await approvedVersion(db, ctx.automation);
  if (!v || v.configHash !== ctx.hash) throw new AutomationError("La configuración cambió: revisa y valida una nueva versión antes de reanudar", "config_changed", 409);
  const next = nextRunAfter(new Date(), ctx.automation.prefs.scheduleTime, ctx.automation.prefs.timezone);
  await db.update(schema.automations).set({ status: "active", pausedReason: null, nextRunAt: next.at, updatedAt: new Date() })
    .where(eq(schema.automations.id, ctx.automation.id));
  await audit(userId, "automation.resumed");
  return { nextRunAt: next.at };
}

/** Cancela: desactiva la ejecución en el servidor (no hay tareas externas que eliminar en modo servidor). */
export async function cancelAutomation(db: DB, userId: string) {
  const [a] = await db.select().from(schema.automations).where(eq(schema.automations.userId, userId));
  if (!a) return { cancelled: false };
  await db.transaction(async (tx) => {
    await tx.update(schema.automations).set({ status: "cancelled", nextRunAt: null, approvedVersionId: null, pausedReason: "Cancelada por el usuario", updatedAt: new Date() })
      .where(eq(schema.automations.id, a.id));
    await tx.update(schema.instructionVersions).set({ status: "superseded" })
      .where(and(eq(schema.instructionVersions.automationId, a.id), inArray(schema.instructionVersions.status, ["approved", "proposed"])));
    await tx.update(schema.automationRuns).set({ status: "failed", error: "Automatización cancelada", finishedAt: new Date() })
      .where(and(eq(schema.automationRuns.automationId, a.id), eq(schema.automationRuns.status, "queued")));
  });
  await audit(userId, "automation.cancelled");
  // Modo servidor: no existe un recurso externo. Si existiera (externalTaskId), se eliminaría aquí
  // y, ante un fallo, se mostraría el estado real con instrucciones manuales.
  return { cancelled: true, external: a.externalTaskId ? "pending_manual" : "none" };
}

/** Encola una ejecución manual. Evita duplicados: una sola ejecución en cola o en curso por cuenta. */
export async function requestManualRun(db: DB, userId: string, trigger: "manual" | "initial") {
  const pf = await preflight(db, userId, { manual: true });
  if (pf.blocked) throw new AutomationError(pf.blocked, pf.code ?? "blocked", 409);
  const a = pf.ctx!.automation;
  const [busy] = await db.select({ id: schema.automationRuns.id }).from(schema.automationRuns)
    .where(and(eq(schema.automationRuns.automationId, a.id), inArray(schema.automationRuns.status, ["queued", "running"]))).limit(1);
  if (busy) throw new AutomationError("Ya hay una sincronización en curso", "busy", 409);
  const [run] = await db.insert(schema.automationRuns).values({
    userId, automationId: a.id, trigger, slotKey: `${trigger}:${Date.now()}`, instructionVersionId: pf.version!.id, status: "queued",
  }).returning();
  await enqueue(db, "automation.run", { userId, payload: { runId: run.id }, idempotencyKey: `run:${run.id}`, maxAttempts: 3 });
  return run;
}

/** Planificador (lo ejecuta el worker cada minuto): crea a lo sumo una ejecución por día local. */
export async function scheduleDueRuns(db: DB, now = new Date()) {
  const due = await db.select().from(schema.automations)
    .where(and(eq(schema.automations.status, "active"), sql`${schema.automations.nextRunAt} <= ${now}`));
  let created = 0;
  for (const a of due) {
    const slot = slotKeyFor(a.nextRunAt!, a.prefs.timezone);
    const [run] = await db.insert(schema.automationRuns).values({
      userId: a.userId, automationId: a.id, trigger: "scheduled", slotKey: slot, instructionVersionId: a.approvedVersionId, status: "queued",
    }).onConflictDoNothing().returning();
    if (run) {
      await enqueue(db, "automation.run", { userId: a.userId, payload: { runId: run.id }, idempotencyKey: `run:${run.id}`, maxAttempts: 3 });
      created++;
    }
    // Avanza al próximo cupo futuro (si el worker estuvo detenido varios días, se hace una sola puesta al día).
    const next = nextRunAfter(now, a.prefs.scheduleTime, a.prefs.timezone);
    await db.update(schema.automations).set({ nextRunAt: next.at }).where(eq(schema.automations.id, a.id));
  }
  return created;
}

export async function recentRuns(db: DB, userId: string, limit = 20) {
  return db.select().from(schema.automationRuns).where(eq(schema.automationRuns.userId, userId)).orderBy(desc(schema.automationRuns.createdAt)).limit(limit);
}
