"use client";
import Link from "next/link";
import { useState } from "react";
import { api, ApiError, useApi } from "@/lib/client";
import { Icon } from "@/components/Icon";
import { CatIcon, ErrorState, Loading, Notice, Sheet, useToast } from "@/components/ui";
import type { Cat } from "@/components/MovementItem";

const COLORS = ["#0f8a7e", "#f97362", "#f5b82e", "#9b7be0", "#7cb7f5", "#0ea5e9", "#ec4899", "#84cc16", "#ef4444", "#64748b", "#16a34a", "#f59e0b"];

export default function ManageCategories() {
  const toast = useToast();
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [showArchived, setShowArchived] = useState(false);
  const { data, error, loading, reload } = useApi<{ categories: Cat[]; icons: string[] }>(`/api/categories?archived=1`);
  const [editing, setEditing] = useState<null | { cat: Cat | null; parentId: string | null }>(null);
  const parents = data?.categories.filter((c) => !c.parentId && c.kind === kind && (showArchived || !c.archivedAt)) ?? [];

  return (
    <main className="page">
      <Link href="/categorias" className="link-btn"><Icon name="chevronLeft" size={18} /> Categorías</Link>
      <h1 className="title">Gestionar categorías</h1>
      <div className="segmented" role="tablist" style={{ margin: "12px 0" }}>
        <button role="tab" aria-selected={kind === "expense"} onClick={() => setKind("expense")}>Gastos</button>
        <button role="tab" aria-selected={kind === "income"} onClick={() => setKind("income")}>Ingresos</button>
      </div>
      <p className="small muted">Las transferencias propias y las devoluciones son tipos de operación, no categorías: no se convierten en ingresos.</p>
      {loading && !data ? <Loading /> : error ? <ErrorState error={error} retry={reload} /> : (
        <div className="stack">
          {parents.map((p) => (
            <div key={p.id} className="card" style={{ opacity: p.archivedAt ? .6 : 1 }}>
              <button className="item" onClick={() => setEditing({ cat: p, parentId: null })}>
                <CatIcon icon={p.icon} color={p.color} /><span className="t grow">{p.name}</span>{p.archivedAt && <span className="badge">Archivada</span>}<Icon name="pencil" size={18} />
              </button>
              <div style={{ padding: "0 16px 12px 74px" }}>
                {data!.categories.filter((s) => s.parentId === p.id && (showArchived || !s.archivedAt)).map((s) => (
                  <button key={s.id} className="row between small" style={{ width: "100%", background: "none", border: 0, padding: "8px 0", cursor: "pointer", opacity: s.archivedAt ? .6 : 1 }} onClick={() => setEditing({ cat: s, parentId: p.id })}>
                    <span>{s.name}{s.archivedAt ? " (archivada)" : ""}</span><Icon name="pencil" size={14} />
                  </button>
                ))}
                <button className="link-btn small" onClick={() => setEditing({ cat: null, parentId: p.id })}><Icon name="plus" size={14} /> Subcategoría</button>
              </div>
            </div>
          ))}
          <button className="btn block" style={{ borderStyle: "dashed", borderColor: "var(--primary)", color: "var(--primary)" }} onClick={() => setEditing({ cat: null, parentId: null })}><Icon name="plus" /> Crear categoría</button>
          <label className="check"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /><span>Mostrar archivadas</span></label>
        </div>
      )}
      {editing && data && <EditSheet kind={kind} target={editing} icons={data.icons} all={data.categories} onClose={() => setEditing(null)} onSaved={(msg) => { setEditing(null); toast({ text: msg }); reload(); }} />}
    </main>
  );
}

function EditSheet({ kind, target, icons, all, onClose, onSaved }: { kind: string; target: { cat: Cat | null; parentId: string | null }; icons: string[]; all: Cat[]; onClose: () => void; onSaved: (m: string) => void }) {
  const c = target.cat;
  const [name, setName] = useState(c?.name ?? "");
  const [icon, setIcon] = useState(c?.icon ?? "dots");
  const [color, setColor] = useState(c?.color ?? COLORS[0]);
  const [err, setErr] = useState<string | null>(null);
  const [reassign, setReassign] = useState<{ count: number; to: string } | null>(null);
  const isSub = Boolean(target.parentId);
  async function save() {
    setErr(null);
    try {
      if (c) await api(`/api/categories/${c.id}`, { method: "PATCH", body: { name, icon, color } });
      else await api("/api/categories", { body: { name, kind, parentId: target.parentId, icon, color } });
      onSaved(c ? "Categoría actualizada" : "Categoría creada");
    } catch (e) { setErr((e as ApiError).message); }
  }
  async function del() {
    setErr(null);
    try {
      await api(`/api/categories/${c!.id}${reassign?.to ? `?reassignTo=${reassign.to}` : ""}`, { method: "DELETE" });
      onSaved("Categoría eliminada");
    } catch (e) {
      const a = e as ApiError;
      if (a.code === "needs_reassign") setReassign({ count: (a.data as { count: number }).count, to: "" });
      else setErr(a.message);
    }
  }
  const targets = all.filter((x) => x.kind === kind && x.id !== c?.id && x.parentId !== c?.id && !x.archivedAt);
  return (
    <Sheet open onClose={onClose} title={c ? `Editar ${isSub ? "subcategoría" : "categoría"}` : isSub ? "Nueva subcategoría" : "Nueva categoría"}>
      <div className="field"><label htmlFor="cn">Nombre</label><input id="cn" className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></div>
      {!isSub && <>
        <span className="label">Icono</span>
        <div className="row" style={{ flexWrap: "wrap", gap: 8, margin: "8px 0 14px" }} role="radiogroup" aria-label="Icono">
          {icons.map((i) => <button key={i} role="radio" aria-checked={icon === i} aria-label={i} onClick={() => setIcon(i)} style={{ border: icon === i ? "2px solid var(--primary)" : "2px solid transparent", borderRadius: 999, background: "none", padding: 0, cursor: "pointer" }}><CatIcon icon={i} color={color} small /></button>)}
        </div>
        <span className="label">Color</span>
        <div className="row" style={{ flexWrap: "wrap", gap: 8, margin: "8px 0 14px" }} role="radiogroup" aria-label="Color">
          {COLORS.map((x) => <button key={x} role="radio" aria-checked={color === x} aria-label={x} onClick={() => setColor(x)} style={{ width: 34, height: 34, borderRadius: 999, background: x, border: color === x ? "3px solid var(--text)" : "3px solid transparent", cursor: "pointer" }} />)}
        </div>
      </>}
      {err && <Notice tone="danger"><p>{err}</p></Notice>}
      <button className="btn primary block" disabled={name.trim().length < 2} onClick={save}>Guardar</button>
      {c && <>
        <button className="btn block" style={{ marginTop: 8 }} onClick={async () => { await api(`/api/categories/${c.id}`, { method: "PATCH", body: { archived: !c.archivedAt } }); onSaved(c.archivedAt ? "Categoría restaurada" : "Categoría archivada"); }}>{c.archivedAt ? "Desarchivar" : "Archivar"}</button>
        {reassign ? (
          <div className="card pad" style={{ marginTop: 12 }}>
            <p className="small">Tiene <strong>{reassign.count}</strong> movimientos. Elige a dónde reasignarlos antes de eliminar:</p>
            <select className="input" value={reassign.to} onChange={(e) => setReassign({ ...reassign, to: e.target.value })}>
              <option value="">Elegir categoría…</option>
              {targets.map((t) => <option key={t.id} value={t.id}>{t.parentId ? `${all.find((p) => p.id === t.parentId)?.name} › ` : ""}{t.name}</option>)}
            </select>
            <button className="btn danger block" style={{ marginTop: 8 }} disabled={!reassign.to} onClick={del}>Reasignar y eliminar</button>
          </div>
        ) : <button className="btn danger block" style={{ marginTop: 8 }} onClick={del}>Eliminar</button>}
      </>}
    </Sheet>
  );
}
