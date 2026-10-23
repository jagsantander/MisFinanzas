"use client";
import Link from "next/link";
import { useState } from "react";
import { api, ApiError, AUTOMATION_STATUS, fmtDateTime, RUN_STATUS, useApi } from "@/lib/client";
import { Icon } from "@/components/Icon";
import { ConfirmSheet, ErrorState, Loading, Notice, Sheet, useToast } from "@/components/ui";
import { PrefsForm, type AutomationResp } from "@/components/automation";
import { useConnections } from "@/components/connections";

export default function AutomationPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi<AutomationResp>("/api/automation");
  const conns = useConnections();
  const usage = useApi<{ month: { tokens: number; costMicros: string; calls: number } | null; runs: any[] }>("/api/usage");
  const [editPrefs, setEditPrefs] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const a = data?.automation;
  const act = async (url: string, msg: string, body: object = {}) => {
    setBusy(true); setErr(null);
    try { await api(url, { body }); toast({ text: msg }); reload(); usage.reload(); } catch (e) { setErr((e as ApiError).message); } finally { setBusy(false); }
  };
  if (loading && !data) return <main className="page"><Loading rows={4} height={90} /></main>;
  if (error || !a) return <main className="page"><ErrorState error={error} retry={reload} /></main>;
  const st = AUTOMATION_STATUS[a.status];
  const snap = a.approved?.configSnapshot ?? a.proposed?.configSnapshot;
  const configChanged = a.status === "pending_approval" && a.approved != null;
  const ai = conns.data?.ai, mail = conns.data?.mail;

  return (
    <main className="page">
      <Link href="/" className="link-btn"><Icon name="chevronLeft" size={18} /> Inicio</Link>
      <h1 className="title">Actualización nocturna</h1>
      <p className="subtitle">Importa tus avisos financieros mientras duermes, sin tener la app abierta.</p>

      <section className="card pad stack">
        <div className="row between"><strong>Estado</strong><span className={`badge ${st.tone}`}>{st.label}</span></div>
        {a.pausedReason && a.status !== "active" && <Notice tone={a.status === "error" ? "danger" : "warn"}><p className="small">{a.pausedReason}</p></Notice>}
        {configChanged && <Notice tone="warn"><p className="small">La configuración vigente difiere de la aprobada. La ejecución automática está bloqueada hasta validar una nueva versión.</p></Notice>}
        <dl className="small" style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 12px", margin: 0 }}>
          <dt className="muted">Modalidad</dt><dd style={{ margin: 0 }}>Ejecución desde el servidor de MisFinanzas, que llama a tu IA con la instrucción aprobada. No se crea ninguna tarea dentro de ChatGPT, Claude o Gemini (sus APIs no ofrecen tareas programadas).</dd>
          <dt className="muted">IA</dt><dd style={{ margin: 0 }}>{ai ? `${ai.providerLabel} · ${ai.model ?? "sin modelo"}` : "No conectada"}</dd>
          <dt className="muted">Correo</dt><dd style={{ margin: 0 }}>{mail ? `${mail.providerLabel} · ${mail.account}` : "No conectado"}</dd>
          <dt className="muted">Horario</dt><dd style={{ margin: 0 }}>{a.prefs.scheduleTime} · {a.prefs.timezone}</dd>
          <dt className="muted">Próxima ejecución</dt><dd style={{ margin: 0 }}>{a.status === "active" && a.nextRunAt ? fmtDateTime(a.nextRunAt) : "—"}</dd>
          <dt className="muted">Último resultado</dt><dd style={{ margin: 0 }}>{a.lastRun ? `${RUN_STATUS[a.lastRun.status]?.label ?? a.lastRun.status} · ${fmtDateTime(a.lastRun.finishedAt ?? a.lastRun.createdAt)} · ${a.lastRun.movementsCreated} nuevos${a.lastRun.movementsReview ? ` · ${a.lastRun.movementsReview} por revisar` : ""}` : "Sin ejecuciones"}</dd>
          <dt className="muted">Instrucción aprobada</dt><dd style={{ margin: 0 }}>{a.approved ? `Versión ${a.approved.version} · aprobada ${fmtDateTime(a.approved.approvedAt)}` : "Ninguna"}</dd>
        </dl>
        {err && <Notice tone="danger"><p>{err}</p></Notice>}
        <div className="stack" style={{ gap: 8 }}>
          {a.status !== "active" && a.proposed && <Link href="/automatizacion/revisar" className="btn primary block">Revisar y validar versión {a.proposed.version}</Link>}
          {a.status !== "active" && !a.proposed && <Link href="/automatizacion/revisar" className="btn primary block">Generar instrucción para validar</Link>}
          {a.approved && <Link href="/automatizacion/revisar?ver=aprobada" className="btn block">Revisar instrucción aprobada</Link>}
          <button className="btn block" onClick={() => setEditPrefs(true)}>Modificar configuración</button>
          <div className="grid2">
            {a.status === "active" && <button className="btn" disabled={busy} onClick={() => act("/api/automation/pause", "Automatización pausada")}><Icon name="pause" size={18} /> Pausar</button>}
            {(a.status === "paused" || a.status === "error") && a.approved && <button className="btn" disabled={busy} onClick={() => act("/api/automation/resume", "Automatización reanudada")}><Icon name="play" size={18} /> Reanudar</button>}
            {a.approved && <button className="btn" disabled={busy} onClick={() => act("/api/automation/run", "Ejecución en cola; el servidor la procesará", { trigger: "manual" })}><Icon name="refresh" size={18} /> Ejecutar ahora</button>}
          </div>
          {a.status !== "cancelled" && (a.approved || a.status === "active") && <button className="btn danger block" onClick={() => setConfirmCancel(true)}>Cancelar automatización</button>}
        </div>
      </section>

      <h2 className="section">Consumo de IA</h2>
      <section className="card pad small stack" style={{ gap: 6 }}>
        {usage.data?.month ? <div>Este mes: {usage.data.month.tokens.toLocaleString("es-CL")} tokens · {usage.data.month.calls} solicitudes · costo estimado US${(Number(usage.data.month.costMicros) / 1e6).toFixed(2)}</div> : <div className="muted">Sin IA conectada.</div>}
        <div>Límite de MisFinanzas: {ai?.monthlyLimitUsdMicros ? `US$${(Number(ai.monthlyLimitUsdMicros) / 1e6).toFixed(2)}/mes` : ""}{ai?.monthlyLimitUsdMicros && ai?.monthlyTokenLimit ? " y " : ""}{ai?.monthlyTokenLimit ? `${ai.monthlyTokenLimit.toLocaleString("es-CL")} tokens/mes` : ""}{!ai?.monthlyLimitUsdMicros && !ai?.monthlyTokenLimit ? "sin configurar" : ""} · <Link href="/conexiones">Configurar</Link></div>
        <p className="muted" style={{ margin: 0 }}>Es un límite técnico (no un presupuesto personal) y no representa el consumo total de tu cuenta externa. Los costos son estimados; la factura final la emite tu proveedor.</p>
      </section>

      <h2 className="section">Historial de ejecuciones</h2>
      {a.runs.length === 0 ? <p className="muted small">Aún no hay ejecuciones.</p> : (
        <div className="list">
          {a.runs.map((r) => (
            <div key={r.id} className="item" style={{ cursor: "default", alignItems: "flex-start" }}>
              <div className="grow small">
                <div className="row" style={{ gap: 8 }}><strong>{r.trigger === "scheduled" ? "Programada" : r.trigger === "initial" ? "Primera sincronización" : "Manual"}</strong><span className={`badge ${RUN_STATUS[r.status]?.tone}`}>{RUN_STATUS[r.status]?.label ?? r.status}</span></div>
                <div className="muted">{fmtDateTime(r.startedAt ?? r.createdAt)} · {r.messagesFound} correos candidatos · {r.messagesAnalyzed} analizados · {r.movementsCreated} nuevos · {r.movementsReview} por revisar · {r.duplicatesSkipped} duplicados{r.messagesFailed ? ` · ${r.messagesFailed} con error` : ""}</div>
                <div className="muted">{(r.inputTokens + r.outputTokens).toLocaleString("es-CL")} tokens · US${(Number(r.costUsdMicros) / 1e6).toFixed(3)} estimado</div>
                {r.error && <div className="expense">{r.error}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="small muted" style={{ marginTop: 16 }}>Solo se detectan los movimientos informados en los correos accesibles. No es una conciliación bancaria completa.</p>

      <Sheet open={editPrefs} onClose={() => setEditPrefs(false)} title="Configuración de la automatización">
        {a.status === "active" && <Notice tone="warn"><p className="small">Cambiar horario, alcance o canales genera una nueva versión que deberás validar; mientras tanto la ejecución automática queda bloqueada.</p></Notice>}
        <div style={{ height: 12 }} />
        <PrefsForm prefs={a.prefs} types={data!.movementTypes} onSaved={() => { setEditPrefs(false); toast({ text: "Preferencias guardadas" }); reload(); }} />
      </Sheet>
      <ConfirmSheet open={confirmCancel} onClose={() => setConfirmCancel(false)} danger title="¿Cancelar la automatización?" confirmLabel="Cancelar automatización" busy={busy}
        body={<><p>Se desactiva la ejecución en el servidor y se revoca la aprobación vigente. Para volver a activarla deberás validar una nueva instrucción.</p><p><strong>No se borran tus movimientos</strong> ni se desconectan el correo o la IA.</p></>}
        onConfirm={async () => { await act("/api/automation/cancel", "Automatización cancelada"); setConfirmCancel(false); }} />
      <div style={{ height: 8 }} />
      {snap && <details className="small"><summary>Configuración cubierta por la autorización</summary><pre className="instruction">{JSON.stringify(snap, null, 2)}</pre></details>}
    </main>
  );
}
