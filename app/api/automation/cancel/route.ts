import { getDb } from "@/lib/db";
import { json, requireUser, route } from "@/lib/http";
import { cancelAutomation } from "@/lib/automation/service";

export const POST = route(async () => {
  const { user } = await requireUser();
  return json({ ok: true, ...(await cancelAutomation(getDb(), user.id)) });
});
