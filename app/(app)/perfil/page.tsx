"use client";
import Link from "next/link";
import { AUTOMATION_STATUS, fmtDateTime, useStore } from "@/lib/client";
import { Icon } from "@/components/Icon";
import { lockConfigured } from "@/lib/local/lock";
import { localTheme } from "@/components/AppShell";
import { useEffect, useState } from "react";

function Row({ href, icon, color, title, value, sub }: { href: string; icon: string; color: string; title: string; value?: string; sub?: string }) {
  return (
    <Link href={href} className="item" style={{ color: "var(--text)" }}>
      <span className="ico" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}><Icon name={icon} /></span>
      <div className="grow"><div className="t">{title}</div>{sub && <div className="s">{sub}</div>}</div>
      {value && <span className="muted small right">{value}</span>}
      <Icon name="chevronRight" />
    </Link>
  );
}
const THEME: Record<string, string> = { system: "Sistema", light: "Claro", dark: "Oscuro" };

export default function Profile() {
  const st = useStore();
  const s = st.settings;
  const [lock, setLock] = useState(false);
  const [theme, setTheme] = useState("system");
  useEffect(() => { setLock(lockConfigured()); setTheme(localTheme()); }, []);
  const initials = (s.name || "MF").split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const a = st.automation;
  return (
    <main className="page">
      <div className="brand"><span>Mi<b>Saldo</b></span></div>
      <h1 className="title" style={{ marginTop: 12 }}>Mi perfil</h1>
      <section className="card pad row" style={{ marginTop: 12 }}>
        <span className="ico" style={{ width: 64, height: 64, background: "var(--primary-soft)", color: "var(--primary-strong)", fontWeight: 800, fontSize: 22 }} aria-hidden>{initials}</span>
        <div className="grow"><div style={{ fontWeight: 750, fontSize: 19 }}>{s.name || "Sin nombre"}</div><div className="small muted ellipsis">{st.account ? `Google: ${st.account}` : "Solo en este dispositivo"}</div></div>
        <Link href="/perfil/preferencias" className="btn sm" style={{ background: "var(--primary-soft)", color: "var(--primary-strong)", borderColor: "transparent" }}><Icon name="pencil" size={16} /> Editar</Link>
      </section>

      <h2 className="section">Preferencias</h2>
      <div className="list">
        <Row href="/perfil/preferencias" icon="dollar" color="#11734f" title="Moneda y zona horaria" value={`${s.currency} · ${s.timezone.split("/").pop()?.replace("_", " ")}`} />
        <Row href="/perfil/preferencias" icon="calendar" color="#7c5cd6" title="Inicio del mes" value={`Día ${s.monthStartDay}`} />
        <Row href="/perfil/notificaciones" icon="bell" color="#11734f" title="Avisos" value={s.notifyEmail ? "App y correo" : "Solo en la app"} sub={`Silencio ${s.quietStart}–${s.quietEnd}`} />
        <Row href="/perfil/preferencias" icon="sun" color="#e08a00" title="Apariencia" value={THEME[theme]} />
        <Row href="/perfil/preferencias" icon="percent" color="#c23d2d" title="Umbrales de presupuesto" value={s.budgetThresholds.map((t) => `${t}%`).join(", ")} />
      </div>

      <h2 className="section">Datos y automatización</h2>
      <div className="list">
        <Row href="/conexiones" icon="table" color="#3b82f6" title="Tu planilla" value={st.connection ? (st.syncError ? "Con error" : "Conectada") : "Sin conectar"} sub={st.lastSyncAt ? `Sincronizada ${fmtDateTime(st.lastSyncAt)}` : undefined} />
        <Row href="/automatico" icon="refresh" color="#0f7d70" title="Registro automático" sub="Notificaciones del banco, Atajos de iPhone y cartola" />
        <Row href="/automatizacion" icon="moon" color="#7c5cd6" title="Lectura de Gmail (avanzado)" value={a ? AUTOMATION_STATUS[a.status]?.label : "—"} sub={a?.mode === "google" ? `Google · ${a.ai.provider ?? "sin IA"}` : a?.mode === "claude" ? "Tarea de Claude" : undefined} />
        <Row href="/perfil/datos" icon="download" color="#3b82f6" title="Exportar y copia de seguridad" sub="Excel, CSV o copia completa" />
        <Row href="/categorias/reglas" icon="filter" color="#64708a" title="Reglas de clasificación" />
      </div>

      <h2 className="section">Seguridad</h2>
      <div className="list">
        <Row href="/perfil/seguridad" icon="fingerprint" color="#0f7d70" title="Bloqueo con huella o PIN" value={lock ? "Activo" : "Desactivado"} />
        <Row href="/perfil/seguridad#dispositivo" icon="devices" color="#64708a" title="Este dispositivo" sub="Token de la planilla y datos locales" />
      </div>
      <div className="list" style={{ marginTop: 16 }}>
        <Row href="/ayuda" icon="help" color="#3b82f6" title="Ayuda y soporte" />
      </div>
    </main>
  );
}
