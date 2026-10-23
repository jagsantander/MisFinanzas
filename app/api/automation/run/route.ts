import { z } from "zod";
import { getDb } from "@/lib/db";
import { body, json, requireUser, route, HttpError } from "@/lib/http";
import { AutomationError, requestManualRun } from "@/lib/automation/service";

/** "Ejecutar ahora" / "Sincronizar ahora": encola una corrida para el worker (no corre en el navegador). */
export const POST = route(async (req) => {
  const { user } = await requireUser({ requireVerified: true });
  const { trigger } = await body(req, z.object({ trigger: z.enum(["manual", "initial"]).default("manual") }));
  try {
    const run = await requestManualRun(getDb(), user.id, trigger);
    return json({ ok: true, runId: run.id });
  } catch (e) {
    if (e instanceof AutomationError) throw new HttpError(e.status, e.message, e.code);
    throw e;
  }
});
