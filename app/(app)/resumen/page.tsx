"use client";
import { useState } from "react";
import { useApi } from "@/lib/client";
import { BackLink } from "@/components/BackLink";
import { Empty, ErrorState, Loading, Money, pctText } from "@/components/ui";
import { PeriodPicker, shiftKey } from "@/components/PeriodPicker";
import type { CatRow } from "@/components/CategoryRows";

type Dash = {
  period: { key: string; label: string };
  totals: { income: string; expense: string; balance: string };
  expenseCategories: CatRow[]; uncategorizedExpense: string; currency: string;
};
type Slice = { name: string; value: bigint; color: string };
// El saldo va con rayas para no confundirse con ninguna categoría (hay categorías de muchos colores, incluidos verdes).
const SALDO = "url(#saldo-rayas)";
const SALDO_CSS = "repeating-linear-gradient(45deg, var(--income) 0 3px, var(--surface) 3px 6px)";

/** Torta llena (no anillo): cada porción es un trozo del círculo. */
function Pie({ slices, label }: { slices: Slice[]; label: string }) {
  const total = slices.reduce((a, s) => a + Number(s.value), 0);
  const R = 100, C = 110;
  let angle = -Math.PI / 2;
  return (
    <svg viewBox="0 0 220 220" width="220" height="220" role="img" aria-label={label} style={{ maxWidth: "100%", flex: "none" }}>
      <defs><pattern id="saldo-rayas" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="var(--surface)" /><rect width="4" height="8" fill="var(--income)" /></pattern></defs>
      {total > 0 && slices.length === 1 && <circle cx={C} cy={C} r={R} fill={slices[0].color} stroke="var(--income)" strokeWidth="2" />}
      {total > 0 && slices.length > 1 && slices.map((s) => {
        const a = (Number(s.value) / total) * Math.PI * 2;
        const x1 = C + R * Math.cos(angle), y1 = C + R * Math.sin(angle);
        angle += a;
        const x2 = C + R * Math.cos(angle), y2 = C + R * Math.sin(angle);
        return <path key={s.name} d={`M${C},${C} L${x1},${y1} A${R},${R} 0 ${a > Math.PI ? 1 : 0} 1 ${x2},${y2} Z`} fill={s.color} stroke="var(--surface)" strokeWidth="2" />;
      })}
    </svg>
  );
}

export default function Summary() {
  const [period, setPeriod] = useState<string | null>(null);
  const { data, error, loading, reload } = useApi<Dash>(`/api/dashboard${period ? `?period=${period}` : ""}`);
  const cur = data?.currency ?? "CLP";
  const income = data ? BigInt(data.totals.income) : 0n;
  const expense = data ? BigInt(data.totals.expense) : 0n;
  const balance = income - expense;
  // La torta reparte el ingreso: cuánto se fue a cada categoría de gasto y cuánto queda de saldo.
  // Si se gastó más de lo que ingresó, la base es el gasto total.
  const base = income > expense ? income : expense;
  const slices: Slice[] = data ? [
    ...data.expenseCategories.filter((r) => BigInt(r.amount) > 0n).map((r) => ({ name: r.name, value: BigInt(r.amount), color: r.color })).sort((a, b) => Number(b.value - a.value)),
    ...(BigInt(data.uncategorizedExpense) > 0n ? [{ name: "Sin categoría", value: BigInt(data.uncategorizedExpense), color: "#9aa3b2" }] : []),
    ...(balance > 0n ? [{ name: "Saldo (lo que te queda)", value: balance, color: SALDO }] : []),
  ] : [];
  const pct = (v: bigint) => (base > 0n ? pctText(Number((v * 1000n) / base)) : "0,0%");

  return (
    <main className="page">
      <BackLink href="/" label="Inicio" />
      <div className="row between" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
        <h1 className="title">Resumen</h1>
        {data && <PeriodPicker label={data.period.label} onPrev={() => setPeriod(shiftKey(data.period.key, -1))} onNext={() => setPeriod(shiftKey(data.period.key, 1))} />}
      </div>
      <div style={{ marginTop: 16 }}>
        {loading && !data ? <Loading rows={2} height={200} /> : error ? <ErrorState error={error} retry={reload} /> : data && (
          <div className="stack">
            <section className="card pad stack" style={{ gap: 8 }}>
              <div className="row between"><span>Ingresos</span><Money minor={income} currency={cur} className="income" /></div>
              <div className="row between"><span>Gastos</span><Money minor={expense} currency={cur} className="expense" sign="−" /></div>
              <div className="row between" style={{ borderTop: "1px solid var(--border)", paddingTop: 8, fontWeight: 750 }}><span>Saldo</span><Money minor={balance} currency={cur} className={balance < 0n ? "expense" : "income"} /></div>
              {income > 0n && <div className="small muted">Gastaste el {pctText(Number((expense * 1000n) / income))} de tus ingresos.</div>}
            </section>

            {slices.length ? (
              <section className="card pad">
                <h2 style={{ fontSize: 18, margin: "0 0 12px" }}>{income > expense ? "¿En qué se fue tu ingreso?" : "Tus gastos del mes"}</h2>
                <div className="row" style={{ flexWrap: "wrap", gap: 20, justifyContent: "center" }}>
                  <Pie slices={slices} label="Gráfico de torta: gasto por categoría y saldo" />
                  <ul className="grow" style={{ listStyle: "none", padding: 0, margin: 0, minWidth: 220 }}>
                    {slices.map((s) => (
                      <li key={s.name} className="row small" style={{ padding: "5px 0", gap: 8, fontWeight: s.name.startsWith("Saldo") ? 750 : undefined }}>
                        <span className="dot" style={{ background: s.color === SALDO ? SALDO_CSS : s.color, border: s.color === SALDO ? "1px solid var(--income)" : undefined, width: 14, height: 14, flex: "none" }} />
                        <span className="grow ellipsis">{s.name}</span>
                        <Money minor={s.value} currency={cur} className="" />
                        <span className="muted tabular" style={{ width: 52, textAlign: "right" }}>{pct(s.value)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                {balance < 0n && <p className="small expense" style={{ margin: "12px 0 0" }}>Este mes gastaste <Money minor={-balance} currency={cur} className="" /> más de lo que ingresó.</p>}
                <p className="small muted" style={{ margin: "8px 0 0" }}>Los porcentajes son sobre {income > expense ? "tus ingresos" : "el gasto total"} del mes.</p>
              </section>
            ) : <Empty icon="pie" title="Sin movimientos en este período"><p>Agrega ingresos y gastos para ver tu resumen.</p></Empty>}
          </div>
        )}
      </div>
    </main>
  );
}
