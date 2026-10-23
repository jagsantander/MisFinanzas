import { sql } from "drizzle-orm";
import {
  pgTable, uuid, text, timestamp, boolean, integer, bigint, jsonb, date, real,
  uniqueIndex, index,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });
const money = (name: string) => bigint(name, { mode: "bigint" });
const userRef = () => uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" });

// ───────────────────────── Usuarios y acceso ─────────────────────────
export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  emailVerifiedAt: ts("email_verified_at"),
  passwordHash: text("password_hash").notNull(),
  termsVersion: text("terms_version").notNull(),
  termsAcceptedAt: ts("terms_accepted_at").notNull(),
  dataProcessingAcceptedAt: ts("data_processing_accepted_at").notNull(),
  currency: text("currency").notNull().default("CLP"),
  timezone: text("timezone").notNull().default("America/Santiago"),
  monthStartDay: integer("month_start_day").notNull().default(1),
  theme: text("theme").notNull().default("system"),
  budgetThresholds: jsonb("budget_thresholds").$type<number[]>().notNull().default([80, 100]),
  notifyChannels: jsonb("notify_channels").$type<{ inApp: true; push: boolean; email: boolean }>()
    .notNull().default({ inApp: true, push: false, email: false }),
  quietStart: text("quiet_start").notNull().default("22:00"),
  quietEnd: text("quiet_end").notNull().default("08:00"),
  hideSensitiveInPush: boolean("hide_sensitive_in_push").notNull().default(true),
  localLockMinutes: integer("local_lock_minutes"),
  onboardingStep: text("onboarding_step").notNull().default("preferences"),
  onboardingCompletedAt: ts("onboarding_completed_at"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("users_email_uq").on(sql`lower(${t.email})`)]);

export const sessions = pgTable("sessions", {
  id: id(),
  userId: userRef(),
  tokenHash: text("token_hash").notNull(),
  authMethod: text("auth_method").notNull(), // password | passkey
  userAgent: text("user_agent"),
  createdAt: createdAt(),
  lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
  expiresAt: ts("expires_at").notNull(),
  lockedAt: ts("locked_at"),
  revokedAt: ts("revoked_at"),
}, (t) => [uniqueIndex("sessions_token_uq").on(t.tokenHash), index("sessions_user_idx").on(t.userId)]);

export const authTokens = pgTable("auth_tokens", {
  id: id(),
  userId: userRef(),
  purpose: text("purpose").notNull(), // verify_email | reset_password | change_email
  tokenHash: text("token_hash").notNull(),
  newEmail: text("new_email"),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("auth_tokens_hash_uq").on(t.tokenHash)]);

export const loginAttempts = pgTable("login_attempts", {
  id: id(),
  key: text("key").notNull(),
  success: boolean("success").notNull(),
  createdAt: createdAt(),
}, (t) => [index("login_attempts_key_idx").on(t.key, t.createdAt)]);

export const passkeys = pgTable("passkeys", {
  id: id(),
  userId: userRef(),
  credentialId: text("credential_id").notNull(),
  publicKey: text("public_key").notNull(), // base64url (clave pública, no biometría)
  counter: bigint("counter", { mode: "number" }).notNull().default(0),
  transports: jsonb("transports").$type<string[]>(),
  deviceType: text("device_type"),
  backedUp: boolean("backed_up").notNull().default(false),
  name: text("name").notNull(),
  createdAt: createdAt(),
  lastUsedAt: ts("last_used_at"),
}, (t) => [uniqueIndex("passkeys_cred_uq").on(t.credentialId)]);

export const webauthnChallenges = pgTable("webauthn_challenges", {
  id: id(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id"),
  purpose: text("purpose").notNull(), // register | login | unlock
  challenge: text("challenge").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: createdAt(),
});

// ───────────────────────── Conexiones ─────────────────────────
export const oauthStates = pgTable("oauth_states", {
  state: text("state").primaryKey(),
  userId: userRef(),
  provider: text("provider").notNull(),
  codeVerifier: text("code_verifier").notNull(),
  returnTo: text("return_to").notNull(),
  expiresAt: ts("expires_at").notNull(),
});

export const mailConnections = pgTable("mail_connections", {
  id: id(),
  userId: userRef(),
  provider: text("provider").notNull(), // gmail | outlook
  accountEmail: text("account_email").notNull(),
  scopes: text("scopes").notNull(),
  encryptedTokens: text("encrypted_tokens"), // null tras desconectar
  accessTokenExpiresAt: ts("access_token_expires_at"),
  status: text("status").notNull().default("active"), // active | reauth_required | error | disconnected
  lastError: text("last_error"),
  financialReadConsentAt: ts("financial_read_consent_at").notNull(),
  lastSuccessfulSyncAt: ts("last_successful_sync_at"),
  syncCursor: jsonb("sync_cursor").$type<{ lastReceivedAt?: string }>(),
  createdAt: createdAt(),
  disconnectedAt: ts("disconnected_at"),
}, (t) => [index("mail_conn_user_idx").on(t.userId)]);

export const aiConnections = pgTable("ai_connections", {
  id: id(),
  userId: userRef(),
  provider: text("provider").notNull(), // openai | anthropic | gemini
  encryptedKey: text("encrypted_key"),
  keyHint: text("key_hint").notNull(),
  model: text("model"),
  status: text("status").notNull().default("untested"), // untested | ok | error | quota | limit_reached | removed
  lastError: text("last_error"),
  lastTestedAt: ts("last_tested_at"),
  lastSuccessAt: ts("last_success_at"),
  monthlyLimitUsdMicros: money("monthly_limit_usd_micros"),
  monthlyTokenLimit: bigint("monthly_token_limit", { mode: "number" }),
  createdAt: createdAt(),
  removedAt: ts("removed_at"),
}, (t) => [index("ai_conn_user_idx").on(t.userId)]);

// ───────────────────────── Categorías, movimientos, reglas ─────────────────────────
export const categories = pgTable("categories", {
  id: id(),
  userId: userRef(),
  kind: text("kind").notNull(), // expense | income
  parentId: uuid("parent_id"),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("dots"),
  color: text("color").notNull().default("#64748b"),
  sortOrder: integer("sort_order").notNull().default(0),
  archivedAt: ts("archived_at"),
  createdAt: createdAt(),
}, (t) => [index("categories_user_idx").on(t.userId)]);

export const movements = pgTable("movements", {
  id: id(),
  userId: userRef(),
  kind: text("kind").notNull(), // expense | income | own_transfer | card_payment | refund | reversal
  status: text("status").notNull().default("confirmed"), // confirmed | review | pending
  amountMinor: money("amount_minor").notNull(), // siempre positivo, en unidades mínimas
  currency: text("currency").notNull(),
  occurredOn: date("occurred_on").notNull(),
  occurredTime: text("occurred_time"),
  receivedAt: ts("received_at"),
  description: text("description").notNull().default(""),
  merchant: text("merchant"),
  counterparty: text("counterparty"),
  bank: text("bank"),
  accountMask: text("account_mask"),
  operationRef: text("operation_ref"),
  categoryId: uuid("category_id"),
  subcategoryId: uuid("subcategory_id"),
  categorySource: text("category_source").notNull().default("none"), // manual | rule | ai | none
  ruleId: uuid("rule_id"),
  suggestedCategory: text("suggested_category"),
  notes: text("notes"),
  reviewReason: text("review_reason"),
  reviewedAt: ts("reviewed_at"),
  excluded: boolean("excluded").notNull().default(false),
  source: text("source").notNull(), // manual | email
  sourceConnectionId: uuid("source_connection_id"),
  sourceMessageId: text("source_message_id"),
  sourceIndex: integer("source_index"),
  senderDomain: text("sender_domain"),
  confidence: real("confidence"),
  runId: uuid("run_id"),
  relatedMovementId: uuid("related_movement_id"),
  possibleDuplicateOf: uuid("possible_duplicate_of"),
  lockedFields: jsonb("locked_fields").$type<string[]>().notNull().default([]),
  deletedAt: ts("deleted_at"),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [
  index("movements_user_date_idx").on(t.userId, t.occurredOn),
  // Lápida: un correo+índice solo genera un movimiento aunque se haya eliminado.
  uniqueIndex("movements_source_uq").on(t.userId, t.sourceMessageId, t.sourceIndex),
  index("movements_opref_idx").on(t.userId, t.operationRef),
]);

export const movementSources = pgTable("movement_sources", {
  id: id(),
  movementId: uuid("movement_id").notNull().references(() => movements.id, { onDelete: "cascade" }),
  userId: userRef(),
  messageId: text("message_id").notNull(),
  receivedAt: ts("received_at"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("movement_sources_uq").on(t.movementId, t.messageId)]);

export const movementChanges = pgTable("movement_changes", {
  id: id(),
  movementId: uuid("movement_id").notNull().references(() => movements.id, { onDelete: "cascade" }),
  userId: userRef(),
  actor: text("actor").notNull(), // user | sync | rule | system
  action: text("action").notNull(),
  changes: jsonb("changes").$type<Record<string, { from: unknown; to: unknown }>>(),
  createdAt: createdAt(),
}, (t) => [index("movement_changes_mv_idx").on(t.movementId)]);

export type RuleConditions = {
  merchantContains?: string;
  senderContains?: string;
  descriptionContains?: string;
  accountMask?: string;
  kind?: string;
};
export const rules = pgTable("rules", {
  id: id(),
  userId: userRef(),
  priority: integer("priority").notNull(),
  name: text("name").notNull(),
  conditions: jsonb("conditions").$type<RuleConditions>().notNull(),
  categoryId: uuid("category_id").notNull(),
  subcategoryId: uuid("subcategory_id"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [index("rules_user_idx").on(t.userId)]);

// ───────────────────────── Presupuestos ─────────────────────────
export const budgets = pgTable("budgets", {
  id: id(),
  userId: userRef(),
  scopeKey: text("scope_key").notNull(), // total | cat:<uuid> | sub:<uuid>
  categoryId: uuid("category_id"),
  subcategoryId: uuid("subcategory_id"),
  amountMinor: money("amount_minor").notNull(),
  currency: text("currency").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("budgets_scope_uq").on(t.userId, t.scopeKey)]);

export const budgetOverrides = pgTable("budget_overrides", {
  id: id(),
  budgetId: uuid("budget_id").notNull().references(() => budgets.id, { onDelete: "cascade" }),
  userId: userRef(),
  periodKey: text("period_key").notNull(), // YYYY-MM (mes en que inicia el período)
  amountMinor: money("amount_minor").notNull(),
}, (t) => [uniqueIndex("budget_overrides_uq").on(t.budgetId, t.periodKey)]);

export const budgetAlertStates = pgTable("budget_alert_states", {
  id: id(),
  userId: userRef(),
  budgetId: uuid("budget_id").notNull().references(() => budgets.id, { onDelete: "cascade" }),
  periodKey: text("period_key").notNull(),
  threshold: integer("threshold").notNull(), // 80, 100, 101 (= superado)
  notifiedAt: ts("notified_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("budget_alert_uq").on(t.budgetId, t.periodKey, t.threshold)]);

// ───────────────────────── Notificaciones ─────────────────────────
export const notifications = pgTable("notifications", {
  id: id(),
  userId: userRef(),
  type: text("type").notNull(),
  severity: text("severity").notNull().default("info"), // info | warning | danger | success
  title: text("title").notNull(),
  body: text("body").notNull(),
  publicTitle: text("public_title").notNull(), // versión sin datos sensibles (pantalla bloqueada)
  link: text("link"),
  dedupeKey: text("dedupe_key"),
  readAt: ts("read_at"),
  deliverAfter: ts("deliver_after").notNull().defaultNow(),
  pushStatus: text("push_status").notNull().default("skip"), // pending | sent | failed | skip
  emailStatus: text("email_status").notNull().default("skip"),
  createdAt: createdAt(),
}, (t) => [
  index("notifications_user_idx").on(t.userId, t.createdAt),
  uniqueIndex("notifications_dedupe_uq").on(t.userId, t.dedupeKey),
]);

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: id(),
  userId: userRef(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("push_endpoint_uq").on(t.endpoint)]);

// ───────────────────────── Automatización ─────────────────────────
export type AutomationPrefs = {
  scheduleTime: string; // HH:mm local
  timezone: string;
  initialPeriodDays: number;
  overlapHours: number;
  movementTypes: string[]; // purchase, transfer_in, transfer_out, service_charge, refund, reversal, fee, salary
  notifyChannels: string[]; // in_app, push, email
  maxMessagesPerRun: number;
  extraHints: string; // indicaciones del usuario (validadas, sin poder anular restricciones)
  bankSenders: string[]; // dominios/remitentes bancarios preferidos
};

export const automations = pgTable("automations", {
  id: id(),
  userId: userRef(),
  status: text("status").notNull().default("pending_approval"), // pending_approval | active | paused | error | cancelled
  mode: text("mode").notNull().default("server"), // server | provider_native
  prefs: jsonb("prefs").$type<AutomationPrefs>().notNull(),
  aiConnectionId: uuid("ai_connection_id"),
  mailConnectionId: uuid("mail_connection_id"),
  approvedVersionId: uuid("approved_version_id"),
  nextRunAt: ts("next_run_at"),
  pausedReason: text("paused_reason"),
  externalTaskId: text("external_task_id"),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("automations_user_uq").on(t.userId)]);

export const instructionVersions = pgTable("instruction_versions", {
  id: id(),
  automationId: uuid("automation_id").notNull().references(() => automations.id, { onDelete: "cascade" }),
  userId: userRef(),
  version: integer("version").notNull(),
  configSnapshot: jsonb("config_snapshot").notNull(),
  configHash: text("config_hash").notNull(),
  proposal: jsonb("proposal").notNull(),
  instructionText: text("instruction_text").notNull(),
  instructionHash: text("instruction_hash").notNull(),
  generatedWith: text("generated_with").notNull(),
  status: text("status").notNull().default("proposed"), // proposed | approved | superseded | discarded
  approvedAt: ts("approved_at"),
  approvedBy: uuid("approved_by"),
  approvalUserAgent: text("approval_user_agent"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("instruction_versions_uq").on(t.automationId, t.version)]);

export const automationRuns = pgTable("automation_runs", {
  id: id(),
  userId: userRef(),
  automationId: uuid("automation_id").notNull().references(() => automations.id, { onDelete: "cascade" }),
  trigger: text("trigger").notNull(), // scheduled | manual | initial
  slotKey: text("slot_key"), // fecha local del horario programado: evita duplicados
  instructionVersionId: uuid("instruction_version_id"),
  status: text("status").notNull().default("queued"), // queued | running | succeeded | partial | failed | blocked
  startedAt: ts("started_at"),
  finishedAt: ts("finished_at"),
  messagesFound: integer("messages_found").notNull().default(0),
  messagesAnalyzed: integer("messages_analyzed").notNull().default(0),
  messagesFailed: integer("messages_failed").notNull().default(0),
  movementsCreated: integer("movements_created").notNull().default(0),
  movementsReview: integer("movements_review").notNull().default(0),
  duplicatesSkipped: integer("duplicates_skipped").notNull().default(0),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  costUsdMicros: money("cost_usd_micros").notNull().default(sql`0`),
  error: text("error"),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("automation_runs_slot_uq").on(t.automationId, t.slotKey),
  // Una sola ejecución en curso por cuenta (evita ejecuciones simultáneas).
  uniqueIndex("automation_runs_one_running_uq").on(t.automationId).where(sql`status = 'running'`),
  index("automation_runs_user_idx").on(t.userId, t.createdAt),
]);

export const processedMessages = pgTable("processed_messages", {
  id: id(),
  userId: userRef(),
  connectionId: uuid("connection_id").notNull(),
  messageId: text("message_id").notNull(),
  status: text("status").notNull(), // pending | processed | failed | not_financial
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  runId: uuid("run_id"),
  instructionVersionId: uuid("instruction_version_id"),
  receivedAt: ts("received_at"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("processed_messages_uq").on(t.userId, t.connectionId, t.messageId)]);

export const aiUsage = pgTable("ai_usage", {
  id: id(),
  userId: userRef(),
  aiConnectionId: uuid("ai_connection_id").notNull(),
  runId: uuid("run_id"),
  purpose: text("purpose").notNull(), // test | instruction | extraction
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  ok: boolean("ok").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  costUsdMicros: money("cost_usd_micros"),
  createdAt: createdAt(),
}, (t) => [index("ai_usage_user_idx").on(t.userId, t.createdAt)]);

// ───────────────────────── Cola de tareas y auditoría ─────────────────────────
export const jobs = pgTable("jobs", {
  id: id(),
  type: text("type").notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  payload: jsonb("payload").notNull().default({}),
  idempotencyKey: text("idempotency_key"),
  status: text("status").notNull().default("queued"), // queued | running | done | failed
  runAt: ts("run_at").notNull().defaultNow(),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  lockedUntil: ts("locked_until"),
  lockedBy: text("locked_by"),
  lastError: text("last_error"),
  createdAt: createdAt(),
  finishedAt: ts("finished_at"),
}, (t) => [
  uniqueIndex("jobs_idem_uq").on(t.idempotencyKey),
  index("jobs_due_idx").on(t.status, t.runAt),
]);

export const auditLog = pgTable("audit_log", {
  id: id(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  meta: jsonb("meta"),
  createdAt: createdAt(),
}, (t) => [index("audit_user_idx").on(t.userId, t.createdAt)]);

export const devOutbox = pgTable("dev_outbox", {
  id: id(),
  to: text("to_address").notNull(),
  subject: text("subject").notNull(),
  text: text("text").notNull(),
  createdAt: createdAt(),
});

export type User = typeof users.$inferSelect;
export type Movement = typeof movements.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Automation = typeof automations.$inferSelect;
export type InstructionVersion = typeof instructionVersions.$inferSelect;
