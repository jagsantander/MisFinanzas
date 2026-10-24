import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

/** Chequeo de salud para la plataforma de despliegue: responde 200 solo si la base de datos contesta. */
export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
