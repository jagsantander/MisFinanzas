import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { body, json, requireUser, route, HttpError } from "@/lib/http";
import { getActiveAiConnection } from "@/lib/ai";

/** Límite técnico de consumo de IA dentro de MisFinanzas (distinto de los presupuestos personales). */
export const POST = route(async (req) => {
  const { user } = await requireUser();
  const d = await body(req, z.object({ monthlyUsd: z.number().min(0.1).max(1000).nullable(), monthlyTokens: z.number().int().min(10_000).max(1_000_000_000).nullable() }));
  const db = getDb();
  const conn = await getActiveAiConnection(db, user.id);
  if (!conn) throw new HttpError(404, "No hay IA conectada");
  await db.update(schema.aiConnections).set({
    monthlyLimitUsdMicros: d.monthlyUsd == null ? null : BigInt(Math.round(d.monthlyUsd * 1_000_000)),
    monthlyTokenLimit: d.monthlyTokens,
    status: conn.status === "limit_reached" || conn.status === "quota" ? "ok" : conn.status,
  }).where(eq(schema.aiConnections.id, conn.id));
  return json({ ok: true });
});
