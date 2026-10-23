import { z } from "zod";
import { getDb } from "@/lib/db";
import { body, json, requireUser, route, HttpError } from "@/lib/http";
import { mergeDuplicate } from "@/lib/movements/service";
import { evaluateBudgetAlerts } from "@/lib/budgets/alerts";

/** Fusiona este movimiento (posible duplicado) en otro. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { user } = await requireUser();
  const { id } = await params;
  const { intoId } = await body(req, z.object({ intoId: z.uuid() }));
  const db = getDb();
  if (!(await mergeDuplicate(db, user.id, id, intoId))) throw new HttpError(404, "No se pudo fusionar");
  await evaluateBudgetAlerts(db, user.id);
  return json({ ok: true });
});
