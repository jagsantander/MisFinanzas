"use client";
import Link from "next/link";
import { useState } from "react";
import { useApi, withBase } from "@/lib/client";
import { useMe } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { Empty, ErrorState, Loading, Money, Notice, LEVEL, pctText } from "@/components/ui";
import { PeriodPicker, shiftKey } from "@/components/PeriodPicker";
import { CategoryRows, type CatRow } from "@/components/CategoryRows";
import { MovementItem, type Cat, type Mv } from "@/components/MovementItem";

type Dash = {
  period: { key: string; start: string; end: string; label: string }; daysRemaining: number;
  totals: { income: string; expense: string; balance: string; otherCurrencies: Record<string, { income: string; expense: string }> };
  expenseCategories: CatRow[]; incomeCategories: CatRow[]; uncategorizedExpense: string;
  totalBudget: { limit: string; spent: string; pctTenths: number; level: string } | null;
  alerts: { budgetId: string; categoryId: string | null; subcategoryId: string | null; scope: string; level: string; pctTenths: number }[];
  latest: Mv[]; reviewCount: number; currency: string; name: string;
  automation: { status: string; mode?: string; nextRunAt: string | null; lastRun: any; pausedReason: string | null } | null;
};

export default function Home() {
  const { me } = useMe();
  const [period, setPeriod] = useState<string | null>(null);
  const [tab, setTab] = useState<"expense" | "income">("expense");
  const { data, error, loading, reload } = useApi<Dash>(`/api/dashboard${period ? `?period=${period}` : ""}`);
  const cats = useApi<{ categories: Cat[] }>("/api/categories");
  const cur = data?.currency ?? "CLP";
  const pq = data ? `from=${data.period.start}&to=${data.period.end}` : "";
  const nameOf = (id: string | null) => cats.data?.categories.find((c) => c.id === id)?.name ?? "";

  return (
    <main className="page">
      <div className="topbar">
        <div className="brand"><img src={withBase("/icons/icon-192.png")} alt="" width={40} height={40} style={{ borderRadius: 11 }} /><span>Mi<b>Saldo</b></span></div>
        <Link href="/notificaciones" className="btn ghost sm" aria-label={`Notificaciones${me?.unread ? `, ${me.unread} sin leer` : ""}`} style={{ position: "relative" }}>
          <Icon name="bell" size={26} />
          {me?.unread ? <span style={{ position: "absolute", top: 6, right: 10, width: 10, height: 10, borderRadius: 5, background: "var(--expense-icon)" }} /> : null}
        </Link>
      </div>
      <div className="row between" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <h1 className="title">Hola, {(me?.user.name ?? "").split(" ")[0]}</h1>
          <p className="subtitle" style={{ margin: 0 }}>Tu dinero, en orden</p>
        </div>
        {data && <PeriodPicker label={data.period.label} onPrev={() => setPeriod(shiftKey(data.period.key, -1))} onNext={() => setPeriod(shiftKey(data.period.key, 1))} />}
      </div>

      <div style={{ marginTop: 16 }}>
        {loading && !data ? <Loading rows={3} height={110} /> : error ? <ErrorState error={error} retry={reload} /> : data && (
          <div className="stack">
            <Link href="/resumen" className="hero" aria-label="Saldo del mes: ver resumen" style={{ display: "block", color: "inherit", textDecoration: "none" }}>
              <div style={{ fontWeight: 650 }}>Saldo del mes</div>
              <div className="big tabular"><Money minor={data.totals.balance} currency={cur} className="" /></div>
              <div className="muted small">Ingresos menos gastos del período. No es el saldo de tu cuenta bancaria.</div>
              <div className="small" style={{ fontWeight: 700, marginTop: 6 }}>Ver resumen con gráfico <Icon name="chevronRight" size={14} /></div>
              <svg viewBox="0 0 120 40" width="110" style={{ position: "absolute", right: 14, top: 12, opacity: .6 }} aria-hidden><path d="M2 34 C 20 20, 30 30, 45 26 S 70 12, 85 18 S 105 6, 118 4" fill="none" stroke="#bff1e8" strokeWidth="2.5" strokeLinecap="round" /><circle cx="118" cy="4" r="3.5" fill="#fff" /></svg>
            </Link>
            <div className="grid2">
              <div className="card pad row" style={{ gap: 10 }}>
                <span className="ico" style={{ background: "var(--income-soft)", color: "var(--income)" }}><Icon name="down" /></span>
                <div className="grow"><div className="small muted">Ingresos</div><Money minor={data.totals.income} currency={cur} className="income" /></div>
              </div>
              <div className="card pad row" style={{ gap: 10 }}>
                <span className="ico" style={{ background: "var(--expense-soft)", color: "var(--expense-icon)" }}><Icon name="up" /></span>
                <div className="grow"><div className="small muted">Gastos</div><Money minor={data.totals.expense} currency={cur} className="expense" /></div>
              </div>
            </div>
            <div className="small muted">Montos en {cur}. Transferencias propias y pagos de tarjeta no se suman.
              {Object.keys(data.totals.otherCurrencies).length > 0 && <> Además hay movimientos en {Object.keys(data.totals.otherCurrencies).join(", ")} que no se convierten ni se suman.</>}
            </div>

            {data.reviewCount > 0 && (
              <Link href="/movimientos?revision=pendiente" className="notice warn" style={{ color: "var(--text)" }}>
                <Icon name="alert" /><div className="grow"><strong>{data.reviewCount} movimientos por revisar</strong><p className="small">Revisa los movimientos dudosos que llegaron solos.</p></div><Icon name="chevronRight" />
              </Link>
            )}

            {data.alerts.length > 0 && (
              <section aria-label="Presupuestos que requieren atención" className="card pad">
                <div className="row between" style={{ marginBottom: 8 }}><strong>Presupuestos</strong><Link href="/categorias?vista=presupuestos" className="small">Ver todos</Link></div>
                {data.alerts.slice(0, 4).map((a) => (
                  <div key={a.budgetId} className="row between small" style={{ padding: "6px 0" }}>
                    <span className="ellipsis">{a.scope === "total" ? "Gasto total" : a.subcategoryId ? `${nameOf(a.categoryId)} › ${nameOf(a.subcategoryId)}` : nameOf(a.categoryId)}</span>
                    <span className={`badge ${LEVEL[a.level].tone}`}><Icon name={LEVEL[a.level].icon} size={12} /> {LEVEL[a.level].label} · {pctText(a.pctTenths)}</span>
                  </div>
                ))}
              </section>
            )}

            <div className="segmented" role="tablist" aria-label="Tipo de distribución" style={{ marginTop: 4 }}>
              <button role="tab" aria-selected={tab === "expense"} onClick={() => setTab("expense")}>Gastos</button>
              <button role="tab" aria-selected={tab === "income"} onClick={() => setTab("income")}>Ingresos</button>
            </div>
            <h2 className="section" style={{ marginTop: 8 }}>{tab === "expense" ? "Gastos por categoría" : "Ingresos por categoría"} <Link href="/categorias" className="small">Ver todo <Icon name="chevronRight" size={14} /></Link></h2>
            {tab === "expense" && data.totalBudget && data.totalBudget.limit !== "0" && (
              <div className="small muted">Presupuesto total: <Money minor={data.totalBudget.spent} currency={cur} className="" /> de <Money minor={data.totalBudget.limit} currency={cur} className="" /> · {pctText(data.totalBudget.pctTenths)} · {data.daysRemaining} días restantes</div>
            )}
            {(() => {
              const rows = tab === "expense" ? data.expenseCategories : data.incomeCategories;
              const total = BigInt(tab === "expense" ? data.totals.expense : data.totals.income);
              const has = rows.some((r) => BigInt(r.amount) !== 0n || r.budget?.active);
              return has ? <CategoryRows rows={rows} currency={cur} total={total} periodQuery={pq} kind={tab} />
                : <Empty icon="pie" title={tab === "expense" ? "Sin gastos este mes" : "Sin ingresos este mes"}><p>Agrega un movimiento para verlo aquí.</p></Empty>;
            })()}
            {tab === "expense" && BigInt(data.uncategorizedExpense) > 0n && <Notice><p className="small">Hay <Money minor={data.uncategorizedExpense} currency={cur} className="" /> en gastos sin categoría. <Link href={`/movimientos?type=gastos&${pq}`}>Clasificar</Link></p></Notice>}

            <h2 className="section">Últimos movimientos <Link href="/movimientos" className="small">Ver todos</Link></h2>
            {data.latest.length ? <div className="list">{data.latest.map((m) => <MovementItem key={m.id} m={m} cats={cats.data?.categories ?? []} />)}</div>
              : <Empty icon="list" title="Aún no hay movimientos"><p>Registra uno con el botón «Agregar movimiento».</p></Empty>}
          </div>
        )}
      </div>
      <div style={{ height: 16 }} />
      <Link href="/movimientos/nuevo" className="btn primary block fab"><Icon name="plus" /> Agregar movimiento</Link>
    </main>
  );
}
