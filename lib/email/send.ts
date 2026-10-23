import nodemailer from "nodemailer";
import { getDb, schema } from "../db";
import { log } from "../log";

export type Delivery = "smtp" | "dev_outbox";

/**
 * Envía correos transaccionales de MisFinanzas (verificación, recuperación, alertas).
 * - Con SMTP_URL: envío real por SMTP (cualquier proveedor: SES, Postmark, Resend SMTP, etc.).
 * - Sin SMTP_URL y fuera de producción: se guarda en la bandeja de desarrollo (/dev/outbox).
 *   Esto NO es un envío real y la interfaz lo indica.
 * - Sin SMTP_URL en producción: error explícito.
 */
export async function sendEmail(to: string, subject: string, text: string): Promise<Delivery> {
  const smtp = process.env.SMTP_URL;
  if (smtp) {
    const transport = nodemailer.createTransport(smtp);
    await transport.sendMail({ from: process.env.MAIL_FROM ?? "MisFinanzas <no-reply@localhost>", to, subject, text });
    return "smtp";
  }
  if (process.env.NODE_ENV === "production") throw new Error("Servicio de envío de correo no configurado (SMTP_URL)");
  await getDb().insert(schema.devOutbox).values({ to, subject, text });
  log.info("email.dev_outbox", { subject });
  return "dev_outbox";
}

export function emailDeliveryConfigured() {
  return Boolean(process.env.SMTP_URL);
}
