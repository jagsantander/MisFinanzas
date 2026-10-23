import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { body, json, requireUser, route } from "@/lib/http";

const STEPS = ["preferences", "mail", "ai", "period", "instruction", "first_sync", "budgets", "done"] as const;

export const POST = route(async (req) => {
  const { user } = await requireUser();
  const { step } = await body(req, z.object({ step: z.enum(STEPS) }));
  await getDb().update(schema.users).set({ onboardingStep: step, onboardingCompletedAt: step === "done" ? new Date() : null }).where(eq(schema.users.id, user.id));
  return json({ ok: true });
});
