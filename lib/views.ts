import type { DB } from "./db";
import { schema } from "./db";
import { maskEmail } from "./crypto";
import { CONNECTORS, getActiveMailConnection } from "./mail";
import type { MailProvider } from "./mail/types";
import { getActiveAiConnection, monthlyUsage, PROVIDER_LABEL } from "./ai";
import type { AiProvider } from "./ai/types";
import { approvedVersion, syncAutomationStatus } from "./automation/service";
import { and, desc, eq } from "drizzle-orm";

/** Vistas seguras para el frontend: nunca incluyen tokens ni claves (solo referencias enmascaradas). */
export async function connectionsView(db: DB, userId: string) {
  const mail = await getActiveMailConnection(db, userId);
  const ai = await getActiveAiConnection(db, userId);
  const [auto] = await db.select().from(schema.automations).where(eq(schema.automations.userId, userId));
  const usage = ai ? await monthlyUsage(db, userId, ai.id) : null;
  return {
    mail: mail && {
      id: mail.id, provider: mail.provider, providerLabel: CONNECTORS[mail.provider as MailProvider].label,
      account: maskEmail(mail.accountEmail), status: mail.status, lastError: mail.lastError, scopes: mail.scopes.split(" "),
      lastSuccessfulSyncAt: mail.lastSuccessfulSyncAt, consentAt: mail.financialReadConsentAt, createdAt: mail.createdAt,
      nextSyncAt: auto?.status === "active" ? auto.nextRunAt : null,
    },
    ai: ai && {
      id: ai.id, provider: ai.provider, providerLabel: PROVIDER_LABEL[ai.provider as AiProvider], keyHint: ai.keyHint, model: ai.model,
      status: ai.status, lastError: ai.lastError, lastTestedAt: ai.lastTestedAt, lastSuccessAt: ai.lastSuccessAt,
      monthlyLimitUsdMicros: ai.monthlyLimitUsdMicros, monthlyTokenLimit: ai.monthlyTokenLimit, usage,
    },
    providers: {
      mail: Object.values(CONNECTORS).map((c) => ({ id: c.provider, label: c.label, configured: c.configured(), scopes: c.scopes })),
      ai: (Object.keys(PROVIDER_LABEL) as AiProvider[]).map((id) => ({ id, label: PROVIDER_LABEL[id] })),
    },
  };
}

export async function automationView(db: DB, userId: string) {
  await syncAutomationStatus(db, userId);
  const [a] = await db.select().from(schema.automations).where(eq(schema.automations.userId, userId));
  if (!a) return null;
  const approved = await approvedVersion(db, a);
  const [proposed] = await db.select().from(schema.instructionVersions)
    .where(and(eq(schema.instructionVersions.automationId, a.id), eq(schema.instructionVersions.status, "proposed")))
    .orderBy(desc(schema.instructionVersions.version)).limit(1);
  const runs = await db.select().from(schema.automationRuns).where(eq(schema.automationRuns.automationId, a.id)).orderBy(desc(schema.automationRuns.createdAt)).limit(15);
  const v = (x: typeof approved) => x && {
    id: x.id, version: x.version, status: x.status, instructionText: x.instructionText, proposal: x.proposal, configSnapshot: x.configSnapshot,
    generatedWith: x.generatedWith, createdAt: x.createdAt, approvedAt: x.approvedAt,
  };
  return {
    id: a.id, status: a.status, mode: a.mode, prefs: a.prefs, nextRunAt: a.nextRunAt, pausedReason: a.pausedReason,
    approved: v(approved), proposed: v(proposed ?? null), runs, lastRun: runs.find((r) => r.status !== "queued") ?? null,
  };
}
