"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, useApi, useStore } from "@/lib/client";
import { saveSettings, script } from "@/lib/local/store";
import { Icon } from "@/components/Icon";
import { Notice, useToast } from "@/components/ui";
import { SheetConnection } from "@/components/sheet";
import { AiSetup, ClaudeAuthSteps, ClaudeSetup, ClaudeTaskSteps, GmailAccess, ModePicker, PrefsForm, ReviewInstruction } from "@/components/automation";
import { formatMoney, parseAmount } from "@/lib/money";

const STEPS = ["preferences", "sheet", "mode", "ai", "period", "instruction", "first_sync", "budgets"] as const;
type Step = (typeof STEPS)[number];
const TITLES: Record<Step, string> = {
  preferences: "Te damos la bienvenida", sheet: "Conecta tu planilla", mode: "¿Dónde corre la actualización nocturna?", ai: "Autoriza Gmail y tu IA",
  period: "Período de importación inicial", instruction: "Revisa y autoriza tu actualización nocturna", first_sync: "Primera sincronización", budgets: "Presupuestos por categoría",
};

export default function Welcome() {
  const router = useRouter();
  const st = useStore();
  const [step, setStep] = useState<Step>("preferences");
  const a = st.automation;
  const finish = async () => { await saveSettings({ onboardingDone: true }).catch(() => {}); router.replace("/"); };
  // Pasos que no aplican se saltan solos (sin planilla no hay nocturna; sin modalidad no hay IA).
  const applies = (s: Step) => {
    if (["mode", "ai", "period", "instruction", "first_sync"].includes(s)) {
      if (!st.connection || !a) return false;
      if (s !== "mode" && a.mode === "none") return false;
    }
    return true;
  };
  const go = (dir: 1 | -1) => {
    let i = STEPS.indexOf(step) + dir;
    while (i >= 0 && i < STEPS.length && !applies(STEPS[i])) i += dir;
    if (i >= STEPS.length) return void finish();
    if (i >= 0) { setStep(STEPS[i]); window.scrollTo(0, 0); }
  };
  const idx = STEPS.indexOf(step);
  return (
    <main className="page">
      <div className="brand"><span>Mi<b>Saldo</b></span></div>
      <div className="row between" style={{ marginTop: 16 }}>
        <span className="small muted">Paso {idx + 1} de {STEPS.length}</span>
        <button className="link-btn small" onClick={finish}>Omitir y usar manualmente</button>
      </div>
      <div className="bar" style={{ margin: "8px 0 16px" }} role="progressbar" aria-valuenow={idx + 1} aria-valuemin={1} aria-valuemax={STEPS.length} aria-label="Progreso"><i style={{ width: `${((idx + 1) / STEPS.length) * 100}%` }} /></div>
      <h1 className="title" style={{ fontSize: 26 }}>{TITLES[step]}</h1>
      <div style={{ marginTop: 12 }} className="stack">
        {step === "preferences" && <PrefsStep onNext={() => go(1)} />}
        {step === "sheet" && (
          <>
            <p>Tus datos se guardan en una planilla de Google <strong>tuya</strong>. Así no dependes de ningún servidor y puedes usar la app en varios dispositivos.</p>
            <SheetConnection />
            {st.connection ? <button className="btn primary block" onClick={() => go(1)}>Continuar</button>
              : <button className="btn block" onClick={() => go(1)}>Por ahora, guardar solo en este dispositivo</button>}
          </>
        )}
        {step === "mode" && a && <><ModePicker a={a} /><button className="btn primary block" onClick={() => go(1)}>Continuar</button></>}
        {step === "ai" && a && (a.mode === "google"
          ? <><h2 className="section">Autoriza Gmail</h2><GmailAccess /><h2 className="section">Tu IA</h2><AiSetup a={a} />{a.hasAiKey && a.ai.model ? <button className="btn primary block" onClick={() => go(1)}>Continuar</button> : <p className="small muted">Guarda tu clave y elige un modelo para continuar.</p>}</>
          : <><ClaudeAuthSteps /><ClaudeSetup a={a} />{a.prefs.claudeGmailAccount ? <button className="btn primary block" onClick={() => go(1)}>Continuar</button> : null}</>)}
        {step === "period" && a && <><p>¿Desde cuándo importar en la primera sincronización? Después solo se buscan correos nuevos.</p><PrefsForm a={a} compact onSaved={() => go(1)} /></>}
        {step === "instruction" && a && <ReviewInstruction a={a} onApproved={() => go(1)} onCancel={() => go(1)} />}
        {step === "first_sync" && a && <FirstSync onNext={() => go(1)} />}
        {step === "budgets" && <BudgetsStep onDone={finish} />}
      </div>
      {idx > 0 && <button className="link-btn" style={{ marginTop: 16 }} onClick={() => go(-1)}><Icon name="chevronLeft" size={16} /> Paso anterior</button>}
    </main>
  );
}

function PrefsStep({ onNext }: { onNext: () => void }) {
  const st = useStore();
  const [name, setName] = useState(st.settings.name);
  const [currency, setCurrency] = useState(st.settings.currency);
  const [tz, setTz] = useState(st.settings.timezone);
  return (
    <>
      <p>MiSaldo ordena tus ingresos y gastos. Usaremos pesos chilenos y la hora de Santiago por defecto.</p>
      <div className="field"><label htmlFor="n">¿Cómo te llamas?</label><input id="n" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" /></div>
      <div className="field"><label htmlFor="c">Moneda principal</label><select id="c" className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}><option value="CLP">Peso chileno · CLP ($1.650.000)</option><option value="USD">Dólar · USD</option><option value="EUR">Euro · EUR</option></select></div>
      <div className="field"><label htmlFor="t">Zona horaria</label><select id="t" className="input" value={tz} onChange={(e) => setTz(e.target.value)}>{["America/Santiago", "Pacific/Easter", "America/Punta_Arenas", "America/Argentina/Buenos_Aires", "America/Lima", "America/Bogota", "America/Mexico_City", "Europe/Madrid", "UTC"].map((z) => <option key={z}>{z}</option>)}</select></div>
      <button className="btn primary block" onClick={async () => { await saveSettings({ name: name.trim(), currency, timezone: tz }).catch(() => {}); onNext(); }}>Continuar</button>
    </>
  );
}

function FirstSync({ onNext }: { onNext: () => void }) {
  const st = useStore();
  const a = st.automation!;
  const toast = useToast();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  if (!a.approved) return <><Notice><p>La actualización nocturna no quedó aprobada. Puedes hacerlo después en Perfil.</p></Notice><button className="btn primary block" onClick={onNext}>Continuar</button></>;
  if (a.mode === "claude") return (
    <>
      <p>Ahora crea la tarea en tu cuenta de Claude con la instrucción aprobada:</p>
      <ClaudeSetup a={a} />
      <ClaudeTaskSteps a={a} />
      <button className="btn primary block" onClick={onNext}>Ya la creé, continuar</button>
    </>
  );
  return (
    <>
      <p>Puedes hacer ahora la primera importación. Corre en tu cuenta de Google y puede tardar unos minutos.</p>
      {err && <Notice tone="danger"><p>{err}</p></Notice>}
      {done ? <Notice tone="ok"><p>{done}</p></Notice> : (
        <button className="btn primary block" disabled={busy} onClick={async () => {
          setBusy(true); setErr(null);
          try {
            const r = await script<{ run: { movementsCreated: number; movementsReview: number } }>("runNow", {}, 360_000);
            setDone(`Listo: ${r.run.movementsCreated} movimientos nuevos${r.run.movementsReview ? `, ${r.run.movementsReview} por revisar` : ""}.`);
            toast({ text: "Primera sincronización completada" });
          } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
        }}><Icon name="refresh" /> {busy ? "Importando… (no cierres esta pantalla)" : "Sincronizar ahora"}</button>
      )}
      <button className="btn block" onClick={onNext}>{done ? "Continuar" : "Más tarde"}</button>
    </>
  );
}

function BudgetsStep({ onDone }: { onDone: () => void }) {
  const st = useStore();
  const cats = useApi<{ categories: { id: string; name: string; parentId: string | null; kind: string }[] }>("/api/categories");
  const [vals, setVals] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const cur = st.settings.currency;
  const main = cats.data?.categories.filter((c) => !c.parentId && c.kind === "expense").slice(0, 8) ?? [];
  async function save() {
    setErr(null);
    try {
      for (const [id, v] of Object.entries(vals)) if (v.trim()) await api("/api/budgets", { method: "PUT", body: { scope: id === "total" ? "total" : "category", categoryId: id === "total" ? null : id, subcategoryId: null, amount: v } });
      onDone();
    } catch (e) { setErr((e as ApiError).message); }
  }
  return (
    <>
      <p>Fija límites mensuales opcionales. Son informativos: te avisaremos al 80%, al 100% y si se superan. Deja en blanco las categorías sin límite.</p>
      {[{ id: "total", name: "Gasto total del mes" }, ...main].map((c) => {
        const parsed = vals[c.id] ? parseAmount(vals[c.id], cur) : null;
        return (
          <div key={c.id} className="field"><label htmlFor={`b-${c.id}`}>{c.name}</label>
            <input id={`b-${c.id}`} className="input" inputMode="decimal" placeholder="Sin límite" value={vals[c.id] ?? ""} onChange={(e) => setVals({ ...vals, [c.id]: e.target.value })} />
            {parsed && <span className="hint">{formatMoney(parsed, cur)}</span>}</div>
        );
      })}
      {err && <Notice tone="danger"><p>{err}</p></Notice>}
      <button className="btn primary block" onClick={save}>Guardar y terminar</button>
      <button className="btn block" onClick={onDone}>Omitir</button>
      <p className="small muted">Puedes ajustarlos en <Link href="/categorias?vista=presupuestos">Categorías › Presupuestos</Link>.</p>
    </>
  );
}
