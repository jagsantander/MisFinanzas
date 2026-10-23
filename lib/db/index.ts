import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;

const g = globalThis as unknown as { __mfPool?: pg.Pool; __mfDb?: DB };

export function getPool(): pg.Pool {
  if (!g.__mfPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL no está definida");
    g.__mfPool = new pg.Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? 10) });
  }
  return g.__mfPool;
}

export function getDb(): DB {
  if (!g.__mfDb) g.__mfDb = drizzle(getPool(), { schema });
  return g.__mfDb;
}

/** Permite inyectar una BD (pruebas). */
export function setDbForTests(db: DB, pool: pg.Pool) {
  g.__mfDb = db;
  g.__mfPool = pool;
}

export { schema };
