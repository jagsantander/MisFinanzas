"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { fmtDate, KIND_LABEL, useStore } from "@/lib/client";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
import { Notice, useToast } from "@/components/ui";
import { DeviceAiSetup } from "@/components/automation";
import { androidStatus, type AndroidStatus } from "@/lib/capture/incoming";
import { importMovements } from "@/lib/capture/import";
import { readStatement, type StatementRow } from "@/lib/capture/statement";
import { getDeviceAi, type DeviceAi } from "@/lib/ai/receipt";
import { formatMoney } from "@/lib/money";

const APK_URL = "https://jagsantander.github.io/MisFinanzas/descargas/MiSaldo.apk";
const PERMISSION_INTENT = "intent://permiso-notificaciones#Intent;scheme=misaldo;package=cl.misfinanzas.app;end";
const SHORTCUT_URL = "https://jagsantander.github.io/MisFinanzas/movimientos/#atajo&monto=[Monto]&comercio=[Comercio]&tarjeta=[Tarjeta]";

export default function AutomaticPage() {
  const [android, setAndroid] = useState<AndroidStatus>(null);
  useEffect(() => { setAndroid(androidStatus()); }, []);
  return (
    <main className="page">
      <BackLink href="/perfil" label="Perfil" />
      <h1 className="title">Registro automático</h1>
      <p className="subtitle">Formas de que tus movimientos lleguen solos, sin dar permiso para leer tu correo.</p>

      <h2 className="section">Android: notificaciones del banco</h2>
      <div className="card pad stack">
        <p className="small" style={{ margin: 0 }}>Cuando tu banco o billetera (Mercado Pago, Tenpo, Mach…) te avisa «Compra por $12.990 en LIDER», la app Android de MiSaldo lo lee y lo registra. Solo guarda las notificaciones que tienen un monto y una palabra como compra, pago o transferencia; ignora WhatsApp y otras apps de mensajería. El texto no sale de tu teléfono.</p>
        {android ? (
          <>
            <div className="row"><span className={`badge ${android.listener ? "ok" : "warn"}`}>{android.listener ? "Activo" : "Falta el permiso"}</span><span className="small muted">Estado al abrir la app el {fmtDate(android.at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></div>
            {!android.listener && <>
              <a className="btn primary block" href={PERMISSION_INTENT}><Icon name="bell" size={18} /> Dar acceso a las notificaciones</a>
              <p className="small muted" style={{ margin: 0 }}>Se abre Ajustes: activa <strong>MiSaldo</strong> y confirma. En Xiaomi puede aparecer un aviso de seguridad con cuenta regresiva; espera y acepta. Luego cierra y vuelve a abrir MiSaldo.</p>
            </>}
            <p className="small muted" style={{ margin: 0 }}>Cuando llegue un pago verás «1 movimiento detectado»; al tocarlo (o al abrir MiSaldo) se agrega. Lo dudoso queda «Por revisar».</p>
          </>
        ) : (
          <>
            <p className="small" style={{ margin: 0 }}>Necesitas la app Android de MiSaldo (no la versión del navegador).</p>
            <a className="btn primary block" href={APK_URL}><Icon name="download" size={18} /> Descargar la app para Android</a>
            <p className="small muted" style={{ margin: 0 }}>Al instalarla, Android pedirá permitir apps de esta fuente. Si ya la tienes, abre esta pantalla desde la app.</p>
          </>
        )}
        <p className="small" style={{ margin: 0 }}><strong>También puedes compartir:</strong> en Gmail o en la app del banco toca <strong>Compartir → MiSaldo</strong> y el aviso se agrega solo.</p>
      </div>

      <h2 className="section">iPhone: Atajos y Apple Pay</h2>
      <ShortcutHelp />

      <h2 className="section">Cartola del banco</h2>
      <StatementImport />

      <h2 className="section">A mano, pero rápido</h2>
      <div className="card pad stack">
        <p className="small" style={{ margin: 0 }}>En <Link href="/movimientos/nuevo">Agregar movimiento</Link> puedes fotografiar una boleta o pegar el texto de un aviso del banco: MiSaldo completa el formulario por ti.</p>
      </div>

      <p className="small muted" style={{ marginTop: 16 }}>¿Prefieres que se lea tu Gmail cada noche? Existe una <Link href="/automatizacion">opción avanzada con un script en tu planilla</Link>.</p>
    </main>
  );
}

function ShortcutHelp() {
  const toast = useToast();
  return (
    <div className="card pad stack">
      <p className="small" style={{ margin: 0 }}>Si pagas con Apple Pay, la app Atajos puede avisarle a MiSaldo cada pago (monto y comercio). Se configura una vez:</p>
      <ol className="small stack" style={{ paddingLeft: 20, margin: 0, gap: 6 }}>
        <li>Abre <strong>Atajos → Automatización → Nueva automatización → Cartera</strong>, elige tus tarjetas y marca <strong>Ejecutar inmediatamente</strong>.</li>
        <li>Agrega la acción <strong>Abrir URL</strong> y pega esta dirección: <button type="button" className="link-btn" onClick={async () => { try { await navigator.clipboard.writeText(SHORTCUT_URL); toast({ text: "Dirección copiada" }); } catch { toast({ text: "Cópiala a mano" }); } }}>copiar dirección</button>
          <code className="addr" style={{ display: "block", wordBreak: "break-all", marginTop: 4 }}>{SHORTCUT_URL}</code></li>
        <li>Reemplaza <code>[Monto]</code>, <code>[Comercio]</code> y <code>[Tarjeta]</code> por las variables <strong>Monto</strong>, <strong>Comercio</strong> y <strong>Tarjeta o pase</strong> que ofrece la automatización (toca cada palabra y elige la variable).</li>
      </ol>
      <Notice><p className="small">El Atajo abre MiSaldo en <strong>Safari</strong>. Funciona mejor si usas MiSaldo en Safari o si tienes tu planilla conectada con Google, porque así el movimiento llega a todos tus dispositivos. Solo captura pagos con Apple Pay.</p></Notice>
    </div>
  );
}

function StatementImport() {
  const st = useStore();
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [ai, setAi] = useState<DeviceAi | null | undefined>(undefined);
  const [rows, setRows] = useState<(StatementRow & { on: boolean })[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { getDeviceAi().then((x) => setAi(x ?? null)); }, []);
  const existing = new Set(st.tables.movements.map((m) => m.sourceMessageId));

  async function read(f: File | undefined) {
    if (!f || !ai) return;
    setBusy(true); setErr(null); setRows(null);
    try {
      const r = await readStatement(ai, f, st.settings.currency, st.settings.timezone);
      setRows(r.map((x) => ({ ...x, on: !existing.has(`cap:${x.id}`) })));
      if (!r.length) setErr("No encontré movimientos en ese archivo.");
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); if (file.current) file.current.value = ""; }
  }
  function doImport() {
    if (!rows) return;
    const r = importMovements(rows.filter((x) => x.on));
    toast({ text: `${r.created + r.review} movimientos importados${r.review ? ` (${r.review} por revisar por posibles repetidos)` : ""}${r.skipped ? ` · ${r.skipped} ya estaban` : ""}` });
    setRows(null);
  }

  if (ai === undefined) return null;
  if (!ai) return (
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>Descarga la cartola desde el sitio de tu banco (Excel, CSV o PDF) y súbela aquí: tu IA la lee completa. Primero agrega tu clave gratuita de Gemini:</p>
      <DeviceAiSetup />
    </div>
  );
  const on = rows?.filter((x) => x.on) ?? [];
  return (
    <div className="card pad stack">
      <p className="small" style={{ margin: 0 }}>Descarga la cartola o estado de cuenta desde el sitio de tu banco (Excel, CSV o PDF) y súbela. Verás la lista antes de importar; lo que ya importaste antes no se repite.</p>
      <input ref={file} type="file" accept=".xlsx,.xls,.csv,.txt,.pdf,application/pdf,text/csv" hidden onChange={(e) => read(e.target.files?.[0])} />
      <button className="btn primary block" disabled={busy} onClick={() => file.current?.click()}><Icon name="upload" size={18} /> {busy ? "Leyendo la cartola…" : "Subir cartola"}</button>
      {err && <Notice tone="danger"><p className="small">{err}</p></Notice>}
      {rows && rows.length > 0 && <>
        <div className="row between"><strong className="small">{on.length} de {rows.length} seleccionados</strong>
          <button className="link-btn" onClick={() => setRows(rows.map((x) => ({ ...x, on: !on.length })))}>{on.length ? "Quitar todos" : "Marcar todos"}</button></div>
        <div className="list" style={{ maxHeight: 360, overflow: "auto" }}>
          {rows.map((x, i) => (
            <label key={x.id} className="item check" style={{ cursor: "pointer" }}>
              <input type="checkbox" checked={x.on} onChange={() => setRows(rows.map((y, j) => (j === i ? { ...y, on: !y.on } : y)))} />
              <div className="grow small"><div className="ellipsis">{x.description}</div><div className="muted">{fmtDate(x.occurredOn)} · {KIND_LABEL[x.kind]}{existing.has(`cap:${x.id}`) ? " · ya importado" : ""}</div></div>
              <span className={`small ${x.kind === "income" ? "income" : "expense"}`}>{x.kind === "income" ? "+" : "-"}{formatMoney(x.amountMinor, x.currency)}</span>
            </label>
          ))}
        </div>
        <button className="btn primary block" disabled={!on.length} onClick={doImport}>Importar {on.length} movimientos</button>
      </>}
    </div>
  );
}

