import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { json, requireUser, route } from "@/lib/http";
import { getActiveAiConnection, monthlyUsage } from "@/lib/ai";

export const GET = route(async () => {
  const { user } = await requireUser();
  const db = getDb();
  const conn = await getActiveAiConnection(db, user.id);
  const runs = await db.select({
    id: schema.automationRuns.id, createdAt: schema.automationRuns.createdAt, trigger: schema.automationRuns.trigger, status: schema.automationRuns.status,
    inputTokens: schema.automationRuns.inputTokens, outputTokens: schema.automationRuns.outputTokens, costUsdMicros: schema.automationRuns.costUsdMicros,
    messagesAnalyzed: schema.automationRuns.messagesAnalyzed,
  }).from(schema.automationRuns).where(eq(schema.automationRuns.userId, user.id)).orderBy(desc(schema.automationRuns.createdAt)).limit(30);
  const other = conn ? await db.select().from(schema.aiUsage).where(and(eq(schema.aiUsage.userId, user.id), eq(schema.aiUsage.aiConnectionId, conn.id))).orderBy(desc(schema.aiUsage.createdAt)).limit(30) : [];
  return json({ month: conn ? await monthlyUsage(db, user.id, conn.id) : null, runs, calls: other.filter((c) => c.purpose !== "extraction") });
});
