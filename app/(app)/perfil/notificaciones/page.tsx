"use client";
import { useState } from "react";
import { useStore } from "@/lib/client";
import { saveSettings } from "@/lib/local/store";
import { BackLink } from "@/components/BackLink";
import { Notice, Switch, useToast } from "@/components/ui";

export default function NotificationPrefs() {
  const st = useStore();
  const toast = useToast();
  const [p, setP] = useState({ notifyEmail: st.settings.notifyEmail, quietStart: st.settings.quietStart, quietEnd: st.settings.quietEnd });
  const [err, setErr] = useState<string | null>(null);
  return (
    <main className="page">
      <BackLink href="/perfil" label="Perfil" />
      <h1 className="title">Avisos</h1>
      <div className="list" style={{ marginTop: 12 }}>
        <div className="item" style={{ cursor: "default" }}><div className="grow"><div className="t">Dentro de la app</div><div className="s">Siempre activo, con historial en Notificaciones.</div></div><Switch checked disabled label="Dentro de la app" onChange={() => {}} /></div>
      </div>
      <h2 className="section">Horario de silencio</h2>
      <div className="card pad">
        <div className="grid2">
          <div className="field"><label htmlFor="qs">Desde</label><input id="qs" type="time" className="input" value={p.quietStart} onChange={(e) => setP({ ...p, quietStart: e.target.value })} /></div>
          <div className="field"><label htmlFor="qe">Hasta</label><input id="qe" type="time" className="input" value={p.quietEnd} onChange={(e) => setP({ ...p, quietEnd: e.target.value })} /></div>
        </div>
        {err && <Notice tone="danger"><p>{err}</p></Notice>}
        <button className="btn primary block" onClick={async () => { setErr(null); try { await saveSettings(p); toast({ text: "Avisos guardados" }); } catch (e) { setErr((e as Error).message); } }}>Guardar</button>
      </div>
      <p className="small muted" style={{ marginTop: 12 }}>Las alertas de presupuesto se basan en los movimientos registrados: no son alertas bancarias en tiempo real.</p>
    </main>
  );
}
