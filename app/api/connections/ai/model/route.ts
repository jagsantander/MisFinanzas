import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { body, json, requireUser, route, HttpError } from "@/lib/http";
import { ADAPTERS, aiKeyAad, getActiveAiConnection } from "@/lib/ai";
import type { AiProvider } from "@/lib/ai/types";
import { decryptSecret } from "@/lib/crypto";
import { syncAutomationStatus } from "@/lib/automation/service";

export const POST = route(async (req) => {
  const { user } = await requireUser();
  const { model } = await body(req, z.object({ model: z.string().min(2).max(100) }));
  const db = getDb();
  const conn = await getActiveAiConnection(db, user.id);
  if (!conn?.encryptedKey) throw new HttpError(404, "No hay IA conectada");
  const models = await ADAPTERS[conn.provider as AiProvider].listModels(decryptSecret(conn.encryptedKey, aiKeyAad(user.id, conn.id)));
  if (!models.some((m) => m.id === model)) throw new HttpError(400, "Ese modelo no está disponible para tu clave");
  await db.update(schema.aiConnections).set({ model }).where(eq(schema.aiConnections.id, conn.id));
  await syncAutomationStatus(db, user.id);
  return json({ ok: true });
});
