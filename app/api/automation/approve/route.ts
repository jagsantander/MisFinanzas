import { z } from "zod";
import { getDb } from "@/lib/db";
import { body, json, requireUser, route, HttpError } from "@/lib/http";
import { approveVersion, AutomationError } from "@/lib/automation/service";

export const POST = route(async (req) => {
  const { user } = await requireUser({ requireVerified: true });
  const d = await body(req, z.object({ versionId: z.uuid(), confirmed: z.literal(true, { error: "Debes confirmar explícitamente" }) }));
  try {
    const r = await approveVersion(getDb(), user.id, d.versionId, { userAgent: req.headers.get("user-agent"), confirmed: d.confirmed });
    return json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof AutomationError) throw new HttpError(e.status, e.message, e.code);
    throw e;
  }
});
