/** Registros tal como se guardan en el navegador y en la planilla (JSON; montos como texto exacto). */
export type Kind = "expense" | "income" | "own_transfer" | "card_payment" | "refund" | "reversal";

export type Movement = {
  id: string; kind: Kind; status: "confirmed" | "review" | "pending";
  amountMinor: string; currency: string; occurredOn: string; occurredTime: string | null; receivedAt?: string | null;
  description: string; merchant: string | null; counterparty?: string | null; bank?: string | null; accountMask: string | null;
  operationRef?: string | null; categoryId: string | null; subcategoryId: string | null;
  categorySource: "manual" | "rule" | "ai" | "none"; ruleId?: string | null; suggestedCategory?: string | null;
  notes: string | null; reviewReason?: string | null; reviewedAt?: string | null; excluded: boolean;
  source: "manual" | "email"; sourceMessageId?: string | null; sourceIndex?: number | null; senderDomain?: string | null;
  confidence?: number | null; runId?: string | null; relatedMovementId?: string | null; possibleDuplicateOf?: string | null;
  lockedFields: string[]; deletedAt: string | null; createdAt: string; updatedAt: string;
};
export type Category = { id: string; kind: "expense" | "income"; parentId: string | null; name: string; icon: string; color: string; sortOrder: number; archivedAt: string | null; deletedAt?: string | null; updatedAt: string };
export type RuleConditions = { merchantContains?: string; senderContains?: string; descriptionContains?: string; accountMask?: string; kind?: string };
export type Rule = { id: string; priority: number; name: string; conditions: RuleConditions; categoryId: string; subcategoryId: string | null; active: boolean; deletedAt?: string | null; updatedAt: string };
export type Budget = { id: string; scopeKey: string; categoryId: string | null; subcategoryId: string | null; amountMinor: string; currency: string; active: boolean; deletedAt?: string | null; updatedAt: string };
export type Override = { id: string; budgetId: string; periodKey: string; amountMinor: string; deletedAt?: string | null; updatedAt: string };
export type AlertState = { id: string; budgetId: string; periodKey: string; threshold: number; updatedAt: string };
export type Notice = { id: string; type: string; severity: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string; updatedAt: string; emailStatus?: string };
export type Change = { id: string; movementId?: string; entity?: string; actor: string; action: string; changes?: Record<string, { from: unknown; to: unknown }> | null; data?: unknown; createdAt: string; updatedAt: string };
export type Run = {
  id: string; trigger: string; status: string; startedAt: string; finishedAt: string | null; messagesFound: number; messagesAnalyzed: number;
  messagesFailed: number; movementsCreated: number; movementsReview: number; duplicatesSkipped: number; inputTokens: number; outputTokens: number; error: string | null; note?: string | null;
};

export type Tables = {
  movements: Movement[]; categories: Category[]; rules: Rule[]; budgets: Budget[]; overrides: Override[];
  alertStates: AlertState[]; notifications: Notice[]; changes: Change[]; runs: Run[];
};
export type TableName = keyof Tables;
export const SYNCED_TABLES: TableName[] = ["movements", "categories", "rules", "budgets", "overrides", "alertStates", "notifications", "changes"];

export type Settings = {
  name: string; currency: string; timezone: string; monthStartDay: number; theme: "system" | "light" | "dark";
  budgetThresholds: number[]; quietStart: string; quietEnd: string; notifyEmail: boolean; onboardingDone: boolean;
};
export const DEFAULT_SETTINGS: Settings = {
  name: "", currency: "CLP", timezone: "America/Santiago", monthStartDay: 1, theme: "system", budgetThresholds: [80, 100],
  quietStart: "22:00", quietEnd: "08:00", notifyEmail: true, onboardingDone: false,
};

export type InstructionRow = { version: number; status: string; generatedAt: string; approvedAt: string | null; approvedBy: string | null; configHash: string; textHash: string; mode: string; text: string };
export type AutomationPrefs = {
  scheduleTime: string; timezone: string; initialPeriodDays: number; overlapHours: number; maxMessagesPerRun: number;
  movementTypes: string[]; extraHints: string; bankSenders: string[]; claudeGmailAccount: string;
};
/** Estado de la actualización nocturna, tal como lo entrega el script (sin secretos). */
export type AutomationView = {
  mode: "none" | "google" | "claude"; status: string; pausedReason: string | null; prefs: AutomationPrefs;
  ai: { provider: string | null; model: string | null; keyHint: string | null; status: string; lastError: string | null; monthlyTokenLimit: number | null };
  nextRunAt: string | null; lastRun: { id: string; status: string; finishedAt: string; created: number; review: number; error: string | null; trigger: string } | null;
  lastSuccessAt: string | null; approved: InstructionRow | null; proposed: InstructionRow | null; configMatchesApproval: boolean;
  snapshot: Record<string, any>; account: string; movementTypes: Record<string, string>; hasAiKey: boolean; triggerActive: boolean;
  usage: { month: string; tokens: number };
};

export type Connection = { url: string; token: string };
