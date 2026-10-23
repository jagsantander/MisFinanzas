"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/client";
import { TextField } from "@/components/forms";
import { Notice } from "@/components/ui";

function ResetInner() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [passwordConfirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (done) return <div className="stack"><Notice tone="ok"><p>Contraseña actualizada. Cerramos todas las sesiones abiertas por seguridad.</p></Notice><Link className="btn primary block" href="/entrar">Entrar</Link></div>;
  return (
    <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); setError(null); try { await api("/api/auth/reset", { body: { token, password, passwordConfirm } }); setDone(true); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } }}>
      <h1 className="title">Nueva contraseña</h1>
      {error && <Notice tone="danger"><p>{error}</p></Notice>}
      <TextField label="Nueva contraseña" type="password" autoComplete="new-password" hint="Al menos 10 caracteres." value={password} onChange={(e) => setPassword(e.target.value)} />
      <TextField label="Confirmar contraseña" type="password" autoComplete="new-password" error={passwordConfirm && passwordConfirm !== password ? "No coinciden" : null} value={passwordConfirm} onChange={(e) => setConfirm(e.target.value)} />
      <button className="btn primary block" disabled={busy || password.length < 10 || password !== passwordConfirm}>Guardar contraseña</button>
    </form>
  );
}
export default function ResetPage() { return <Suspense><ResetInner /></Suspense>; }
