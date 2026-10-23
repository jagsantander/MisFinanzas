"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, ApiError, useApi } from "@/lib/client";
import { Icon } from "@/components/Icon";
import { BudgetBar, CatIcon, Donut, Empty, ErrorState, LEVEL, Loading, Money, Notice, pctText, Sheet, Switch, useToast } from "@/components/ui";
import { PeriodPicker, shiftKey } from "@/components/PeriodPicker";
import type { CatRow } from "@/components/CategoryRows";
import { useMe } from "@/components/AppShell";
import { formatMoney, minorToDecimalString, parseAmount } from "@/lib/money";

type Status = { budgetId: string; scope: string; categoryId: string | null; subcategoryId: string | null; limit: string; spent: string; available: string; excess: string; pctTenths: number; level: string; isOverride: boolean; active: boolean };
type Dash = { period: { key: string; label: string; start: string; end: string }; daysRemaining: number; totals: { income: string; expense: string }; previousTotals: { income: string; expense: string }; expenseCategories: CatRow[]; incomeCategories: CatRow[]; currency: string };

function CategoriesInner() {
  const sp = useSearchParams();
  const { me } = useMe();
  const [view, setView] = useState<"dist" | "budgets">(sp.get("vista") === "presupuestos" ? "budgets" : "dist");
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [period, setPeriod] = useState<string | null>(null);
  const dash = useApi<Dash>(`/api/dashboard${period ? `?period=${period}` : ""}`);
  const budgets = useApi<{ statuses: Status[]; daysRemaining: number; period: { key: string } }>(`/api/budgets${period ? `?period=${period}` : ""}`);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<null | { scope: "total" | "category" | "subcategory"; categoryId: string | null; subcategoryId: string | null; name: string; status: Status | null }>(null);
  const cur = me?.user.currency ?? "CLP";
  const d = dash.data;
  const rows = d ? (kind === "expense" ? d.expenseCategories : d.incomeCategories) : [];
  const total = d ? BigInt(kind === "expense" ? d.totals.expense : d.totals.income) : 0n;
  const prevTotal = d ? BigInt(kind === "expense" ? d.previousTotals.expense : d.previousTotals.income) : 0n;
  const withAmount = rows.filter((r) => BigInt(r.amount) > 0n).sort((a, b) => Number(BigInt(b.amount) - BigInt(a.amount)));
  const reloadAll = () => { dash.reload(); budgets.reload(); };
  const statusFor = (scope: string, id: string | null) => budgets.data?.statuses.find((s) => (scope === "total" ? s.scope === "total" : scope === "category" ? s.scope === "category" && s.categoryId === id : s.subcategoryId === id)) ?? null;

  return (
    <main className="page">
      <div className="topbar"><div className="brand"><span>Mis<b>Finanzas</b></span></div><Link href="/notificaciones" className="btn ghost sm" aria-label="Notificaciones"><Icon name="bell" size={24} /></Link></div>
      <h1 className="title">Categorías</h1>
      <p className="subtitle">Organiza cada peso</p>
      <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
        <div className="segmented grow" role="tablist" aria-label="Tipo" style={{ minWidth: 240 }}>
          <button role="tab" aria-selected={kind === "expense"} onClick={() => setKind("expense")}>Gastos</button>
          <button role="tab" aria-selected={kind === "income"} onClick={() => { setKind("income"); setView("dist"); }}>Ingresos</button>
        </div>
        {d && <PeriodPicker label={d.period.label} onPrev={() => setPeriod(shiftKey(d.period.key, -1))} onNext={() => setPeriod(shiftKey(d.period.key, 1))} />}
      </div>
      {kind === "expense" && (
        <div className="chips" role="tablist" aria-label="Vista" style={{ marginTop: 12 }}>
          <button className="chip" role="tab" aria-pressed={view === "dist"} aria-selected={view === "dist"} onClick={() => setView("dist")}>Distribución</button>
          <button className="chip" role="tab" aria-pressed={view === "budgets"} aria-selected={view === "budgets"} onClick={() => setView("budgets")}>Presupuestos</button>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        {dash.loading && !d ? <Loading rows={3} height={120} /> : dash.error ? <ErrorState error={dash.error} retry={dash.reload} /> : d && view === "dist" && (
          <div className="stack">
            <section className="card pad">
              <div className="muted">Total de {kind === "expense" ? "gastos" : "ingresos"}</div>
              <div style={{ fontSize: 34, fontWeight: 800 }}><Money minor={total} currency={cur} className="" /></div>
              {prevTotal > 0n && <div className="small muted">Mes anterior: <Money minor={prevTotal} currency={cur} className="" /> ({total >= prevTotal ? "+" : "−"}{pctText(Number(((total >= prevTotal ? total - prevTotal : prevTotal - total) * 1000n) / prevTotal))})</div>}
              {withAmount.length ? (
                <div className="row" style={{ flexWrap: "wrap", gap: 16, marginTop: 12 }}>
                  <Donut label={`Distribución de ${kind === "expense" ? "gastos" : "ingresos"} por categoría`} parts={withAmount.map((r) => ({ value: Number(r.amount), color: r.color, name: r.name }))}
                    center={<div><div style={{ fontSize: 30, fontWeight: 800 }}>{withAmount.length}</div><div className="small muted">categorías</div></div>} />
                  <ul className="grow" style={{ listStyle: "none", padding: 0, margin: 0, minWidth: 220 }}>
                    {withAmount.map((r) => (
                      <li key={r.id} className="row small" style={{ padding: "5px 0", gap: 8 }}>
                        <span className="dot" style={{ background: r.color, width: 14, height: 14 }} />
                        <span className="grow ellipsis">{r.name}</span>
                        <Money minor={r.amount} currency={cur} className="" />
                        <span className="muted tabular" style={{ width: 52, textAlign: "right" }}>{pctText(Number((BigInt(r.amount) * 1000n) / total))}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : <Empty icon="pie" title="Sin movimientos en este período" />}
            </section>
            <h2 className="section">Tus categorías <Link href="/categorias/gestionar" className="small"><Icon name="pencil" size={16} /> Editar</Link></h2>
            <div className="stack" style={{ gap: 10 }}>
              {rows.filter((r) => !("archived" in r) || !(r as CatRow & { archived: boolean }).archived).map((r) => {
                const isOpen = open === r.id;
                const amt = BigInt(r.amount), prev = BigInt(r.previous);
                return (
                  <div key={r.id} className="card">
                    <button className="item" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : r.id)}>
                      <CatIcon icon={r.icon} color={r.color} />
                      <span className="t grow ellipsis">{r.name}</span>
                      <div className="right"><Money minor={amt} currency={cur} className="" /><div className="small muted">{total > 0n ? pctText(Number((amt * 1000n) / total)) : "0,0%"}</div></div>
                      <Icon name={isOpen ? "chevronDown" : "chevronRight"} />
                    </button>
                    {isOpen && (
                      <div style={{ margin: "0 12px 12px", background: "var(--surface-2)", borderRadius: 12 }}>
                        {r.subs.map((s, i) => <div key={s.id} className="row between" style={{ padding: "11px 14px", borderTop: i ? "1px solid var(--border)" : 0 }}><span>{s.name}</span><Money minor={s.amount} currency={cur} className="" /></div>)}
                        <div className="row between small" style={{ padding: "11px 14px", borderTop: "1px solid var(--border)" }}>
                          <span className="muted">Mes anterior: {formatMoney(prev, cur)}</span>
                          <Link href={`/movimientos?categoryId=${r.id}&from=${d.period.start}&to=${d.period.end}`}>Ver movimientos</Link>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <Link href="/categorias/gestionar" className="btn block" style={{ borderStyle: "dashed", borderColor: "var(--primary)", color: "var(--primary)" }}><Icon name="plus" /> Crear categoría</Link>
          </div>
        )}

        {d && view === "budgets" && (budgets.loading && !budgets.data ? <Loading /> : budgets.error ? <ErrorState error={budgets.error} retry={budgets.reload} /> : (
          <div className="stack">
            <Notice><p className="small">Los límites son informativos: no bloquean compras ni operaciones bancarias. Se recalculan con cada cambio y al sincronizar. {budgets.data!.daysRemaining} días restantes en el período.</p></Notice>
            <BudgetCard name="Gasto total del mes" icon="wallet" color="#0f7d70" status={statusFor("total", null)} spent={BigInt(d.totals.expense)} cur={cur} onEdit={() => setEditing({ scope: "total", categoryId: null, subcategoryId: null, name: "Gasto total", status: statusFor("total", null) })} />
            {d.expenseCategories.map((r) => (
              <div key={r.id}>
                <BudgetCard name={r.name} icon={r.icon} color={r.color} status={statusFor("category", r.id)} spent={BigInt(r.amount)} cur={cur} onEdit={() => setEditing({ scope: "category", categoryId: r.id, subcategoryId: null, name: r.name, status: statusFor("category", r.id) })}
                  subs={r.subs.map((s) => ({ id: s.id, name: s.name, spent: BigInt(s.amount), status: statusFor("subcategory", s.id), onEdit: () => setEditing({ scope: "subcategory", categoryId: r.id, subcategoryId: s.id, name: `${r.name} › ${s.name}`, status: statusFor("subcategory", s.id) }) }))} />
              </div>
            ))}
          </div>
        ))}
      </div>
      {editing && <BudgetSheet target={editing} periodKey={budgets.data?.period.key ?? d?.period.key ?? ""} cur={cur} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reloadAll(); }} />}
    </main>
  );
}

function BudgetCard({ name, icon, color, status, spent, cur, onEdit, subs }: { name: string; icon: string; color: string; status: Status | null; spent: bigint; cur: string; onEdit: () => void; subs?: { id: string; name: string; spent: bigint; status: Status | null; onEdit: () => void }[] }) {
  const s = status?.active ? status : null;
  const lv = s ? LEVEL[s.level] : null;
  const subWith = subs?.filter((x) => x.status?.active) ?? [];
  return (
    <div className="card pad">
      <div className="row">
        <CatIcon icon={icon} color={color} />
        <div className="grow">
          <div className="row between"><strong className="ellipsis">{name}</strong><button className="link-btn" style={{ whiteSpace: "nowrap", flex: "none" }} onClick={onEdit}>{s ? "Editar" : "Fijar límite"}</button></div>
          {s ? (
            <div className="small"><Money minor={s.spent} currency={cur} className="" /> de <Money minor={s.limit} currency={cur} className="" /> · {pctText(s.pctTenths)} utilizado{s.isOverride ? " · excepción de este mes" : ""}</div>
          ) : <div className="small muted">Sin límite configurado · gastado {formatMoney(spent < 0n ? 0n : spent, cur)}</div>}
        </div>
      </div>
      {s && (
        <div style={{ marginTop: 10 }}>
          <BudgetBar pctTenths={s.pctTenths} level={s.level} />
          <div className="row between small" style={{ marginTop: 6 }}>
            <span className={`badge ${lv!.tone}`}><Icon name={lv!.icon} size={12} /> {lv!.label}</span>
            {BigInt(s.excess) > 0n ? <span className="expense" style={{ fontWeight: 700 }}>Excedido en {formatMoney(BigInt(s.excess), cur)}</span> : <span className="muted">Disponible {formatMoney(BigInt(s.available), cur)}</span>}
          </div>
        </div>
      )}
      {subs && subs.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary className="small">Límites por subcategoría{subWith.length ? ` (${subWith.length})` : ""}</summary>
          {subs.map((x) => (
            <div key={x.id} className="row between small" style={{ padding: "8px 0", borderTop: "1px solid var(--border)" }}>
              <span className="grow ellipsis">{x.name}</span>
              {x.status?.active ? <span className={`badge ${LEVEL[x.status.level].tone}`}>{formatMoney(BigInt(x.status.spent), cur)} de {formatMoney(BigInt(x.status.limit), cur)}</span> : <span className="muted">{formatMoney(x.spent < 0n ? 0n : x.spent, cur)} · sin límite</span>}
              <button className="link-btn" onClick={x.onEdit}>{x.status ? "Editar" : "Fijar"}</button>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

function BudgetSheet({ target, periodKey, cur, onClose, onSaved }: { target: { scope: "total" | "category" | "subcategory"; categoryId: string | null; subcategoryId: string | null; name: string; status: Status | null }; periodKey: string; cur: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const s = target.status;
  const [amount, setAmount] = useState(s ? minorToDecimalString(BigInt(s.limit), cur) : "");
  const [active, setActive] = useState(s?.active ?? true);
  const [overrideOnly, setOverrideOnly] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const parsed = amount ? parseAmount(amount, cur) : null;
  async function save() {
    setErr(null);
    try {
      if (overrideOnly && s) await api(`/api/budgets/${s.budgetId}/override`, { method: "PUT", body: { periodKey, amount } });
      else {
        await api("/api/budgets", { method: "PUT", body: { scope: target.scope, categoryId: target.categoryId, subcategoryId: target.subcategoryId, amount, active } });
      }
      toast({ text: "Presupuesto guardado" }); onSaved();
    } catch (e) { setErr((e as ApiError).message); }
  }
  return (
    <Sheet open onClose={onClose} title={`Presupuesto · ${target.name}`}>
      <div className="field"><label htmlFor="bamt">Límite mensual ({cur})</label>
        <input id="bamt" className="input money" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="$0" />
        <span className="hint" style={{ textAlign: "center" }}>{parsed ? formatMoney(parsed, cur) : "Se renueva automáticamente cada período."}</span></div>
      {s && <label className="check"><input type="checkbox" checked={overrideOnly} onChange={(e) => setOverrideOnly(e.target.checked)} /><span>Aplicar solo a este mes (excepción). Los demás meses mantienen el límite habitual.</span></label>}
      {!overrideOnly && <div className="row between" style={{ padding: "10px 0" }}><span>Presupuesto activo</span><Switch checked={active} onChange={setActive} label="Presupuesto activo" /></div>}
      {err && <Notice tone="danger"><p>{err}</p></Notice>}
      <button className="btn primary block" disabled={!parsed} onClick={save}>Guardar</button>
      {s?.isOverride && <button className="btn block" style={{ marginTop: 8 }} onClick={async () => { await api(`/api/budgets/${s.budgetId}/override`, { method: "PUT", body: { periodKey, amount: null } }); onSaved(); }}>Quitar excepción de este mes</button>}
      {s && <button className="btn danger block" style={{ marginTop: 8 }} onClick={async () => { await api(`/api/budgets/${s.budgetId}`, { method: "DELETE" }); toast({ text: "Presupuesto eliminado" }); onSaved(); }}>Eliminar presupuesto</button>}
    </Sheet>
  );
}

export default function CategoriesPage() { return <Suspense><CategoriesInner /></Suspense>; }
