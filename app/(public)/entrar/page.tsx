"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { api, ApiError } from "@/lib/client";
import { safeNextPath } from "@/lib/safe-redirect";
import { TextField } from "@/components/forms";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/ui";
import { loginWithPasskey, passkeyErrorMessage, passkeysSupported } from "@/lib/passkey-client";

function LoginInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(sp.get("error"));
  const [unverified, setUnverified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pkSupported, setPkSupported] = useState(false);
  const [resent, setResent] = useState(false);
  useEffect(() => setPkSupported(passkeysSupported()), []);
  const next = safeNextPath(sp.get("next"));
  const done = (onboarding: boolean) => router.replace(onboarding ? "/bienvenida" : next);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setUnverified(false);
    try { const r = await api("/api/auth/login", { body: { email, password } }); done(r.onboarding); }
    catch (err) { const a = err as ApiError; setError(a.message); setUnverified(a.code === "email_unverified"); }
    finally { setBusy(false); }
  }
  async function passkey() {
    setBusy(true); setError(null);
    try { const r = await loginWithPasskey(); done(r.onboarding); }
    catch (e) { setError(passkeyErrorMessage(e)); }
    finally { setBusy(false); }
  }
  return (
    <>
      <h1 className="title">Entrar</h1>
      <p className="subtitle">Tu dinero, en orden.</p>
      {error && <div style={{ marginBottom: 16 }}><Notice tone="danger"><p>{error}</p>
        {unverified && (resent ? <p className="small">Si la cuenta existe y no está verificada, enviamos un nuevo enlace.</p>
          : <button className="link-btn" onClick={async () => { await api("/api/auth/resend-verification", { body: { email } }); setResent(true); }}>Reenviar enlace de verificación</button>)}
      </Notice></div>}
      {pkSupported && (
        <>
          <button className="btn primary block" onClick={passkey} disabled={busy}>
            <Icon name="fingerprint" /> Entrar con passkey
          </button>
          <p className="small muted" style={{ textAlign: "center", margin: "8px 0 20px" }}>Usa huella, rostro o el PIN de tu dispositivo. MisFinanzas no recibe datos biométricos.</p>
          <div className="row" style={{ margin: "8px 0 16px" }}><hr className="sep grow" /><span className="small muted">o con contraseña</span><hr className="sep grow" /></div>
        </>
      )}
      <form onSubmit={submit} noValidate>
        <TextField label="Correo electrónico" type="email" autoComplete="username webauthn" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField label="Contraseña" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className={`btn block ${pkSupported ? "" : "primary"}`} disabled={busy || !email || !password}>{busy ? "Entrando…" : "Entrar"}</button>
      </form>
      <div className="stack" style={{ marginTop: 20, textAlign: "center" }}>
        <Link href="/recuperar">¿Olvidaste tu contraseña?</Link>
        <span className="muted">¿No tienes cuenta? <Link href="/registro">Crear cuenta</Link></span>
      </div>
    </>
  );
}
export default function LoginPage() { return <Suspense><LoginInner /></Suspense>; }
