import { and, eq, gte, isNull, sql } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { decryptSecret, encryptSecret } from "../crypto";
import { anthropicAdapter } from "./anthropic";
import { geminiAdapter } from "./gemini";
import { openaiAdapter } from "./openai";
import { estimateCostMicros } from "./pricing";
import { AiError, type AiAdapter, type AiProvider, type StructuredRequest } from "./types";

export const ADAPTERS: Record<AiProvider, AiAdapter> = { openai: openaiAdapter, anthropic: anthropicAdapter, gemini: geminiAdapter };
export const PROVIDER_LABEL: Record<AiProvider, string> = { openai: "OpenAI", anthropic: "Anthropic (Claude)", gemini: "Google Gemini" };

export const aiKeyAad = (userId: string, connectionId: string) => `ai-key:${userId}:${connectionId}`;
export const encryptAiKey = (userId: string, connectionId: string, key: string) => encryptSecret(key, aiKeyAad(userId, connectionId));

export type AiConn = typeof schema.aiConnections.$inferSelect;

/** Conexión de IA activa del usuario. Nunca existe una clave de respaldo del administrador. */
export async function getActiveAiConnection(db: DB, userId: string): Promise<AiConn | null> {
  const [c] = await db.select().from(schema.aiConnections)
    .where(and(eq(schema.aiConnections.userId, userId), isNull(schema.aiConnections.removedAt)))
    .orderBy(sql`${schema.aiConnections.createdAt} desc`).limit(1);
  return c ?? null;
}

export function monthStartUtc(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function monthlyUsage(db: DB, userId: string, aiConnectionId: string) {
  const [row] = await db.select({
    tokens: sql<number>`coalesce(sum(coalesce(${schema.aiUsage.inputTokens},0) + coalesce(${schema.aiUsage.outputTokens},0)),0)::bigint`,
    cost: sql<string>`coalesce(sum(${schema.aiUsage.costUsdMicros}),0)::bigint`,
    calls: sql<number>`count(*)::int`,
  }).from(schema.aiUsage).where(and(eq(schema.aiUsage.userId, userId), eq(schema.aiUsage.aiConnectionId, aiConnectionId), gte(schema.aiUsage.createdAt, monthStartUtc())));
  return { tokens: Number(row.tokens), costMicros: BigInt(row.cost), calls: row.calls };
}

export async function limitReached(db: DB, conn: AiConn): Promise<string | null> {
  if (!conn.monthlyLimitUsdMicros && !conn.monthlyTokenLimit) return null;
  const u = await monthlyUsage(db, conn.userId, conn.id);
  if (conn.monthlyLimitUsdMicros && u.costMicros >= conn.monthlyLimitUsdMicros) return "Se alcanzó el límite mensual de costo de IA configurado en MisFinanzas";
  if (conn.monthlyTokenLimit && u.tokens >= conn.monthlyTokenLimit) return "Se alcanzó el límite mensual de tokens configurado en MisFinanzas";
  return null;
}

/**
 * Única vía para llamar a la IA: usa EXCLUSIVAMENTE la credencial de `ownerUserId`,
 * verifica el límite de consumo y registra el uso.
 */
export async function callUserAi(db: DB, ownerUserId: string, purpose: "test" | "instruction" | "extraction", req: StructuredRequest, runId: string | null = null) {
  const conn = await getActiveAiConnection(db, ownerUserId);
  if (!conn || !conn.encryptedKey) throw new AiError("No hay una IA conectada", "auth");
  if (conn.userId !== ownerUserId) throw new Error("Violación de aislamiento de credenciales");
  if (!conn.model) throw new AiError("No hay un modelo seleccionado", "invalid_request");
  const reason = await limitReached(db, conn);
  if (reason) throw new AiError(reason, "quota");
  const apiKey = decryptSecret(conn.encryptedKey, aiKeyAad(ownerUserId, conn.id));
  const adapter = ADAPTERS[conn.provider as AiProvider];
  try {
    const res = await adapter.structured(apiKey, conn.model, req);
    await db.insert(schema.aiUsage).values({
      userId: ownerUserId, aiConnectionId: conn.id, runId, purpose, provider: conn.provider, model: conn.model, ok: true,
      inputTokens: res.inputTokens, outputTokens: res.outputTokens, costUsdMicros: estimateCostMicros(conn.model, res.inputTokens, res.outputTokens),
    });
    await db.update(schema.aiConnections).set({ lastSuccessAt: new Date(), status: "ok", lastError: null }).where(eq(schema.aiConnections.id, conn.id));
    return { ...res, conn };
  } catch (e) {
    await db.insert(schema.aiUsage).values({ userId: ownerUserId, aiConnectionId: conn.id, runId, purpose, provider: conn.provider, model: conn.model, ok: false });
    if (e instanceof AiError && (e.kind === "auth" || e.kind === "quota")) {
      await db.update(schema.aiConnections).set({ status: e.kind === "auth" ? "error" : "quota", lastError: e.message.slice(0, 300) }).where(eq(schema.aiConnections.id, conn.id));
    }
    throw e;
  }
}
