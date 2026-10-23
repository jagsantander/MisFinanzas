"use client";
import { useState } from "react";
import { api, ApiError, fmtDateTime, useApi } from "@/lib/client";
import { Icon } from "./Icon";
import { ConfirmSheet, Loading, Notice, useToast } from "./ui";

export type Conns = {
  mail: null | { id: string; provider: string; providerLabel: string; account: string; status: string; lastError: string | null; scopes: string[]; lastSuccessfulSyncAt: string | null; consentAt: string; nextSyncAt: string | null };
  ai: null | { id: string; provider: string; providerLabel: string; keyHint: string; model: string | null; status: string; lastError: string | null; lastTestedAt: string | null; lastSuccessAt: string | null; monthlyLimitUsdMicros: string | null; monthlyTokenLimit: number | null; usage: { tokens: number; costMicros: string; calls: number } | null };
  providers: { mail: { id: string; label: string; configured: boolean; scopes: string[] }[]; ai: { id: string; label: string }[] };
};

const MAIL_STATUS: Record<string, { label: string; tone: string }> = {
  active: { label: "Autorizado", tone: "ok" }, reauth_required: { label: "Requiere reconexión", tone: "danger" }, error: { label: "Con error", tone: "danger" },
};
const AI_STATUS: Record<string, { label: string; tone: string }> = {
  ok: { label: "Conectada", tone: "ok" }, untested: { label: "Sin probar", tone: "info" }, error: { label: "Credencial rechazada", tone: "danger" }, quota: { label: "Sin saldo o cuota", tone: "danger" }, limit_reached: { label: "Límite alcanzado", tone: "warn" },
};

/* ───────── Correo ───────── */
export function MailConnection({ conns, onChange, returnTo = "/conexiones", automationActive }: { conns: Conns; onChange: () => void; returnTo?: "/conexiones" | "/bienvenida"; automationActive?: boolean }) {
  const toast = useToast();
  const [provider, setProvider] = useState(conns.providers.mail.find((p) => p.configured)?.id ?? "gmail");
  const [consent, setConsent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [revokeInfo, setRevokeInfo] = useState<string | null>(null);
  const m = conns.mail;
  const prov = conns.providers.mail.find((p) => p.id === provider)!;

  async function connect() {
    setBusy(true); setErr(null);
    try { const r = await api("/api/connections/mail/start", { body: { provider, consent, returnTo } }); location.href = r.url; }
    catch (e) { setErr((e as ApiError).message); setBusy(false); }
  }
  async function syncNow() {
    setBusy(true); setErr(null);
    try { await api("/api/automation/run", { body: { trigger: "manual" } }); toast({ text: "Sincronización en cola. El servidor la procesará en segundos." }); onChange(); }
    catch (e) { setErr((e as ApiError).message); } finally { setBusy(false); }
  }
  if (m) {
    const st = MAIL_STATUS[m.status] ?? { label: m.status, tone: "info" };
    return (
      <div className="card pad stack">
        <div className="row">
          <span className="ico" style={{ background: "var(--info-soft)", color: "var(--text)" }}><Icon name="mail" /></span>
          <div className="grow"><strong>{m.providerLabel}</strong><div className="small muted">{m.account}</div></div>
          <span className={`badge ${st.tone}`}>{st.label}</span>
        </div>
        {m.status === "reauth_required" && <Notice tone="danger"><p>La autorización venció o fue revocada. Las importaciones están detenidas.</p><button className="link-btn" onClick={() => { setProvider(m.provider); setConsent(false); setRevokeInfo("reconnect"); }}>Reconectar</button></Notice>}
        <dl className="small" style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", margin: 0 }}>
          <dt className="muted">Permiso</dt><dd style={{ margin: 0 }}>Solo lectura</dd>
          <dt className="muted">Última sincronización exitosa</dt><dd style={{ margin: 0 }}>{m.lastSuccessfulSyncAt ? fmtDateTime(m.lastSuccessfulSyncAt) : "Aún no"}</dd>
          <dt className="muted">Próxima sincronización</dt><dd style={{ margin: 0 }}>{m.nextSyncAt ? fmtDateTime(m.nextSyncAt) : automationActive === false ? "Sin automatización activa" : "—"}</dd>
          <dt className="muted">Consentimiento</dt><dd style={{ margin: 0 }}>{fmtDateTime(m.consentAt)}</dd>
        </dl>
        {err && <Notice tone="danger"><p>{err}</p></Notice>}
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button className="btn sm primary" onClick={syncNow} disabled={busy || m.status !== "active"}><Icon name="refresh" size={16} /> Sincronizar ahora</button>
          <button className="btn sm danger" onClick={() => setConfirm(true)}>Desconectar correo</button>
        </div>
        <p className="small muted" style={{ margin: 0 }}>«Sincronizar ahora» requiere una instrucción nocturna validada: solo así se envían avisos a tu IA.</p>
        {revokeInfo && revokeInfo !== "reconnect" && <Notice tone="warn"><p className="small">{revokeInfo}</p></Notice>}
        {revokeInfo === "reconnect" && connectForm()}
        <ConfirmSheet open={confirm} onClose={() => setConfirm(false)} danger title="¿Desconectar correo?" confirmLabel="Desconectar"
          body={<><p>Se detienen las importaciones y se eliminan los tokens de acceso guardados.</p><p><strong>No se borran tus movimientos.</strong> La automatización quedará pendiente de nueva validación.</p></>}
          onConfirm={async () => { const r = await api("/api/connections/mail/disconnect", { body: {} }); setConfirm(false); toast({ text: r.revoked ? "Correo desconectado y permiso revocado" : "Correo desconectado; tokens eliminados" }); if (!r.revoked && r.instructions) setRevokeInfo(r.instructions); onChange(); }} />
      </div>
    );
  }
  function connectForm() {
    return (
      <div className="stack">
        <div className="segmented" role="radiogroup" aria-label="Proveedor de correo">
          {conns.providers.mail.map((p) => <button key={p.id} role="radio" aria-checked={provider === p.id} aria-pressed={provider === p.id} onClick={() => setProvider(p.id)}>{p.label}</button>)}
        </div>
        {!prov.configured && <Notice tone="warn"><p className="small"><strong>{prov.label} no está configurado en este servidor.</strong> El administrador debe registrar la aplicación OAuth y definir sus credenciales (ver README). No es posible conectar hasta entonces.</p></Notice>}
        <div className="small muted">
          Se usará el inicio de sesión oficial de {prov.label} (OAuth). MisFinanzas nunca pide tu contraseña del correo.
          Permisos solicitados: <strong>{prov.id === "gmail" ? "leer correos (solo lectura)" : "leer correo (solo lectura), perfil básico y acceso sin conexión para la actualización nocturna"}</strong>.
        </div>
        <label className="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>Autorizo a MisFinanzas a leer mis correos para identificar avisos financieros (compras, transferencias, abonos, cargos, devoluciones). Solo se procesan los que parecen financieros; no se envían, borran ni modifican correos.</span></label>
        {err && <Notice tone="danger"><p>{err}</p></Notice>}
        <button className="btn primary block" disabled={!consent || busy || !prov.configured} onClick={connect}>Conectar {prov.label}</button>
        <p className="small muted" style={{ margin: 0 }}>Conectar el correo <strong>no activa</strong> la automatización: deberás revisar y validar la instrucción nocturna.</p>
      </div>
    );
  }
  return <div className="card pad">{connectForm()}</div>;
}

/* ───────── IA ───────── */
export function AiConnection({ conns, onChange }: { conns: Conns; onChange: () => void }) {
  const toast = useToast();
  const a = conns.ai;
  const [replacing, setReplacing] = useState(!a);
  const [provider, setProvider] = useState(a?.provider ?? "anthropic");
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<{ id: string; label: string }[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [limitUsd, setLimitUsd] = useState(a?.monthlyLimitUsdMicros ? String(Number(a.monthlyLimitUsdMicros) / 1e6) : "");
  const [limitTok, setLimitTok] = useState(a?.monthlyTokenLimit ? String(a.monthlyTokenLimit) : "");

  async function saveKey() {
    setBusy(true); setErr(null);
    try { const r = await api("/api/connections/ai", { body: { provider, apiKey } }); setModels(r.models); setApiKey(""); setReplacing(false); toast({ text: "Clave verificada y guardada cifrada" }); onChange(); }
    catch (e) { setErr((e as ApiError).message); } finally { setBusy(false); }
  }
  async function test() {
    setBusy(true); setErr(null);
    try { const r = await api("/api/connections/ai/test", { body: {} }); if (r.ok) { setModels(r.models); toast({ text: r.modelAvailable === false ? "Conexión correcta, pero el modelo elegido ya no está disponible" : "Conexión correcta" }); } else setErr(r.error); onChange(); }
    catch (e) { setErr((e as ApiError).message); } finally { setBusy(false); }
  }
  async function pickModel(model: string) {
    setErr(null);
    try { await api("/api/connections/ai/model", { body: { model } }); toast({ text: "Modelo seleccionado" }); onChange(); } catch (e) { setErr((e as ApiError).message); }
  }
  async function saveLimits() {
    setErr(null);
    try { await api("/api/connections/ai/limits", { body: { monthlyUsd: limitUsd ? Number(limitUsd.replace(",", ".")) : null, monthlyTokens: limitTok ? Number(limitTok.replace(/\D/g, "")) : null } }); toast({ text: "Límite guardado" }); onChange(); }
    catch (e) { setErr((e as ApiError).message); }
  }
  return (
    <div className="card pad stack">
      {a && !replacing && (
        <>
          <div className="row">
            <span className="ico" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}><Icon name="sparkle" /></span>
            <div className="grow"><strong>{a.providerLabel}</strong><div className="small muted">Clave {a.keyHint}</div></div>
            <span className={`badge ${(AI_STATUS[a.status] ?? { tone: "info" }).tone}`}>{(AI_STATUS[a.status] ?? { label: a.status }).label}</span>
          </div>
          {a.lastError && a.status !== "ok" && <Notice tone="danger"><p className="small">{a.lastError}</p></Notice>}
          <div className="field">
            <label htmlFor="model">Modelo</label>
            {models ? (
              <select id="model" className="input" value={a.model ?? ""} onChange={(e) => pickModel(e.target.value)}>
                <option value="" disabled>Elige un modelo…</option>
                {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            ) : (
              <div className="row"><span className="grow">{a.model ?? <span className="muted">Sin seleccionar</span>}</span><button className="btn sm" onClick={test} disabled={busy}>{a.model ? "Cambiar" : "Elegir"}</button></div>
            )}
            <span className="hint">La lista proviene de tu cuenta. Elige un modelo que admita salidas estructuradas (JSON).</span>
          </div>
          <dl className="small" style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", margin: 0 }}>
            <dt className="muted">Última prueba</dt><dd style={{ margin: 0 }}>{fmtDateTime(a.lastTestedAt)}</dd>
            <dt className="muted">Último análisis exitoso</dt><dd style={{ margin: 0 }}>{a.lastSuccessAt ? fmtDateTime(a.lastSuccessAt) : "Aún no"}</dd>
            {a.usage && <><dt className="muted">Consumo del mes</dt><dd style={{ margin: 0 }}>{a.usage.tokens.toLocaleString("es-CL")} tokens · {a.usage.calls} solicitudes · costo estimado US${(Number(a.usage.costMicros) / 1e6).toFixed(2)}</dd></>}
          </dl>
          <details>
            <summary>Límite de consumo de IA en MisFinanzas</summary>
            <p className="small muted">Límite técnico, distinto de tus presupuestos personales. Al alcanzarlo se pausa el análisis. No representa el consumo total de tu cuenta externa ni garantiza la facturación final.</p>
            <div className="grid2">
              <div className="field"><label htmlFor="lusd">Costo estimado máx. (US$/mes)</label><input id="lusd" className="input" inputMode="decimal" value={limitUsd} onChange={(e) => setLimitUsd(e.target.value)} placeholder="Ej.: 5" /></div>
              <div className="field"><label htmlFor="ltok">Tokens máx. al mes</label><input id="ltok" className="input" inputMode="numeric" value={limitTok} onChange={(e) => setLimitTok(e.target.value)} placeholder="Ej.: 2000000" /></div>
            </div>
            <button className="btn sm" onClick={saveLimits}>Guardar límite</button>
          </details>
          {err && <Notice tone="danger"><p>{err}</p></Notice>}
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="btn sm" onClick={test} disabled={busy}>{busy ? "Probando…" : "Probar conexión"}</button>
            <button className="btn sm" onClick={() => { setReplacing(true); setProvider(a.provider); }}>Cambiar credencial</button>
            <button className="btn sm danger" onClick={() => setConfirm(true)}>Eliminar</button>
          </div>
        </>
      )}
      {replacing && (
        <>
          <div className="field"><label htmlFor="prov">Proveedor</label>
            <select id="prov" className="input" value={provider} onChange={(e) => setProvider(e.target.value)}>{conns.providers.ai.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
          <div className="field"><label htmlFor="key">Clave de API</label>
            <input id="key" className="input" type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={provider === "openai" ? "sk-…" : provider === "anthropic" ? "sk-ant-…" : "AIza…"} />
            <span className="hint">Se verifica con {conns.providers.ai.find((p) => p.id === provider)?.label}, se guarda cifrada en el servidor y solo verás una referencia enmascarada. {provider === "openai" ? "Créala en platform.openai.com/api-keys." : provider === "anthropic" ? "Créala en console.anthropic.com (Claude Console)." : "Créala en aistudio.google.com/apikey."}</span></div>
          <Notice><p className="small">Una suscripción a ChatGPT, Claude o Gemini <strong>no incluye necesariamente</strong> acceso o saldo para sus APIs: el uso de la API se factura aparte en tu cuenta de desarrollador. Nunca te pediremos la contraseña de esas plataformas.</p></Notice>
          {err && <Notice tone="danger"><p>{err}</p></Notice>}
          <button className="btn primary block" disabled={apiKey.trim().length < 20 || busy} onClick={saveKey}>{busy ? "Verificando…" : "Verificar y guardar"}</button>
          {a && <button className="btn block" onClick={() => setReplacing(false)}>Cancelar</button>}
        </>
      )}
      <ConfirmSheet open={confirm} onClose={() => setConfirm(false)} danger title="¿Eliminar la conexión de IA?" confirmLabel="Eliminar credencial"
        body={<><p>Se detienen las solicitudes a la IA y se borra la clave guardada.</p><p><strong>No se borran tus movimientos.</strong> El registro manual y los presupuestos siguen funcionando.</p></>}
        onConfirm={async () => { await api("/api/connections/ai", { method: "DELETE" }); setConfirm(false); setReplacing(true); toast({ text: "Credencial eliminada" }); onChange(); }} />
    </div>
  );
}

export function useConnections() {
  return useApi<Conns>("/api/connections");
}
export function ConnectionsLoading() { return <Loading rows={2} height={160} />; }
