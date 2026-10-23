"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError, KIND_LABEL, useApi } from "@/lib/client";
import { CategoryPicker } from "@/components/CategoryPicker";
import { Notice } from "@/components/ui";
import { Icon } from "@/components/Icon";
import type { Cat } from "@/components/MovementItem";
import { useMe } from "@/components/AppShell";
import { formatMoney, parseAmount } from "@/lib/money";

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
  const cur = me?.user.currency ?? "CLP";
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
