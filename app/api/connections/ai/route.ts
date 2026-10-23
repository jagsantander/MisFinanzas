import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { body, json, requireUser, route, HttpError } from "@/lib/http";
import { ADAPTERS, encryptAiKey, getActiveAiConnection } from "@/lib/ai";
import { AiError } from "@/lib/ai/types";
import { maskSecret } from "@/lib/crypto";
import { syncAutomationStatus } from "@/lib/automation/service";
import { hitRateLimit } from "@/lib/auth/rate-limit";
import { audit } from "@/lib/audit";

/** Guarda (o reemplaza) la clave de API del usuario tras verificarla con el proveedor. */
export const POST = route(async (req) => {
  const { user } = await requireUser({ requireVerified: true });
  const d = await body(req, z.object({ provider: z.enum(["openai", "anthropic", "gemini"]), apiKey: z.string().trim().min(20).max(300) }));
  if (await hitRateLimit(`ai-key:${user.id}`, 10, 15)) throw new HttpError(429, "Demasiados intentos. Espera unos minutos.");
  let models;
  try { models = await ADAPTERS[d.provider].listModels(d.apiKey); }
  catch (e) { throw new HttpError(400, e instanceof AiError ? e.message : "No se pudo verificar la clave"); }
  const db = getDb();
  const conn = await db.transaction(async (tx) => {
    await tx.update(schema.aiConnections).set({ removedAt: new Date(), encryptedKey: null, status: "removed" })
      .where(and(eq(schema.aiConnections.userId, user.id), isNull(schema.aiConnections.removedAt)));
    const [c] = await tx.insert(schema.aiConnections).values({ userId: user.id, provider: d.provider, keyHint: maskSecret(d.apiKey), status: "ok", lastTestedAt: new Date() }).returning();
    await tx.update(schema.aiConnections).set({ encryptedKey: encryptAiKey(user.id, c.id, d.apiKey) }).where(eq(schema.aiConnections.id, c.id));
    return c;
  });
  await syncAutomationStatus(db, user.id);
  await audit(user.id, "ai.connected", { provider: d.provider });
  return json({ ok: true, id: conn.id, keyHint: conn.keyHint, models });
});

/** Elimina la credencial: detiene solicitudes. NO borra movimientos. */
export const DELETE = route(async () => {
  const { user } = await requireUser();
  const db = getDb();
  const conn = await getActiveAiConnection(db, user.id);
  if (!conn) throw new HttpError(404, "No hay IA conectada");
  await db.update(schema.aiConnections).set({ removedAt: new Date(), encryptedKey: null, status: "removed" }).where(eq(schema.aiConnections.id, conn.id));
  await syncAutomationStatus(db, user.id);
  await audit(user.id, "ai.removed");
  return json({ ok: true });
});
