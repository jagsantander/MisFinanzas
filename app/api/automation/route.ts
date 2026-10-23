import { getDb } from "@/lib/db";
import { json, requireUser, route } from "@/lib/http";
import { automationView } from "@/lib/views";
import { ensureAutomation } from "@/lib/automation/service";
import { DATA_SENT_TO_AI, MOVEMENT_TYPES } from "@/lib/automation/config";

export const GET = route(async () => {
  const { user } = await requireUser();
  const db = getDb();
  await ensureAutomation(db, user.id);
  return json({ automation: await automationView(db, user.id), dataSentToAi: DATA_SENT_TO_AI, movementTypes: MOVEMENT_TYPES });
});
