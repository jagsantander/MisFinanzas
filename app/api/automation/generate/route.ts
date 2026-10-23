import { getDb } from "@/lib/db";
import { json, requireUser, route, HttpError } from "@/lib/http";
import { generateInstructionVersion } from "@/lib/automation/instruction";
import { ensureAutomation } from "@/lib/automation/service";
import { AiError } from "@/lib/ai/types";
import { hitRateLimit } from "@/lib/auth/rate-limit";
import { ZodError } from "zod";

export const POST = route(async () => {
  const { user } = await requireUser({ requireVerified: true });
  if (await hitRateLimit(`gen:${user.id}`, 10, 60)) throw new HttpError(429, "Demasiadas generaciones seguidas. Espera un momento.");
  const db = getDb();
  await ensureAutomation(db, user.id);
  try {
    const v = await generateInstructionVersion(db, user.id);
    return json({ ok: true, versionId: v.id, version: v.version });
  } catch (e) {
    if (e instanceof AiError) throw new HttpError(502, e.message, `ai_${e.kind}`);
    if (e instanceof ZodError) throw new HttpError(502, "La IA devolvió una propuesta incompleta. Intenta regenerarla.");
    if (e instanceof Error) throw new HttpError(400, e.message);
    throw e;
  }
});
