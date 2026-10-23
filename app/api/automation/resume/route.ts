import { getDb } from "@/lib/db";
import { json, requireUser, route, HttpError } from "@/lib/http";
import { AutomationError, resumeAutomation } from "@/lib/automation/service";

export const POST = route(async () => {
  const { user } = await requireUser();
  try { return json({ ok: true, ...(await resumeAutomation(getDb(), user.id)) }); }
  catch (e) { if (e instanceof AutomationError) throw new HttpError(e.status, e.message, e.code); throw e; }
});
