"use client";
import { useEffect, useState } from "react";
import { disableLock, enableLock, lockConfigured, lockMinutes, lockSupported, setLockMinutes } from "@/lib/local/lock";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
import { Notice, useToast } from "@/components/ui";

export default function Security() {
  const toast = useToast();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [active, setActive] = useState(false);
  const [minutes, setMinutes] = useState(5);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { lockSupported().then(setSupported); setActive(lockConfigured()); setMinutes(lockMinutes() || 5); }, []);

  return (
    <main className="page">
      <BackLink href="/perfil" label="Perfil" />
      <h1 className="title">Bloqueo con huella o PIN</h1>
      <div className="card pad stack" style={{ marginTop: 12 }}>
        <p className="small" style={{ margin: 0 }}>Pide desbloquear MiSaldo con el método del dispositivo al abrir la app y tras un tiempo sin uso. El sistema verifica tu identidad: <strong>MiSaldo no recibe ni guarda datos biométricos</strong>.</p>
        {supported === false && <Notice tone="warn"><p className="small">Este dispositivo o navegador no ofrece un desbloqueo integrado.</p></Notice>}
        <div className="field"><label htmlFor="lm">Bloquear tras</label>
          <select id="lm" className="input" value={minutes} onChange={(e) => { const m = Number(e.target.value); setMinutes(m); if (active) setLockMinutes(m); }}>
            {[1, 5, 15, 30, 60].map((m) => <option key={m} value={m}>{m} min sin uso</option>)}
          </select></div>
        {active
          ? <button className="btn block" onClick={() => { disableLock(); setActive(false); toast({ text: "Bloqueo desactivado" }); }}>Desactivar bloqueo</button>
          : <button className="btn primary block" disabled={!supported} onClick={async () => { setErr(null); try { await enableLock(minutes); setActive(true); toast({ text: "Bloqueo activado" }); } catch (e) { setErr((e as Error).name === "NotAllowedError" ? "Se canceló la verificación." : (e as Error).message); } }}><Icon name="fingerprint" /> Activar bloqueo</button>}
        {err && <Notice tone="danger"><p className="small">{err}</p></Notice>}
      </div>

    </main>
  );
}
