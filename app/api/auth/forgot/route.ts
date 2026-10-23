import { z } from "zod";
import { sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { appUrl, body, clientIp, json, route } from "@/lib/http";
import { issueToken } from "@/lib/auth/tokens";
import { sendEmail } from "@/lib/email/send";
import { hitRateLimit } from "@/lib/auth/rate-limit";
import { pseudonymize } from "@/lib/crypto";

/** Siempre responde igual: no revela si el correo existe. */
export const POST = route(async (req) => {
  const { email } = await body(req, z.object({ email: z.string().trim().toLowerCase().max(200) }));
  const limited = await hitRateLimit(`forgot:${pseudonymize(email)}`, 3, 30) || await hitRateLimit(`forgot-ip:${pseudonymize(clientIp(req))}`, 20, 30);
  if (!limited) {
    const [u] = await getDb().select().from(schema.users).where(sql`lower(${schema.users.email}) = ${email}`).limit(1);
    if (u) {
      const token = await issueToken(u.id, "reset_password");
      await sendEmail(u.email, "Recupera tu contraseña de MisFinanzas",
        `Para crear una nueva contraseña usa este enlace (válido 60 minutos, un solo uso):\n${appUrl()}/restablecer?token=${token}\n\nSi no lo solicitaste, ignora este correo.`);
    }
  }
  return json({ ok: true });
});
