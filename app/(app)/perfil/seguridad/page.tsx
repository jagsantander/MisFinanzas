"use client";
import { useEffect, useState } from "react";
import { api, ApiError, fmtDateTime, useApi } from "@/lib/client";
import { useMe } from "@/components/AppShell";
import { BackLink } from "@/components/BackLink";
import { TextField } from "@/components/forms";
import { Icon } from "@/components/Icon";
import { ConfirmSheet, Empty, Loading, Notice, useToast } from "@/components/ui";
import { passkeyErrorMessage, passkeysSupported, platformAuthenticatorAvailable, registerPasskey } from "@/lib/passkey-client";

type Pk = { id: string; name: string; createdAt: string; lastUsedAt: string | null; backedUp: boolean; deviceType: string | null };
type Sess = { id: string; device: string; method: string; createdAt: string; lastSeenAt: string; current: boolean };

export default function Security() {
  const { me, reload: reloadMe } = useMe();
  const toast = useToast();
  const pks = useApi<{ passkeys: Pk[] }>("/api/auth/passkeys");
  const sessions = useApi<{ sessions: Sess[] }>("/api/auth/sessions");
  const [supported, setSupported] = useState<boolean | null>(null);
  const [platform, setPlatform] = useState(false);
  const [pkName, setPkName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Pk | null>(null);
  const [pw, setPw] = useState({ current: "", password: "", passwordConfirm: "", logoutOthers: true });
  const [lock, setLock] = useState<string>("");
  useEffect(() => { setSupported(passkeysSupported()); platformAuthenticatorAvailable().then(setPlatform); }, []);
  useEffect(() => { if (me) setLock(me.user.localLockMinutes ? String(me.user.localLockMinutes) : ""); }, [me]);
  if (!me) return <main className="page"><Loading /></main>;

  async function addPasskey() {
    setBusy(true); setErr(null);
    try { await registerPasskey(pkName || undefined); setPkName(""); toast({ text: "Passkey registrada" }); pks.reload(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : passkeyErrorMessage(e)); } finally { setBusy(false); }
  }
  return (
    <main className="page">
      <BackLink href="/perfil" label="Perfil" />
      <h1 className="title">Seguridad</h1>
      {err && <Notice tone="danger"><p>{err}</p></Notice>}

      <h2 className="section">Passkeys</h2>
      <div className="card pad stack">
        <p className="small" style={{ margin: 0 }}>Entra con huella, reconocimiento facial o el PIN de tu dispositivo. Tu dispositivo verifica tu identidad y solo comparte una firma: <strong>MisFinanzas no recibe ni guarda datos biométricos</strong>. Tu contraseña sigue siendo la vía de recuperación.</p>
        {supported === false && <Notice tone="warn"><p className="small">Este navegador no admite passkeys.</p></Notice>}
        {supported && !platform && <Notice><p className="small">Este dispositivo no informa un autenticador integrado; puedes usar otro teléfono o una llave de seguridad.</p></Notice>}
        {pks.loading && !pks.data ? <Loading rows={1} /> : pks.data!.passkeys.length === 0 ? <Empty icon="fingerprint" title="Sin passkeys">Aún no has configurado ninguna; esta función no está activa.</Empty> : (
          <div className="list">
            {pks.data!.passkeys.map((k) => (
              <div key={k.id} className="item" style={{ cursor: "default" }}>
                <span className="ico sm" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}><Icon name="key" /></span>
                <div className="grow"><div className="t">{k.name}</div><div className="s">Creada {fmtDateTime(k.createdAt)}{k.lastUsedAt ? ` · usada ${fmtDateTime(k.lastUsedAt)}` : ""}{k.backedUp ? " · sincronizada" : ""}</div></div>
                <button className="btn ghost sm" aria-label={`Eliminar passkey ${k.name}`} onClick={() => setRemoving(k)}><Icon name="trash" size={18} /></button>
              </div>
            ))}
          </div>
        )}
        {supported && <>
          <TextField label="Nombre del dispositivo (opcional)" value={pkName} onChange={(e) => setPkName(e.target.value)} placeholder="Mi teléfono" />
          <button className="btn primary block" disabled={busy || !me.user.emailVerified} onClick={addPasskey}><Icon name="fingerprint" /> Registrar passkey en este dispositivo</button>
        </>}
      </div>

      <h2 className="section">Bloqueo por inactividad</h2>
      <div className="card pad stack">
        <p className="small" style={{ margin: 0 }}>Distinto de iniciar sesión: bloquea una sesión ya abierta tras un tiempo sin uso y pide passkey o contraseña para continuar. El servidor aplica el bloqueo, por lo que no basta con manipular la app.</p>
        <div className="field"><label htmlFor="lk">Bloquear tras</label>
          <select id="lk" className="input" value={lock} onChange={(e) => setLock(e.target.value)}>
            <option value="">Nunca</option>{[1, 5, 15, 30, 60].map((m) => <option key={m} value={m}>{m} min sin actividad</option>)}
          </select></div>
        <Notice><p className="small"><strong>Límites en una PWA:</strong> la inactividad se mide por la actividad con el servidor; el sistema operativo puede mostrar una captura de la app en el selector de apps; y cerrar la app no cierra la sesión. Para mayor protección, usa también el bloqueo de pantalla de tu teléfono.</p></Notice>
        <button className="btn block" onClick={async () => { await api("/api/me", { method: "PATCH", body: { localLockMinutes: lock ? Number(lock) : null } }); toast({ text: "Bloqueo actualizado" }); reloadMe(); }}>Guardar</button>
      </div>

      <h2 className="section" id="contrasena">Cambiar contraseña</h2>
      <form className="card pad" onSubmit={async (e) => { e.preventDefault(); setErr(null); try { const r = await api("/api/auth/change-password", { body: pw }); toast({ text: `Contraseña actualizada${r.revoked ? ` · ${r.revoked} sesión(es) cerradas` : ""}` }); setPw({ current: "", password: "", passwordConfirm: "", logoutOthers: true }); sessions.reload(); } catch (x) { setErr((x as ApiError).message); } }}>
        <TextField label="Contraseña actual" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
        <TextField label="Nueva contraseña" type="password" autoComplete="new-password" hint="Al menos 10 caracteres." value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} />
        <TextField label="Confirmar nueva contraseña" type="password" autoComplete="new-password" error={pw.passwordConfirm && pw.password !== pw.passwordConfirm ? "No coinciden" : null} value={pw.passwordConfirm} onChange={(e) => setPw({ ...pw, passwordConfirm: e.target.value })} />
        <label className="check"><input type="checkbox" checked={pw.logoutOthers} onChange={(e) => setPw({ ...pw, logoutOthers: e.target.checked })} /><span>Cerrar las demás sesiones</span></label>
        <button className="btn primary block" disabled={!pw.current || pw.password.length < 10 || pw.password !== pw.passwordConfirm}>Cambiar contraseña</button>
      </form>

      <h2 className="section" id="sesiones">Sesiones abiertas</h2>
      {sessions.loading && !sessions.data ? <Loading /> : (
        <div className="list">
          {sessions.data?.sessions.map((s) => (
            <div key={s.id} className="item" style={{ cursor: "default" }}>
              <span className="ico sm" style={{ background: "var(--surface-2)" }}><Icon name="devices" /></span>
              <div className="grow"><div className="t">{s.device}{s.current && <span className="badge ok" style={{ marginLeft: 8 }}>Esta sesión</span>}</div><div className="s">Activa {fmtDateTime(s.lastSeenAt)} · entró con {s.method === "passkey" ? "passkey" : s.method === "password" ? "contraseña" : "enlace de correo"}</div></div>
              {!s.current && <button className="btn sm" onClick={async () => { await api(`/api/auth/sessions/${s.id}`, { method: "DELETE" }); sessions.reload(); }}>Cerrar</button>}
            </div>
          ))}
        </div>
      )}
      <button className="btn block" style={{ marginTop: 12 }} onClick={async () => { const r = await api("/api/auth/sessions/revoke-others", { body: {} }); toast({ text: `${r.revoked} sesión(es) cerradas` }); sessions.reload(); }}>Cerrar las demás sesiones</button>

      <ConfirmSheet open={Boolean(removing)} onClose={() => setRemoving(null)} danger title="¿Eliminar passkey?" confirmLabel="Eliminar"
        body={<p>«{removing?.name}» ya no podrá usarse para entrar. Si también existe en tu gestor de contraseñas o llavero, puedes borrarla allí.</p>}
        onConfirm={async () => { await api(`/api/auth/passkeys/${removing!.id}`, { method: "DELETE" }); setRemoving(null); toast({ text: "Passkey eliminada" }); pks.reload(); }} />
    </main>
  );
}
