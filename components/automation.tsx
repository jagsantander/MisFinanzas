"use client";
import { useState } from "react";
import { api, ApiError } from "@/lib/client";
import { Notice } from "./ui";

export type Prefs = { scheduleTime: string; timezone: string; initialPeriodDays: number; overlapHours: number; movementTypes: string[]; notifyChannels: string[]; maxMessagesPerRun: number; extraHints: string; bankSenders: string[] };
export type Version = { id: string; version: number; status: string; instructionText: string; proposal: { plain_summary: string }; configSnapshot: any; generatedWith: string; createdAt: string; approvedAt: string | null };
export type AutomationResp = {
  automation: { id: string; status: string; mode: string; prefs: Prefs; nextRunAt: string | null; pausedReason: string | null; approved: Version | null; proposed: Version | null; runs: any[]; lastRun: any } | null;
  dataSentToAi: string[];
  movementTypes: Record<string, string>;
};

const TIMES = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`);
const ZONES = ["America/Santiago", "Pacific/Easter", "America/Punta_Arenas", "America/Argentina/Buenos_Aires", "America/Lima", "America/Bogota", "America/Mexico_City", "Europe/Madrid", "UTC"];

/** Preferencias validadas (no texto libre de la instrucción). Cambiarlas exige nueva validación si ya estaba aprobada. */
export function PrefsForm({ prefs, types, onSaved, compact }: { prefs: Prefs; types: Record<string, string>; onSaved: () => void; compact?: boolean }) {
  const [p, setP] = useState<Prefs>(prefs);
  const [senders, setSenders] = useState(prefs.bankSenders.join(", "));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toggle = (k: "movementTypes" | "notifyChannels", v: string) => setP({ ...p, [k]: p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v] });
  async function save() {
    setBusy(true); setErr(null);
    try {
      await api("/api/automation/prefs", { method: "PUT", body: { ...p, bankSenders: senders.split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean) } });
      onSaved();
    } catch (e) { setErr((e as ApiError).message); } finally { setBusy(false); }
  }
  return (
    <div>
      <div className="grid2">
        <div className="field"><label htmlFor="st">Horario</label><select id="st" className="input" value={p.scheduleTime} onChange={(e) => setP({ ...p, scheduleTime: e.target.value })}>{TIMES.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div className="field"><label htmlFor="tz">Zona horaria</label><select id="tz" className="input" value={p.timezone} onChange={(e) => setP({ ...p, timezone: e.target.value })}>{[...new Set([p.timezone, ...ZONES])].map((z) => <option key={z}>{z}</option>)}</select></div>
      </div>
      <div className="field"><label htmlFor="ip">Período de importación inicial</label>
        <select id="ip" className="input" value={p.initialPeriodDays} onChange={(e) => setP({ ...p, initialPeriodDays: Number(e.target.value) })}>
          {[7, 30, 60, 90, 180].map((d) => <option key={d} value={d}>Últimos {d} días</option>)}
        </select><span className="hint">Luego la búsqueda es incremental, con {p.overlapHours} h de solapamiento para correos retrasados.</span></div>
      {!compact && <>
        <fieldset className="field" style={{ border: 0, padding: 0 }}><legend className="label">Movimientos que se analizarán</legend>
          {Object.entries(types).map(([k, v]) => <label key={k} className="check" style={{ padding: "4px 0" }}><input type="checkbox" checked={p.movementTypes.includes(k)} onChange={() => toggle("movementTypes", k)} /><span>{v}</span></label>)}
        </fieldset>
        <fieldset className="field" style={{ border: 0, padding: 0 }}><legend className="label">Avisos de la automatización</legend>
          <label className="check" style={{ padding: "4px 0" }}><input type="checkbox" checked disabled /><span>Dentro de la app (siempre)</span></label>
          <label className="check" style={{ padding: "4px 0" }}><input type="checkbox" checked={p.notifyChannels.includes("push")} onChange={() => toggle("notifyChannels", "push")} /><span>Notificación push</span></label>
          <label className="check" style={{ padding: "4px 0" }}><input type="checkbox" checked={p.notifyChannels.includes("email")} onChange={() => toggle("notifyChannels", "email")} /><span>Correo electrónico</span></label>
        </fieldset>
        <div className="field"><label htmlFor="mx">Máximo de correos por ejecución</label><input id="mx" type="number" className="input" min={10} max={500} value={p.maxMessagesPerRun} onChange={(e) => setP({ ...p, maxMessagesPerRun: Number(e.target.value) })} /></div>
        <div className="field"><label htmlFor="bs">Remitentes bancarios adicionales (dominios)</label><input id="bs" className="input" value={senders} onChange={(e) => setSenders(e.target.value)} placeholder="mibanco.cl, otrabilletera.com" /></div>
        <div className="field"><label htmlFor="hx">Indicaciones para clasificar (opcional)</label><textarea id="hx" className="input" maxLength={500} value={p.extraHints} onChange={(e) => setP({ ...p, extraHints: e.target.value })} placeholder="Ej.: los cargos de 'Copec' son Transporte › Combustible" />
          <span className="hint">No pueden modificar las restricciones de seguridad ni incluir enlaces o credenciales.</span></div>
      </>}
      {err && <Notice tone="danger"><p>{err}</p></Notice>}
      <button className="btn primary block" onClick={save} disabled={busy || p.movementTypes.length === 0}>{busy ? "Guardando…" : "Guardar preferencias"}</button>
    </div>
  );
}
