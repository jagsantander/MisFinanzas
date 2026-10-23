import { z } from "zod";
export const RuleConditionsSchema = z.object({
  merchantContains: z.string().trim().max(60).optional(),
  senderContains: z.string().trim().max(60).optional(),
  descriptionContains: z.string().trim().max(60).optional(),
  accountMask: z.string().trim().max(30).optional(),
  kind: z.enum(["expense", "income"]).optional(),
}).refine((c) => Object.values(c).some((v) => v), "Define al menos un criterio");
