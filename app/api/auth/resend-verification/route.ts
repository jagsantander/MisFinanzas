import { z } from "zod";
import { sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { appUrl, body, json, route } from "@/lib/http";
import { issueToken } from "@/lib/auth/tokens";
import { sendEmail } from "@/lib/email/send";
import { hitRateLimit } from "@/lib/auth/rate-limit";

export const POST = route(async (req) => {
  const { email } = await body(req, z.object({ email: z.email().transform((e) => e.trim().toLowerCase()) }));
  if (await hitRateLimit(`resend:${email}`, 3, 60)) return json({ ok: true });
  const [u] = await getDb().select().from(schema.users).where(sql`lower(${schema.users.email}) = ${email}`).limit(1);
  let delivery = null;
  if (u && !u.emailVerifiedAt) {
    const token = await issueToken(u.id, "verify_email");
    delivery = await sendEmail(u.email, "Verifica tu correo en MisFinanzas", `Confirma tu correo (válido 24 horas, un solo uso):\n${appUrl()}/verificar?token=${token}`);
  }
  return json({ ok: true, delivery });
});
