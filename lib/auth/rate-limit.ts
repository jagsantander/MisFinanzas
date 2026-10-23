import { and, eq, gte, sql } from "drizzle-orm";
import { getDb, schema } from "../db";

const WINDOW_MIN = 15;
const MAX_PER_ACCOUNT = 5;
const MAX_PER_IP = 30;

/** Devuelve los segundos de espera si el intento está bloqueado; 0 si puede intentarse. */
export async function loginBlockedFor(keys: { account: string; ip: string }): Promise<number> {
  const db = getDb();
  const since = new Date(Date.now() - WINDOW_MIN * 60_000);
  const count = async (key: string) => {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int`, last: sql<Date | null>`max(${schema.loginAttempts.createdAt})` })
      .from(schema.loginAttempts)
      .where(and(eq(schema.loginAttempts.key, key), eq(schema.loginAttempts.success, false), gte(schema.loginAttempts.createdAt, since)));
    return row;
  };
  const acc = await count(`acct:${keys.account}`);
  if (acc.n >= MAX_PER_ACCOUNT && acc.last) {
    // Espera exponencial: 1, 2, 4… minutos (máx. 15) desde el último fallo.
    const waitMin = Math.min(2 ** (acc.n - MAX_PER_ACCOUNT), WINDOW_MIN);
    const until = new Date(acc.last).getTime() + waitMin * 60_000;
    if (until > Date.now()) return Math.ceil((until - Date.now()) / 1000);
  }
  const ip = await count(`ip:${keys.ip}`);
  if (ip.n >= MAX_PER_IP) return WINDOW_MIN * 60;
  return 0;
}

export async function recordLoginAttempt(keys: { account: string; ip: string }, success: boolean) {
  const db = getDb();
  if (success) {
    // Un acceso correcto reinicia el contador de la cuenta.
    await db.delete(schema.loginAttempts).where(eq(schema.loginAttempts.key, `acct:${keys.account}`));
    return;
  }
  await db.insert(schema.loginAttempts).values([
    { key: `acct:${keys.account}`, success: false },
    { key: `ip:${keys.ip}`, success: false },
  ]);
}

/** Limitador genérico para endpoints sensibles (envío de correos, pruebas de IA…). */
export async function hitRateLimit(key: string, max: number, windowMin: number): Promise<boolean> {
  const db = getDb();
  const since = new Date(Date.now() - windowMin * 60_000);
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.loginAttempts)
    .where(and(eq(schema.loginAttempts.key, `rl:${key}`), gte(schema.loginAttempts.createdAt, since)));
  if (row.n >= max) return true;
  await db.insert(schema.loginAttempts).values({ key: `rl:${key}`, success: false });
  return false;
}
