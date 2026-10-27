"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, ApiError, KIND_LABEL, useApi, useStore } from "@/lib/client";
import { getDeviceAi, scanReceiptOnDevice, type DeviceAi } from "@/lib/ai/receipt";
import { CategoryPicker } from "@/components/CategoryPicker";
import { Notice } from "@/components/ui";
import { Icon } from "@/components/Icon";
import type { Cat } from "@/components/MovementItem";
import { useMe } from "@/components/AppShell";
import { formatMoney, minorToDecimalString, parseAmount } from "@/lib/money";
import { parseNotice } from "@/lib/capture/parse";

/** Achica la foto (lado mayor 1600 px, JPEG) para que viaje rápido a la planilla. Devuelve base64 sin encabezado. */
async function shrinkPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fail(new Error("No se pudo abrir la imagen")); i.src = url; });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Archivo completo en base64 sin encabezado (para PDF). */
async function fileBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export default function NewMovement() {
  const router = useRouter();
  const { me } = useMe();
  const cats = useApi<{ categories: Cat[] }>("/api/categories");
  const [kind, setKind] = useState("expense");
  const [f, setF] = useState({ amount: "", occurredOn: today(), occurredTime: "", description: "", merchant: "", accountMask: "", notes: "" });
  const [cat, setCat] = useState<{ c: string | null; s: string | null }>({ c: null, s: null });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const st = useStore();
  const photo = useRef<HTMLInputElement>(null);
  const attach = useRef<HTMLInputElement>(null);
  const [tried, setTried] = useState(false);
  const [scan, setScan] = useState<{ busy: boolean; error: string | null; warnings: string[]; done?: boolean }>({ busy: false, error: null, warnings: [] });
  const [deviceAi, setDeviceAi] = useState<DeviceAi | null>(null);
  useEffect(() => { getDeviceAi().then((x) => setDeviceAi(x ?? null)); }, []);
  const canScan = Boolean(deviceAi);
  const cur = me?.user.currency ?? "CLP";
  const [pasted, setPasted] = useState("");
  const [pasteMsg, setPasteMsg] = useState<{ ok: boolean; text: string } | null>(null);
  function applyPasted() {
    const p = parseNotice(pasted, cur);
    if (!p) { setPasteMsg({ ok: false, text: "No encontré un monto y un tipo de operación (compra, transferencia, abono…) en ese texto." }); return; }
    const k = p.kind === "income" || p.kind === "refund" ? "income" : "expense";
    setKind(k);
    setF((prev) => ({ ...prev, amount: p.currency === cur ? minorToDecimalString(BigInt(p.amountMinor), cur) : prev.amount, description: p.description, merchant: p.merchant ?? prev.merchant, accountMask: p.accountMask ?? prev.accountMask, notes: pasted.slice(0, 300) }));
    setCat({ c: null, s: null });
    setPasteMsg({ ok: true, text: p.currency === cur ? "Listo: revisa los datos y guarda." : `El aviso está en ${p.currency}; completa el monto en ${cur}.` });
  }

  async function readReceipt(file: File | undefined) {
    if (!file) return;
    setScan({ busy: true, error: null, warnings: [] });
    try {
      const pdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      if (pdf && file.size > 15 * 1024 * 1024) throw new Error("El PDF pesa más de 15 MB");
      const image = pdf ? await fileBase64(file) : await shrinkPhoto(file);
      const r = await scanReceiptOnDevice(deviceAi!, image, st.settings, st.tables.categories, pdf ? "application/pdf" : "image/jpeg");
      const warnings = [...r.warnings];
      if (r.currency !== cur) warnings.push(`La boleta está en ${r.currency}; el monto se dejó en blanco porque tu moneda es ${cur}.`);
      setKind("expense");
      setF((prev) => ({
        ...prev,
        amount: r.amountMinor !== null && r.currency === cur ? minorToDecimalString(BigInt(r.amountMinor), cur) : prev.amount,
        occurredOn: r.occurredOn, occurredTime: r.occurredTime ?? "", description: r.description, merchant: r.merchant ?? prev.merchant,
      }));
      setCat({ c: r.categoryId, s: r.subcategoryId });
      setScan({ busy: false, error: null, warnings, done: true });
    } catch (e) {
      setScan({ busy: false, error: (e as Error).message, warnings: [] });
    } finally {
      if (photo.current) photo.current.value = "";
      if (attach.current) attach.current.value = "";
    }
  }
  const parsed = f.amount ? parseAmount(f.amount, cur) : null;

  // La descripción es opcional: si queda vacía se usa el comercio o la categoría elegida.
  const autoDescription = () => {
    const name = (id: string | null) => cats.data?.categories.find((c) => c.id === id)?.name;
    return f.merchant.trim() || name(cat.s) || name(cat.c) || KIND_LABEL[kind];
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (!parsed) return;
    setBusy(true); setError(null);
    try {
      await api("/api/movements", { body: { kind, ...f, description: f.description.trim() || autoDescription(), currency: cur, occurredTime: f.occurredTime || null, merchant: f.merchant || null, accountMask: f.accountMask || null, notes: f.notes || null, categoryId: cat.c, subcategoryId: cat.s } });
      router.push("/movimientos");
    } catch (err) { setError((err as ApiError).message); setBusy(false); }
  }
  return (
    <main className="page">
      <button className="link-btn" onClick={() => router.back()}><Icon name="chevronLeft" size={18} /> Volver</button>
      <h1 className="title">Agregar movimiento</h1>
      <section className="card pad stack" style={{ marginTop: 12 }}>
        <input ref={photo} type="file" accept="image/*" capture="environment" hidden onChange={(e) => readReceipt(e.target.files?.[0])} />
        <input ref={attach} type="file" accept="image/*,application/pdf" hidden onChange={(e) => readReceipt(e.target.files?.[0])} />
        <div className="grid2">
          <button type="button" className="btn" disabled={!canScan || scan.busy} onClick={() => photo.current?.click()}><Icon name="camera" size={18} /> Sacar foto</button>
          <button type="button" className="btn" disabled={!canScan || scan.busy} onClick={() => attach.current?.click()}><Icon name="upload" size={18} /> Adjuntar foto</button>
        </div>
        {scan.busy && <p className="small muted" style={{ margin: 0 }}>Leyendo la boleta…</p>}
        {!canScan && <p className="small muted" style={{ margin: 0 }}>Para leer boletas, <Link href="/automatizacion">vincula tu IA Gemini</Link>. Es gratis y toma un minuto.</p>}
        {canScan && !scan.busy && !scan.done && !scan.error && <p className="small muted" style={{ margin: 0 }}>Saca una foto de la boleta o elige una de tu galería (también PDF). Se analiza con tu IA y no se guarda.</p>}
        {scan.done && !scan.warnings.length && <Notice tone="ok"><p className="small">Datos leídos de la boleta. Revísalos y guarda.</p></Notice>}
        {scan.error && <Notice tone="danger"><p className="small">{scan.error}</p></Notice>}
        {scan.warnings.length > 0 && <Notice tone="warn"><p className="small">Datos leídos de la boleta. Revisa: {scan.warnings.join(" · ")}</p></Notice>}
        <details>
          <summary>Pegar un aviso del banco</summary>
          <div className="stack" style={{ marginTop: 8 }}>
            <textarea className="input" rows={3} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Ej.: Compra por $12.990 en LIDER con tu tarjeta terminada en 1234" aria-label="Texto del aviso" />
            <button type="button" className="btn sm" disabled={!pasted.trim()} onClick={applyPasted}>Completar con este texto</button>
            {pasteMsg && <Notice tone={pasteMsg.ok ? "ok" : "warn"}><p className="small">{pasteMsg.text}</p></Notice>}
          </div>
        </details>
      </section>
      <form onSubmit={save} style={{ marginTop: 12 }}>
        <div className="segmented" role="radiogroup" aria-label="Tipo" style={{ marginBottom: 16 }}>
          {["expense", "income"].map((k) => <button type="button" key={k} role="radio" aria-checked={kind === k} aria-pressed={kind === k} onClick={() => { setKind(k); setCat({ c: null, s: null }); }}>{KIND_LABEL[k]}</button>)}
        </div>
        <p className="small muted" style={{ margin: "0 0 8px" }}>Los campos con <span className="req">*</span> son obligatorios.</p>
        <div className="field">
          <label htmlFor="amt">Monto ({cur}) <span className="req">*</span></label>
          <input id="amt" className={`input money ${kind === "income" ? "income" : "expense"}`} inputMode="decimal" placeholder="$0" autoFocus value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} aria-describedby="amt-h" aria-invalid={tried && !parsed ? true : undefined} aria-required />
          {tried && !parsed
            ? <span id="amt-h" className="err" role="alert" style={{ textAlign: "center" }}>{f.amount ? "Escribe un monto válido, por ejemplo 62.500" : "Escribe el monto"}</span>
            : <span id="amt-h" className="hint" style={{ textAlign: "center" }}>{parsed ? formatMoney(parsed, cur) : "Ejemplo: 62.500"}</span>}
        </div>
        <div className="field"><label htmlFor="desc">Descripción (opcional)</label><input id="desc" className="input" maxLength={300} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder={kind === "expense" ? "Supermercado" : "Sueldo"} aria-describedby="desc-h" />
          <span id="desc-h" className="hint">Si la dejas vacía, usamos {f.merchant.trim() || cat.c ? `«${autoDescription()}»` : "el nombre de la categoría"}.</span></div>
        {cats.data && <CategoryPicker cats={cats.data.categories} kind={kind as "expense" | "income"} categoryId={cat.c} subcategoryId={cat.s} onChange={(c, s) => setCat({ c, s })} />}
        <div className="grid2">
          <div className="field"><label htmlFor="date">Fecha</label><input id="date" type="date" className="input" value={f.occurredOn} onChange={(e) => setF({ ...f, occurredOn: e.target.value })} /></div>
          <div className="field"><label htmlFor="time">Hora (opcional)</label><input id="time" type="time" className="input" value={f.occurredTime} onChange={(e) => setF({ ...f, occurredTime: e.target.value })} /></div>
        </div>
        <details><summary>Más detalles</summary>
          <div className="field"><label htmlFor="mer">Comercio o contraparte</label><input id="mer" className="input" value={f.merchant} onChange={(e) => setF({ ...f, merchant: e.target.value })} /></div>
          <div className="field"><label htmlFor="acc">Cuenta o tarjeta</label><input id="acc" className="input" placeholder="••••1234" value={f.accountMask} onChange={(e) => setF({ ...f, accountMask: e.target.value })} /><span className="hint">Usa solo los últimos 4 dígitos.</span></div>
          <div className="field"><label htmlFor="notes">Notas</label><textarea id="notes" className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
        </details>
        {error && <Notice tone="danger"><p>{error}</p></Notice>}
        {tried && !parsed && <Notice tone="danger"><p className="small">Falta el monto: es el único dato obligatorio.</p></Notice>}
        <button className="btn primary block" style={{ marginTop: 16 }} disabled={busy}>{busy ? "Guardando…" : "Guardar movimiento"}</button>
      </form>
    </main>
  );
}
