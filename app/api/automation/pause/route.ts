import { getDb } from "@/lib/db";
import { json, requireUser, route } from "@/lib/http";
import { pauseAutomation } from "@/lib/automation/service";

export const POST = route(async () => {
  const { user } = await requireUser();
  await pauseAutomation(getDb(), user.id);
  return json({ ok: true });
});
