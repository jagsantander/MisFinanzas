"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError, useApi } from "@/lib/client";
import { useMe } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { Notice, useToast } from "@/components/ui";
import { AiConnection, ConnectionsLoading, MailConnection, useConnections } from "@/components/connections";
import { PrefsForm, type AutomationResp } from "@/components/automation";
import { ReviewInstruction } from "@/components/ReviewInstruction";
import { formatMoney, parseAmount } from "@/lib/money";

const STEPS = ["preferences", "mail", "ai", "period", "instruction", "first_sync", "budgets"] as const;
type Step = (typeof STEPS)[number];
const TITLES: Record<Step, string> = {
  preferences: "Moneda y zona horaria", mail: "Conecta tu correo", ai: "Conecta tu IA", period: "Período de importación inicial",
  instruction: "Revisa y autoriza tu actualización nocturna", first_sync: "Primera sincronización", budgets: "Presupuestos por categoría",
};

function Wizard() {
  const router = useRouter();
  const sp = useSearchParams();
  const { me, reload: reloadMe } = useMe();
  const [step, setStep] = useState<Step | null>(null);
  useEffect(() => {
    if (!me || step) return;
    let s = (STEPS as readonly string[]).includes(me.user.onboardingStep) ? (me.user.onboardingStep as Step) : "preferences";
    if (sp.get("ok") === "mail" && s === "mail") s = "ai";
    setStep(s);
  }, [me, step, sp]);
  const go = async (s: Step | "done") => {
    await api("/api/onboarding", { body: { step: s } });
    if (s === "done") { await reloadMe(); router.replace("/"); return; }
    setStep(s); window.scrollTo(0, 0);
  };
  const next = () => go(STEPS[STEPS.indexOf(step!) + 1] ?? "done");
  if (!me || !step) return null;
  const idx = STEPS.indexOf(step);
  return (
    <main className="page">
      <div className="brand"><span>Mis<b>Finanzas</b></span></div>
      <div className="row between" style={{ marginTop: 16 }}>
        <span className="small muted">Paso {idx + 1} de {STEPS.length}</span>
        <button className="link-btn small" onClick={() => go("done")}>Omitir y usar manualmente</button>
      </div>
      <div className="bar" style={{ margin: "8px 0 16px" }} role="progressbar" aria-valuenow={idx + 1} aria-valuemin={1} aria-valuemax={STEPS.length} aria-label="Progreso"><i style={{ width: `${((idx + 1) / STEPS.length) * 100}%` }} /></div>
      <h1 className="title" style={{ fontSize: 26 }}>{TITLES[step]}</h1>
      {sp.get("error") && <Notice tone="danger"><p>{sp.get("error")}</p></Notice>}
      <div style={{ marginTop: 12 }}>
        {step === "preferences" && <PrefsStep onNext={next} />}
        {step === "mail" && <MailStep onNext={next} />}
        {step === "ai" && <AiStep onNext={next} />}
        {step === "period" && <PeriodStep onNext={next} />}
        {step === "instruction" && <InstructionStep onNext={next} onSkip={() => go("budgets")} />}
        {step === "first_sync" && <FirstSyncStep onNext={next} />}
        {step === "budgets" && <BudgetsStep onDone={() => go("done")} />}
      </div>
      {idx > 0 && <button className="link-btn" style={{ marginTop: 16 }} onClick={() => go(STEPS[idx - 1])}><Icon name="chevronLeft" size={16} /> Paso anterior</button>}
    </main>
  );
}

function PrefsStep({ onNext }: { onNext: () => void }) {
  const { me, reload } = useMe();
  const [currency, setCurrency] = useState(me!.user.currency);
  const [tz, setTz] = useState(me!.user.timezone);
  return (
    <div className="stack">
      <p>Usaremos pesos chilenos y la hora de Santiago por defecto. Puedes cambiarlo después en Perfil.</p>
      <div className="field"><label htmlFor="c">Moneda principal</label><select id="c" className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}><option value="CLP">Peso chileno · CLP ($1.650.000)</option><option value="USD">Dólar · USD</option><option value="EUR">Euro · EUR</option></select></div>
      <div className="field"><label htmlFor="t">Zona horaria</label><select id="t" className="input" value={tz} onChange={(e) => setTz(e.target.value)}>{["America/Santiago", "Pacific/Easter", "America/Punta_Arenas", "America/Argentina/Buenos_Aires", "America/Lima", "America/Bogota", "America/Mexico_City", "Europe/Madrid", "UTC"].map((z) => <option key={z}>{z}</option>)}</select></div>
      <button className="btn primary block" onClick={async () => { await api("/api/me", { method: "PATCH", body: { currency, timezone: tz } }); reload(); onNext(); }}>Confirmar y continuar</button>
    </div>
  );
}

function MailStep({ onNext }: { onNext: () => void }) {
  const { data, reload } = useConnections();
  if (!data) return <ConnectionsLoading />;
  return (
    <div className="stack">
      <p>Conecta el correo donde recibes avisos de tu banco. Puede ser distinto del correo de tu cuenta.</p>
      <MailConnection conns={data} onChange={reload} returnTo="/bienvenida" />
      {data.mail ? <button className="btn primary block" onClick={onNext}>Continuar</button> : <button className="btn block" onClick={onNext}>Omitir por ahora</button>}
    </div>
  );
}

function AiStep({ onNext }: { onNext: () => void }) {
  const { data, reload } = useConnections();
  if (!data) return <ConnectionsLoading />;
  return (
    <div className="stack">
      <p>MisFinanzas interpretará tus avisos con <strong>tu propia</strong> cuenta de OpenAI, Anthropic o Google Gemini. Cada solicitud usa solo tu credencial.</p>
      <AiConnection conns={data} onChange={reload} />
      {data.ai?.model ? <button className="btn primary block" onClick={onNext}>Continuar</button> : <button className="btn block" onClick={onNext}>{data.ai ? "Elige un modelo para continuar, u omite" : "Omitir por ahora"}</button>}
    </div>
  );
}

function PeriodStep({ onNext }: { onNext: () => void }) {
  const { data } = useApi<AutomationResp>("/api/automation");
  if (!data?.automation) return <ConnectionsLoading />;
  return (
    <div className="stack">
      <p>¿Desde cuándo quieres importar movimientos en la primera sincronización? Después solo se buscarán correos nuevos.</p>
      <PrefsForm prefs={data.automation.prefs} types={data.movementTypes} compact onSaved={onNext} />
    </div>
  );
}

function InstructionStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const { data } = useConnections();
  if (!data) return <ConnectionsLoading />;
  if (!data.mail || !data.ai?.model) return (
    <div className="stack">
      <Notice tone="warn"><p>Para activar la actualización nocturna necesitas un correo y una IA conectados. Puedes hacerlo más tarde desde Perfil › Conexiones.</p></Notice>
      <button className="btn primary block" onClick={onSkip}>Continuar sin automatización</button>
    </div>
  );
  return (
    <div className="stack">
      <Notice><p className="small">Tu IA generará una propuesta basada en una plantilla de MisFinanzas. <strong>Nada se activa</strong> hasta que pulses «Validar y activar».</p></Notice>
      <ReviewInstruction onApproved={onNext} onCancel={onSkip} />
    </div>
  );
}

function FirstSyncStep({ onNext }: { onNext: () => void }) {
  const toast = useToast();
  const [err, setErr] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  return (
    <div className="stack">
      <p>Puedes hacer ahora la primera importación. Se ejecuta en el servidor: puedes cerrar la app y te avisaremos al terminar.</p>
      {err && <Notice tone="danger"><p>{err}</p></Notice>}
      {queued ? <Notice tone="ok"><p>Primera sincronización en cola. Verás el resultado en Inicio y en Notificaciones.</p></Notice>
        : <button className="btn primary block" onClick={async () => { setErr(null); try { await api("/api/automation/run", { body: { trigger: "initial" } }); setQueued(true); toast({ text: "Sincronización en cola" }); } catch (e) { setErr((e as ApiError).message); } }}><Icon name="refresh" /> Sincronizar ahora</button>}
      <button className="btn block" onClick={onNext}>{queued ? "Continuar" : "Más tarde"}</button>
    </div>
  );
}

function BudgetsStep({ onDone }: { onDone: () => void }) {
  const { me } = useMe();
  const cats = useApi<{ categories: { id: string; name: string; parentId: string | null; kind: string }[] }>("/api/categories");
  const [vals, setVals] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const cur = me!.user.currency;
  const main = cats.data?.categories.filter((c) => !c.parentId && c.kind === "expense").slice(0, 8) ?? [];
  async function save() {
    setErr(null);
    try {
      for (const [id, v] of Object.entries(vals)) if (v.trim()) await api("/api/budgets", { method: "PUT", body: { scope: id === "total" ? "total" : "category", categoryId: id === "total" ? null : id, subcategoryId: null, amount: v } });
      onDone();
    } catch (e) { setErr((e as ApiError).message); }
  }
  return (
    <div className="stack">
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
      <p className="small muted">Puedes ajustar presupuestos y subcategorías en <Link href="/categorias?vista=presupuestos">Categorías › Presupuestos</Link>.</p>
    </div>
  );
}

export default function Welcome() { return <Suspense><Wizard /></Suspense>; }
