/**
 * Simulador mínimo de los servicios de Google Apps Script para probar apps-script/Code.gs en Node.
 * Reproduce el comportamiento que usa el script (hojas, propiedades, disparadores, Gmail, UrlFetch, MailApp).
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";

type Cell = string | number | boolean | Date;

class FakeRange {
  constructor(private sheet: FakeSheet, private r: number, private c: number, private nr: number, private nc: number) {}
  getValues(): Cell[][] {
    const out: Cell[][] = [];
    for (let i = 0; i < this.nr; i++) {
      const row = this.sheet.rows[this.r - 1 + i] ?? [];
      out.push(Array.from({ length: this.nc }, (_, j) => row[this.c - 1 + j] ?? ""));
    }
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  setValues(v: Cell[][]) {
    v.forEach((row, i) => {
      const target = (this.sheet.rows[this.r - 1 + i] ??= []);
      row.forEach((cell, j) => { target[this.c - 1 + j] = cell; });
    });
    return this;
  }
  setValue(v: Cell) { return this.setValues([[v]]); }
}
export class FakeSheet {
  rows: Cell[][] = [];
  constructor(public name: string) {}
  getName() { return this.name; }
  getLastRow() { return this.rows.length; }
  getRange(r: number, c: number, nr = 1, nc = 1) { return new FakeRange(this, r, c, nr, nc); }
  getDataRange() { return this.getRange(1, 1, this.rows.length, Math.max(0, ...this.rows.map((r) => r.length))); }
  appendRow(row: Cell[]) { this.rows.push(row); }
  setFrozenRows() {}
}

export type FakeMail = { id: string; from: string; subject: string; date: Date; body: string; labels?: string[] };

export function createGoogle(opts: { email?: string; now?: () => Date } = {}) {
  const sheets = new Map<string, FakeSheet>();
  const props = new Map<string, string>();
  const cache = new Map<string, string>();
  const triggers: { id: string; fn: string; spec: Record<string, unknown> }[] = [];
  const mailbox: FakeMail[] = [];
  const sentMail: { to: string; subject: string; body: string }[] = [];
  const fetches: { url: string; params: any }[] = [];
  let fetchHandler: (url: string, params: any) => { code: number; body: unknown } = () => ({ code: 500, body: { error: "sin simulación" } });
  let ids = 0;
  const sheetId = { value: "planilla-1" };

  const fmt = (date: Date, tz: string, pattern: string) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(date).map((x) => [x.type, x.value]));
    return pattern.replace("yyyy", p.year).replace("MM", p.month).replace("dd", p.day).replace("HH", p.hour).replace("mm", p.minute).replace("'T'", "T");
  };

  const ctx: Record<string, unknown> = {
    console,
    Logger: { log: () => {} },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getId: () => sheetId.value,
        getSheetByName: (n: string) => sheets.get(n) ?? null,
        insertSheet: (n: string) => { const s = new FakeSheet(n); sheets.set(n, s); return s; },
        getSheets: () => [...sheets.values()],
        deleteSheet: (s: FakeSheet) => sheets.delete(s.name),
      }),
      getUi: () => { throw new Error("Sin interfaz (ejecutado desde el editor)"); },
    },
    HtmlService: { createHtmlOutput: () => ({ setWidth() { return this; }, setHeight() { return this; } }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k: string) => props.get(k) ?? null,
      setProperty: (k: string, v: string) => { if (v.length > 9 * 1024) throw new Error(`Propiedad demasiado grande: ${k}`); props.set(k, v); },
      deleteProperty: (k: string) => props.delete(k),
    }) },
    CacheService: { getScriptCache: () => ({ get: (k: string) => cache.get(k) ?? null, put: (k: string, v: string) => cache.set(k, v) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Utilities: {
      getUuid: () => randomUUID(),
      formatDate: fmt,
      sleep: () => {},
      DigestAlgorithm: { SHA_256: "sha256" }, Charset: { UTF_8: "utf8" },
      base64EncodeWebSafe: (s: string) => Buffer.from(s, "utf8").toString("base64url") + "=".repeat((4 - (Buffer.from(s, "utf8").toString("base64url").length % 4)) % 4),
      computeDigest: (_a: string, s: string) => [...createHash("sha256").update(s, "utf8").digest()].map((b) => (b > 127 ? b - 256 : b)),
    },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (s: string) => ({ content: s, setMimeType() { return this; } }) },
    ScriptApp: {
      getService: () => ({ getUrl: () => "https://script.google.com/macros/s/PRUEBA_DE_SCRIPT_0123456789/exec" }),
      getScriptId: () => "script-1",
      getProjectTriggers: () => triggers.map((t) => ({ getUniqueId: () => t.id, getHandlerFunction: () => t.fn, spec: t.spec })),
      deleteTrigger: (t: { getUniqueId: () => string }) => { const i = triggers.findIndex((x) => x.id === t.getUniqueId()); if (i >= 0) triggers.splice(i, 1); },
      newTrigger: (fn: string) => {
        const spec: Record<string, unknown> = {};
        const b = {
          timeBased: () => b, atHour: (h: number) => { spec.hour = h; return b; }, nearMinute: (m: number) => { spec.minute = m; return b; },
          everyDays: (d: number) => { spec.everyDays = d; return b; }, inTimezone: (tz: string) => { spec.tz = tz; return b; }, at: (d: Date) => { spec.at = d; return b; },
          create: () => { const id = `trig-${++ids}`; triggers.push({ id, fn, spec }); return { getUniqueId: () => id }; },
        };
        return b;
      },
    },
    GmailApp: {
      search: (q: string) => {
        const after = Number(/after:(\d+)/.exec(q)?.[1] ?? 0) * 1000;
        const label = /label:(\S+)/.exec(q)?.[1];
        const slug = (n: string) => n.toLowerCase().replace(/[\s/]+/g, "-");
        return mailbox.filter((m) => m.date.getTime() >= after && (!label || (m.labels ?? []).some((l) => slug(l) === label))).map((m) => ({ getMessages: () => [{
          getId: () => m.id, getFrom: () => m.from, getSubject: () => m.subject, getDate: () => m.date, getPlainBody: () => m.body,
        }] }));
      },
      getUserLabels: () => [...new Set(mailbox.flatMap((m) => m.labels ?? []))].map((n) => ({ getName: () => n })),
    },
    UrlFetchApp: { fetch: (url: string, params: any) => {
      fetches.push({ url, params });
      const r = fetchHandler(url, params);
      return { getResponseCode: () => r.code, getContentText: () => JSON.stringify(r.body) };
    } },
    MailApp: { sendEmail: (m: { to: string; subject: string; body: string }) => { sentMail.push(m); } },
    Session: { getEffectiveUser: () => ({ getEmail: () => opts.email ?? "ana.prueba@gmail.com" }), getScriptTimeZone: () => "America/Santiago" },
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync("apps-script/Code.gs", "utf8"), ctx, { filename: "Code.gs" });
  const g = ctx as Record<string, any>;

  /** Simula una llamada HTTP POST a la aplicación web. */
  const post = (body: unknown) => JSON.parse(g.doPost({ postData: { contents: JSON.stringify(body) } }).content);
  return {
    g, post, sheets, props, sheetId, triggers, mailbox, sentMail, fetches,
    onFetch: (h: typeof fetchHandler) => { fetchHandler = h; },
    appToken: () => props.get("APP_TOKEN")!, importToken: () => props.get("IMPORT_TOKEN")!,
  };
}
