"use client";
import Link from "next/link";
import { Icon } from "./Icon";
import { AUTOMATION_STATUS, fmtDateTime } from "@/lib/client";

type Run = { status: string; finishedAt: string | null; createdAt: string; movementsCreated: number; movementsReview: number; error: string | null };

/** Línea compacta de estado: "Última actualización: hoy, 03:08 · 8 movimientos nuevos · 2 por revisar". */
export function AutomationStatus({ a }: { a: { status: string; mode?: string; nextRunAt: string | null; lastRun: Run | null; pausedReason: string | null } | null }) {
  if (!a) return null;
  const st = AUTOMATION_STATUS[a.status] ?? { label: a.status, tone: "info" };
  const last = a.lastRun;
  return (
    <Link href="/automatizacion" className="card pad row" style={{ color: "var(--text)", gap: 12 }}>
      <span className="ico sm" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}><Icon name="moon" /></span>
      <div className="grow small">
        <div className="row" style={{ gap: 8 }}><strong>Actualización nocturna</strong><span className={`badge ${st.tone}`}>{st.label}</span></div>
        {last && last.finishedAt ? (
          <div className="muted">Última actualización: {fmtDateTime(last.finishedAt)} · {last.movementsCreated} movimientos nuevos{last.movementsReview ? ` · ${last.movementsReview} por revisar` : ""}{last.status === "failed" || last.status === "blocked" ? " · con problemas" : ""}</div>
        ) : <div className="muted">{a.status === "not_configured" ? "Aún no configurada. Toca para elegir dónde corre." : a.status === "pending_approval" ? "Revisa y valida la instrucción para activarla." : a.mode === "claude" ? "Aún no llega ninguna importación de tu tarea de Claude." : "Aún no hay ejecuciones."}</div>}
        {a.status === "active" && a.nextRunAt && <div className="muted">Próxima: {fmtDateTime(a.nextRunAt)}</div>}
        {(a.status === "paused" || a.status === "error") && a.pausedReason && <div className="expense">{a.pausedReason}</div>}
      </div>
      <Icon name="chevronRight" />
    </Link>
  );
}
