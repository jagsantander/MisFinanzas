"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, useApi, useStore } from "@/lib/client";
import { saveSettings } from "@/lib/local/store";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/ui";
import { SheetConnection } from "@/components/sheet";
import { DeviceAiSetup } from "@/components/automation";
import { formatMoney, parseAmount } from "@/lib/money";

const STEPS = ["preferences", "sheet", "ai", "budgets"] as const;
type Step = (typeof STEPS)[number];
const TITLES: Record<Step, string> = {
  preferences: "Te damos la bienvenida", sheet: "Conecta tu planilla", ai: "Vincula tu IA Gemini", budgets: "Presupuestos por categoría",
};

export default function Welcome() {
  const router = useRouter();
  const st = useStore();
  const [step, setStep] = useState<Step>("preferences");
  const finish = async () => { await saveSettings({ onboardingDone: true }).catch(() => {}); router.replace("/"); };
  const go = (dir: 1 | -1) => {
    const i = STEPS.indexOf(step) + dir;
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
        {step === "ai" && (
          <>
            <p>Opcional: con una clave gratuita de Gemini, MiSaldo lee fotos de boletas y cartolas del banco por ti.</p>
            <DeviceAiSetup onSaved={() => go(1)} />
            <button className="btn block" onClick={() => go(1)}>Más tarde</button>
          </>
        )}
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
