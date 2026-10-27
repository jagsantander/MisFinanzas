"use client";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { dayHeading, KIND_LABEL, movementTone, SOURCE_LABEL, useApi } from "@/lib/client";
import { Icon } from "@/components/Icon";
import { Empty, ErrorState, Loading, Money, Sheet } from "@/components/ui";
import { MovementItem, type Cat, type Mv } from "@/components/MovementItem";
import { useMe } from "@/components/AppShell";
import { exportData } from "@/lib/local/api";

type Resp = { movements: Mv[]; totals: { income: string; expense: string; balance: string; reviewCount: number; otherCurrencies: Record<string, unknown> }; accounts: string[]; truncated: boolean };
const FILTER_KEYS = ["from", "to", "kind", "type", "categoryId", "subcategoryId", "account", "source", "revision", "q", "deleted"] as const;

function monthRange(offset = 0) {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offset);
  const s = new Date(d), e = new Date(d); e.setMonth(e.getMonth() + 1);
  const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-01`;
  return { from: iso(s), to: iso(e) };
}

function MovementsInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const { me } = useMe();
  const params = useMemo(() => {
    const p = new URLSearchParams();
    FILTER_KEYS.forEach((k) => { const v = sp.get(k); if (v) p.set(k, v); });
    return p;
  }, [sp]);
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { data, error, loading, reload } = useApi<Resp>(`/api/movements?${params}`);
  const cats = useApi<{ categories: Cat[] }>("/api/categories");
  const cur = me?.user.currency ?? "CLP";

  const set = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    router.replace(`/movimientos?${p}`);
  };
  useEffect(() => {
    const t = setTimeout(() => { if ((sp.get("q") ?? "") !== q) set({ q: q || null }); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const groups = useMemo(() => {
    const g = new Map<string, Mv[]>();
    data?.movements.forEach((m) => g.set(m.occurredOn, [...(g.get(m.occurredOn) ?? []), m]));
    return [...g.entries()];
  }, [data]);
  const type = sp.get("type");
  const activeFilters = FILTER_KEYS.filter((k) => !["q", "type"].includes(k) && params.get(k)).length;
  const catName = (id: string | null) => cats.data?.categories.find((c) => c.id === id)?.name ?? "";

  return (
    <main className="page wide">
      <div className="topbar"><div className="brand"><span>Mi<b>Saldo</b></span></div>
        <Link href="/categorias/reglas" className="btn ghost sm" aria-label="Reglas de clasificación"><Icon name="gear" size={24} /></Link></div>
      <div className="row between" style={{ flexWrap: "wrap" }}>
        <h1 className="title">Movimientos</h1>
        <button className="btn sm" onClick={() => setFiltersOpen(true)}><Icon name="filter" size={18} /> Filtros{activeFilters ? ` (${activeFilters})` : ""}</button>
      </div>
      <div className="stack" style={{ marginTop: 12 }}>
        <div className="search"><Icon name="search" /><input className="input" type="search" placeholder="Buscar movimiento" aria-label="Buscar movimiento" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="chips" role="group" aria-label="Tipo">
          <button className="chip" aria-pressed={!type} onClick={() => set({ type: null })}>Todos</button>
          <button className="chip" aria-pressed={type === "ingresos"} onClick={() => set({ type: "ingresos" })}>Ingresos</button>
          <button className="chip" aria-pressed={type === "gastos"} onClick={() => set({ type: "gastos" })}>Gastos</button>
          <button className="chip" aria-pressed={sp.get("revision") === "pendiente"} onClick={() => set({ revision: sp.get("revision") === "pendiente" ? null : "pendiente" })}>Por revisar</button>
        </div>
        {data && (
          <div className="card pad grid2" aria-live="polite">
            <div className="row" style={{ gap: 10 }}><span className="ico sm" style={{ background: "var(--income-soft)", color: "var(--income)" }}><Icon name="up" /></span><div><div className="small muted">Ingresos</div><Money minor={data.totals.income} currency={cur} className="income" /></div></div>
            <div className="row" style={{ gap: 10 }}><span className="ico sm" style={{ background: "var(--expense-soft)", color: "var(--expense-icon)" }}><Icon name="down" /></span><div><div className="small muted">Gastos</div><Money minor={data.totals.expense} currency={cur} className="expense" /></div></div>
          </div>
        )}
        {loading && !data ? <Loading rows={5} /> : error ? <ErrorState error={error} retry={reload} /> : data && (data.movements.length === 0 ? (
          <Empty icon="list" title={params.toString() ? "Sin resultados" : "Aún no hay movimientos"}>
            <p>{params.toString() ? "Prueba con otros filtros." : "Agrega un movimiento para verlo aquí."}</p>
            {params.toString() && <button className="btn sm" onClick={() => router.replace("/movimientos")}>Limpiar filtros</button>}
          </Empty>
        ) : (
          <>
            <div className="only-mobile stack">
              {groups.map(([day, list]) => (
                <section key={day}>
                  <h2 className="section muted" style={{ fontSize: 16, margin: "8px 0" }}>{dayHeading(day)}</h2>
                  <div className="list">{list.map((m) => <MovementItem key={m.id} m={m} cats={cats.data?.categories ?? []} />)}</div>
                </section>
              ))}
            </div>
            <div className="only-desktop card table-wrap">
              <table className="sheet-table">
                <thead><tr><th>Fecha</th><th>Descripción</th><th>Categoría</th><th>Tipo</th><th>Cuenta</th><th>Origen</th><th>Estado</th><th className="right">Monto</th></tr></thead>
                <tbody>
                  {data.movements.map((m) => {
                    const t = movementTone(m.kind);
                    return (
                      <tr key={m.id} onClick={() => router.push(`/movimientos/detalle?id=${m.id}`)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && router.push(`/movimientos/detalle?id=${m.id}`)} style={{ opacity: m.excluded ? .6 : 1 }}>
                        <td className="tabular">{m.occurredOn} {m.occurredTime ?? ""}</td>
                        <td style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }}>{m.merchant || m.description}</td>
                        <td>{catName(m.categoryId)}{m.subcategoryId ? ` › ${catName(m.subcategoryId)}` : ""}</td>
                        <td>{KIND_LABEL[m.kind]}</td>
                        <td>{m.accountMask ?? ""}</td>
                        <td>{SOURCE_LABEL[m.source] ?? "Manual"}</td>
                        <td>{m.status === "review" ? <span className="badge warn">Por revisar</span> : m.status === "pending" ? <span className="badge info">Pendiente</span> : m.excluded ? <span className="badge">Excluido</span> : <span className="badge ok">OK</span>}</td>
                        <td className="right"><Money minor={m.amountMinor} currency={m.currency} sign={t.sign} className={t.cls} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {data.truncated && <p className="small muted">Se muestran los primeros resultados. Acota con filtros para ver el resto.</p>}
          </>
        ))}
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button className="btn sm" onClick={() => exportData("xlsx", Object.fromEntries(params))}><Icon name="download" size={18} /> Excel</button>
          <button className="btn sm" onClick={() => exportData("csv", Object.fromEntries(params))}><Icon name="download" size={18} /> CSV</button>
          <button className="btn sm" onClick={() => exportData("pdf", Object.fromEntries(params))}><Icon name="download" size={18} /> PDF</button>
          <Link className="btn sm ghost" href="/movimientos?deleted=1">Ver eliminados</Link>
        </div>
      </div>
      <div style={{ height: 16 }} />
      <Link href="/movimientos/nuevo" className="btn primary block fab" style={{ maxWidth: 560, margin: "0 auto" }}><Icon name="plus" /> Agregar movimiento</Link>

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filtros">
        <Filters initial={params} accounts={data?.accounts ?? []} cats={cats.data?.categories ?? []} onApply={(p) => { router.replace(`/movimientos?${p}`); setFiltersOpen(false); }} />
      </Sheet>
    </main>
  );
}

function Filters({ initial, accounts, cats, onApply }: { initial: URLSearchParams; accounts: string[]; cats: Cat[]; onApply: (p: URLSearchParams) => void }) {
  const [f, setF] = useState<Record<string, string>>(Object.fromEntries(initial));
  const upd = (k: string, v: string) => setF((x) => { const n = { ...x }; if (v) n[k] = v; else delete n[k]; return n; });
  return (
    <div>
      <div className="field"><span className="label">Período</span>
        <div className="chips">
          <button className="chip" onClick={() => setF({ ...f, ...monthRange(0) })}>Este mes</button>
          <button className="chip" onClick={() => setF({ ...f, ...monthRange(-1) })}>Mes anterior</button>
          <button className="chip" onClick={() => { const n = { ...f }; delete n.from; delete n.to; setF(n); }}>Todo</button>
        </div>
      </div>
      <div className="grid2">
        <div className="field"><label htmlFor="ffrom">Desde</label><input id="ffrom" type="date" className="input" value={f.from ?? ""} onChange={(e) => upd("from", e.target.value)} /></div>
        <div className="field"><label htmlFor="fto">Hasta (excluido)</label><input id="fto" type="date" className="input" value={f.to ?? ""} onChange={(e) => upd("to", e.target.value)} /></div>
      </div>
      <div className="field"><label htmlFor="fkind">Tipo de operación</label>
        <select id="fkind" className="input" value={f.kind ?? ""} onChange={(e) => upd("kind", e.target.value)}>
          <option value="">Todos</option>{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select></div>
      <div className="field"><label htmlFor="fcat">Categoría</label>
        <select id="fcat" className="input" value={f.categoryId ?? ""} onChange={(e) => upd("categoryId", e.target.value)}>
          <option value="">Todas</option>{cats.filter((c) => !c.parentId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></div>
      <div className="field"><label htmlFor="facc">Cuenta o tarjeta</label>
        <select id="facc" className="input" value={f.account ?? ""} onChange={(e) => upd("account", e.target.value)}>
          <option value="">Todas</option>{accounts.map((a) => <option key={a} value={a}>{a}</option>)}
        </select></div>
      <div className="grid2">
        <div className="field"><label htmlFor="fsrc">Origen</label>
          <select id="fsrc" className="input" value={f.source ?? ""} onChange={(e) => upd("source", e.target.value)}>
            <option value="">Todos</option>{Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>
        <div className="field"><label htmlFor="frev">Revisión</label>
          <select id="frev" className="input" value={f.revision ?? ""} onChange={(e) => upd("revision", e.target.value)}>
            <option value="">Todas</option><option value="pendiente">Por revisar</option><option value="revisado">Revisados</option>
          </select></div>
      </div>
      <button className="btn primary block" onClick={() => onApply(new URLSearchParams(f))}>Aplicar filtros</button>
      <button className="btn block" style={{ marginTop: 8 }} onClick={() => onApply(new URLSearchParams())}>Limpiar</button>
    </div>
  );
}

export default function MovementsPage() { return <Suspense><MovementsInner /></Suspense>; }
