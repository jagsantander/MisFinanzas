"use client";
import Link from "next/link";
import { useState } from "react";
import { api, ApiError } from "@/lib/client";
import { TextField } from "@/components/forms";
import { Notice } from "@/components/ui";

export default function RegisterPage() {
  const [f, setF] = useState({ name: "", email: "", password: "", passwordConfirm: "" });
  const [acceptTerms, setTerms] = useState(false);
  const [acceptData, setData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | string>(null);
  const [busy, setBusy] = useState(false);
  const mismatch = f.passwordConfirm && f.password !== f.passwordConfirm ? "Las contraseñas no coinciden" : null;
  const short = f.password && f.password.length < 10 ? "Mínimo 10 caracteres" : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api("/api/auth/register", { body: { ...f, acceptTerms, acceptDataProcessing: acceptData } });
      setDone(r.delivery);
    } catch (err) { setError((err as ApiError).message); }
    finally { setBusy(false); }
  }
  if (done) return (
    <div className="stack">
      <h1 className="title">Revisa tu correo</h1>
      <p>Si el correo es válido, te enviamos un enlace de verificación a <strong>{f.email}</strong>. Vence en 24 horas y solo se puede usar una vez.</p>
      {done === "dev_outbox" && <Notice tone="warn"><p><strong>Modo desarrollo:</strong> no hay servicio de correo configurado, así que el mensaje NO se envió. Puedes verlo en la <Link href="/dev-outbox">bandeja local de desarrollo</Link>.</p></Notice>}
      <Link className="btn block" href="/entrar">Ir a entrar</Link>
    </div>
  );
  return (
    <>
      <h1 className="title">Crear cuenta</h1>
      <p className="subtitle">El correo de tu cuenta puede ser distinto del correo que conectes para importar movimientos.</p>
      {error && <div style={{ marginBottom: 16 }}><Notice tone="danger"><p>{error}</p></Notice></div>}
      <form onSubmit={submit} noValidate>
        <TextField label="Nombre" autoComplete="name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <TextField label="Correo electrónico" type="email" autoComplete="email" inputMode="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <TextField label="Contraseña" type="password" autoComplete="new-password" required hint="Al menos 10 caracteres. Mejor una frase que puedas recordar." error={short} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        <TextField label="Confirmar contraseña" type="password" autoComplete="new-password" required error={mismatch} value={f.passwordConfirm} onChange={(e) => setF({ ...f, passwordConfirm: e.target.value })} />
        <label className="check"><input type="checkbox" checked={acceptTerms} onChange={(e) => setTerms(e.target.checked)} /><span>Acepto las <Link href="/condiciones" target="_blank">condiciones de uso</Link>.</span></label>
        <label className="check"><input type="checkbox" checked={acceptData} onChange={(e) => setData(e.target.checked)} /><span>Acepto el <Link href="/privacidad" target="_blank">tratamiento de mis datos</Link> necesario para operar el servicio.</span></label>
        <button className="btn primary block" style={{ marginTop: 12 }} disabled={busy || !acceptTerms || !acceptData || !f.name || !f.email || !f.password || Boolean(mismatch) || Boolean(short)}>{busy ? "Creando…" : "Crear cuenta"}</button>
      </form>
      <p className="muted" style={{ textAlign: "center", marginTop: 20 }}>¿Ya tienes cuenta? <Link href="/entrar">Entrar</Link></p>
    </>
  );
}
