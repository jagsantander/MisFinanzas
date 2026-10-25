"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AUTOMATION_STATUS, fmtDateTime, useStore } from "@/lib/client";
import { script } from "@/lib/local/store";
import type { AutomationPrefs, AutomationView } from "@/lib/local/types";
import { Icon } from "./Icon";
import { ConfirmSheet, Notice, useToast } from "./ui";

const TIMES = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`);
const ZONES = ["America/Santiago", "Pacific/Easter", "America/Punta_Arenas", "America/Argentina/Buenos_Aires", "America/Lima", "America/Bogota", "America/Mexico_City", "Europe/Madrid", "UTC"];
const PROVIDERS = [
  { id: "gemini", label: "Google Gemini", hint: "Crea la clave gratis en aistudio.google.com/apikey con tu cuenta de Google (no pide tarjeta). El nivel gratuito tiene límites diarios que alcanzan para uso personal.", placeholder: "AIza…" },
  { id: "openai", label: "OpenAI", hint: "Crea la clave en platform.openai.com/api-keys (requiere saldo en la API).", placeholder: "sk-…" },
  { id: "anthropic", label: "Anthropic (Claude)", hint: "Crea la clave en console.anthropic.com (requiere saldo en la API).", placeholder: "sk-ant-…" },
];

export function useAutomation() {
  const st = useStore();
  return { automation: st.automation, connected: Boolean(st.connection) };
}

/** Paso 1: dónde se ejecuta la actualización nocturna. */
export function ModePicker({ a, onChanged }: { a: AutomationView; onChanged?: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const choose = async (mode: string) => {
    setBusy(true); setErr(null);
    try { await script("setPrefs", { mode }); onChanged?.(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const opts = [
    { id: "google", title: "En tu cuenta de Google", badge: { text: "Gratis", tone: "ok" }, icon: "table", body: "El script de tu planilla lee Gmail cada noche y analiza los avisos con TU clave de IA. Con una clave gratuita de Gemini (aistudio.google.com) no pagas nada. Solo Gmail." },
    { id: "claude", title: "En tu cuenta de Claude", badge: { text: "Claude Pro o superior", tone: "warn" }, icon: "sparkle", body: "Creas una tarea programada en claude.ai que lee Gmail con su conector y envía los movimientos a tu planilla. La cuenta gratuita de Claude no permite tareas programadas." },
    { id: "none", title: "Sin actualización nocturna", icon: "pencil", body: "Registras los movimientos a mano. Puedes activarla después." },
  ];
  return (
    <div className="stack" role="radiogroup" aria-label="Dónde se ejecuta la actualización nocturna">
      {opts.map((o) => (
        <button key={o.id} role="radio" aria-checked={a.mode === o.id} disabled={busy} onClick={() => choose(o.id)} className="card pad row"
          style={{ textAlign: "left", cursor: "pointer", alignItems: "flex-start", borderColor: a.mode === o.id ? "var(--primary)" : undefined, borderWidth: a.mode === o.id ? 2 : 1, color: "var(--text)" }}>
          <span className="ico sm" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}><Icon name={o.icon} /></span>
          <div className="grow"><strong>{o.title}</strong>{o.badge && <> <span className={`badge ${o.badge.tone}`}>{o.badge.text}</span></>}<p className="small muted" style={{ margin: "4px 0 0" }}>{o.body}</p></div>
          {a.mode === o.id && <Icon name="check" />}
        </button>
      ))}
      {err && <Notice tone="danger"><p className="small">{err}</p></Notice>}
    </div>
  );
}

/** Modalidad Google: clave de IA del usuario (se guarda en las propiedades privadas de SU script). */
export function AiSetup({ a }: { a: AutomationView }) {
  const toast = useToast();
  const [provider, setProvider] = useState(a.ai.provider ?? "gemini");
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<string[] | null>(null);
  const [replacing, setReplacing] = useState(!a.hasAiKey);
  const [limit, setLimit] = useState(a.ai.monthlyTokenLimit ? String(a.ai.monthlyTokenLimit) : "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const p = PROVIDERS.find((x) => x.id === provider)!;
  useEffect(() => { if (a.hasAiKey && !models) script<{ models: string[] }>("listModels").then((r) => setModels(r.models)).catch(() => {}); }, [a.hasAiKey, models]);

  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(null); try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  return (
    <div className="card pad stack">
      {a.hasAiKey && !replacing ? (
        <>
          <div className="row">
            <span className="ico" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}><Icon name="sparkle" /></span>
            <div className="grow"><strong>{PROVIDERS.find((x) => x.id === a.ai.provider)?.label}</strong><div className="small muted">Clave {a.ai.keyHint}</div></div>
            <span className={`badge ${a.ai.status === "ok" ? "ok" : "danger"}`}>{a.ai.status === "ok" ? "Conectada" : a.ai.status === "quota" ? "Sin saldo" : "Con error"}</span>
          </div>
          {a.ai.lastError && a.ai.status !== "ok" && <Notice tone="danger"><p className="small">{a.ai.lastError}</p></Notice>}
          <div className="field"><label htmlFor="model">Modelo</label>
            <select id="model" className="input" value={a.ai.model ?? ""} onChange={(e) => run(async () => { await script("setAi", { model: e.target.value }); toast({ text: "Modelo seleccionado" }); })}>
              <option value="" disabled>{models ? "Elige un modelo…" : "Cargando modelos…"}</option>
              {(models ?? (a.ai.model ? [a.ai.model] : [])).map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <span className="hint">La lista viene de tu cuenta. Elige uno que admita respuestas en JSON (por ejemplo, gemini-2.5-flash).</span></div>
          <div className="field"><label htmlFor="lim">Límite mensual de tokens en Mi saldo (opcional)</label>
            <div className="row"><input id="lim" className="input" inputMode="numeric" placeholder="Ej.: 2000000" value={limit} onChange={(e) => setLimit(e.target.value.replace(/\D/g, ""))} />
              <button className="btn sm" disabled={busy} onClick={() => run(async () => { await script("setAi", { monthlyTokenLimit: limit ? Number(limit) : null }); toast({ text: "Límite guardado" }); })}>Guardar</button></div>
            <span className="hint">Usados este mes: {a.usage.tokens.toLocaleString("es-CL")} tokens. Es un límite técnico (no un presupuesto personal) y no reemplaza la facturación de tu proveedor.</span></div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="btn sm" disabled={busy} onClick={() => run(async () => { const r = await script<{ models: string[] }>("listModels"); setModels(r.models); toast({ text: "Conexión correcta" }); })}>Probar conexión</button>
            <button className="btn sm" onClick={() => setReplacing(true)}>Cambiar clave</button>
            <button className="btn sm danger" onClick={() => setConfirm(true)}>Eliminar clave</button>
          </div>
        </>
      ) : (
        <>
          <div className="field"><label htmlFor="prov">Proveedor de IA</label>
            <select id="prov" className="input" value={provider} onChange={(e) => setProvider(e.target.value)}>{PROVIDERS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></div>
          <div className="field"><label htmlFor="key">Clave de API</label>
            <input id="key" className="input" type="password" autoComplete="off" spellCheck={false} placeholder={p.placeholder} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
            <span className="hint">{p.hint} Se verifica con el proveedor y se guarda en las propiedades privadas de tu script: no queda en la planilla ni en este dispositivo.</span></div>
          <Notice><p className="small">Una suscripción a ChatGPT, Claude o Gemini no incluye necesariamente acceso a sus APIs. Si prefieres usar tu suscripción de Claude, elige la modalidad «En tu cuenta de Claude».</p></Notice>
          <button className="btn primary block" disabled={busy || apiKey.trim().length < 20} onClick={() => run(async () => { const r = await script<{ models: string[] }>("setAiKey", { provider, apiKey: apiKey.trim() }); setModels(r.models); setApiKey(""); setReplacing(false); toast({ text: "Clave verificada y guardada" }); })}>{busy ? "Verificando…" : "Verificar y guardar"}</button>
          {a.hasAiKey && <button className="btn block" onClick={() => setReplacing(false)}>Cancelar</button>}
        </>
      )}
      {err && <Notice tone="danger"><p className="small">{err}</p></Notice>}
      <ConfirmSheet open={confirm} onClose={() => setConfirm(false)} danger title="¿Eliminar la clave de IA?" confirmLabel="Eliminar clave"
        body={<p>Se borra de tu script y se pausa la actualización nocturna. <strong>No se borran tus movimientos.</strong></p>}
        onConfirm={() => run(async () => { await script("removeAiKey"); setConfirm(false); setReplacing(true); toast({ text: "Clave eliminada" }); })} />
    </div>
  );
}

/** Modalidad Google: comprueba que el script tenga permiso para leer Gmail y explica cómo darlo. */
export function GmailAccess({ onLabels }: { onLabels?: (labels: string[]) => void }) {
  const [res, setRes] = useState<{ ok: boolean; account?: string; labels?: string[]; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const check = async () => {
    setBusy(true);
    try {
      const r = await script<{ gmail: { ok: boolean; account?: string; labels?: string[]; error?: string } }>("checkGmail");
      setRes(r.gmail);
      if (r.gmail.ok) onLabels?.(r.gmail.labels ?? []);
    } catch (e) {
      const msg = (e as Error).message;
      setRes({ ok: false, error: /Acción desconocida/.test(msg) ? "El script de tu planilla es de una versión anterior: actualízalo en Perfil → Tu planilla." : msg });
    } finally { setBusy(false); }
  };
  useEffect(() => { void check(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="card pad stack">
      <p className="small" style={{ margin: 0 }}>Tu script lee Gmail con un permiso de <strong>solo lectura</strong> que Google te pidió al ejecutar <code>instalar</code> en tu planilla. Nadie más recibe ese permiso.</p>
      <button className="btn sm" disabled={busy} onClick={check}><Icon name="mail" size={16} /> {busy ? "Probando…" : "Probar acceso a Gmail"}</button>
      {res?.ok && <Notice tone="ok"><p className="small">Gmail autorizado{res.account ? ` para ${res.account}` : ""}. {res.labels?.length ? `Encontré ${res.labels.length} etiquetas.` : ""}</p></Notice>}
      {res && !res.ok && (
        <Notice tone="danger">
          <p className="small">No se pudo leer Gmail: {res.error}</p>
          <ol className="small" style={{ paddingLeft: 20, margin: "6px 0 0" }}>
            <li>Abre tu planilla → <strong>Extensiones → Apps Script</strong>.</li>
            <li>Elige la función <code>instalar</code> y pulsa <strong>Ejecutar</strong>.</li>
            <li>Acepta los permisos, incluido «Ver tus mensajes de correo electrónico y la configuración» (solo lectura).</li>
            <li>Vuelve aquí y prueba de nuevo.</li>
          </ol>
        </Notice>
      )}
    </div>
  );
}

/** Modalidad Claude: pasos de autorización (plan, conector de Gmail) antes de configurar la tarea. */
export function ClaudeAuthSteps() {
  return (
    <div className="card pad stack">
      <Notice tone="warn"><p className="small"><strong>Necesitas Claude Pro o superior.</strong> La cuenta gratuita de Claude no permite tareas programadas. Si buscas una opción gratuita, elige «En tu cuenta de Google» con una clave gratuita de Gemini.</p></Notice>
      <ol className="stack small" style={{ paddingLeft: 20, margin: 0, gap: 8 }}>
        <li><strong>Autoriza Gmail en Claude:</strong> abre <a href="https://claude.ai/customize/connectors" target="_blank" rel="noopener">claude.ai → Conectores</a>, pulsa <strong>Conectar</strong> en Gmail e inicia sesión con la cuenta donde llegan los avisos del banco. Google te mostrará los permisos que pide Claude.</li>
        <li>Escribe abajo esa misma cuenta de Gmail y guárdala.</li>
        <li>Genera y valida la instrucción. Después te mostraremos cómo crear la tarea en claude.ai.</li>
      </ol>
    </div>
  );
}

/** Modalidad Claude: cuenta de Gmail del conector y credenciales de importación para la tarea. */
export function ClaudeSetup({ a }: { a: AutomationView }) {
  const toast = useToast();
  const [account, setAccount] = useState(a.prefs.claudeGmailAccount);
  const [creds, setCreds] = useState<{ url: string; importToken: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const copy = async (text: string, label: string) => { try { await navigator.clipboard.writeText(text); toast({ text: `${label}: copiado` }); } catch { toast({ text: "No se pudo copiar; selecciónalo manualmente" }); } };
  return (
    <div className="card pad stack">
      <div className="field"><label htmlFor="cga">Cuenta de Gmail conectada a Claude</label>
        <div className="row"><input id="cga" className="input" type="email" value={account} onChange={(e) => setAccount(e.target.value)} placeholder="tucorreo@gmail.com" />
          <button className="btn sm" onClick={async () => { try { await script("setPrefs", { prefs: { claudeGmailAccount: account } }); toast({ text: "Guardado" }); } catch (e) { setErr((e as Error).message); } }}>Guardar</button></div>
        <span className="hint">Es la cuenta que autorizas en el conector de Gmail de claude.ai. Aparece en la instrucción que vas a aprobar.</span></div>
      <details>
        <summary>Datos para la tarea de Claude</summary>
        <p className="small">La tarea necesita dos variables de entorno. El token de importación solo permite <strong>agregar movimientos</strong>: no sirve para leer tus datos ni cambiar la configuración.</p>
        {creds ? (
          <div className="stack small">
            <div><strong>MISFINANZAS_URL</strong><code className="addr" style={{ display: "block", wordBreak: "break-all" }}>{creds.url}</code><button className="link-btn" onClick={() => copy(creds.url, "URL")}>Copiar</button></div>
            <div><strong>MISFINANZAS_IMPORT_TOKEN</strong><code style={{ display: "block", wordBreak: "break-all" }}>{creds.importToken}</code><button className="link-btn" onClick={() => copy(creds.importToken, "Token")}>Copiar</button></div>
            <button className="btn sm danger" onClick={async () => { setCreds(await script("regenerateImportToken")); toast({ text: "Token regenerado: actualízalo en Claude" }); }}>Regenerar token de importación</button>
          </div>
        ) : <button className="btn sm" onClick={async () => { try { setCreds(await script("importCredentials")); } catch (e) { setErr((e as Error).message); } }}>Mostrar URL y token</button>}
      </details>
      {err && <Notice tone="danger"><p className="small">{err}</p></Notice>}
    </div>
  );
}

/** Pasos para crear la tarea en claude.ai con la instrucción ya aprobada. */
export function ClaudeTaskSteps({ a }: { a: AutomationView }) {
  return (
    <ol className="stack small" style={{ paddingLeft: 20, margin: 0, gap: 8 }}>
      <li>En <a href="https://claude.ai/customize/connectors" target="_blank" rel="noopener">claude.ai → Conectores</a>, conecta <strong>Gmail</strong> con la cuenta {a.prefs.claudeGmailAccount || "indicada arriba"}.</li>
      <li>En <a href="https://claude.ai/code/routines" target="_blank" rel="noopener">claude.ai/code/routines</a> pulsa <strong>New task</strong> (o New routine).</li>
      <li>Pega como instrucción el <strong>texto completo aprobado</strong> (botón «Copiar instrucción»).</li>
      <li>Disparador: <strong>Schedule</strong>, diario a las <strong>{a.prefs.scheduleTime}</strong> (hora local). Para que empiece puntual, Claude recomienda unos minutos después de la hora en punto.</li>
      <li>En <strong>Advanced settings → Cloud environment</strong>, crea un entorno con <strong>Network access: Custom</strong> que permita <code>script.google.com</code> y <code>script.googleusercontent.com</code>, y agrega las variables <code>MISFINANZAS_URL</code> y <code>MISFINANZAS_IMPORT_TOKEN</code>.</li>
      <li>En <strong>Connectors</strong> deja solo Gmail. Crea la tarea y usa <strong>Run now</strong> para probarla.</li>
    </ol>
  );
}

/** Preferencias validadas (no texto libre de la instrucción). Cambiarlas exige nueva validación. */
export function PrefsForm({ a, onSaved, compact, labels }: { a: AutomationView; onSaved: () => void; compact?: boolean; labels?: string[] | null }) {
  const [p, setP] = useState<AutomationPrefs>({ ...a.prefs, disabledBanks: a.prefs.disabledBanks ?? [], sendersOnly: a.prefs.sendersOnly ?? false, gmailLabel: a.prefs.gmailLabel ?? "" });
  const banks = a.bankDomains ?? [];
  const toggleBank = (d: string) => setP({ ...p, disabledBanks: p.disabledBanks.includes(d) ? p.disabledBanks.filter((x) => x !== d) : [...p.disabledBanks, d] });
  const [senders, setSenders] = useState(a.prefs.bankSenders.join(", "));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toggle = (v: string) => setP({ ...p, movementTypes: p.movementTypes.includes(v) ? p.movementTypes.filter((x) => x !== v) : [...p.movementTypes, v] });
  async function save() {
    setBusy(true); setErr(null);
    try { await script("setPrefs", { prefs: { ...p, bankSenders: senders.split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean) } }); onSaved(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div>
      <div className="grid2">
        <div className="field"><label htmlFor="st">Horario</label><select id="st" className="input" value={p.scheduleTime} onChange={(e) => setP({ ...p, scheduleTime: e.target.value })}>{TIMES.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div className="field"><label htmlFor="tz">Zona horaria</label><select id="tz" className="input" value={p.timezone} onChange={(e) => setP({ ...p, timezone: e.target.value })}>{[...new Set([p.timezone, ...ZONES])].map((z) => <option key={z}>{z}</option>)}</select></div>
      </div>
      <div className="field"><label htmlFor="ip">Período de importación inicial</label>
        <select id="ip" className="input" value={p.initialPeriodDays} onChange={(e) => setP({ ...p, initialPeriodDays: Number(e.target.value) })}>{[7, 30, 60, 90, 180].map((d) => <option key={d} value={d}>Últimos {d} días</option>)}</select>
        <span className="hint">Luego solo se buscan correos nuevos, con {p.overlapHours} h de solapamiento para mensajes retrasados.</span></div>
      {!compact && <>
        <fieldset className="field" style={{ border: 0, padding: 0 }}><legend className="label">Movimientos que se analizarán</legend>
          {Object.entries(a.movementTypes).map(([k, v]) => <label key={k} className="check" style={{ padding: "4px 0" }}><input type="checkbox" checked={p.movementTypes.includes(k)} onChange={() => toggle(k)} /><span>{v}</span></label>)}
        </fieldset>
        <div className="field"><label htmlFor="mx">Máximo de correos por noche</label><input id="mx" type="number" className="input" min={10} max={150} value={p.maxMessagesPerRun} onChange={(e) => setP({ ...p, maxMessagesPerRun: Number(e.target.value) })} /></div>
        <fieldset className="field" style={{ border: 0, padding: 0 }}><legend className="label">Correos que se leen</legend>
          {banks.length > 0 && (
            <details className="card pad" style={{ marginBottom: 8 }}>
              <summary>Bancos y billeteras reconocidos ({banks.length - p.disabledBanks.length} de {banks.length} marcados)</summary>
              <div className="row" style={{ gap: 8, margin: "8px 0" }}>
                <button type="button" className="link-btn" onClick={() => setP({ ...p, disabledBanks: [] })}>Marcar todos</button>
                <button type="button" className="link-btn" onClick={() => setP({ ...p, disabledBanks: [...banks] })}>Desmarcar todos</button>
              </div>
              <div className="grid2">{banks.map((d) => <label key={d} className="check small" style={{ padding: "2px 0" }}><input type="checkbox" checked={!p.disabledBanks.includes(d)} onChange={() => toggleBank(d)} /><span>{d}</span></label>)}</div>
            </details>
          )}
          <label htmlFor="bs" className="small">Otros remitentes (dominio o dirección exacta)</label>
          <input id="bs" className="input" value={senders} onChange={(e) => setSenders(e.target.value)} placeholder="mibanco.cl, avisos@mitarjeta.com" />
          <label className="check" style={{ padding: "8px 0 0" }}><input type="checkbox" checked={p.sendersOnly} onChange={(e) => setP({ ...p, sendersOnly: e.target.checked })} />
            <span>Leer <strong>solo</strong> estos remitentes {banks.length > 0 && "(marcados y otros)"}. Si no, también se leen correos de cualquier remitente cuyo asunto parezca un aviso financiero («compra», «transferencia», «pago»…).</span></label>
        </fieldset>
        <div className="field"><label htmlFor="gl">Etiqueta de Gmail (opcional)</label>
          {labels && labels.length > 0
            ? <select id="gl" className="input" value={p.gmailLabel} onChange={(e) => setP({ ...p, gmailLabel: e.target.value })}><option value="">Todo el correo</option>{[...new Set([p.gmailLabel, ...labels].filter(Boolean))].map((l) => <option key={l} value={l}>{l}</option>)}</select>
            : <input id="gl" className="input" value={p.gmailLabel} maxLength={60} onChange={(e) => setP({ ...p, gmailLabel: e.target.value })} placeholder="Ej.: Finanzas (vacío = todo el correo)" />}
          <span className="hint">Si eliges una etiqueta, solo se leen los correos que la tengan. En Gmail puedes crear un filtro que la aplique a los avisos de tus bancos.</span></div>
        <div className="field"><label htmlFor="hx">Indicaciones para clasificar (opcional)</label><textarea id="hx" className="input" maxLength={500} value={p.extraHints} onChange={(e) => setP({ ...p, extraHints: e.target.value })} placeholder="Ej.: los cargos de «Copec» son Transporte › Combustible" />
          <span className="hint">No pueden modificar las restricciones de seguridad ni incluir enlaces o credenciales.</span></div>
      </>}
      {err && <Notice tone="danger"><p className="small">{err}</p></Notice>}
      <button className="btn primary block" onClick={save} disabled={busy || p.movementTypes.length === 0}>{busy ? "Guardando…" : "Guardar preferencias"}</button>
    </div>
  );
}

/** «Revisa y autoriza tu actualización nocturna»: confirmación explícita, versión exacta. */
export function ReviewInstruction({ a, onApproved, onCancel, showApproved }: { a: AutomationView; onApproved: () => void; onCancel: () => void; showApproved?: boolean }) {
  const toast = useToast();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<null | "gen" | "approve">(null);
  const [err, setErr] = useState<string | null>(null);
  const v = showApproved ? a.approved : a.proposed;
  const ready = a.mode === "claude" ? Boolean(a.prefs.claudeGmailAccount) : a.mode === "google" ? Boolean(a.hasAiKey && a.ai.model) : false;

  async function generate() {
    setBusy("gen"); setErr(null);
    try { await script("generate", {}, 120_000); setConfirmed(false); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }
  async function approve() {
    if (!a.proposed) return;
    setBusy("approve"); setErr(null);
    try { await script("approve", { version: a.proposed.version, confirmed }); toast({ text: a.mode === "google" ? "Actualización nocturna activada" : "Instrucción aprobada" }); onApproved(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }
  if (!v) return (
    <div className="stack">
      {!ready && <Notice tone="warn"><p>{a.mode === "google" ? "Conecta tu IA y elige un modelo antes de generar la instrucción." : a.mode === "claude" ? "Indica la cuenta de Gmail conectada a Claude antes de generar la instrucción." : "Elige primero dónde se ejecutará la actualización nocturna."}</p></Notice>}
      <p>{a.mode === "google" ? "Tu IA personalizará las pautas de clasificación sobre una plantilla controlada por Mi saldo." : "Mi saldo armará la instrucción que pegarás en tu tarea de Claude."} Nada se activa hasta que la valides.</p>
      {err && <Notice tone="danger"><p>{err}</p></Notice>}
      <button className="btn primary block" disabled={!ready || busy !== null} onClick={generate}>{busy === "gen" ? "Generando…" : "Generar instrucción"}</button>
      <button className="btn block" onClick={onCancel}>Cancelar</button>
    </div>
  );
  const snap = a.snapshot;
  const copyText = async () => { try { await navigator.clipboard.writeText(v.text); toast({ text: "Instrucción copiada" }); } catch { toast({ text: "No se pudo copiar; selecciona el texto" }); } };
  return (
    <div className="stack">
      {showApproved ? <Notice tone="ok"><p className="small">Versión {v.version} aprobada {fmtDateTime(v.approvedAt)}{v.approvedBy ? ` por ${v.approvedBy}` : ""}.</p></Notice>
        : <Notice><p className="small">Versión {v.version} generada {fmtDateTime(v.generatedAt)}. Aún <strong>no está activa</strong>.</p></Notice>}
      <section className="card pad">
        <h2 style={{ fontSize: 18, marginTop: 0 }}>Resumen</h2>
        <p style={{ margin: 0 }}>{a.mode === "google"
          ? `Cada noche, a las ${snap.schedule.time}, el script de tu planilla buscará en tu Gmail los avisos financieros nuevos, los analizará con ${snap.ai?.provider} (${snap.ai?.model}) usando tu clave, agregará los movimientos a tu planilla y te avisará por correo.`
          : `Cada noche, a las ${snap.schedule.time}, tu tarea de Claude leerá los avisos financieros nuevos de ${snap.mailAccount} con el conector de Gmail y los enviará a tu planilla, que los valida y agrega.`}</p>
      </section>
      <section className="card pad small stack" style={{ gap: 10 }}>
        <div className="row"><Icon name="clock" /><div><strong>Horario</strong><div>Todos los días a las {snap.schedule.time} ({snap.schedule.timezone}), considerando el horario de verano. Funciona con el teléfono apagado.</div></div></div>
        <div className="row"><Icon name="cloud" /><div><strong>Dónde se ejecuta</strong><div>{snap.executionPlace}</div></div></div>
        <div className="row"><Icon name="mail" /><div><strong>Datos que se leerán</strong><div>Correos de {snap.mailAccount || "tu cuenta"}: los últimos {snap.search.initialPeriodDays} días la primera vez y luego solo los nuevos. Solo se analizan los que parecen avisos financieros (máximo {snap.search.maxMessagesPerRun} por noche).</div></div></div>
        <div className="row"><Icon name="sparkle" /><div><strong>Datos que se envían a la IA</strong><div>{a.mode === "google" ? "Remitente, asunto, fecha y el texto del aviso reducido: sin enlaces ni adjuntos, con tarjetas y RUT enmascarados, hasta 6.000 caracteres." : "Claude lee los correos con tu conector de Gmail, dentro de tu cuenta de Claude. A tu planilla solo llegan los datos extraídos y un fragmento de hasta 200 caracteres con el monto."}</div></div></div>
        <div className="row"><Icon name="shield" /><div><strong>Acciones permitidas</strong><div>Leer avisos (solo lectura), extraer operaciones, agregar movimientos nuevos, recalcular presupuestos y avisarte. <strong>Nunca</strong>: enviar, borrar ni mover correos, abrir enlaces o adjuntos, hacer pagos, ni sobrescribir tus correcciones.</div></div></div>
        <div className="row"><Icon name="dollar" /><div><strong>Consumo y costos</strong><div>{a.mode === "google" ? "Cada aviso analizado es una solicitud a tu IA, cobrada por tu proveedor (o dentro del nivel gratuito de Gemini, con sus límites). Puedes fijar un límite mensual de tokens." : "Cada ejecución consume uso de tu suscripción de Claude, según sus límites."} Si falta saldo o se alcanza el límite, se pausa sin perder el progreso.</div></div></div>
      </section>
      <details className="card pad"><summary>Texto completo de la instrucción</summary><pre className="instruction" style={{ marginTop: 8 }}>{v.text}</pre></details>
      {a.mode === "claude" && <button className="btn" onClick={copyText}><Icon name="download" size={18} /> Copiar instrucción</button>}
      {!showApproved && (
        <>
          {err && <Notice tone="danger"><p>{err}</p></Notice>}
          <label className="check card pad" style={{ alignItems: "flex-start" }}>
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            <span>Revisé la instrucción y autorizo que se ejecute <strong>todas las noches</strong> con esta configuración, leyendo mi correo y enviando a mi IA el contenido indicado. Puedo pausarla o cancelarla cuando quiera.</span>
          </label>
          <button className="btn primary block" disabled={!confirmed || busy !== null} onClick={approve}>{busy === "approve" ? "Activando…" : "Validar y activar"}</button>
          <div className="grid2">
            <Link className="btn" href="/automatizacion#preferencias"><Icon name="pencil" size={18} /> Editar</Link>
            <button className="btn" onClick={onCancel}>Cancelar</button>
          </div>
          <button className="link-btn" disabled={busy !== null} onClick={generate}>{busy === "gen" ? "Regenerando…" : "Regenerar"}</button>
        </>
      )}
    </div>
  );
}

export function AutomationControls({ a }: { a: AutomationView }) {
  const toast = useToast();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const act = async (action: string, msg: string, timeout?: number) => {
    setBusy(true); setErr(null);
    try { await script(action, {}, timeout); toast({ text: msg }); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const st = AUTOMATION_STATUS[a.status] ?? { label: a.status, tone: "info" };
  return (
    <section className="card pad stack">
      <div className="row between"><strong>Estado</strong><span className={`badge ${st.tone}`}>{st.label}</span></div>
      {a.pausedReason && a.status !== "active" && <Notice tone={a.status === "error" ? "danger" : "warn"}><p className="small">{a.pausedReason}</p></Notice>}
      <dl className="small" style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 12px", margin: 0 }}>
        <dt className="muted">Modalidad</dt><dd style={{ margin: 0 }}>{a.mode === "google" ? "Script en tu cuenta de Google" : a.mode === "claude" ? "Tarea programada en tu cuenta de Claude" : "Sin actualización nocturna"}</dd>
        {a.mode === "google" && <><dt className="muted">IA</dt><dd style={{ margin: 0 }}>{a.ai.provider ? `${a.ai.provider} · ${a.ai.model ?? "sin modelo"}` : "No conectada"}</dd></>}
        <dt className="muted">Correo</dt><dd style={{ margin: 0 }}>{a.snapshot.mailAccount || "—"}</dd>
        <dt className="muted">Horario</dt><dd style={{ margin: 0 }}>{a.prefs.scheduleTime} · {a.prefs.timezone}</dd>
        {a.mode === "google" && <><dt className="muted">Próxima ejecución</dt><dd style={{ margin: 0 }}>{a.nextRunAt ? fmtDateTime(a.nextRunAt) : "—"}{a.status === "active" && !a.triggerActive ? " · ⚠ disparador no encontrado" : ""}</dd></>}
        <dt className="muted">Último resultado</dt><dd style={{ margin: 0 }}>{a.lastRun ? `${a.lastRun.status === "succeeded" ? "Completada" : a.lastRun.status === "partial" ? "Parcial" : "Fallida"} · ${fmtDateTime(a.lastRun.finishedAt)} · ${a.lastRun.created} nuevos${a.lastRun.review ? ` · ${a.lastRun.review} por revisar` : ""}` : a.mode === "claude" ? "Aún no llega ninguna importación de Claude" : "Sin ejecuciones"}</dd>
        <dt className="muted">Instrucción aprobada</dt><dd style={{ margin: 0 }}>{a.approved ? `Versión ${a.approved.version} · ${fmtDateTime(a.approved.approvedAt)}` : "Ninguna"}</dd>
      </dl>
      {a.approved && !a.configMatchesApproval && <Notice tone="warn"><p className="small">La configuración vigente difiere de la aprobada: la ejecución automática está bloqueada hasta validar una nueva versión.</p></Notice>}
      {err && <Notice tone="danger"><p className="small">{err}</p></Notice>}
      <div className="grid2">
        {a.status === "active" && <button className="btn" disabled={busy} onClick={() => act("pause", "Pausada")}><Icon name="pause" size={18} /> Pausar</button>}
        {(a.status === "paused" || a.status === "error") && a.approved && <button className="btn" disabled={busy} onClick={() => act("resume", "Reanudada")}><Icon name="play" size={18} /> Reanudar</button>}
        {a.mode === "google" && a.approved && <button className="btn" disabled={busy} onClick={() => act("runNow", "Ejecución completada", 360_000)}><Icon name="refresh" size={18} /> {busy ? "Ejecutando…" : "Ejecutar ahora"}</button>}
      </div>
      {a.mode === "claude" && a.status === "paused" && <p className="small muted" style={{ margin: 0 }}>Mientras esté pausada, tu planilla rechaza las importaciones de Claude. Para ahorrar uso, pausa también la tarea en claude.ai.</p>}
      {a.status !== "cancelled" && a.approved && <button className="btn danger block" onClick={() => setConfirmCancel(true)}>Cancelar automatización</button>}
      <ConfirmSheet open={confirmCancel} onClose={() => setConfirmCancel(false)} danger title="¿Cancelar la actualización nocturna?" confirmLabel="Cancelar automatización" busy={busy}
        body={<>{a.mode === "google" ? <p>Se elimina el disparador diario de tu script y se revoca la aprobación.</p> : <p>Tu planilla dejará de aceptar importaciones de Claude. <strong>La tarea en claude.ai sigue existiendo:</strong> elimínala tú en claude.ai/code/routines (Mi saldo no puede hacerlo).</p>}<p><strong>No se borran tus movimientos.</strong></p></>}
        onConfirm={async () => { await act("cancel", "Automatización cancelada"); setConfirmCancel(false); }} />
    </section>
  );
}
