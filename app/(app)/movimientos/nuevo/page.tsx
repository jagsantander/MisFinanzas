"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import Link from "next/link";
import { api, ApiError, KIND_LABEL, useApi, useStore } from "@/lib/client";
import { script } from "@/lib/local/store";
import type { ReceiptScan } from "@/lib/local/types";
import { CategoryPicker } from "@/components/CategoryPicker";
import { Notice } from "@/components/ui";
import { Icon } from "@/components/Icon";
import type { Cat } from "@/components/MovementItem";
import { useMe } from "@/components/AppShell";
import { formatMoney, minorToDecimalString, parseAmount } from "@/lib/money";

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
  const [scan, setScan] = useState<{ busy: boolean; error: string | null; warnings: string[]; done?: boolean }>({ busy: false, error: null, warnings: [] });
  const canScan = Boolean(st.connection && st.automation?.hasAiKey && st.automation.ai.model);
  const cur = me?.user.currency ?? "CLP";

  async function readReceipt(file: File | undefined) {
    if (!file) return;
    setScan({ busy: true, error: null, warnings: [] });
    try {
      const image = await shrinkPhoto(file);
      const { receipt: r } = await script<{ receipt: ReceiptScan }>("scanReceipt", { image, mimeType: "image/jpeg" }, 90_000);
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
      const msg = (e as Error).message;
      setScan({ busy: false, error: /Acción desconocida/.test(msg) ? "El script de tu planilla es de una versión anterior. Actualízalo en Perfil → Tu planilla para leer boletas." : msg, warnings: [] });
    } finally {
      if (photo.current) photo.current.value = "";
    }
  }
  const parsed = f.amount ? parseAmount(f.amount, cur) : null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api("/api/movements", { body: { kind, ...f, currency: cur, occurredTime: f.occurredTime || null, merchant: f.merchant || null, accountMask: f.accountMask || null, notes: f.notes || null, categoryId: cat.c, subcategoryId: cat.s } });
      router.push("/movimientos");
    } catch (err) { setError((err as ApiError).message); setBusy(false); }
  }
  return (
    <main className="page">
      <button className="link-btn" onClick={() => router.back()}><Icon name="chevronLeft" size={18} /> Volver</button>
      <h1 className="title">Agregar movimiento</h1>
      <section className="card pad stack" style={{ marginTop: 12 }}>
        <input ref={photo} type="file" accept="image/*" capture="environment" hidden onChange={(e) => readReceipt(e.target.files?.[0])} />
        <button type="button" className="btn block" disabled={!canScan || scan.busy} onClick={() => photo.current?.click()}>
          <Icon name="camera" size={18} /> {scan.busy ? "Leyendo la boleta…" : "Fotografiar boleta"}
        </button>
        {!canScan && <p className="small muted" style={{ margin: 0 }}>Para leer boletas con IA, <Link href={st.connection ? "/automatizacion#ia" : "/conexiones"}>{st.connection ? "conecta tu IA" : "conecta tu planilla y tu IA"}</Link>. Con una clave gratuita de Gemini no tiene costo.</p>}
        {canScan && !scan.busy && !scan.done && !scan.error && <p className="small muted" style={{ margin: 0 }}>La foto se analiza con tu IA y no se guarda. Revisa los datos antes de guardar.</p>}
        {scan.done && !scan.warnings.length && <Notice tone="ok"><p className="small">Datos leídos de la boleta. Revísalos y guarda.</p></Notice>}
        {scan.error && <Notice tone="danger"><p className="small">{scan.error}</p></Notice>}
        {scan.warnings.length > 0 && <Notice tone="warn"><p className="small">Datos leídos de la boleta. Revisa: {scan.warnings.join(" · ")}</p></Notice>}
      </section>
      <form onSubmit={save} style={{ marginTop: 12 }}>
        <div className="segmented" role="radiogroup" aria-label="Tipo" style={{ marginBottom: 16 }}>
          {["expense", "income"].map((k) => <button type="button" key={k} role="radio" aria-checked={kind === k} aria-pressed={kind === k} onClick={() => { setKind(k); setCat({ c: null, s: null }); }}>{KIND_LABEL[k]}</button>)}
        </div>
        <div className="field">
          <label htmlFor="amt">Monto ({cur})</label>
          <input id="amt" className={`input money ${kind === "income" ? "income" : "expense"}`} inputMode="decimal" placeholder="$0" autoFocus value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} aria-describedby="amt-h" />
          <span id="amt-h" className="hint" style={{ textAlign: "center" }}>{parsed ? formatMoney(parsed, cur) : "Ejemplo: 62.500"}</span>
        </div>
        <div className="field"><label htmlFor="desc">Descripción</label><input id="desc" className="input" required maxLength={300} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder={kind === "expense" ? "Supermercado" : "Sueldo"} /></div>
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
        <button className="btn primary block" style={{ marginTop: 16 }} disabled={busy || !parsed || !f.description}>{busy ? "Guardando…" : "Guardar movimiento"}</button>
      </form>
    </main>
  );
}
