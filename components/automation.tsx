"use client";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { clearDeviceAi, getDeviceAi, saveDeviceAi, type DeviceAi } from "@/lib/ai/receipt";
import { Notice, useToast } from "./ui";

/** Clave de Gemini guardada solo en este dispositivo: lee boletas y cartolas sin script ni servidor. */
export function DeviceAiSetup({ onSaved }: { onSaved?: () => void }) {
  const toast = useToast();
  const [ai, setAi] = useState<DeviceAi | null | undefined>(undefined);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { getDeviceAi().then((x) => setAi(x ?? null)); }, []);
  if (ai === undefined) return null;
  return (
    <div className="card pad stack">
      {ai ? (
        <>
          <div className="row">
            <span className="ico" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}><Icon name="sparkle" /></span>
            <div className="grow"><strong>Gemini vinculada</strong><div className="small muted">Clave …{ai.key.slice(-4)} · guardada en este dispositivo</div></div>
            <span className="badge ok">Lista</span>
          </div>
          <button className="btn sm danger" onClick={async () => { await clearDeviceAi(); setAi(null); toast({ text: "Clave eliminada de este dispositivo" }); }}>Desvincular</button>
        </>
      ) : (
        <>
          <ol className="small stack" style={{ paddingLeft: 20, margin: 0, gap: 6 }}>
            <li>Abre <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> con tu cuenta de Google (es gratis y no pide tarjeta).</li>
            <li>Toca <strong>Create API key</strong> (Crear clave) y cópiala.</li>
            <li>Pégala aquí abajo y toca <strong>Vincular</strong>.</li>
          </ol>
          <div className="field"><label htmlFor="dkey">Clave de Gemini</label>
            <input id="dkey" className="input" type="password" autoComplete="off" spellCheck={false} placeholder="AIza…" value={key} onChange={(e) => setKey(e.target.value)} />
            <span className="hint">Se guarda solo en este dispositivo. Las fotos van directo de tu teléfono a Gemini.</span></div>
          {err && <Notice tone="danger"><p className="small">{err}</p></Notice>}
          <button className="btn primary block" disabled={busy || key.trim().length < 20} onClick={async () => {
            setBusy(true); setErr(null);
            try { setAi(await saveDeviceAi(key)); setKey(""); toast({ text: "Gemini vinculada" }); onSaved?.(); }
            catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
          }}>{busy ? "Verificando…" : "Vincular"}</button>
        </>
      )}
    </div>
  );
}
