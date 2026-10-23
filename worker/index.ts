/**
 * Proceso de tareas programadas de MisFinanzas. Debe correr SIEMPRE (independiente del navegador):
 *   npm run worker
 * - Cada minuto: planifica corridas nocturnas vencidas (03:00 hora local de cada usuario por defecto),
 *   recupera corridas interrumpidas y despacha notificaciones cuyo horario de silencio terminó.
 * - Procesa la cola de tareas con límite de concurrencia.
 * Se pueden ejecutar varias instancias: el reclamo de tareas usa SKIP LOCKED y los cupos son únicos.
 */
import { hostname } from "node:os";
import { getDb } from "../lib/db";
import { claimJobs, completeJob, failJob } from "../lib/jobs/queue";
import { scheduleDueRuns } from "../lib/automation/service";
import { executeRun, recoverStaleRuns } from "../lib/automation/runner";
import { dispatchPending } from "../lib/notifications/dispatch";
import { log, safeErrorMessage } from "../lib/log";
import { sql } from "drizzle-orm";

const WORKER_ID = `${hostname()}:${process.pid}`;
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 3);
const db = getDb();
let stopping = false;
let active = 0;

async function tick() {
  try {
    const recovered = await recoverStaleRuns(db);
    if (recovered.length) log.warn("worker.recovered_runs", { count: recovered.length });
    const created = await scheduleDueRuns(db);
    if (created) log.info("worker.scheduled", { created });
    await dispatchPending(db);
    await db.execute(sql`DELETE FROM webauthn_challenges WHERE expires_at < now()`);
    await db.execute(sql`DELETE FROM oauth_states WHERE expires_at < now()`);
    await db.execute(sql`DELETE FROM login_attempts WHERE created_at < now() - interval '2 days'`);
  } catch (e) {
    log.error("worker.tick_failed", { error: safeErrorMessage(e) });
  }
}

async function work() {
  while (!stopping) {
    const free = CONCURRENCY - active;
    if (free > 0) {
      const jobs = await claimJobs(db, WORKER_ID, free).catch((e) => { log.error("worker.claim_failed", { error: safeErrorMessage(e) }); return []; });
      for (const job of jobs) {
        active++;
        (async () => {
          try {
            if (job.type === "automation.run") await executeRun(db, String(job.payload.runId));
            else throw new Error(`Tipo de tarea desconocido: ${job.type}`);
            await completeJob(db, job.id);
          } catch (e) {
            await failJob(db, job, safeErrorMessage(e));
          } finally {
            active--;
          }
        })();
      }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

log.info("worker.start", { worker: WORKER_ID, concurrency: CONCURRENCY });
await tick();
const interval = setInterval(tick, 60_000);
process.on("SIGTERM", () => { stopping = true; clearInterval(interval); });
process.on("SIGINT", () => { stopping = true; clearInterval(interval); setTimeout(() => process.exit(0), 500); });
await work();
