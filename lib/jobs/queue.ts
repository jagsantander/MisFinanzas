import { and, eq, sql } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";

/**
 * Cola de tareas persistente en Postgres (sin Redis):
 * - idempotencia con idempotencyKey única;
 * - reclamo concurrente seguro con FOR UPDATE SKIP LOCKED;
 * - arrendamiento (lease): si un worker muere, la tarea se recupera al vencer el lease;
 * - reintentos con espera exponencial.
 */
export async function enqueue(db: DB, type: string, opts: { userId?: string | null; payload?: Record<string, unknown>; runAt?: Date; idempotencyKey?: string; maxAttempts?: number } = {}) {
  const [row] = await db.insert(schema.jobs).values({
    type, userId: opts.userId ?? null, payload: opts.payload ?? {}, runAt: opts.runAt ?? new Date(),
    idempotencyKey: opts.idempotencyKey ?? null, maxAttempts: opts.maxAttempts ?? 5,
  }).onConflictDoNothing().returning();
  return row ?? null;
}

export async function claimJobs(db: DB, workerId: string, limit: number, leaseSeconds = 900) {
  const res = await db.execute(sql`
    UPDATE jobs SET status = 'running', attempts = attempts + 1, locked_by = ${workerId},
      locked_until = now() + make_interval(secs => ${leaseSeconds})
    WHERE id IN (
      SELECT id FROM jobs
      WHERE (status = 'queued' AND run_at <= now()) OR (status = 'running' AND locked_until < now())
      ORDER BY run_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, type, user_id as "userId", payload, attempts, max_attempts as "maxAttempts"`);
  return res.rows as { id: string; type: string; userId: string | null; payload: Record<string, unknown>; attempts: number; maxAttempts: number }[];
}

export async function completeJob(db: DB, id: string) {
  await db.update(schema.jobs).set({ status: "done", finishedAt: new Date(), lockedUntil: null }).where(eq(schema.jobs.id, id));
}

export async function failJob(db: DB, job: { id: string; attempts: number; maxAttempts: number }, error: string, retryable = true) {
  const final = !retryable || job.attempts >= job.maxAttempts;
  const backoffSec = Math.min(60 * 2 ** (job.attempts - 1), 3600);
  await db.update(schema.jobs).set({
    status: final ? "failed" : "queued", lastError: error.slice(0, 300), lockedUntil: null,
    runAt: final ? undefined : new Date(Date.now() + backoffSec * 1000), finishedAt: final ? new Date() : null,
  }).where(and(eq(schema.jobs.id, job.id)));
  return final;
}
