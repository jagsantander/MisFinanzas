import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { json, requireUser, route, HttpError } from "@/lib/http";
import { ADAPTERS, aiKeyAad, getActiveAiConnection } from "@/lib/ai";
import { AiError, type AiProvider } from "@/lib/ai/types";
import { decryptSecret } from "@/lib/crypto";
import { hitRateLimit } from "@/lib/auth/rate-limit";

/** Prueba real: lista modelos con la clave guardada del usuario. */
export const POST = route(async () => {
  const { user } = await requireUser();
  if (await hitRateLimit(`ai-test:${user.id}`, 10, 15)) throw new HttpError(429, "Demasiadas pruebas. Espera unos minutos.");
  const db = getDb();
  const conn = await getActiveAiConnection(db, user.id);
  if (!conn?.encryptedKey) throw new HttpError(404, "No hay IA conectada");
  try {
    const models = await ADAPTERS[conn.provider as AiProvider].listModels(decryptSecret(conn.encryptedKey, aiKeyAad(user.id, conn.id)));
    await db.update(schema.aiConnections).set({ status: "ok", lastError: null, lastTestedAt: new Date() }).where(eq(schema.aiConnections.id, conn.id));
    return json({ ok: true, models, modelAvailable: conn.model ? models.some((m) => m.id === conn.model) : null });
  } catch (e) {
    const msg = e instanceof AiError ? e.message : "No se pudo contactar al proveedor";
    await db.update(schema.aiConnections).set({ status: e instanceof AiError && e.kind === "quota" ? "quota" : "error", lastError: msg.slice(0, 300), lastTestedAt: new Date() }).where(eq(schema.aiConnections.id, conn.id));
    return json({ ok: false, error: msg }, 200);
  }
});
