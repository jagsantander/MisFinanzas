"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, useApi } from "@/lib/client";
import { Icon } from "./Icon";
import { Notice, ToastProvider } from "./ui";
import { passkeysSupported, unlockWithPasskey, passkeyErrorMessage } from "@/lib/passkey-client";

export type Me = {
  user: {
    id: string; name: string; email: string; emailVerified: boolean; currency: string; timezone: string; monthStartDay: number; theme: string;
    budgetThresholds: number[]; notifyChannels: { inApp: true; push: boolean; email: boolean }; quietStart: string; quietEnd: string;
    hideSensitiveInPush: boolean; localLockMinutes: number | null; onboardingStep: string; onboardingCompleted: boolean; createdAt: string;
  };
  session: { locked: boolean; method: string };
  unread: number;
  capabilities: { emailDelivery: boolean; push: boolean; vapidPublicKey: string | null };
};
const MeCtx = createContext<{ me: Me | null; reload: () => Promise<void> }>({ me: null, reload: async () => {} });
export const useMe = () => useContext(MeCtx);

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
  const { data: me, reload } = useApi<Me>("/api/me");
  const [locked, setLocked] = useState(false);

  useEffect(() => { if (me) { setLocked(me.session.locked); applyTheme(me.user.theme); } }, [me]);
  useEffect(() => {
    const h = () => setLocked(true);
    window.addEventListener("mf:locked", h);
    return () => window.removeEventListener("mf:locked", h);
  }, []);
  useEffect(() => {
    if (me && !me.user.onboardingCompleted && !path.startsWith("/bienvenida")) router.replace("/bienvenida");
  }, [me, path, router]);
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  // Comprueba periódicamente el bloqueo por inactividad (lo decide el servidor).
  useEffect(() => {
    if (!me?.user.localLockMinutes) return;
    const t = setInterval(() => { fetch("/api/me").then((r) => r.json()).then((d) => d?.session?.locked && setLocked(true)).catch(() => {}); }, 60_000);
    return () => clearInterval(t);
  }, [me?.user.localLockMinutes]);

  const hideNav = path.startsWith("/bienvenida");
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <MeCtx.Provider value={{ me, reload }}>
      <ToastProvider>
        <a href="#contenido" className="sr-only">Saltar al contenido</a>
        <div className="app" style={hideNav ? { paddingLeft: 0, paddingBottom: 24 } : undefined}>
          <div id="contenido">{locked ? <LockScreen onUnlocked={() => { setLocked(false); reload(); }} /> : children}</div>
        </div>
        {!hideNav && !locked && (
          <nav className="nav" aria-label="Principal">
            <div className="nav-brand brand" style={{ display: "none" }}><span>Mis<b>Finanzas</b></span></div>
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

/** Bloqueo de una sesión ya abierta (distinto de iniciar sesión). */
function LockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pk, setPk] = useState(false);
  useEffect(() => setPk(passkeysSupported()), []);
  return (
    <main className="page" style={{ paddingTop: 48 }}>
      <div className="stack" style={{ textAlign: "center", alignItems: "center" }}>
        <span className="ico" style={{ width: 72, height: 72, background: "var(--primary-soft)", color: "var(--primary)" }}><Icon name="lock" size={32} /></span>
        <h1 className="title">Sesión bloqueada</h1>
        <p className="muted">Por inactividad. Desbloquea para seguir; tus datos no se muestran mientras tanto.</p>
      </div>
      {error && <Notice tone="danger"><p>{error}</p></Notice>}
      {pk && <button className="btn primary block" style={{ marginTop: 16 }} disabled={busy} onClick={async () => { setBusy(true); setError(null); try { await unlockWithPasskey(); onUnlocked(); } catch (e) { setError(passkeyErrorMessage(e)); } finally { setBusy(false); } }}><Icon name="fingerprint" /> Desbloquear con passkey</button>}
      <form style={{ marginTop: 16 }} onSubmit={async (e) => { e.preventDefault(); setBusy(true); setError(null); try { await api("/api/auth/unlock/password", { body: { password } }); onUnlocked(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } }}>
        <div className="field"><label htmlFor="lockpw">Contraseña</label><input id="lockpw" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <button className="btn block" disabled={busy || !password}>Desbloquear con contraseña</button>
      </form>
      <button className="link-btn" style={{ marginTop: 12 }} onClick={async () => { await api("/api/auth/logout", { body: {} }); location.href = "/entrar"; }}>Cerrar sesión</button>
    </main>
  );
}
