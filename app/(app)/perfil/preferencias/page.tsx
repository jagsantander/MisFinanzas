"use client";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/client";
import { applyTheme, localTheme, useMe } from "@/components/AppShell";
import { BackLink } from "@/components/BackLink";
import { Loading, Notice, useToast } from "@/components/ui";

const ZONES = ["America/Santiago", "Pacific/Easter", "America/Punta_Arenas", "America/Argentina/Buenos_Aires", "America/Lima", "America/Bogota", "America/Mexico_City", "Europe/Madrid", "UTC"];
const CURRENCIES: Record<string, string> = { CLP: "Peso chileno · CLP", USD: "Dólar estadounidense · USD", EUR: "Euro · EUR" };

export default function Preferences() {
  const { me } = useMe();
  const reload = () => {};
  const toast = useToast();
  const [p, setP] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [theme, setTheme] = useState(localTheme);
  const [nearText, setNearText] = useState("");
  useEffect(() => { if (me && !p) setNearText(String(me.user.budgetThresholds.find((t: number) => t < 100) ?? 80)); }, [me, p]);
  useEffect(() => { if (me && !p) setP({ name: me.user.name, currency: me.user.currency, timezone: me.user.timezone, monthStartDay: me.user.monthStartDay, budgetThresholds: me.user.budgetThresholds }); }, [me, p]);
  if (!me || !p) return <main className="page"><Loading /></main>;
  async function save() {
    setErr(null);
    const t = Number(nearText);
    if (!Number.isInteger(t) || t < 1 || t > 99) { setErr("El aviso de proximidad debe ser un número entero entre 1 y 99"); return; }
    p.budgetThresholds = [t, 100];
    try { await api("/api/me", { method: "PATCH", body: p }); toast({ text: "Preferencias guardadas" }); reload(); }
    catch (e) { setErr((e as ApiError).message); }
  }
  return (
    <main className="page">
      <BackLink href="/perfil" label="Perfil" />
      <h1 className="title">Preferencias</h1>
      <div className="card pad" style={{ marginTop: 12 }}>
        <div className="field"><label htmlFor="nm">Nombre</label><input id="nm" className="input" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></div>
        <div className="field"><label htmlFor="cur">Moneda principal</label><select id="cur" className="input" value={p.currency} onChange={(e) => setP({ ...p, currency: e.target.value })}>{Object.entries(CURRENCIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <span className="hint">Los movimientos en otras monedas se conservan en su moneda original y no se suman sin una conversión documentada.</span></div>
        <div className="field"><label htmlFor="tz">Zona horaria</label><select id="tz" className="input" value={p.timezone} onChange={(e) => setP({ ...p, timezone: e.target.value })}>{[...new Set([p.timezone, ...ZONES])].map((z) => <option key={z}>{z}</option>)}</select></div>
        <div className="field"><label htmlFor="msd">Inicio del período mensual</label><select id="msd" className="input" value={p.monthStartDay} onChange={(e) => setP({ ...p, monthStartDay: Number(e.target.value) })}>{Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>Día {d}</option>)}</select>
          <span className="hint">Útil si te pagan, por ejemplo, el día 25. Presupuestos y totales usan este período.</span></div>
        <fieldset className="field" style={{ border: 0, padding: 0 }}><legend className="label">Apariencia</legend>
          <div className="segmented">{([["light", "Claro"], ["dark", "Oscuro"], ["system", "Sistema"]] as const).map(([k, v]) => <button key={k} type="button" aria-pressed={theme === k} onClick={() => { setTheme(k); applyTheme(k); }}>{v}</button>)}</div>
          <span className="hint">Se aplica al instante y solo en este dispositivo.</span></fieldset>
        <div className="field"><label htmlFor="th">Aviso de proximidad al límite (%)</label>
          <div className="row" style={{ gap: 8 }}>
            <input id="th" className="input" inputMode="numeric" maxLength={2} style={{ maxWidth: 110 }} value={nearText} onChange={(e) => setNearText(e.target.value.replace(/\D/g, ""))} aria-describedby="th-h" />
            <span style={{ fontWeight: 700 }}>%</span>
          </div>
          <div className="chips" style={{ marginTop: 6 }}>{[50, 70, 80, 90].map((t) => <button key={t} type="button" className="chip" aria-pressed={nearText === String(t)} onClick={() => setNearText(String(t))}>{t}%</button>)}</div>
          <span id="th-h" className="hint">Escribe cualquier valor entre 1 y 99, o elige uno. También se avisa al llegar al 100% y al superar el límite.</span></div>
        {err && <Notice tone="danger"><p>{err}</p></Notice>}
        <button className="btn primary block" onClick={save}>Guardar</button>
      </div>
    </main>
  );
}
