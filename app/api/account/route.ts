import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { body, json, requireUser, route, HttpError } from "@/lib/http";
import { verifyPassword } from "@/lib/auth/password";
import { clearSessionCookie } from "@/lib/auth/session";
import { CONNECTORS, decryptTokens } from "@/lib/mail";
import type { MailProvider } from "@/lib/mail/types";
import { log } from "@/lib/log";

/**
 * Borrado de datos, separado de las desconexiones:
 * - scope "movements": borra movimientos, reglas y presupuestos (mantiene la cuenta);
 * - scope "account": revoca el correo en el proveedor (si es posible) y elimina la cuenta y TODOS sus datos.
 */
export const DELETE = route(async (req) => {
  const { user } = await requireUser();
  const d = await body(req, z.object({ password: z.string(), confirmText: z.string(), scope: z.enum(["movements", "account"]) }));
  const expected = d.scope === "account" ? "ELIMINAR MI CUENTA" : "BORRAR MOVIMIENTOS";
  if (d.confirmText.trim().toUpperCase() !== expected) throw new HttpError(400, `Escribe “${expected}” para confirmar`);
  if (!(await verifyPassword(d.password, user.passwordHash))) throw new HttpError(400, "Contraseña incorrecta");
  const db = getDb();
  if (d.scope === "movements") {
    await db.transaction(async (tx) => {
      await tx.delete(schema.movements).where(eq(schema.movements.userId, user.id));
      await tx.delete(schema.processedMessages).where(eq(schema.processedMessages.userId, user.id));
      await tx.delete(schema.budgetAlertStates).where(eq(schema.budgetAlertStates.userId, user.id));
    });
    return json({ ok: true });
  }
  const conns = await db.select().from(schema.mailConnections).where(and(eq(schema.mailConnections.userId, user.id), isNull(schema.mailConnections.disconnectedAt)));
  for (const c of conns) {
    try { if (c.encryptedTokens) await CONNECTORS[c.provider as MailProvider].revoke(decryptTokens(c)); } catch { log.warn("account.delete.revoke_failed", { provider: c.provider }); }
  }
  await db.delete(schema.jobs).where(eq(schema.jobs.userId, user.id));
  await db.delete(schema.users).where(eq(schema.users.id, user.id)); // cascada: todos los datos del usuario
  await db.execute(sql`DELETE FROM audit_log WHERE user_id IS NULL AND created_at < now() - interval '1 day'`);
  await clearSessionCookie();
  return json({ ok: true });
});
