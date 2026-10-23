import { desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { json, route, HttpError } from "@/lib/http";

/** SOLO desarrollo: bandeja local de correos no enviados (sin SMTP configurado). Deshabilitada en producción. */
export const GET = route(async () => {
  if (process.env.NODE_ENV === "production" || process.env.SMTP_URL) throw new HttpError(404, "No disponible");
  const rows = await getDb().select().from(schema.devOutbox).orderBy(desc(schema.devOutbox.createdAt)).limit(30);
  return json({ emails: rows });
});
