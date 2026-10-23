"use client";
import Link from "next/link";
import { api, fmtDateTime, useApi } from "@/lib/client";
import { useMe } from "@/components/AppShell";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
import { Empty, ErrorState, Loading } from "@/components/ui";

type N = { id: string; type: string; severity: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string; pushStatus: string; emailStatus: string; deliverAfter: string };
const SEV: Record<string, { icon: string; color: string }> = { info: { icon: "info", color: "#3b82f6" }, success: { icon: "check", color: "#11734f" }, warning: { icon: "alert", color: "#b7791f" }, danger: { icon: "alert", color: "#c23d2d" } };

export default function NotificationsPage() {
  const { reload: reloadMe } = useMe();
  const { data, error, loading, reload } = useApi<{ notifications: N[] }>("/api/notifications");
  const markAll = async () => { await api("/api/notifications/read", { body: {} }); reload(); reloadMe(); };
  return (
    <main className="page">
      <BackLink href="/" label="Inicio" />
      <div className="row between"><h1 className="title">Notificaciones</h1>{data?.notifications.some((n) => !n.readAt) && <button className="link-btn" onClick={markAll}>Marcar todo leído</button>}</div>
      {loading && !data ? <Loading rows={4} /> : error ? <ErrorState error={error} retry={reload} /> : data!.notifications.length === 0 ? <Empty icon="bell" title="Sin notificaciones"><p>Aquí verás sincronizaciones, alertas de presupuesto y avisos de conexión.</p></Empty> : (
        <div className="list" style={{ marginTop: 12 }}>
          {data!.notifications.map((n) => {
            const s = SEV[n.severity] ?? SEV.info;
            const pending = n.pushStatus === "pending" || n.emailStatus === "pending";
            const inner = (
              <>
                <span className="ico sm" style={{ background: `color-mix(in srgb, ${s.color} 15%, transparent)`, color: s.color }}><Icon name={s.icon} /></span>
                <div className="grow">
                  <div className="t" style={{ fontWeight: n.readAt ? 550 : 750 }}>{n.title}</div>
                  <div className="s">{n.body}</div>
                  <div className="small muted">{fmtDateTime(n.createdAt)}{pending ? ` · envío externo programado ${fmtDateTime(n.deliverAfter)}` : ""}</div>
                </div>
                {!n.readAt && <span className="dot" style={{ background: "var(--primary)" }} aria-label="No leída" />}
              </>
            );
            return n.link ? <Link key={n.id} href={n.link} className="item" style={{ color: "var(--text)" }} onClick={() => api("/api/notifications/read", { body: { ids: [n.id] } }).then(reloadMe)}>{inner}</Link>
              : <button key={n.id} className="item" onClick={() => api("/api/notifications/read", { body: { ids: [n.id] } }).then(() => { reload(); reloadMe(); })}>{inner}</button>;
          })}
        </div>
      )}
    </main>
  );
}
