import { getDb, schema } from "./db";

/** Auditoría de acciones relevantes. Nunca incluir secretos ni contenido de correos. */
export async function audit(userId: string | null, action: string, meta?: Record<string, unknown>) {
  await getDb().insert(schema.auditLog).values({ userId, action, meta: meta ?? null });
}
