"use client";
import Link from "next/link";
import { api, AUTOMATION_STATUS, useApi } from "@/lib/client";
import { useMe } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { Loading } from "@/components/ui";

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
  const { me } = useMe();
  const conns = useApi<{ mail: { account: string; status: string } | null; ai: { providerLabel: string; model: string | null } | null }>("/api/connections");
  const auto = useApi<{ automation: { status: string } | null }>("/api/automation");
  const pk = useApi<{ passkeys: unknown[] }>("/api/auth/passkeys");
  if (!me) return <main className="page"><Loading rows={5} /></main>;
  const u = me.user;
  const initials = u.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const ch = [u.notifyChannels.push && "push", u.notifyChannels.email && "correo"].filter(Boolean);
  return (
    <main className="page">
      <div className="brand"><span>Mis<b>Finanzas</b></span></div>
      <h1 className="title" style={{ marginTop: 12 }}>Mi perfil</h1>
      <section className="card pad row" style={{ marginTop: 12 }}>
        <span className="ico" style={{ width: 64, height: 64, background: "var(--primary-soft)", color: "var(--primary-strong)", fontWeight: 800, fontSize: 22 }} aria-hidden>{initials}</span>
        <div className="grow"><div style={{ fontWeight: 750, fontSize: 19 }}>{u.name}</div><div className="small muted ellipsis">{u.email}</div></div>
        <Link href="/perfil/cuenta" className="btn sm" style={{ background: "var(--primary-soft)", color: "var(--primary-strong)", borderColor: "transparent" }}><Icon name="pencil" size={16} /> Editar</Link>
      </section>

      <h2 className="section">Preferencias</h2>
      <div className="list">
        <Row href="/perfil/preferencias" icon="dollar" color="#11734f" title="Moneda y zona horaria" value={`${u.currency} · ${u.timezone.split("/").pop()?.replace("_", " ")}`} />
        <Row href="/perfil/preferencias" icon="calendar" color="#7c5cd6" title="Inicio del mes" value={`Día ${u.monthStartDay}`} />
        <Row href="/perfil/notificaciones" icon="bell" color="#11734f" title="Notificaciones" value={ch.length ? `App, ${ch.join(", ")}` : "Solo en la app"} sub={`Silencio ${u.quietStart}–${u.quietEnd}`} />
        <Row href="/perfil/preferencias" icon="sun" color="#e08a00" title="Apariencia" value={THEME[u.theme]} />
        <Row href="/perfil/preferencias" icon="percent" color="#c23d2d" title="Umbrales de presupuesto" value={u.budgetThresholds.map((t) => `${t}%`).join(", ")} />
      </div>

      <h2 className="section">Conexiones y automatización</h2>
      <div className="list">
        <Row href="/conexiones" icon="mail" color="#3b82f6" title="Correo conectado" value={conns.data?.mail ? conns.data.mail.account : "Sin conectar"} sub={conns.data?.mail?.status === "reauth_required" ? "Requiere reconexión" : undefined} />
        <Row href="/conexiones" icon="sparkle" color="#0f7d70" title="Proveedor de IA" value={conns.data?.ai ? `${conns.data.ai.providerLabel}` : "Sin conectar"} sub={conns.data?.ai?.model ?? undefined} />
        <Row href="/automatizacion" icon="moon" color="#7c5cd6" title="Actualización nocturna" value={auto.data?.automation ? AUTOMATION_STATUS[auto.data.automation.status]?.label : "—"} />
      </div>

      <h2 className="section">Tus datos</h2>
      <div className="list">
        <Row href="/perfil/datos" icon="download" color="#3b82f6" title="Exportar movimientos" sub="Excel o CSV" />
        <Row href="/perfil/datos" icon="cloud" color="#7c5cd6" title="Copia de seguridad" sub="Descarga completa de tus datos" />
        <Row href="/categorias/reglas" icon="filter" color="#64708a" title="Reglas de clasificación" />
      </div>

      <h2 className="section">Seguridad</h2>
      <div className="list">
        <Row href="/perfil/seguridad" icon="fingerprint" color="#0f7d70" title="Passkeys y bloqueo" value={pk.data ? (pk.data.passkeys.length ? `${pk.data.passkeys.length} registrada(s)` : "Sin configurar") : ""} sub={u.localLockMinutes ? `Bloqueo tras ${u.localLockMinutes} min` : undefined} />
        <Row href="/perfil/seguridad#contrasena" icon="lock" color="#c23d2d" title="Cambiar contraseña" />
        <Row href="/perfil/seguridad#sesiones" icon="devices" color="#64708a" title="Sesiones abiertas" />
      </div>

      <div className="list" style={{ marginTop: 16 }}>
        <Row href="/ayuda" icon="help" color="#3b82f6" title="Ayuda y soporte" />
      </div>
      <button className="btn danger block" style={{ marginTop: 16, justifyContent: "flex-start" }} onClick={async () => { await api("/api/auth/logout", { body: {} }); location.href = "/entrar"; }}><Icon name="logout" /> Cerrar sesión</button>
      <p className="small muted" style={{ textAlign: "center", marginTop: 12 }}><Link href="/perfil/datos#eliminar">Eliminar cuenta y datos</Link></p>
    </main>
  );
}
