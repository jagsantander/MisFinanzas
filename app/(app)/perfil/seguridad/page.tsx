"use client";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/client";
import { disconnect, forgetDevice } from "@/lib/local/store";
import { disableLock, enableLock, lockConfigured, lockMinutes, lockSupported, setLockMinutes } from "@/lib/local/lock";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
import { ConfirmSheet, Notice, useToast } from "@/components/ui";

export default function Security() {
  const st = useStore();
  const toast = useToast();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [active, setActive] = useState(false);
  const [minutes, setMinutes] = useState(5);
  const [err, setErr] = useState<string | null>(null);
  const [confirmForget, setConfirmForget] = useState(false);
  useEffect(() => { lockSupported().then(setSupported); setActive(lockConfigured()); setMinutes(lockMinutes() || 5); }, []);

  return (
    <main className="page">
      <BackLink href="/perfil" label="Perfil" />
      <h1 className="title">Seguridad</h1>

      <h2 className="section">Bloqueo con huella, rostro o PIN</h2>
      <div className="card pad stack">
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
        <Notice><p className="small"><strong>Límites:</strong> es una barrera de uso en este dispositivo, no cifra los datos guardados en el navegador. El sistema puede mostrar una vista previa de la app en el selector de apps. La protección principal es el bloqueo de pantalla de tu teléfono y tu cuenta de Google.</p></Notice>
      </div>

      <h2 className="section" id="dispositivo">Este dispositivo</h2>
      <div className="card pad stack">
        <p className="small" style={{ margin: 0 }}>Aquí se guardan una copia de tus datos y el <strong>token de tu planilla</strong>. Quien tenga ese token y la dirección del script puede ver tus movimientos: no lo compartas.</p>
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
          <li>Si pierdes este dispositivo, regenera el token en la planilla: menú <strong>MiSaldo → Regenerar token de la app</strong>.</li>
          <li>La clave de tu IA nunca se guarda aquí: vive en las propiedades privadas de tu script.</li>
        </ul>
        <button className="btn danger block" onClick={() => setConfirmForget(true)}>Olvidar este dispositivo</button>
      </div>
      <ConfirmSheet open={confirmForget} onClose={() => setConfirmForget(false)} danger title="¿Olvidar este dispositivo?" confirmLabel="Borrar datos de este dispositivo"
        body={<><p>Se borran la copia local, el token y el bloqueo de este dispositivo.{st.pending.length ? ` Hay ${st.pending.length} cambios sin enviar a la planilla que se perderán.` : ""}</p><p><strong>Tu planilla no se modifica.</strong></p></>}
        onConfirm={async () => { disconnect(); disableLock(); await forgetDevice(); location.reload(); }} />
    </main>
  );
}
