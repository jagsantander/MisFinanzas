"use client";
import { useState } from "react";
import { api, ApiError, fmtDateTime, useApi } from "@/lib/client";
import { Icon } from "./Icon";
import { Loading, Notice, Sheet, useToast } from "./ui";
import { PrefsForm, type AutomationResp } from "./automation";
import { useConnections } from "./connections";

/**
 * «Revisa y autoriza tu actualización nocturna».
 * La confirmación es explícita (casilla sin marcar + botón). La aprobación guarda la versión exacta.
 */
export function ReviewInstruction({ onApproved, onCancel, showApproved }: { onApproved: () => void; onCancel: () => void; showApproved?: boolean }) {
  const toast = useToast();
  const { data, loading, reload } = useApi<AutomationResp>("/api/automation");
  const conns = useConnections();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<null | "gen" | "approve">(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const a = data?.automation;

  async function generate() {
    setBusy("gen"); setErr(null);
    try { await api("/api/automation/generate", { body: {} }); setConfirmed(false); reload(); }
    catch (e) { setErr((e as ApiError).message); } finally { setBusy(null); }
  }
  async function approve() {
    if (!a?.proposed) return;
    setBusy("approve"); setErr(null);
    try { await api("/api/automation/approve", { body: { versionId: a.proposed.id, confirmed } }); toast({ text: "Automatización validada y activa" }); onApproved(); }
    catch (e) { setErr((e as ApiError).message); if ((e as ApiError).code === "config_changed" || (e as ApiError).code === "stale_version") reload(); }
    finally { setBusy(null); }
  }
  if (loading && !data) return <Loading rows={4} />;
  if (!a) return null;
  const v = showApproved ? a.approved : a.proposed;
  const ai = conns.data?.ai, mail = conns.data?.mail;
  const ready = Boolean(ai?.model && mail);

  if (!v) return (
    <div className="stack">
      {!ready && <Notice tone="warn"><p>Para generar la instrucción necesitas un correo conectado y una IA con modelo seleccionado.</p></Notice>}
      <p>MisFinanzas usará <strong>tu IA</strong> para personalizar la instrucción a partir de una plantilla controlada. No se activa nada hasta que la valides.</p>
      {err && <Notice tone="danger"><p>{err}</p></Notice>}
      <button className="btn primary block" disabled={!ready || busy !== null} onClick={generate}>{busy === "gen" ? "Generando con tu IA…" : "Generar instrucción"}</button>
      <button className="btn block" onClick={onCancel}>Cancelar</button>
    </div>
  );
  const snap = v.configSnapshot;
  return (
    <div className="stack">
      {showApproved ? <Notice tone="ok"><p className="small">Versión {v.version} aprobada {fmtDateTime(v.approvedAt)}. Generada con {v.generatedWith}.</p></Notice>
        : <Notice><p className="small">Versión {v.version} generada {fmtDateTime(v.createdAt)} con {v.generatedWith}. Aún <strong>no está activa</strong>.</p></Notice>}

      <section className="card pad">
        <h2 style={{ fontSize: 18, marginTop: 0 }}>Resumen</h2>
        <p style={{ margin: 0 }}>{v.proposal.plain_summary}</p>
      </section>

      <section className="card pad small stack" style={{ gap: 10 }}>
        <div className="row"><Icon name="clock" /><div><strong>Horario</strong><div>Todos los días a las {snap.schedule.time} ({snap.schedule.timezone}), considerando horario de verano. Funciona con el teléfono apagado o la app cerrada.</div></div></div>
        <div className="row"><Icon name="cloud" /><div><strong>Dónde se ejecuta</strong><div>{snap.executionPlace}</div></div></div>
        <div className="row"><Icon name="mail" /><div><strong>Datos que se leerán</strong><div>Correos de {snap.mail?.account} recibidos en los últimos {snap.search.initialPeriodDays} días (la primera vez) y luego solo los nuevos, con {snap.search.overlapHours} h de solapamiento. Solo se abren los que parecen avisos financieros (máx. {snap.search.maxMessagesPerRun} por ejecución).</div></div></div>
        <div className="row"><Icon name="sparkle" /><div><strong>Datos que se enviarán a {snap.ai?.provider === "openai" ? "OpenAI" : snap.ai?.provider === "anthropic" ? "Anthropic" : "Google"} ({snap.ai?.model})</strong><ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{snap.dataDestination.dataSentToAi.map((d: string) => <li key={d}>{d}</li>)}</ul></div></div>
        <div className="row"><Icon name="shield" /><div><strong>Acciones permitidas</strong><div>Leer avisos (solo lectura), extraer operaciones, agregar movimientos nuevos, recalcular presupuestos y avisarte. <strong>Nunca</strong>: enviar, borrar o mover correos, abrir enlaces o adjuntos, hacer pagos, ni sobrescribir tus correcciones.</div></div></div>
        <div className="row"><Icon name="dollar" /><div><strong>Consumo y costos</strong><div>Cada correo analizado es una solicitud a tu IA, facturada por tu proveedor en tu cuenta. Puedes fijar un límite técnico en Conexiones; al alcanzarlo, el análisis se pausa sin perder el progreso. Si falta saldo, la credencial falla o se alcanza el límite, no se usa otra cuenta ni otro proveedor.</div></div></div>
      </section>

      <details className="card pad"><summary>Texto completo de la instrucción</summary><pre className="instruction" style={{ marginTop: 8 }}>{v.instructionText}</pre></details>

      {!showApproved && (
        <>
          {err && <Notice tone="danger"><p>{err}</p></Notice>}
          <label className="check card pad" style={{ alignItems: "flex-start" }}>
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            <span>Revisé la instrucción y autorizo a MisFinanzas a ejecutarla <strong>todas las noches</strong> con esta configuración, leyendo mi correo y enviando el contenido indicado a mi proveedor de IA. Puedo pausarla o cancelarla cuando quiera.</span>
          </label>
          <button className="btn primary block" disabled={!confirmed || busy !== null} onClick={approve}>{busy === "approve" ? "Activando…" : "Validar y activar"}</button>
          <div className="grid2">
            <button className="btn" onClick={() => setEditing(true)}><Icon name="pencil" size={18} /> Editar</button>
            <button className="btn" onClick={onCancel}>Cancelar</button>
          </div>
          <button className="link-btn" disabled={busy !== null} onClick={generate}>{busy === "gen" ? "Regenerando…" : "Regenerar con mi IA"}</button>
        </>
      )}
      <Sheet open={editing} onClose={() => setEditing(false)} title="Editar preferencias">
        <p className="small muted">Ajusta las opciones y regeneramos la propuesta. Las restricciones de seguridad no se pueden eliminar.</p>
        <PrefsForm prefs={a.prefs} types={data!.movementTypes} onSaved={async () => { setEditing(false); await generate(); }} />
      </Sheet>
    </div>
  );
}
