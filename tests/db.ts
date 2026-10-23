import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { sql } from "drizzle-orm";
import { setDbForTests, schema, type DB } from "@/lib/db";
import { seedDefaultCategories } from "@/lib/categories/service";
import { hashPassword } from "@/lib/auth/password";
import { encryptAiKey } from "@/lib/ai";
import { encryptTokens } from "@/lib/mail";
import { eq } from "drizzle-orm";

let db: DB;
let pool: pg.Pool;

/** BD de pruebas real (Postgres), migrada desde cero. Requiere `npm run db:local` o TEST_DATABASE_URL. */
export async function setupDb() {
  pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 5 });
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;");
  db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  setDbForTests(db, pool);
  return db;
}
export async function resetDb() {
  await db.execute(sql`TRUNCATE users, jobs, audit_log, dev_outbox, login_attempts CASCADE`);
}
export async function closeDb() { await pool.end(); }

let n = 0;
export async function createUser(name = "Usuaria", opts: { tz?: string } = {}) {
  const [u] = await db.insert(schema.users).values({
    name, email: `u${++n}-${Date.now()}@example.test`, passwordHash: await hashPassword("una-clave-larga-1"), emailVerifiedAt: new Date(),
    termsVersion: "t", termsAcceptedAt: new Date(), dataProcessingAcceptedAt: new Date(), timezone: opts.tz ?? "America/Santiago",
  }).returning();
  await seedDefaultCategories(db, u.id);
  return u;
}

export async function connectAi(userId: string, provider: "openai" | "anthropic" | "gemini", apiKey: string, model: string) {
  const [c] = await db.insert(schema.aiConnections).values({ userId, provider, keyHint: "…" + apiKey.slice(-4), status: "ok", model }).returning();
  await db.update(schema.aiConnections).set({ encryptedKey: encryptAiKey(userId, c.id, apiKey) }).where(eq(schema.aiConnections.id, c.id));
  return c;
}

export async function connectMail(userId: string, provider: "gmail" | "outlook", account: string) {
  const [c] = await db.insert(schema.mailConnections).values({
    userId, provider, accountEmail: account, scopes: "https://www.googleapis.com/auth/gmail.readonly", status: "active", financialReadConsentAt: new Date(),
  }).returning();
  await db.update(schema.mailConnections).set({
    encryptedTokens: encryptTokens(userId, c.id, { accessToken: `access-${userId}`, refreshToken: `refresh-${userId}`, expiresAt: new Date(Date.now() + 3600_000), scope: c.scopes }),
  }).where(eq(schema.mailConnections.id, c.id));
  return c;
}

export const getTestDb = () => db;
