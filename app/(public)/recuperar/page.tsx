"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";
import { TextField } from "@/components/forms";
import { Notice } from "@/components/ui";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <h1 className="title">Recuperar contraseña</h1>
      {sent ? (
        <div className="stack">
          <Notice tone="ok"><p>Si existe una cuenta con <strong>{email}</strong>, enviamos un enlace para crear una nueva contraseña. Vence en 60 minutos y solo se puede usar una vez.</p></Notice>
          <Link className="btn block" href="/entrar">Volver a entrar</Link>
        </div>
      ) : (
        <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); setError(null); try { await api("/api/auth/forgot", { body: { email } }); setSent(true); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } }}>
          <p className="subtitle">Te enviaremos un enlace de un solo uso.</p>
          {error && <Notice tone="danger"><p>{error}</p></Notice>}
          <TextField label="Correo de tu cuenta" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn primary block" disabled={busy || !email}>{busy ? "Enviando…" : "Enviar enlace"}</button>
        </form>
      )}
    </>
  );
}
