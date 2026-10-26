"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useStore, withBase } from "@/lib/client";
import { getState, initStore, resumeGoogle } from "@/lib/local/store";
import { captureConnectionHash } from "@/lib/local/script";
import { captureIncomingHash, importPendingCaptures } from "@/lib/capture/incoming";
import type { Settings } from "@/lib/local/types";
import { Icon } from "./Icon";
import { Loading, Notice, ToastProvider, useToast } from "./ui";
import { lockConfigured, lockMinutes, unlockWithDevice } from "@/lib/local/lock";

export type Me = {
  user: Settings & { email: string; onboardingCompleted: boolean };
  unread: number;
  connected: boolean;
};
const MeCtx = createContext<{ me: Me | null; reload: () => Promise<void> }>({ me: null, reload: async () => {} });
export const useMe = () => useContext(MeCtx);

/** El tema es una preferencia de este dispositivo: no se sincroniza con la planilla. */
export function localTheme(): "system" | "light" | "dark" {
  try { const t = localStorage.getItem("mf-theme"); if (t === "light" || t === "dark") return t; } catch { /* almacenamiento no disponible */ }
  return "system";
}

export function applyTheme(theme: string) {
  try { localStorage.setItem("mf-theme", theme); } catch { /* almacenamiento no disponible */ }
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

const NAV = [
  { href: "/", label: "Inicio", icon: "home" },
  { href: "/movimientos", label: "Movimientos", icon: "list" },
  { href: "/categorias", label: "Categorías", icon: "pie" },
  { href: "/perfil", label: "Perfil", icon: "user" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const st = useStore();
  const [locked, setLocked] = useState<boolean | null>(null);

  useEffect(() => {
    // También al cambiar solo el # (un Atajo o el botón de la planilla con MiSaldo ya abierta en esa pestaña).
    const onHash = () => {
      captureConnectionHash();
      void captureIncomingHash().then((found) => { if (found) window.dispatchEvent(new Event("mf:captured")); });
    };
    onHash();
    void initStore();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => { applyTheme(localTheme()); }, []);
  useEffect(() => {
    if (st.loaded && !st.settings.onboardingDone && !path.startsWith("/bienvenida")) router.replace("/bienvenida");
  }, [st.loaded, st.settings.onboardingDone, path, router]);
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") navigator.serviceWorker.register(withBase("/sw.js"), { scope: withBase("/") }).catch(() => {});
  }, []);

  // Bloqueo local: al abrir y tras inactividad, si el usuario lo activó.
  useEffect(() => { setLocked(lockConfigured()); }, []);
  useEffect(() => {
    const minutes = lockMinutes();
    if (!minutes) return;
    let last = Date.now();
    const touch = () => { last = Date.now(); };
    const check = () => { if (Date.now() - last > minutes * 60_000) setLocked(true); };
    const hidden = () => { if (document.visibilityState === "visible") check(); else touch(); };
    ["pointerdown", "keydown"].forEach((e) => window.addEventListener(e, touch));
    document.addEventListener("visibilitychange", hidden);
    const t = setInterval(check, 30_000);
    return () => { ["pointerdown", "keydown"].forEach((e) => window.removeEventListener(e, touch)); document.removeEventListener("visibilitychange", hidden); clearInterval(t); };
  }, [locked]);

  const me = useMemo<Me | null>(() => st.loaded ? {
    user: { ...st.settings, email: st.account ?? "", onboardingCompleted: st.settings.onboardingDone },
    unread: st.tables.notifications.filter((n) => !n.readAt).length,
    connected: Boolean(st.connection),
  } : null, [st]);
  const reload = useCallback(async () => {}, []);

  const hideNav = path.startsWith("/bienvenida");
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  if (!st.loaded || locked === null) return <main className="page"><Loading rows={3} height={100} /></main>;
  return (
    <MeCtx.Provider value={{ me, reload }}>
      <ToastProvider>
        <a href="#contenido" className="sr-only">Saltar al contenido</a>
        <div className="app" style={hideNav ? { paddingLeft: 0, paddingBottom: 24 } : undefined}>
          <div id="contenido">
            {locked ? <LockScreen onUnlocked={() => setLocked(false)} /> : <>{!hideNav && <SyncBanner />}{children}</>}
            <CaptureImporter />
          </div>
        </div>
        {!hideNav && !locked && (
          <nav className="nav" aria-label="Principal">
            <div className="nav-brand brand" style={{ display: "none" }}><span>Mi<b>Saldo</b></span></div>
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} aria-current={isActive(n.href) ? "page" : undefined}>
                <Icon name={n.icon} />
                <span>{n.label}</span>
              </Link>
            ))}
          </nav>
        )}
      </ToastProvider>
    </MeCtx.Provider>
  );
}

/** Importa los avisos que llegaron de la app Android o de un Atajo de iPhone, y cuenta qué se agregó. */
function CaptureImporter() {
  const st = useStore();
  const toast = useToast();
  useEffect(() => {
    let busy = false;
    const run = async () => {
      if (busy) return;
      busy = true;
      try {
        const r = await importPendingCaptures(getState().settings.currency);
        if (r && r.created + r.review > 0) toast({ text: `${r.created + r.review} movimiento${r.created + r.review === 1 ? "" : "s"} agregado${r.created + r.review === 1 ? "" : "s"} automáticamente${r.review ? ` (${r.review} por revisar)` : ""}` });
      } finally { busy = false; }
    };
    void run();
    window.addEventListener("mf:captured", run);
    return () => window.removeEventListener("mf:captured", run);
  }, [st.loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** Aviso discreto cuando los datos no están respaldados en la planilla o la sincronización falla. */
function SyncBanner() {
  const st = useStore();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (st.connection && st.needsGoogle && !st.syncError) {
    return (
      <div className="page" style={{ paddingBottom: 0 }}>
        <Notice tone="warn">
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            <p className="small grow" style={{ margin: 0 }}>{st.pending.length ? `Tienes ${st.pending.length} cambios guardados aquí que aún no llegan a tu planilla.` : "Toca para traer lo último de tu planilla."}{err ? ` ${err}` : ""}</p>
            <button className="btn sm primary" disabled={busy} onClick={async () => { setBusy(true); setErr(null); try { await resumeGoogle(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } }}>{busy ? "Sincronizando…" : "Sincronizar con Google"}</button>
          </div>
        </Notice>
      </div>
    );
  }
  if (st.connection && !st.syncError) return null;
  return (
    <div className="page" style={{ paddingBottom: 0 }}>
      {!st.connection
        ? <Notice tone="warn"><p className="small">Tus datos están solo en este dispositivo. <Link href="/conexiones">Conecta tu planilla</Link> para respaldarlos y activar la actualización nocturna.</p></Notice>
        : <Notice tone="danger"><p className="small">No se pudo sincronizar con tu planilla: {st.syncError}. Tus cambios quedan guardados aquí y se enviarán al reconectar.</p></Notice>}
    </div>
  );
}

/** Bloqueo local de la app (no es inicio de sesión: los datos siguen en este dispositivo). */
function LockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const unlock = async () => {
    setBusy(true); setError(null);
    try { await unlockWithDevice(); onUnlocked(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  useEffect(() => { void unlock(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <main className="page" style={{ paddingTop: 48 }}>
      <div className="stack" style={{ textAlign: "center", alignItems: "center" }}>
        <span className="ico" style={{ width: 72, height: 72, background: "var(--primary-soft)", color: "var(--primary)" }}><Icon name="lock" size={32} /></span>
        <h1 className="title">MiSaldo está bloqueado</h1>
        <p className="muted">Usa la huella, el rostro o el PIN de este dispositivo para continuar.</p>
      </div>
      {error && <Notice tone="danger"><p>{error}</p></Notice>}
      <button className="btn primary block" style={{ marginTop: 16 }} disabled={busy} onClick={unlock}><Icon name="fingerprint" /> Desbloquear</button>
    </main>
  );
}
