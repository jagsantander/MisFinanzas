import { beforeEach, describe, expect, it } from "vitest";
import { createGoogle } from "./harness";

type G = ReturnType<typeof createGoogle>;
let G: G;
const app = (action: string, extra: Record<string, unknown> = {}) => G.post({ action, token: G.appToken(), ...extra });

/** Respuestas simuladas de los proveedores de IA, según el correo que se analiza. */
const scripted = new Map<string, unknown>();
function aiOk(provider: "gemini" | "anthropic" | "openai") {
  G.onFetch((url, params) => {
    if (url.includes("/models") && !url.includes(":generateContent")) {
      return { code: 200, body: provider === "gemini" ? { models: [{ name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] }] } : { data: [{ id: "claude-haiku-5-5" }, { id: "gpt-4.1-mini" }] } };
    }
    const payload = JSON.parse(params.payload);
    const text = provider === "gemini" ? payload.contents[0].parts[0].text : provider === "anthropic" ? payload.messages[0].content : payload.input[1].content;
    let out: unknown = { message_type: "other", operations: [] };
    if (/nightly_instruction_proposal|Categorías:/.test(text)) out = { classification_guidelines: ["Supermercados van a Alimentación", "Bencineras van a Transporte", "Farmacias a Salud"], ambiguity_guidelines: ["Duda si no hay monto"], merchant_hints: [{ pattern: "LIDER", category: "Alimentación" }, { pattern: "x", category: "Inventada" }] };
    else { const subject = /Asunto: (.*)/.exec(text)?.[1] ?? ""; if (scripted.has(subject)) out = scripted.get(subject); }
    const json = JSON.stringify(out);
    if (provider === "gemini") return { code: 200, body: { candidates: [{ content: { parts: [{ text: json }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 100 } } };
    if (provider === "anthropic") return { code: 200, body: { stop_reason: "end_turn", content: [{ type: "text", text: json }], usage: { input_tokens: 900, output_tokens: 100 } } };
    return { code: 200, body: { output: [{ type: "message", content: [{ type: "output_text", text: json }] }], usage: { input_tokens: 900, output_tokens: 100 } } };
  });
}
const op = (p: Record<string, unknown>) => ({ status: "completed", kind: "expense", amount_text: "$10.000", currency: "CLP", occurred_date: "2026-10-24", occurred_time: null, merchant: null, counterparty: null, bank: "Banco", account_mask: "1234", description: "x", operation_id: null, category: null, subcategory: null, confidence: 0.95, ambiguity: null, ...p });
const rows = (name: string) => G.sheets.get(name)!.rows.slice(1);
const movements = () => (app("pull").tables.movements as any[]);

beforeEach(() => {
  G = createGoogle();
  scripted.clear();
  G.g.instalar();
});

describe("instalación y acceso", () => {
  it("crea hojas, categorías iniciales y tokens distintos; repetir no duplica", () => {
    expect([...G.sheets.keys()]).toEqual(expect.arrayContaining(["Movimientos", "Categorías", "Presupuestos", "Instrucciones", "Correos"]));
    const n = rows("Categorías").length;
    expect(n).toBeGreaterThan(19);
    G.g.instalar();
    expect(rows("Categorías").length).toBe(n);
    expect(G.appToken()).toHaveLength(64);
    expect(G.appToken()).not.toBe(G.importToken());
  });
  it("rechaza tokens inválidos y limita intentos repetidos", () => {
    expect(G.post({ action: "pull", token: "malo" })).toMatchObject({ ok: false, code: "unauthorized" });
    for (let i = 0; i < 20; i++) G.post({ action: "pull", token: "malo" });
    expect(app("pull")).toMatchObject({ ok: false, code: "rate_limited" });
  });
  it("el token de importación no sirve para leer ni modificar datos", () => {
    for (const action of ["pull", "push", "setAiKey", "approve", "importCredentials"]) {
      expect(G.post({ action, token: G.importToken() })).toMatchObject({ ok: false, code: "unauthorized" });
    }
  });
});

describe("sincronización", () => {
  it("push/pull con last-write-wins y espejo legible en la hoja", () => {
    const cat = (app("pull").tables.categories as any[]).find((c) => c.name === "Alimentación");
    const m = { id: "m1", kind: "expense", status: "confirmed", amountMinor: "62500", currency: "CLP", occurredOn: "2026-10-24", description: "Supermercado", categoryId: cat.id, source: "manual", excluded: false, updatedAt: "2026-10-24T10:00:00.000Z" };
    expect(app("push", { changes: [{ table: "movements", record: m }] }).applied).toBe(1);
    expect(app("push", { changes: [{ table: "movements", record: { ...m, description: "viejo", updatedAt: "2026-10-24T09:00:00.000Z" } }] }).applied).toBe(0);
    app("push", { changes: [{ table: "movements", record: { ...m, description: "Líder", updatedAt: "2026-10-24T11:00:00.000Z" } }] });
    expect(movements()).toHaveLength(1);
    expect(movements()[0].description).toBe("Líder");
    const row = rows("Movimientos")[0];
    expect(row[5]).toBe(-62500); // monto con signo de gasto
    expect(row[9]).toBe("Alimentación");
    expect(() => 0).not.toThrow();
    expect(app("push", { changes: [{ table: "runs", record: { id: "x" } }] })).toMatchObject({ ok: false });
  });
});

describe("modalidad Google: script en la cuenta del usuario", () => {
  function setupGoogle() {
    aiOk("gemini");
    const r = app("setAiKey", { provider: "gemini", apiKey: "AIzaPRUEBA0000000000000000000000000" });
    expect(r.ok).toBe(true);
    expect(JSON.stringify(app("pull"))).not.toContain("AIzaPRUEBA"); // la clave nunca vuelve a la app
    expect(app("setAi", { model: "gemini-2.5-flash" }).ok).toBe(true);
    expect(app("setPrefs", { mode: "google" }).automation.status).toBe("pending_approval");
  }

  it("no se activa sin validación explícita; aprobar crea el disparador real", () => {
    setupGoogle();
    const gen = app("generate");
    const v = gen.automation.proposed;
    expect(v.text).toContain("Lugar de ejecución");
    expect(v.text).toContain("Supermercados van a Alimentación");
    expect(v.text).not.toContain("Inventada"); // pistas con categorías inexistentes se descartan
    expect(v.text).not.toMatch(/AIza|token":/);
    expect(app("approve", { version: v.version })).toMatchObject({ ok: false });
    expect(app("runNow")).toMatchObject({ ok: false });
    expect(G.triggers).toHaveLength(0);
    const ok = app("approve", { version: v.version, confirmed: true });
    expect(ok.automation.status).toBe("active");
    expect(G.triggers.filter((t) => t.fn === "nightlyRun")).toHaveLength(1);
    expect(G.triggers[0].spec).toMatchObject({ hour: 3, minute: 0, tz: "America/Santiago", everyDays: 1 });
    const instr = rows("Instrucciones").find((r) => r[1] === "aprobada")!;
    expect(instr[4]).toBe("ana.prueba@gmail.com");
    expect(instr[8]).toBe(v.text);
  });

  it("cambiar el horario invalida la aprobación y elimina el disparador", () => {
    setupGoogle();
    const v = app("generate").automation.proposed;
    app("approve", { version: v.version, confirmed: true });
    const r = app("setPrefs", { prefs: { scheduleTime: "04:00" } });
    expect(r.automation.status).toBe("pending_approval");
    expect(G.triggers.filter((t) => t.fn === "nightlyRun")).toHaveLength(0);
    expect(app("resume")).toMatchObject({ ok: false });
  });

  it("importa desde Gmail, valida, deduplica y no reanaliza", () => {
    setupGoogle();
    app("approve", { version: app("generate").automation.proposed.version, confirmed: true });
    const d = new Date();
    G.mailbox.push(
      { id: "g1", from: "Banco <avisos@bancochile.cl>", subject: "Compras", date: d, body: "Compras: $62.500 en LIDER y $45.000 en COPEC. Tarjeta 4111 1111 1111 1234" },
      { id: "g2", from: "Banco <avisos@bancochile.cl>", subject: "Rechazada", date: d, body: "Compra por $99.000 rechazada" },
      { id: "g3", from: "Banco <avisos@bancochile.cl>", subject: "Op 777", date: d, body: "Compra $120.000 FALABELLA op 777" },
      { id: "g4", from: "Banco <avisos@bancochile.cl>", subject: "Op 777 copia", date: d, body: "Comprobante $120.000 FALABELLA op 777" },
      { id: "g5", from: "amigo <a@personal.test>", subject: "Hola", date: d, body: "Nos vemos" },
      { id: "g6", from: "Banco <avisos@bancochile.cl>", subject: "Inventado", date: d, body: "Abono recibido" },
    );
    scripted.set("Compras", { message_type: "transaction_notice", operations: [op({ amount_text: "$62.500", merchant: "LIDER", category: "Alimentación", subcategory: "Supermercado" }), op({ amount_text: "$45.000", merchant: "COPEC", category: "Transporte" })] });
    scripted.set("Rechazada", { message_type: "rejected_attempt", operations: [op({ status: "rejected", amount_text: "$99.000" })] });
    scripted.set("Op 777", { message_type: "transaction_notice", operations: [op({ amount_text: "$120.000", merchant: "FALABELLA", operation_id: "777" })] });
    scripted.set("Op 777 copia", { message_type: "transaction_notice", operations: [op({ amount_text: "$120.000", merchant: "FALABELLA", operation_id: "777" })] });
    scripted.set("Inventado", { message_type: "transaction_notice", operations: [op({ kind: "income", amount_text: "$500.000" })] });
    const r = app("runNow");
    expect(r.ok).toBe(true);
    expect(r.run.status).toBe("succeeded");
    const ms = movements();
    expect(ms.filter((m) => m.sourceMessageId === "g1")).toHaveLength(2);
    expect(ms.some((m) => m.amountMinor === "99000")).toBe(false);
    expect(ms.filter((m) => m.operationRef === "777")).toHaveLength(1);
    const invented = ms.find((m) => m.amountMinor === "500000");
    expect(invented.status).toBe("review"); // el monto no aparece en el correo
    // El correo personal no se envió a la IA.
    expect(G.fetches.filter((f) => f.url.includes(":generateContent") && f.params.payload.includes("Nos vemos"))).toHaveLength(0);
    // Todas las llamadas usan la clave del dueño.
    expect(G.fetches.every((f) => f.params.headers["x-goog-api-key"] === "AIzaPRUEBA0000000000000000000000000")).toBe(true);

    const calls = G.fetches.length;
    const r2 = app("runNow");
    expect(r2.run.movementsCreated).toBe(0);
    expect(G.fetches.length).toBe(calls); // nada se reanaliza
    expect(movements()).toHaveLength(ms.length);
  });

  it("correcciones manuales y eliminaciones sobreviven a la reimportación", () => {
    setupGoogle();
    app("approve", { version: app("generate").automation.proposed.version, confirmed: true });
    G.mailbox.push({ id: "g1", from: "x@bancochile.cl", subject: "Compra", date: new Date(), body: "Compra $10.000 LIDER" });
    scripted.set("Compra", { message_type: "transaction_notice", operations: [op({ merchant: "LIDER", category: "Alimentación" })] });
    app("runNow");
    const m = movements()[0];
    app("push", { changes: [{ table: "movements", record: { ...m, categoryId: null, notes: "corregido", lockedFields: ["categoryId"], deletedAt: "2026-10-25T00:00:00.000Z", updatedAt: new Date(Date.now() + 1000).toISOString() } }] });
    G.props.set("AUTOMATION", JSON.stringify({ ...JSON.parse(G.props.get("AUTOMATION")!), lastSuccessAt: null }));
    G.sheets.get("Correos")!.rows.splice(1); // simula perder el registro de correos procesados
    app("runNow");
    const all = app("pull").tables.movements as any[];
    expect(all).toHaveLength(1);
    expect(all[0].notes).toBe("corregido");
    expect(all[0].deletedAt).not.toBeNull();
  });

  it("si la IA falla no marca el correo como procesado y una cuota agotada pausa sin cambiar de proveedor", () => {
    setupGoogle();
    app("approve", { version: app("generate").automation.proposed.version, confirmed: true });
    G.mailbox.push({ id: "g1", from: "x@bancochile.cl", subject: "Compra", date: new Date(), body: "Compra $10.000" });
    G.onFetch(() => ({ code: 429, body: { error: { message: "quota exceeded for this billing period" } } }));
    const r = app("runNow");
    expect(r.run.status).toBe("failed");
    expect(rows("Correos")[0][3]).toContain('"status":"failed"');
    const a = app("pull").automation;
    expect(a.status).toBe("paused");
    expect(G.fetches.every((f) => f.url.includes("generativelanguage.googleapis.com"))).toBe(true);
    aiOk("gemini");
    scripted.set("Compra", { message_type: "transaction_notice", operations: [op({})] });
    app("resume");
    expect(app("runNow").run.movementsCreated).toBe(1);
  });

  it("límite mensual de tokens de MisFinanzas bloquea antes de llamar", () => {
    setupGoogle();
    app("setAi", { monthlyTokenLimit: 10000 });
    app("approve", { version: app("generate").automation.proposed.version, confirmed: true });
    G.props.set("USAGE", JSON.stringify({ [new Date().toISOString().slice(0, 7)]: 10000 }));
    const before = G.fetches.length;
    expect(app("runNow")).toMatchObject({ ok: false });
    expect(G.fetches.length).toBe(before);
  });

  it("una sola corrida programada por día local", () => {
    setupGoogle();
    app("approve", { version: app("generate").automation.proposed.version, confirmed: true });
    G.g.nightlyRun();
    const runs1 = rows("Ejecuciones").length;
    G.g.nightlyRun();
    expect(rows("Ejecuciones").length).toBe(runs1);
  });
});

describe("modalidad Claude: tarea programada en claude.ai", () => {
  function setupClaude() {
    app("setPrefs", { mode: "claude", prefs: { claudeGmailAccount: "ana.prueba@gmail.com" } });
    const v = app("generate").automation.proposed;
    expect(v.text).toContain("$MISFINANZAS_IMPORT_TOKEN");
    expect(v.text).not.toContain(G.importToken());
    return v;
  }
  const imp = (emails: unknown[]) => G.post({ action: "import", token: G.importToken(), emails });
  const email = (id: string, ops: unknown[], extra = {}) => ({ message_id: id, received_at: new Date().toISOString(), from: "x@bancochile.cl", subject: "s", extraction: { message_type: "transaction_notice", operations: ops }, ...extra });

  it("rechaza importaciones hasta la aprobación y luego importa con validación por evidencia", () => {
    const v = setupClaude();
    expect(imp([email("c1", [op({ evidence: "Compra por $10.000" })])])).toMatchObject({ ok: false });
    app("approve", { version: v.version, confirmed: true });
    expect(G.triggers.filter((t) => t.fn === "nightlyRun")).toHaveLength(0); // corre en Claude, no aquí
    const r = imp([email("c1", [op({ evidence: "Compra por $10.000" })]), email("c2", [op({ amount_text: "$77.000", evidence: "sin monto" })])]);
    expect(r.ok).toBe(true);
    expect(r.run.movementsCreated).toBe(2);
    const ms = movements();
    expect(ms.find((m) => m.sourceMessageId === "c1").status).toBe("review"); // "Sin categoría asignada"
    expect(ms.find((m) => m.sourceMessageId === "c2").reviewReason).toMatch(/fragmento citado/);
    const st = G.post({ action: "importState", token: G.importToken() });
    expect(st.active).toBe(true);
    expect(st.processedMessageIds).toEqual(expect.arrayContaining(["c1", "c2"]));
    expect(imp([email("c1", [op({ evidence: "Compra por $10.000" })])]).run.movementsCreated).toBe(0);
  });

  it("pausar en MisFinanzas bloquea las importaciones de Claude; cambiar de modalidad evita que corran ambas", () => {
    const v = setupClaude();
    app("approve", { version: v.version, confirmed: true });
    app("pause");
    expect(imp([email("c9", [op({ evidence: "$10.000" })])])).toMatchObject({ ok: false });
    app("setPrefs", { mode: "google" });
    expect(G.post({ action: "importState", token: G.importToken() }).active).toBe(false);
    expect(imp([email("c9", [op({ evidence: "$10.000" })])])).toMatchObject({ ok: false });
  });
});

describe("presupuestos y avisos", () => {
  it("un aviso por umbral; de noche se programa el correo para las 08:00", () => {
    const cats = app("pull").tables.categories as any[];
    const ali = cats.find((c) => c.name === "Alimentación");
    const now = new Date().toISOString();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
    app("push", { changes: [
      { table: "budgets", record: { id: "b1", scopeKey: `cat:${ali.id}`, categoryId: ali.id, subcategoryId: null, amountMinor: "400000", currency: "CLP", active: true, updatedAt: now } },
      { table: "movements", record: { id: "m1", kind: "expense", status: "confirmed", amountMinor: "425000", currency: "CLP", occurredOn: today, categoryId: ali.id, source: "manual", excluded: false, updatedAt: now } },
    ] });
    G.g.evaluateBudgets_();
    G.g.evaluateBudgets_();
    const notes = (app("pull").tables.notifications as any[]).filter((n) => n.type === "budget");
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toBe("Alimentación · $425.000 de $400.000 · 106,3% utilizado · Excedido en $25.000");
  });
  it("horario de silencio: envío inmediato fuera de él", () => {
    app("saveSettings", { settings: { quietStart: "00:00", quietEnd: "00:01" } });
    G.g.queueNotice_({ type: "test", title: "Hola", body: "Prueba", dedupeKey: "t1" });
    G.g.deliverOrSchedule_();
    const s = JSON.parse(G.props.get("SETTINGS")!);
    const inQuiet = G.g.inQuiet_(s, new Date());
    if (inQuiet) expect(G.triggers.some((t) => t.fn === "sendPendingNotices")).toBe(true);
    else expect(G.sentMail).toHaveLength(1);
  });
  it("la próxima ejecución respeta la hora local de Santiago", () => {
    const iso = G.g.zonedDate_("2026-10-26", "03:00", "America/Santiago").toISOString();
    expect(iso).toBe("2026-10-26T06:00:00.000Z"); // octubre: horario de verano (UTC−3)
    expect(G.g.zonedDate_("2026-06-15", "03:00", "America/Santiago").toISOString()).toBe("2026-06-15T07:00:00.000Z");
  });
});

describe("correos que se leen", () => {
  const P = (p: Record<string, unknown> = {}) => G.g.validatePrefs_({ ...JSON.parse(JSON.stringify(G.g.DEFAULT_AUTOMATION.prefs)), ...p });
  it("bancos desmarcados, remitentes propios y modo «solo remitentes»", () => {
    const base = P();
    expect(G.g.looksFinancial_("Banco <avisos@bancochile.cl>", "Hola", base)).toBe(true);
    expect(G.g.looksFinancial_("Tienda <x@tienda.cl>", "Comprobante de compra", base)).toBe(true); // por asunto
    const off = P({ disabledBanks: ["bancochile.cl", "noexiste.cl"], bankSenders: ["pagos@tienda.cl", "@otrobanco.cl"] });
    expect(off.disabledBanks).toEqual(["bancochile.cl"]);
    expect(off.bankSenders).toEqual(["pagos@tienda.cl", "otrobanco.cl"]);
    expect(G.g.looksFinancial_("Banco <avisos@bancochile.cl>", "Hola", off)).toBe(false);
    expect(G.g.looksFinancial_("Tienda <PAGOS@tienda.cl>", "Hola", off)).toBe(true);
    expect(G.g.looksFinancial_("Tienda <ventas@tienda.cl>", "Hola", off)).toBe(false); // otra dirección del mismo dominio
    expect(G.g.looksFinancial_("x@avisos.otrobanco.cl", "Hola", off)).toBe(true); // subdominio
    const only = P({ sendersOnly: true });
    expect(G.g.looksFinancial_("Tienda <x@tienda.cl>", "Comprobante de compra", only)).toBe(false);
    expect(G.g.looksFinancial_("Banco <avisos@bci.cl>", "Hola", only)).toBe(true);
    expect(() => P({ sendersOnly: true, disabledBanks: G.g.BANK_DOMAINS, bankSenders: [] })).toThrow(/al menos un banco/);
    expect(() => P({ gmailLabel: 'a"b' })).toThrow(/etiqueta/);
  });

  it("la etiqueta de Gmail limita la búsqueda y cambia la aprobación", () => {
    aiOk("gemini");
    app("setAiKey", { provider: "gemini", apiKey: "AIzaPRUEBA0000000000000000000000000" });
    app("setAi", { model: "gemini-2.5-flash" });
    app("setPrefs", { mode: "google", prefs: { gmailLabel: "Mi Banco/Avisos" } });
    const v = app("generate").automation.proposed;
    expect(v.text).toContain("etiqueta de Gmail «Mi Banco/Avisos»");
    app("approve", { version: v.version, confirmed: true });
    const d = new Date();
    G.mailbox.push(
      { id: "l1", from: "Banco <avisos@bci.cl>", subject: "Compra", date: d, body: "Compra $5.000", labels: ["Mi Banco/Avisos"] },
      { id: "l2", from: "Banco <avisos@bci.cl>", subject: "Compra 2", date: d, body: "Compra $7.000" },
    );
    scripted.set("Compra", { message_type: "transaction_notice", operations: [op({ amount_text: "$5.000" })] });
    scripted.set("Compra 2", { message_type: "transaction_notice", operations: [op({ amount_text: "$7.000" })] });
    expect(app("runNow").run.movementsCreated).toBe(1);
    expect(movements().map((m) => m.sourceMessageId)).toEqual(["l1"]);
    expect(app("checkGmail").gmail).toMatchObject({ ok: true, labels: ["Mi Banco/Avisos"] });
    expect(app("setPrefs", { prefs: { gmailLabel: "" } }).automation.status).toBe("pending_approval");
  });

  it("la tarea de Claude recibe los remitentes y la etiqueta", () => {
    app("setPrefs", { mode: "claude", prefs: { claudeGmailAccount: "ana@gmail.com", sendersOnly: true, bankSenders: ["pagos@tienda.cl"], disabledBanks: ["paypal.com"], gmailLabel: "Finanzas" } });
    const s = G.post({ action: "importState", token: G.importToken() });
    expect(s.senders).toContain("pagos@tienda.cl");
    expect(s.senders).not.toContain("paypal.com");
    expect(s).toMatchObject({ sendersOnly: true, gmailLabel: "Finanzas" });
    expect(app("generate").automation.proposed.text).toContain('Considera SOLO los remitentes de "senders"');
  });
});

describe("foto de boleta", () => {
  let lastPayload: any;
  function aiReceipt(out: unknown) {
    G.onFetch((url, params) => {
      if (!url.includes(":generateContent")) return { code: 200, body: { models: [{ name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] }] } };
      lastPayload = JSON.parse(params.payload);
      return { code: 200, body: { candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 80 } } };
    });
    app("setAiKey", { provider: "gemini", apiKey: "AIzaPRUEBA0000000000000000000000000" });
    app("setAi", { model: "gemini-2.5-flash" });
  }
  const IMG = "A".repeat(400);
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());

  it("lee total, comercio y categoría existente, enviando la imagen a la IA del usuario", () => {
    aiReceipt({ is_receipt: true, merchant: "LIDER", date: today(), time: "18:45", total_text: "$23.990", currency: "CLP", category: "alimentación", subcategory: "Supermercado", description: "Compra supermercado", confidence: 0.92 });
    const r = app("scanReceipt", { image: IMG, mimeType: "image/jpeg" });
    expect(r.ok).toBe(true);
    expect(lastPayload.contents[0].parts[0]).toEqual({ inlineData: { mimeType: "image/jpeg", data: IMG } });
    const cats = app("pull").tables.categories as any[];
    const ali = cats.find((c) => c.name === "Alimentación");
    expect(r.receipt).toMatchObject({ amountMinor: 23990, currency: "CLP", merchant: "LIDER", occurredTime: "18:45", categoryId: ali.id, warnings: [] });
    expect(r.receipt.subcategoryId).toBe(cats.find((c) => c.name === "Supermercado" && c.parentId === ali.id).id);
    expect(movements()).toHaveLength(0); // no registra nada sin que el usuario lo confirme
  });

  it("marca lo dudoso y rechaza imágenes inválidas", () => {
    aiReceipt({ is_receipt: false, merchant: null, date: "1999-01-01", time: null, total_text: null, currency: null, category: "Inventada", subcategory: null, description: null, confidence: 0.2 });
    const r = app("scanReceipt", { image: IMG, mimeType: "image/png" }).receipt;
    expect(r.amountMinor).toBeNull();
    expect(r.categoryId).toBeNull();
    expect(r.occurredOn).toBe(today());
    expect(r.warnings.join(" ")).toMatch(/no parece una boleta.*total.*fecha.*confianza/);
    expect(app("scanReceipt", { image: IMG, mimeType: "image/gif" })).toMatchObject({ ok: false });
    expect(app("scanReceipt", { image: "no es base64!", mimeType: "image/jpeg" })).toMatchObject({ ok: false });
  });

  it("sin IA conectada avisa en vez de fallar en silencio", () => {
    expect(app("scanReceipt", { image: IMG, mimeType: "image/jpeg" })).toMatchObject({ ok: false, error: expect.stringMatching(/IA/) });
  });
});

describe("conexión simplificada", () => {
  it("el código de conexión del script lo entiende la app", async () => {
    const { parseConnectionCode } = await import("../../lib/local/script");
    const code = G.g.connectionCode_(G.g.webAppUrl_(), G.appToken());
    expect(code).toMatch(/^MS1\.[A-Za-z0-9_-]+$/);
    expect(parseConnectionCode(code)).toEqual({ url: "https://script.google.com/macros/s/PRUEBA_DE_SCRIPT_0123456789/exec", token: G.appToken() });
    expect(parseConnectionCode(code.slice(0, -4))).toBeNull();
    const other = G.g.connectionCode_("https://evil.example.com/exec", G.appToken());
    expect(parseConnectionCode(other)).toBeNull(); // solo direcciones de Apps Script
  });

  it("una copia de la planilla no hereda tokens ni la clave de IA del original", () => {
    const before = G.appToken();
    G.props.set("AI_KEY", "AIzaDELORIGINAL000000000000000000000");
    G.g.instalar();
    expect(G.appToken()).toBe(before); // misma planilla: nada cambia
    G.sheetId.value = "planilla-copia";
    G.g.instalar();
    expect(G.appToken()).not.toBe(before);
    expect(G.props.get("AI_KEY")).toBeUndefined();
    expect(G.props.get("SHEET_ID")).toBe("planilla-copia");
  });
});

describe("planilla directa con Google (sin script)", () => {
  it("la app escribe filas idénticas a las del script, así el script entiende la misma planilla", async () => {
    const { movementRow, MOV_HEADERS, GENERIC_HEADERS, SHEET_TABLES } = await import("../../lib/google/rows");
    expect(MOV_HEADERS).toEqual(JSON.parse(JSON.stringify(G.g.MOV_HEADERS)));
    expect(GENERIC_HEADERS).toEqual(JSON.parse(JSON.stringify(G.g.GENERIC_HEADERS)));
    const { mails, ...scriptTables } = JSON.parse(JSON.stringify(G.g.TABLES));
    expect(SHEET_TABLES).toEqual(scriptTables);
    const cats = { c1: "Alimentación", s1: "Supermercado" };
    for (const m of [
      { id: "m1", kind: "expense", status: "review", amountMinor: "62500", currency: "CLP", occurredOn: "2026-10-24", occurredTime: "18:45", description: "Líder", merchant: "LIDER", categoryId: "c1", subcategoryId: "s1", accountMask: "••••1234", bank: "Banco", source: "email", excluded: false, notes: null, operationRef: "777", sourceMessageId: "g1", updatedAt: "2026-10-24T10:00:00.000Z", deletedAt: null },
      { id: "m2", kind: "income", status: "confirmed", amountMinor: "123456", currency: "USD", occurredOn: "2026-10-01", occurredTime: null, description: "Pago", merchant: null, counterparty: "Cliente", categoryId: null, subcategoryId: null, accountMask: null, source: "manual", excluded: true, notes: "x", updatedAt: "2026-10-02T00:00:00.000Z", deletedAt: "2026-10-03T00:00:00.000Z" },
    ]) {
      expect(movementRow(m as any, cats, "2026-10-25T00:00:00.000Z")).toEqual(JSON.parse(JSON.stringify(G.g.movementRow_(m, cats))));
    }
  });

  it("sube solo lo más reciente y lee lo que escribió el script", async () => {
    const { parseTable, planWrites } = await import("../../lib/google/rows");
    const now = "2026-10-25T00:00:00.000Z";
    app("push", { changes: [{ table: "rules", record: { id: "r1", name: "viejo", updatedAt: "2026-10-24T10:00:00.000Z" } }] });
    const parsed = parseTable("rules", G.sheets.get("Reglas")!.rows.slice(1) as unknown[][]);
    expect(parsed.records).toEqual([{ id: "r1", name: "viejo", updatedAt: "2026-10-24T10:00:00.000Z" }]);
    const w = planWrites({ rules: parsed.index }, [
      { table: "rules", record: { id: "r1", name: "más viejo", updatedAt: "2026-10-24T09:00:00.000Z" } },
      { table: "rules", record: { id: "r2", name: "nuevo", updatedAt: now } },
      { table: "rules", record: { id: "r2", name: "nuevo 2", updatedAt: now } },
    ], {}, now);
    expect(w.updates).toHaveLength(0); // el cambio más antiguo no pisa la planilla
    expect(w.appends).toHaveLength(1); // un registro repetido se agrega una sola vez, con su última versión
    expect(JSON.parse(String(w.appends[0].values[3])).name).toBe("nuevo 2");
    const w2 = planWrites({ rules: parsed.index }, [{ table: "rules", record: { id: "r1", name: "nuevo", updatedAt: now } }], {}, now);
    expect(w2.updates).toEqual([{ table: "rules", row: 2, values: ["r1", now, "", JSON.stringify({ id: "r1", name: "nuevo", updatedAt: now })] }]);
  });

  it("la boleta leída en el dispositivo se valida igual que en el script", async () => {
    const { validateReceipt } = await import("../../lib/ai/receipt");
    const cats = app("pull").tables.categories as any[];
    const settings = JSON.parse(G.props.get("SETTINGS")!);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
    for (const raw of [
      { is_receipt: true, merchant: "LIDER", date: today, time: "18:45", total_text: "$23.990", currency: "CLP", category: "alimentación", subcategory: "Supermercado", description: "Compra", confidence: 0.92 },
      { is_receipt: false, merchant: null, date: "1999-01-01", time: "99:99", total_text: null, currency: "UF", category: "Inventada", subcategory: null, description: null, confidence: 0.2 },
      { is_receipt: true, merchant: "Tienda", date: today, time: null, total_text: "US$ 12,50", currency: "USD", category: null, subcategory: null, description: "Cable", confidence: 0.8 },
    ]) {
      expect(validateReceipt(raw, settings, cats, today)).toEqual(JSON.parse(JSON.stringify(G.g.validateReceipt_(raw, settings, G.g.readTable_("categories")))));
    }
  });
});

describe("instalado por la app (API de Apps Script)", () => {
  const sha = async (s: string) => (await import("node:crypto")).createHash("sha256").update(s).digest("hex");
  async function provisioned() {
    const token = "b".repeat(64);
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("apps-script/Code.gs", "utf8").replace("var BOOT_TOKEN_HASH = '';", `var BOOT_TOKEN_HASH = '${await sha(token)}';`);
    const g = createGoogle({ source: src });
    return { g, token, call: (action: string, extra: Record<string, unknown> = {}) => g.post({ action, token, ...extra }) };
  }

  it("la app se conecta con su token sin pasar por el menú; la primera llamada prepara la planilla", async () => {
    const { g, call } = await provisioned();
    expect(g.props.get("APP_TOKEN")).toBeUndefined();
    const r = call("ping");
    expect(r.ok).toBe(true);
    expect(g.props.get("IMPORT_TOKEN")).toBeTruthy(); // se instaló solo
    expect(g.sheets.get("Movimientos")).toBeTruthy();
    expect(g.post({ action: "ping", token: "c".repeat(64) })).toMatchObject({ ok: false, code: "unauthorized" });
  });

  it("regenerar el token desde la planilla revoca el de la app; una copia tampoco lo acepta", async () => {
    const a = await provisioned();
    expect(a.call("ping").ok).toBe(true);
    a.g.g.regenerarTokenApp = a.g.g.regenerarTokenApp; // sin interfaz: mostrarConexion falla, pero el token ya cambió
    try { a.g.g.regenerarTokenApp(); } catch { /* sin interfaz */ }
    expect(a.call("ping")).toMatchObject({ ok: false });

    const b = await provisioned();
    expect(b.call("ping").ok).toBe(true);
    b.g.sheetId.value = "planilla-copia";
    expect(b.call("ping")).toMatchObject({ ok: false });
  });

  it("la página del permiso prepara la planilla y no muestra datos", async () => {
    const { g } = await provisioned();
    const page = g.g.doGet();
    expect(page.html).toContain("Permiso concedido");
    expect(g.props.get("APP_TOKEN")).toBeTruthy();
    expect(page.html).not.toContain(g.props.get("APP_TOKEN"));
  });
});

describe("actualización manual («Actualizar»)", () => {
  function setupManual() {
    aiOk("gemini");
    app("setAiKey", { provider: "gemini", apiKey: "AIzaPRUEBA0000000000000000000000000" });
    app("setAi", { model: "gemini-2.5-flash" });
    const r = app("setPrefs", { mode: "manual" });
    expect(r.automation.status).toBe("manual");
  }
  const mail = (id: string, minutesAgo: number) => {
    G.mailbox.push({ id, from: "Banco <avisos@bancochile.cl>", subject: `Compra ${id}`, date: new Date(Date.now() - minutesAgo * 60_000), body: `Compra por $1.000 en TIENDA ${id}` });
    scripted.set(`Compra ${id}`, { message_type: "transaction_notice", operations: [op({ amount_text: "$1.000", merchant: `TIENDA ${id}` })] });
  };

  it("funciona sin validar una instrucción ni crear disparadores", () => {
    setupManual();
    mail("m1", 10);
    const r = app("runNow");
    expect(r.ok).toBe(true);
    expect(r.run.movementsCreated).toBe(1);
    expect(G.triggers.filter((t) => t.fn === "nightlyRun")).toHaveLength(0);
    expect(G.g.nightlyRun).toBeTypeOf("function");
  });

  it("cada «Actualizar» lee solo lo nuevo desde la anterior, sin volver a la IA por lo ya leído", () => {
    setupManual();
    mail("m1", 30);
    app("runNow");
    const calls = G.fetches.filter((f) => f.url.includes(":generateContent")).length;
    mail("m2", 0);
    const r = app("runNow");
    expect(r.run.movementsCreated).toBe(1);
    expect(G.fetches.filter((f) => f.url.includes(":generateContent")).length).toBe(calls + 1);
    expect(movements().map((m) => m.merchant).sort()).toEqual(["TIENDA m1", "TIENDA m2"]);
  });

  it("si quedan correos por leer, la siguiente pulsación continúa donde quedó", () => {
    setupManual();
    app("setPrefs", { prefs: { maxMessagesPerRun: 10 } });
    for (let i = 0; i < 13; i++) mail(`n${i}`, 60 - i);
    const r1 = app("runNow");
    expect(r1.run.movementsCreated).toBe(10);
    expect(r1.run.note).toMatch(/Actualizar/);
    const r2 = app("runNow");
    expect(r2.run.movementsCreated).toBe(3);
    expect(movements()).toHaveLength(13);
  });

  it("el resumen de una actualización manual no se envía por correo", () => {
    setupManual();
    mail("m1", 5);
    app("runNow");
    const n = rows("Avisos").map((r) => JSON.parse(String(r[3])));
    expect(n.find((x: any) => x.type === "sync_done").emailStatus).toBe("skip");
    expect(G.sentMail).toHaveLength(0);
  });

  it("pasar de manual a nocturna exige validar la instrucción", () => {
    setupManual();
    const r = app("setPrefs", { mode: "google" });
    expect(r.automation.status).toBe("pending_approval");
    expect(app("runNow")).toMatchObject({ ok: false });
  });
});
