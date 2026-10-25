"use client";
import { useState } from "react";
import Link from "next/link";
import { fmtDateTime, RUN_STATUS, useStore } from "@/lib/client";
import { Icon } from "@/components/Icon";
import { Notice, useToast } from "@/components/ui";
import { AiSetup, AutomationControls, ClaudeAuthSteps, ClaudeSetup, ClaudeTaskSteps, GmailAccess, ModePicker, PrefsForm } from "@/components/automation";
import { SheetConnection } from "@/components/sheet";

export default function AutomationPage() {
  const st = useStore();
  const toast = useToast();
  const a = st.automation;
  const [labels, setLabels] = useState<string[] | null>(null);
  return (
    <main className="page">
      <Link href="/" className="link-btn"><Icon name="chevronLeft" size={18} /> Inicio</Link>
      <h1 className="title">Actualización nocturna</h1>
      <p className="subtitle">Importa tus avisos financieros mientras duermes, sin servidor de Mi saldo: corre en tu cuenta de Google o en tu cuenta de Claude.</p>
      {!st.connection || !a ? (
        <div className="stack">
          <Notice tone="warn"><p>Primero conecta tu planilla: ahí se guardan los movimientos que llegan de noche.</p></Notice>
          <SheetConnection />
        </div>
      ) : (
        <div className="stack">
          <AutomationControls a={a} />
          {a.mode !== "none" && a.status !== "active" && (
            <Link href="/automatizacion/revisar" className="btn primary block">{a.proposed ? `Revisar y validar la versión ${a.proposed.version}` : "Generar la instrucción para validar"}</Link>
          )}
          {a.approved && <Link href="/automatizacion/revisar?ver=aprobada" className="btn block">Ver instrucción aprobada</Link>}

          <h2 className="section">Dónde se ejecuta</h2>
          <ModePicker a={a} />
          {!a.bankDomains && <Notice tone="warn"><p className="small">El script de tu planilla es de una versión anterior. <Link href="/conexiones">Actualízalo</Link> para elegir bancos, probar el acceso a Gmail y leer boletas.</p></Notice>}
          {a.mode === "google" && <><h2 className="section">1. Autoriza Gmail</h2><GmailAccess onLabels={setLabels} /></>}
          {a.mode === "claude" && <><h2 className="section">1. Autoriza Gmail en Claude</h2><ClaudeAuthSteps /></>}
          <h2 className="section" id="ia">{a.mode === "google" ? "2. Tu inteligencia artificial" : "Tu IA para leer boletas (opcional)"}</h2>
          {a.mode !== "google" && <p className="small muted">La foto de una boleta se analiza con una clave de IA guardada en tu script. Con una clave gratuita de Gemini no tiene costo.</p>}
          <AiSetup a={a} />
          {a.mode === "claude" && (
            <>
              <h2 className="section">2. Tu tarea de Claude</h2>
              <ClaudeSetup a={a} />
              {a.approved && <details className="card pad" open={a.status === "active" && !a.lastRun}><summary>Cómo crear la tarea en claude.ai</summary><div style={{ marginTop: 8 }}><ClaudeTaskSteps a={a} /></div></details>}
              <p className="small muted">Mi saldo no puede crear ni ver tu tarea de Claude (Anthropic no ofrece una API para eso). Sabrás que funciona cuando aparezca aquí la última importación.</p>
            </>
          )}

          {a.mode !== "none" && <>
            <h2 className="section" id="preferencias">3. Qué correos leer y cuándo</h2>
            <div className="card pad">
              {a.status === "active" && <Notice tone="warn"><p className="small">Cambiar horario o alcance genera una nueva versión que debes validar; mientras tanto, la ejecución automática queda bloqueada.</p></Notice>}
              <div style={{ height: 8 }} />
              <PrefsForm a={a} labels={labels} onSaved={() => toast({ text: "Preferencias guardadas" })} />
            </div>
          </>}

          <h2 className="section">Historial</h2>
          {st.tables.runs.length === 0 ? <p className="small muted">Aún no hay ejecuciones.</p> : (
            <div className="list">
              {[...st.tables.runs].sort((x, y) => y.startedAt.localeCompare(x.startedAt)).slice(0, 20).map((r) => (
                <div key={r.id} className="item" style={{ cursor: "default", alignItems: "flex-start" }}>
                  <div className="grow small">
                    <div className="row" style={{ gap: 8 }}><strong>{r.trigger === "scheduled" ? "Programada" : r.trigger === "claude" ? "Tarea de Claude" : "Manual"}</strong><span className={`badge ${RUN_STATUS[r.status]?.tone}`}>{RUN_STATUS[r.status]?.label ?? r.status}</span></div>
                    <div className="muted">{fmtDateTime(r.startedAt)} · {r.messagesAnalyzed} correos analizados · {r.movementsCreated} nuevos · {r.movementsReview} por revisar · {r.duplicatesSkipped} duplicados{r.messagesFailed ? ` · ${r.messagesFailed} con error` : ""}</div>
                    {r.inputTokens + r.outputTokens > 0 && <div className="muted">{(r.inputTokens + r.outputTokens).toLocaleString("es-CL")} tokens</div>}
                    {r.note && <div className="muted">{r.note}</div>}
                    {r.error && <div className="expense">{r.error}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="small muted">Solo se detectan los movimientos informados en los correos accesibles; no es una conciliación bancaria completa.</p>
        </div>
      )}
    </main>
  );
}
