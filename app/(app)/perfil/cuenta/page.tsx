"use client";
import { useState } from "react";
import { api, ApiError } from "@/lib/client";
import { useMe } from "@/components/AppShell";
import { BackLink } from "@/components/BackLink";
import { TextField } from "@/components/forms";
import { Loading, Notice, useToast } from "@/components/ui";

export default function Account() {
  const { me, reload } = useMe();
  const toast = useToast();
  const [name, setName] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [pw, setPw] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!me) return <main className="page"><Loading /></main>;
  return (
    <main className="page">
      <BackLink href="/perfil" label="Perfil" />
      <h1 className="title">Datos personales</h1>
      {err && <Notice tone="danger"><p>{err}</p></Notice>}
      <form className="card pad" style={{ marginTop: 12 }} onSubmit={async (e) => { e.preventDefault(); try { await api("/api/me", { method: "PATCH", body: { name: name ?? me.user.name } }); toast({ text: "Nombre actualizado" }); reload(); } catch (x) { setErr((x as ApiError).message); } }}>
        <TextField label="Nombre" value={name ?? me.user.name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        <button className="btn primary block">Guardar</button>
      </form>
      <h2 className="section">Correo de la cuenta</h2>
      <div className="card pad">
        <p className="small">Actual: <strong>{me.user.email}</strong>. Este es el correo para entrar y recibir avisos de MisFinanzas; el correo del que se importan movimientos se gestiona en Conexiones.</p>
        {sent ? <Notice tone="ok"><p>Si el correo está disponible, enviamos un enlace de confirmación a <strong>{newEmail}</strong> (vence en 60 min). El cambio se aplica al confirmar.</p></Notice> : (
          <form onSubmit={async (e) => { e.preventDefault(); setErr(null); try { await api("/api/auth/change-email", { body: { newEmail, password: pw } }); setSent(true); } catch (x) { setErr((x as ApiError).message); } }}>
            <TextField label="Nuevo correo" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} autoComplete="email" />
            <TextField label="Contraseña actual" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
            <button className="btn block" disabled={!newEmail || !pw}>Enviar enlace de verificación</button>
          </form>
        )}
      </div>
    </main>
  );
}
