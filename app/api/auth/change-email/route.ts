import { z } from "zod";
import { sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { appUrl, body, json, requireUser, route, HttpError } from "@/lib/http";
import { verifyPassword } from "@/lib/auth/password";
import { issueToken } from "@/lib/auth/tokens";
import { sendEmail } from "@/lib/email/send";

/** Cambia el correo de la CUENTA (no el correo conectado para importar). */
export const POST = route(async (req) => {
  const { user } = await requireUser();
  const d = await body(req, z.object({ newEmail: z.email().transform((e) => e.trim().toLowerCase()), password: z.string() }));
  if (!(await verifyPassword(d.password, user.passwordHash))) throw new HttpError(400, "Contraseña incorrecta");
  const [taken] = await getDb().select({ id: schema.users.id }).from(schema.users).where(sql`lower(${schema.users.email}) = ${d.newEmail}`).limit(1);
  if (!taken) {
    const token = await issueToken(user.id, "change_email", d.newEmail);
    await sendEmail(d.newEmail, "Confirma tu nuevo correo en MisFinanzas", `Confirma el cambio de correo (válido 60 minutos):\n${appUrl()}/confirmar-correo?token=${token}`);
    await sendEmail(user.email, "Solicitud de cambio de correo", "Se solicitó cambiar el correo de tu cuenta MisFinanzas. Si no fuiste tú, cambia tu contraseña de inmediato.");
  }
  return json({ ok: true });
});
