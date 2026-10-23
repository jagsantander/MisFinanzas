"use client";
import Link from "next/link";
import { useState } from "react";
import { api, ApiError, useApi } from "@/lib/client";
import { Icon } from "@/components/Icon";
import { Empty, ErrorState, Loading, Notice, Sheet, Switch, useToast } from "@/components/ui";
import { CategoryPicker } from "@/components/CategoryPicker";
import type { Cat } from "@/components/MovementItem";

type Rule = { id: string; name: string; priority: number; active: boolean; categoryId: string; subcategoryId: string | null; conditions: Record<string, string | undefined> };
const COND_LABEL: Record<string, string> = { merchantContains: "Comercio contiene", senderContains: "Remitente contiene", descriptionContains: "Descripción contiene", accountMask: "Cuenta", kind: "Tipo" };

export default function RulesPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi<{ rules: Rule[] }>("/api/rules");
  const cats = useApi<{ categories: Cat[] }>("/api/categories");
  const [editing, setEditing] = useState<Rule | "new" | null>(null);
  const name = (id: string | null) => cats.data?.categories.find((c) => c.id === id)?.name ?? "";
  async function move(i: number, d: number) {
    const ids = data!.rules.map((r) => r.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    await api("/api/rules/reorder", { body: { ids } }); reload();
  }
  return (
    <main className="page">
      <Link href="/movimientos" className="link-btn"><Icon name="chevronLeft" size={18} /> Movimientos</Link>
      <h1 className="title">Reglas de clasificación</h1>
      <Notice><p className="small">Prioridad: 1) tus correcciones manuales, 2) estas reglas (de arriba hacia abajo), 3) la propuesta de la IA. Las reglas se aplican a movimientos nuevos; para cambiar existentes usa «Aplicar a similares» al reclasificar.</p></Notice>
      <div className="stack" style={{ marginTop: 12 }}>
        {loading && !data ? <Loading /> : error ? <ErrorState error={error} retry={reload} /> : data!.rules.length === 0 ? (
          <Empty icon="filter" title="Aún no tienes reglas"><p>Créalas al cambiar la categoría de un movimiento o desde aquí.</p></Empty>
        ) : (
          <div className="list">
            {data!.rules.map((r, i) => (
              <div key={r.id} className="item" style={{ cursor: "default", opacity: r.active ? 1 : .6 }}>
                <div className="stack" style={{ gap: 2 }}>
                  <button className="btn ghost sm" aria-label="Subir prioridad" disabled={i === 0} onClick={() => move(i, -1)} style={{ minHeight: 28, padding: 4 }}><Icon name="up" size={16} /></button>
                  <button className="btn ghost sm" aria-label="Bajar prioridad" disabled={i === data!.rules.length - 1} onClick={() => move(i, 1)} style={{ minHeight: 28, padding: 4 }}><Icon name="down" size={16} /></button>
                </div>
                <button className="grow" style={{ background: "none", border: 0, textAlign: "left", cursor: "pointer", padding: 0 }} onClick={() => setEditing(r)}>
                  <div className="t">{r.name}</div>
                  <div className="s">{Object.entries(r.conditions).filter(([, v]) => v).map(([k, v]) => `${COND_LABEL[k]}: ${v === "expense" ? "gasto" : v === "income" ? "ingreso" : v}`).join(" · ")}</div>
                  <div className="small">→ {name(r.categoryId)}{r.subcategoryId ? ` › ${name(r.subcategoryId)}` : ""}</div>
                </button>
                <Switch checked={r.active} label={`Regla ${r.name} activa`} onChange={async (v) => { await api(`/api/rules/${r.id}`, { method: "PATCH", body: { active: v } }); reload(); }} />
              </div>
            ))}
          </div>
        )}
        <button className="btn block" onClick={() => setEditing("new")}><Icon name="plus" /> Nueva regla</button>
      </div>
      {editing && cats.data && <RuleSheet rule={editing === "new" ? null : editing} cats={cats.data.categories} onClose={() => setEditing(null)} onSaved={(m) => { setEditing(null); toast({ text: m }); reload(); }} />}
    </main>
  );
}

function RuleSheet({ rule, cats, onClose, onSaved }: { rule: Rule | null; cats: Cat[]; onClose: () => void; onSaved: (m: string) => void }) {
  const [name, setName] = useState(rule?.name ?? "");
  const [cond, setCond] = useState<Record<string, string>>(Object.fromEntries(Object.entries(rule?.conditions ?? { kind: "expense" }).filter(([, v]) => v)) as Record<string, string>);
  const [cat, setCat] = useState<{ c: string | null; s: string | null }>({ c: rule?.categoryId ?? null, s: rule?.subcategoryId ?? null });
  const [err, setErr] = useState<string | null>(null);
  const kind = (cond.kind as "expense" | "income") ?? "expense";
  async function save() {
    setErr(null);
    const conditions = Object.fromEntries(Object.entries(cond).filter(([, v]) => v));
    try {
      if (rule) await api(`/api/rules/${rule.id}`, { method: "PATCH", body: { name, conditions, categoryId: cat.c, subcategoryId: cat.s } });
      else await api("/api/rules", { body: { name, conditions, categoryId: cat.c, subcategoryId: cat.s } });
      onSaved("Regla guardada");
    } catch (e) { setErr((e as ApiError).message); }
  }
  return (
    <Sheet open onClose={onClose} title={rule ? "Editar regla" : "Nueva regla"}>
      <div className="field"><label htmlFor="rn">Nombre</label><input id="rn" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Supermercados" /></div>
      <div className="field"><label htmlFor="rk">Tipo de operación</label><select id="rk" className="input" value={kind} onChange={(e) => { setCond({ ...cond, kind: e.target.value }); setCat({ c: null, s: null }); }}><option value="expense">Gasto</option><option value="income">Ingreso</option></select></div>
      {(["merchantContains", "senderContains", "descriptionContains", "accountMask"] as const).map((k) => (
        <div key={k} className="field"><label htmlFor={k}>{COND_LABEL[k]}</label><input id={k} className="input" value={cond[k] ?? ""} onChange={(e) => setCond({ ...cond, [k]: e.target.value })} /></div>
      ))}
      <CategoryPicker cats={cats} kind={kind} categoryId={cat.c} subcategoryId={cat.s} onChange={(c, s) => setCat({ c, s })} />
      {err && <Notice tone="danger"><p>{err}</p></Notice>}
      <button className="btn primary block" disabled={!name || !cat.c} onClick={save}>Guardar</button>
      {rule && <button className="btn danger block" style={{ marginTop: 8 }} onClick={async () => { await api(`/api/rules/${rule.id}`, { method: "DELETE" }); onSaved("Regla eliminada"); }}>Eliminar regla</button>}
    </Sheet>
  );
}
