"use client";
import { useEffect, useState } from "react";
import { fmtDateTime, useStore, withBase } from "@/lib/client";
import { SHEET_TEMPLATE_COPY_URL } from "@/lib/config";
import { connect, connectGoogle, disconnect, getState, resumeGoogle, sync } from "@/lib/local/store";
import { googleSignInAvailable } from "@/lib/google/auth";
import { spreadsheetUrl } from "@/lib/google/sheets";
import { callScript, clearPendingConnectionCode, parseConnectionCode, pendingConnectionCode, validScriptUrl } from "@/lib/local/script";
import { isSheets, type ScriptConnection } from "@/lib/local/types";
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
    <div className="card pad" style={{ marginTop: 8 }}>Como el script es tuyo y no está publicado, Google muestra «Google no verificó esta app»: pulsa <em>Configuración avanzada → Ir a MiSaldo → Permitir</em>.
      Los permisos los usa únicamente tu script, en tu cuenta. Puedes revocarlos en <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener">myaccount.google.com/permissions</a>.</div>
  );
}

/** Para quien conectó con Google: agregar el script a SU misma planilla. */
export function AddScriptSteps({ sheetUrl }: { sheetUrl: string }) {
  return (
    <ol className="stack small" style={{ paddingLeft: 20, margin: 0, gap: 10 }}>
      <li><a href={sheetUrl} target="_blank" rel="noopener">Abre tu planilla «MiSaldo»</a> en un computador y entra a <strong>Extensiones → Apps Script</strong>.</li>
      <li>Reemplaza el contenido de <code>Código.gs</code> con el script: <CopyButton path="/apps-script/Code.gs" label="Copiar código" /></li>
      <li>En <strong>Configuración del proyecto</strong> (engranaje) activa «Mostrar el archivo de manifiesto "appsscript.json"», ábrelo y reemplaza su contenido: <CopyButton path="/apps-script/appsscript.json" label="Copiar manifiesto" /> Guarda.</li>
      <li>Vuelve a la planilla, recárgala y usa <strong>MiSaldo → Conectar con la app</strong>. Acepta los permisos.<PermissionsNote /></li>
      <li>Sigue las instrucciones para publicar el script como aplicación web, vuelve a <strong>Conectar con la app</strong> y pulsa <strong>Abrir MiSaldo y conectar</strong>. Tus datos siguen en la misma planilla.</li>
    </ol>
  );
}

/** Pasos con la planilla plantilla: el script ya viene incluido. */
export function TemplateSteps() {
  return (
    <ol className="stack small" style={{ paddingLeft: 20, margin: 0, gap: 10 }}>
      <li>Pulsa <strong>Crear mi planilla</strong> y luego <strong>Hacer una copia</strong>. Usa tu cuenta de Google.</li>
      <li>En tu copia abre el menú <strong>MiSaldo → Conectar con la app</strong> (si no aparece, recarga la página) y acepta los permisos.<PermissionsNote /></li>
      <li>Solo la primera vez, la planilla te mostrará cómo publicar tu script como aplicación web (unos 4 clics). Hazlo y vuelve a usar <strong>MiSaldo → Conectar con la app</strong>.</li>
      <li>Pulsa <strong>Abrir MiSaldo y conectar</strong>. La app se conecta sola.</li>
    </ol>
  );
}

/** Pasos para crear la planilla a mano, pegando el script (si no hay plantilla). */
export function SheetSetupSteps() {
  return (
    <ol className="stack small" style={{ paddingLeft: 20, margin: 0, gap: 10 }}>
      <li>Crea una planilla nueva en <a href="https://sheets.new" target="_blank" rel="noopener">sheets.new</a> con la cuenta de Google donde llegan los avisos de tu banco. Ponle de nombre «MiSaldo».</li>
      <li>En la planilla abre <strong>Extensiones → Apps Script</strong>.</li>
      <li>Borra lo que haya en <code>Código.gs</code> y pega el código del script: <CopyButton path="/apps-script/Code.gs" label="Copiar código" /></li>
      <li>En <strong>Configuración del proyecto</strong> (engranaje) activa «Mostrar el archivo de manifiesto "appsscript.json"». Vuelve al editor, abre <code>appsscript.json</code> y reemplaza su contenido: <CopyButton path="/apps-script/appsscript.json" label="Copiar manifiesto" /></li>
      <li>Guarda, vuelve a la planilla y recárgala. Usa el menú <strong>MiSaldo → Conectar con la app</strong> y acepta los permisos.<PermissionsNote /></li>
      <li>Sigue las instrucciones para publicar el script como aplicación web, vuelve a <strong>MiSaldo → Conectar con la app</strong> y pulsa <strong>Abrir MiSaldo y conectar</strong>.</li>
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
  const [incoming, setIncoming] = useState<{ conn: ScriptConnection; account: string | null; error?: string } | null>(null);
  const localHasData = st.tables.movements.length > 0;

  // Llegó un código desde el botón de la planilla: se muestra la cuenta y se pide confirmar antes de conectar.
  useEffect(() => {
    const pending = pendingConnectionCode();
    if (!pending || (st.connection && !isSheets(st.connection))) return;
    const conn = parseConnectionCode(pending);
    if (!conn) { clearPendingConnectionCode(); setErr("El enlace de conexión no es válido. En tu planilla usa otra vez MiSaldo → Conectar con la app."); return; }
    callScript<{ account: string }>(conn, "ping")
      .then((r) => setIncoming({ conn, account: r.account || null }))
      .catch((e) => setIncoming({ conn, account: null, error: (e as Error).message }));
  }, [st.connection]);

  async function doConnect(conn: ScriptConnection) {
    setBusy(true); setErr(null);
    try { await connect(conn); clearPendingConnectionCode(); setIncoming(null); toast({ text: "Planilla conectada" }); }
    catch (x) { setErr((x as Error).message); }
    finally { setBusy(false); }
  }

  async function google() {
    setBusy(true); setErr(null);
    try { await connectGoogle(); toast({ text: "Planilla conectada" }); }
    catch (x) { setErr((x as Error).message); }
    finally { setBusy(false); }
  }

  if (incoming) {
    return (
      <div className="card pad stack">
        <div className="row">
          <span className="ico" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}><Icon name="table" /></span>
          <div className="grow"><strong>¿Conectar esta planilla?</strong><div className="small muted">{incoming.account ? `Cuenta de Google: ${incoming.account}` : "No se pudo confirmar la cuenta"}</div></div>
        </div>
        <p className="small" style={{ margin: 0 }}>Llegaste desde el botón «Abrir MiSaldo y conectar» de tu planilla. Conéctala solo si la cuenta es la tuya.</p>
        {localHasData && <Notice><p className="small">Si la planilla está vacía, se subirán los datos que ya tienes en este dispositivo. Si ya tiene datos, se usarán los de la planilla.</p></Notice>}
        {incoming.error && <Notice tone="danger"><p className="small">{incoming.error}</p></Notice>}
        {err && <Notice tone="danger"><p className="small">{err}</p></Notice>}
        <button className="btn primary block" disabled={busy || Boolean(incoming.error)} onClick={() => doConnect(incoming.conn)}>{busy ? "Conectando…" : "Conectar planilla"}</button>
        <button className="btn block" disabled={busy} onClick={() => { clearPendingConnectionCode(); setIncoming(null); }}>No es mía, cancelar</button>
      </div>
    );
  }

  if (isSheets(st.connection)) {
    const c = st.connection;
    return (
      <div className="card pad stack">
        <div className="row">
          <span className="ico" style={{ background: "var(--income-soft)", color: "var(--income)" }}><Icon name="table" /></span>
          <div className="grow"><strong>Planilla conectada con Google</strong><div className="small muted ellipsis">{c.email}</div></div>
          <span className={`badge ${st.syncError ? "danger" : st.needsGoogle || st.pending.length ? "warn" : "ok"}`}>{st.syncing ? "Sincronizando…" : st.syncError ? "Con error" : st.needsGoogle ? "Toca sincronizar" : st.pending.length ? `${st.pending.length} por enviar` : "Al día"}</span>
        </div>
        <div className="small muted">Última sincronización: {st.lastSyncAt ? fmtDateTime(st.lastSyncAt) : "aún no"}</div>
        {st.syncError && <Notice tone="danger"><p className="small">{st.syncError}</p></Notice>}
        {err && <Notice tone="danger"><p className="small">{err}</p></Notice>}
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button className="btn sm primary" disabled={st.syncing || busy} onClick={async () => {
            setBusy(true); setErr(null);
            try { if (st.needsGoogle) await resumeGoogle(); else await sync(); if (!getErr()) toast({ text: "Sincronizado" }); }
            catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
          }}><Icon name="refresh" size={16} /> {st.needsGoogle ? "Sincronizar con Google" : "Sincronizar ahora"}</button>
          <a className="btn sm" href={spreadsheetUrl(c.spreadsheetId)} target="_blank" rel="noopener"><Icon name="table" size={16} /> Abrir planilla</a>
          <button className="btn sm danger" onClick={() => setConfirm(true)}>Desconectar</button>
        </div>
        <p className="small muted" style={{ margin: 0 }}>Por seguridad, Google da a la app un permiso que dura una hora. Cuando vence, tus cambios quedan guardados aquí y se envían al tocar «Sincronizar con Google».</p>
        <ConfirmSheet open={confirm} onClose={() => setConfirm(false)} danger title="¿Desconectar la planilla?" confirmLabel="Desconectar"
          body={<p>Este dispositivo deja de enviar y recibir datos. <strong>La planilla no se borra</strong>: sigue en tu Google Drive y puedes volver a conectarla con «Continuar con Google».</p>}
          onConfirm={() => { disconnect(); setConfirm(false); toast({ text: "Planilla desconectada" }); }} />
      </div>
    );
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
        {st.syncError && <Notice tone="danger"><p className="small">{st.syncError}</p></Notice>}
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button className="btn sm primary" disabled={st.syncing} onClick={async () => { await sync(); if (!getErr()) toast({ text: "Sincronizado" }); }}><Icon name="refresh" size={16} /> Sincronizar ahora</button>
          <button className="btn sm danger" onClick={() => setConfirm(true)}>Desconectar</button>
        </div>
        <ConfirmSheet open={confirm} onClose={() => setConfirm(false)} danger title="¿Desconectar la planilla?" confirmLabel="Desconectar"
          body={<p>Este dispositivo deja de enviar y recibir datos. <strong>La planilla no se borra</strong>: sigue en tu cuenta de Google.</p>}
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
    if (!conn) { setErr("El código no es válido. Cópialo completo desde tu planilla: menú MiSaldo → Conectar con la app (empieza con «MS1.»)."); return; }
    await doConnect(conn);
  }

  const scriptOptions = (
    <>
      {SHEET_TEMPLATE_COPY_URL ? (
        <>
          <a className={`btn ${googleSignInAvailable() ? "" : "primary "}block`} href={SHEET_TEMPLATE_COPY_URL} target="_blank" rel="noopener"><Icon name="table" size={18} /> Crear mi planilla con script</a>
          <TemplateSteps />
        </>
      ) : <details><summary>Cómo crear la planilla (una sola vez, unos 5 minutos)</summary><div style={{ marginTop: 8 }}><SheetSetupSteps /></div></details>}
      <form onSubmit={submitCode} className="stack" style={{ gap: 0 }}>
        <div className="field"><label htmlFor="scode">¿Ya tienes tu planilla con script? Pega el código de conexión</label>
          <input id="scode" className="input" autoComplete="off" spellCheck={false} placeholder="MS1.…" value={code} onChange={(e) => setCode(e.target.value)} />
          <span className="hint">Está en tu planilla: menú MiSaldo → Conectar con la app. Trátalo como una contraseña.</span></div>
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
    </>
  );
  return (
    <div className="card pad stack">
      <p className="small" style={{ margin: 0 }}>Tus datos se guardan en una planilla de Google Sheets <strong>tuya</strong>. MiSaldo no tiene servidor ni ve tus datos.</p>
      {localHasData && <Notice><p className="small">Si la planilla está vacía, se subirán los datos que ya tienes en este dispositivo. Si ya tiene datos, se usarán los de la planilla.</p></Notice>}
      {err && <Notice tone="danger"><p className="small">{err}</p></Notice>}
      {googleSignInAvailable() ? (
        <>
          <button className="btn primary block" disabled={busy} onClick={google}><Icon name="table" size={18} /> {busy ? "Conectando…" : "Continuar con Google"}</button>
          <p className="small muted" style={{ margin: 0 }}>MiSaldo crea la planilla «MiSaldo» en tu Google Drive y la mantiene al día. Solo puede ver los archivos que ella misma crea, no el resto de tu Drive. Si ya la creaste en otro dispositivo, la encuentra sola.</p>
          <details><summary>Otras formas de conectar (planilla con script)</summary><div className="stack" style={{ marginTop: 8 }}>{scriptOptions}</div></details>
        </>
      ) : scriptOptions}
    </div>
  );
}

const getErr = () => getState().syncError;
