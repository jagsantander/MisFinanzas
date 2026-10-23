import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { json, requireUser, route, HttpError } from "@/lib/http";
import { CONNECTORS, decryptTokens, getActiveMailConnection } from "@/lib/mail";
import type { MailProvider } from "@/lib/mail/types";
import { syncAutomationStatus } from "@/lib/automation/service";
import { audit } from "@/lib/audit";

/** Detiene importaciones y elimina tokens. NO borra movimientos. */
export const POST = route(async () => {
  const { user } = await requireUser();
  const db = getDb();
  const conn = await getActiveMailConnection(db, user.id);
  if (!conn) throw new HttpError(404, "No hay correo conectado");
  let result: { revoked: boolean; instructions?: string } = { revoked: false };
  try { result = await CONNECTORS[conn.provider as MailProvider].revoke(decryptTokens(conn)); } catch { result = { revoked: false, instructions: "No se pudo confirmar la revocación en el proveedor; quita el acceso manualmente desde la configuración de seguridad de tu cuenta." }; }
  await db.update(schema.mailConnections).set({ status: "disconnected", encryptedTokens: null, disconnectedAt: new Date() }).where(eq(schema.mailConnections.id, conn.id));
  await syncAutomationStatus(db, user.id);
  await audit(user.id, "mail.disconnected", { revokedAtProvider: result.revoked });
  return json({ ok: true, tokensDeleted: true, ...result });
});
