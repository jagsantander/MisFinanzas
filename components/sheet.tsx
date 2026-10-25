"use client";
import { useEffect, useState } from "react";
import { fmtDateTime, useStore, withBase } from "@/lib/client";
import { SHEET_TEMPLATE_COPY_URL } from "@/lib/config";
import { connect, disconnect, getState, sync } from "@/lib/local/store";
import { callScript, clearPendingConnectionCode, parseConnectionCode, pendingConnectionCode, validScriptUrl } from "@/lib/local/script";
import type { Connection } from "@/lib/local/types";
import { Icon } from "./Icon";
import { ConfirmSheet, Notice, useToast } from "./ui";

async function copyFile(path: string) {
  const res = await fetch(withBase(path));
  if (!res.ok) throw new Error("No se pudo leer el archivo");
  await navigator.clipboard.writeText(await res.text());
}

function CopyButton({ path, label }: { path: string; label: string }) {
  const toast = useToast();
  return (
    <button type="button" className="btn sm" onClick={async () => {
      try { await copyFile(path); toast({ text: `${label}: copiado` }); }
      catch { window.open(withBase(path), "_blank", "noopener"); toast({ text: "Abrí el archivo en otra pestaña: cópialo desde ahí" }); }
    }}><Icon name="download" size={16} /> {label}</button>
  );
}

/** Pasos para reemplazar el código del script por una versión nueva, manteniendo la misma URL. */
export function ScriptUpdateSteps() {
  return (
    <ol className="stack small" style={{ paddingLeft: 20, margin: 0, gap: 8 }}>
      <li>Abre tu planilla y entra a <strong>Extensiones → Apps Script</strong>.</li>
      <li>Reemplaza todo el contenido de <code>Código.gs</code>: <CopyButton path="/apps-script/Code.gs" label="Copiar código" /> y guarda.</li>
      <li>Pulsa <strong>Implementar → Gestionar implementaciones</strong>, edita (lápiz) la implementación actual, elige <strong>Versión: Nueva versión</strong> y pulsa <strong>Implementar</strong>. La URL no cambia.</li>
      <li>Vuelve aquí y pulsa <strong>Sincronizar ahora</strong>.</li>
    </ol>
  );
}

/** Aviso sobre los permisos que Google pide al autorizar el script. */
function PermissionsNote() {
  return (
    <div className="card pad" style={{ marginTop: 8 }}>Como el script es tuyo y no está publicado, Google muestra «Google no verificó esta app»: pulsa <em>Configuración avanzada → Ir a Mi saldo → Permitir</em>.
      Entre los permisos aparece «Ver tus mensajes de correo electrónico y la configuración»: es <strong>solo lectura</strong> y lo usa únicamente tu script, en tu cuenta. Los demás: ver esta planilla, conectarse a tu IA, crear el disparador nocturno y enviarte avisos. Puedes revocarlos en <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener">myaccount.google.com/permissions</a>.</div>
  );
}

/** Pasos con la planilla plantilla: el script ya viene incluido. */
export function TemplateSteps() {
  return (
    <ol className="stack small" style={{ paddingLeft: 20, margin: 0, gap: 10 }}>
      <li>Pulsa <strong>Crear mi planilla</strong> y luego <strong>Hacer una copia</strong>. Usa la cuenta de Google donde llegan los avisos de tu banco.</li>
      <li>En tu copia abre el menú <strong>Mi saldo → Conectar con la app</strong> (si no aparece, recarga la página) y acepta los permisos.<PermissionsNote /></li>
      <li>Solo la primera vez, la planilla te mostrará cómo publicar tu script como aplicación web (unos 4 clics). Hazlo y vuelve a usar <strong>Mi saldo → Conectar con la app</strong>.</li>
      <li>Pulsa <strong>Abrir Mi saldo y conectar</strong>. La app se conecta sola.</li>
    </ol>
  );
}

/** Pasos para crear la planilla a mano, pegando el script (si no hay plantilla). */
export function SheetSetupSteps() {
  return (
    <ol className="stack small" style={{ paddingLeft: 20, margin: 0, gap: 10 }}>
      <li>Crea una planilla nueva en <a href="https://sheets.new" target="_blank" rel="noopener">sheets.new</a> con la cuenta de Google donde llegan los avisos de tu banco. Ponle de nombre «Mi saldo».</li>
      <li>En la planilla abre <strong>Extensiones → Apps Script</strong>.</li>
      <li>Borra lo que haya en <code>Código.gs</code> y pega el código del script: <CopyButton path="/apps-script/Code.gs" label="Copiar código" /></li>
      <li>En <strong>Configuración del proyecto</strong> (engranaje) activa «Mostrar el archivo de manifiesto "appsscript.json"». Vuelve al editor, abre <code>appsscript.json</code> y reemplaza su contenido: <CopyButton path="/apps-script/appsscript.json" label="Copiar manifiesto" /></li>
      <li>Guarda, vuelve a la planilla y recárgala. Usa el menú <strong>Mi saldo → Conectar con la app</strong> y acepta los permisos.<PermissionsNote /></li>
      <li>Sigue las instrucciones para publicar el script como aplicación web, vuelve a <strong>Mi saldo → Conectar con la app</strong> y pulsa <strong>Abrir Mi saldo y conectar</strong>.</li>
    </ol>
  );
}

export function SheetConnection() {
  const st = useStore();
  const toast = useToast();
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [code, setCode] = useState("");
  const [incoming, setIncoming] = useState<{ conn: Connection; account: string | null; error?: string } | null>(null);
  const localHasData = st.tables.movements.length > 0;

  // Llegó un código desde el botón de la planilla: se muestra la cuenta y se pide confirmar antes de conectar.
  useEffect(() => {
    const pending = pendingConnectionCode();
    if (!pending || st.connection) return;
    const conn = parseConnectionCode(pending);
    if (!conn) { clearPendingConnectionCode(); setErr("El enlace de conexión no es válido. En tu planilla usa otra vez Mi saldo → Conectar con la app."); return; }
    callScript<{ account: string }>(conn, "ping")
      .then((r) => setIncoming({ conn, account: r.account || null }))
      .catch((e) => setIncoming({ conn, account: null, error: (e as Error).message }));
  }, [st.connection]);

  async function doConnect(conn: Connection) {
    setBusy(true); setErr(null);
    try { await connect(conn); clearPendingConnectionCode(); setIncoming(null); toast({ text: "Planilla conectada" }); }
    catch (x) { setErr((x as Error).message); }
    finally { setBusy(false); }
  }

  if (st.connection) {
    return (
      <div className="card pad stack">
        <div className="row">
          <span className="ico" style={{ background: "var(--income-soft)", color: "var(--income)" }}><Icon name="table" /></span>
          <div className="grow"><strong>Planilla conectada</strong><div className="small muted">{st.account ? `Cuenta de Google: ${st.account}` : "Google Sheets"}</div></div>
          <span className={`badge ${st.syncError ? "danger" : st.pending.length ? "warn" : "ok"}`}>{st.syncing ? "Sincronizando…" : st.syncError ? "Con error" : st.pending.length ? `${st.pending.length} por enviar` : "Al día"}</span>
        </div>
        <div className="small muted">Última sincronización: {st.lastSyncAt ? fmtDateTime(st.lastSyncAt) : "aún no"}</div>
        {st.automation && !st.automation.bankDomains && (
          <Notice tone="warn"><p className="small"><strong>Actualiza el script de tu planilla.</strong> Es de una versión anterior: sin actualizarlo no podrás leer boletas, elegir bancos ni probar el acceso a Gmail.</p>
            <ScriptUpdateSteps /></Notice>
        )}
        {st.syncError && <Notice tone="danger"><p className="small">{st.syncError}</p></Notice>}
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button className="btn sm primary" disabled={st.syncing} onClick={async () => { await sync(); if (!getErr()) toast({ text: "Sincronizado" }); }}><Icon name="refresh" size={16} /> Sincronizar ahora</button>
          <button className="btn sm danger" onClick={() => setConfirm(true)}>Desconectar</button>
        </div>
        <ConfirmSheet open={confirm} onClose={() => setConfirm(false)} danger title="¿Desconectar la planilla?" confirmLabel="Desconectar"
          body={<><p>Este dispositivo deja de enviar y recibir datos. <strong>La planilla y la actualización nocturna no se borran</strong>: siguen en tu cuenta de Google.</p><p>Para detener la actualización nocturna, páusala o cancélala antes en «Actualización nocturna».</p></>}
          onConfirm={() => { disconnect(); setConfirm(false); toast({ text: "Planilla desconectada" }); }} />
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!validScriptUrl(url)) { setErr("La URL debe ser la de tu aplicación web de Apps Script: empieza con https://script.google.com/macros/s/… y termina en /exec"); return; }
    await doConnect({ url: url.trim(), token: token.trim() });
  }
  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const conn = parseConnectionCode(code);
    if (!conn) { setErr("El código no es válido. Cópialo completo desde tu planilla: menú Mi saldo → Conectar con la app (empieza con «MS1.»)."); return; }
    await doConnect(conn);
  }

  if (incoming) {
    return (
      <div className="card pad stack">
        <div className="row">
          <span className="ico" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}><Icon name="table" /></span>
          <div className="grow"><strong>¿Conectar esta planilla?</strong><div className="small muted">{incoming.account ? `Cuenta de Google: ${incoming.account}` : "No se pudo confirmar la cuenta"}</div></div>
        </div>
        <p className="small" style={{ margin: 0 }}>Llegaste desde el botón «Abrir Mi saldo y conectar» de tu planilla. Conéctala solo si la cuenta es la tuya.</p>
        {localHasData && <Notice><p className="small">Si la planilla está vacía, se subirán los datos que ya tienes en este dispositivo. Si ya tiene datos, se usarán los de la planilla.</p></Notice>}
        {incoming.error && <Notice tone="danger"><p className="small">{incoming.error}</p></Notice>}
        {err && <Notice tone="danger"><p className="small">{err}</p></Notice>}
        <button className="btn primary block" disabled={busy || Boolean(incoming.error)} onClick={() => doConnect(incoming.conn)}>{busy ? "Conectando…" : "Conectar planilla"}</button>
        <button className="btn block" disabled={busy} onClick={() => { clearPendingConnectionCode(); setIncoming(null); }}>No es mía, cancelar</button>
      </div>
    );
  }
  return (
    <div className="card pad stack">
      <p className="small" style={{ margin: 0 }}>Tus datos se guardan en una planilla de Google Sheets <strong>tuya</strong>, con un pequeño script que solo tú controlas. Mi saldo no tiene servidor ni ve tus datos.</p>
      {SHEET_TEMPLATE_COPY_URL ? (
        <>
          <a className="btn primary block" href={SHEET_TEMPLATE_COPY_URL} target="_blank" rel="noopener"><Icon name="table" size={18} /> Crear mi planilla</a>
          <TemplateSteps />
        </>
      ) : <details><summary>Cómo crear la planilla (una sola vez, unos 5 minutos)</summary><div style={{ marginTop: 8 }}><SheetSetupSteps /></div></details>}
      <form onSubmit={submitCode} className="stack" style={{ gap: 0 }}>
        <div className="field"><label htmlFor="scode">¿Ya tienes tu planilla? Pega el código de conexión</label>
          <input id="scode" className="input" autoComplete="off" spellCheck={false} placeholder="MS1.…" value={code} onChange={(e) => setCode(e.target.value)} />
          <span className="hint">Está en tu planilla: menú Mi saldo → Conectar con la app. Trátalo como una contraseña.</span></div>
        {localHasData && <Notice><p className="small">Si la planilla está vacía, se subirán los datos que ya tienes en este dispositivo. Si ya tiene datos, se usarán los de la planilla.</p></Notice>}
        {err && <Notice tone="danger"><p className="small">{err}</p></Notice>}
        <button className="btn block" style={{ marginTop: 4 }} disabled={busy || code.trim().length < 20}>{busy ? "Conectando…" : "Conectar con el código"}</button>
      </form>
      {SHEET_TEMPLATE_COPY_URL && <details><summary>Crear la planilla a mano</summary><div style={{ marginTop: 8 }}><SheetSetupSteps /></div></details>}
      <details><summary>Conectar con URL y token</summary>
      <form onSubmit={submit} className="stack" style={{ gap: 0, marginTop: 8 }}>
        <div className="field"><label htmlFor="surl">URL de la aplicación web del script</label>
          <input id="surl" className="input" inputMode="url" spellCheck={false} placeholder="https://script.google.com/macros/s/…/exec" value={url} onChange={(e) => setUrl(e.target.value)} /></div>
        <div className="field"><label htmlFor="stok">Token de la app</label>
          <input id="stok" className="input" type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} />
          <span className="hint">Trátalo como una contraseña. Se guarda solo en este dispositivo.</span></div>
        <button className="btn block" style={{ marginTop: 12 }} disabled={busy || !url || token.length < 20}>{busy ? "Conectando…" : "Conectar planilla"}</button>
      </form>
      </details>
    </div>
  );
}

const getErr = () => getState().syncError;
