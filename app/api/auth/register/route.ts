import { z } from "zod";
import { sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { body, clientIp, json, route, appUrl, HttpError } from "@/lib/http";
import { hashPassword, passwordProblem } from "@/lib/auth/password";
import { issueToken } from "@/lib/auth/tokens";
import { sendEmail } from "@/lib/email/send";
import { seedDefaultCategories } from "@/lib/categories/service";
import { hitRateLimit } from "@/lib/auth/rate-limit";
import { pseudonymize } from "@/lib/crypto";
import { audit } from "@/lib/audit";

const TERMS_VERSION = "2026-10";

const Schema = z.object({
  name: z.string().trim().min(2, "Ingresa tu nombre").max(80),
  email: z.email("Correo inválido").max(200).transform((e) => e.trim().toLowerCase()),
  password: z.string(),
  passwordConfirm: z.string(),
  acceptTerms: z.literal(true, { error: "Debes aceptar las condiciones" }),
  acceptDataProcessing: z.literal(true, { error: "Debes aceptar el tratamiento de datos" }),
});

export const POST = route(async (req) => {
  const data = await body(req, Schema);
  if (data.password !== data.passwordConfirm) throw new HttpError(400, "Las contraseñas no coinciden");
  const problem = passwordProblem(data.password, data);
  if (problem) throw new HttpError(400, problem);
  if (await hitRateLimit(`register:${pseudonymize(clientIp(req))}`, 10, 60)) throw new HttpError(429, "Demasiados intentos. Espera un momento.");

  const db = getDb();
  const [existing] = await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${data.email}`).limit(1);
  let delivery;
  if (existing) {
    // Respuesta idéntica para no revelar si el correo ya está registrado.
    delivery = await sendEmail(data.email, "Intento de registro en MisFinanzas",
      `Alguien intentó crear una cuenta con este correo. Si fuiste tú, inicia sesión o recupera tu contraseña en ${appUrl()}/recuperar.`);
  } else {
    const now = new Date();
    const passwordHash = await hashPassword(data.password);
    const user = await db.transaction(async (tx) => {
      const [u] = await tx.insert(schema.users).values({
        name: data.name, email: data.email, passwordHash, termsVersion: TERMS_VERSION, termsAcceptedAt: now, dataProcessingAcceptedAt: now,
      }).returning();
      await seedDefaultCategories(tx as never, u.id);
      return u;
    });
    const token = await issueToken(user.id, "verify_email");
    delivery = await sendEmail(data.email, "Verifica tu correo en MisFinanzas",
      `Hola ${data.name}:\n\nConfirma tu correo con este enlace (válido 24 horas, un solo uso):\n${appUrl()}/verificar?token=${token}\n\nSi no creaste esta cuenta, ignora este mensaje.`);
    await audit(user.id, "auth.register");
  }
  return json({ ok: true, delivery });
});
