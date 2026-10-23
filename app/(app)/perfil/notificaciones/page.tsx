"use client";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/client";
import { useMe } from "@/components/AppShell";
import { BackLink } from "@/components/BackLink";
import { Loading, Notice, Switch, useToast } from "@/components/ui";

function b64ToUint8(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export default function NotificationPrefs() {
  const { me, reload } = useMe();
  const toast = useToast();
  const [p, setP] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [perm, setPerm] = useState<string>("default");
  useEffect(() => { if (me && !p) setP({ notifyChannels: me.user.notifyChannels, quietStart: me.user.quietStart, quietEnd: me.user.quietEnd, hideSensitiveInPush: me.user.hideSensitiveInPush }); }, [me, p]);
  useEffect(() => { if (typeof Notification !== "undefined") setPerm(Notification.permission); }, []);
  if (!me || !p) return <main className="page"><Loading /></main>;
  const pushSupported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;

  async function enablePush(on: boolean) {
    setErr(null);
    try {
      if (on) {
        if (!me!.capabilities.push || !me!.capabilities.vapidPublicKey) throw new Error("Las notificaciones push no están configuradas en este servidor.");
        const result = await Notification.requestPermission(); // se solicita el permiso solo al activar la función
        setPerm(result);
        if (result !== "granted") throw new Error("No se otorgó permiso de notificaciones en este dispositivo.");
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(me!.capabilities.vapidPublicKey) });
        await api("/api/push/subscribe", { body: sub.toJSON() });
        setP({ ...p, notifyChannels: { ...p.notifyChannels, push: true } });
        toast({ text: "Push activado en este dispositivo" });
      } else {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (sub) { await api("/api/push/subscribe", { method: "DELETE", body: { endpoint: sub.endpoint } }); await sub.unsubscribe(); }
        const next = { ...p, notifyChannels: { ...p.notifyChannels, push: false } };
        setP(next);
        await api("/api/me", { method: "PATCH", body: next });
      }
      reload();
    } catch (e) { setErr((e as Error).message); }
  }
  async function save() {
    setErr(null);
    try { await api("/api/me", { method: "PATCH", body: p }); toast({ text: "Notificaciones guardadas" }); reload(); } catch (e) { setErr((e as ApiError).message); }
  }
  return (
    <main className="page">
      <BackLink href="/perfil" label="Perfil" />
      <h1 className="title">Notificaciones</h1>
      <div className="list" style={{ marginTop: 12 }}>
        <div className="item" style={{ cursor: "default" }}><div className="grow"><div className="t">Dentro de la app</div><div className="s">Siempre activo. Centro de notificaciones con historial.</div></div><Switch checked disabled label="Dentro de la app" onChange={() => {}} /></div>
        <div className="item" style={{ cursor: "default" }}><div className="grow"><div className="t">Push en este dispositivo</div><div className="s">{!pushSupported ? "Este navegador no admite push. En iPhone, instala la app en la pantalla de inicio primero." : !me.capabilities.push ? "No configurado en el servidor (VAPID)." : perm === "denied" ? "Bloqueado en la configuración del navegador." : "Se pedirá permiso al activarlo."}</div></div>
          <Switch checked={p.notifyChannels.push} disabled={!pushSupported || !me.capabilities.push} label="Push" onChange={enablePush} /></div>
        <div className="item" style={{ cursor: "default" }}><div className="grow"><div className="t">Correo electrónico</div><div className="s">{me.capabilities.emailDelivery ? `A ${me.user.email}` : "Sin servicio de envío configurado en el servidor."}</div></div>
          <Switch checked={p.notifyChannels.email} label="Correo" onChange={(v) => setP({ ...p, notifyChannels: { ...p.notifyChannels, email: v } })} /></div>
        <div className="item" style={{ cursor: "default" }}><div className="grow"><div className="t">Ocultar montos en la pantalla bloqueada</div><div className="s">Los avisos push muestran un texto genérico.</div></div>
          <Switch checked={p.hideSensitiveInPush} label="Ocultar información sensible" onChange={(v) => setP({ ...p, hideSensitiveInPush: v })} /></div>
      </div>
      <h2 className="section">Horario de silencio</h2>
      <div className="card pad">
        <div className="grid2">
          <div className="field"><label htmlFor="qs">Desde</label><input id="qs" type="time" className="input" value={p.quietStart} onChange={(e) => setP({ ...p, quietStart: e.target.value })} /></div>
          <div className="field"><label htmlFor="qe">Hasta</label><input id="qe" type="time" className="input" value={p.quietEnd} onChange={(e) => setP({ ...p, quietEnd: e.target.value })} /></div>
        </div>
        <p className="small muted">Los avisos generados de noche (por ejemplo, tras la actualización de las 03:00) quedan registrados en la app y se envían por push o correo al terminar el silencio.</p>
        {err && <Notice tone="danger"><p>{err}</p></Notice>}
        <button className="btn primary block" onClick={save}>Guardar</button>
        <button className="btn block" style={{ marginTop: 8 }} onClick={async () => { await api("/api/push/test", { body: {} }); toast({ text: "Aviso de prueba creado" }); reload(); }}>Enviar aviso de prueba</button>
      </div>
      <p className="small muted" style={{ marginTop: 12 }}>Las alertas de presupuesto se basan en los correos detectados al sincronizar: no son alertas bancarias en tiempo real.</p>
    </main>
  );
}
