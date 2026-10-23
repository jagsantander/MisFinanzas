import type { Movement, RuleConditions } from "../db/schema";
import { norm } from "../text";

export type RuleLike = { id: string; priority: number; active: boolean; conditions: RuleConditions; categoryId: string; subcategoryId: string | null };
type Target = Pick<Movement, "merchant" | "description" | "accountMask" | "kind" | "senderDomain" | "counterparty">;

export function ruleMatches(r: RuleLike, m: Target): boolean {
  const c = r.conditions;
  const keys = Object.entries(c).filter(([, v]) => v !== undefined && v !== "");
  if (!keys.length) return false; // una regla vacía nunca aplica
  if (c.merchantContains && !norm(`${m.merchant ?? ""} ${m.counterparty ?? ""}`).includes(norm(c.merchantContains))) return false;
  if (c.descriptionContains && !norm(m.description).includes(norm(c.descriptionContains))) return false;
  if (c.senderContains && !norm(m.senderDomain).includes(norm(c.senderContains))) return false;
  if (c.accountMask && !(m.accountMask ?? "").includes(c.accountMask)) return false;
  if (c.kind && m.kind !== c.kind) return false;
  return true;
}

/** Primera regla activa que coincide, en orden de prioridad (menor número = mayor prioridad). */
export function firstMatchingRule<R extends RuleLike>(rules: R[], m: Target): R | null {
  return [...rules].filter((r) => r.active).sort((a, b) => a.priority - b.priority).find((r) => ruleMatches(r, m)) ?? null;
}
