"use client";
import Link from "next/link";
import { useState } from "react";
import { BudgetBar, CatIcon, LEVEL, Money, pctText } from "./ui";
import { Icon } from "./Icon";

export type CatRow = {
  id: string; name: string; icon: string; color: string; amount: string; previous: string;
  budget: { limit: string; spent: string; pctTenths: number; level: string; excess: string; available: string; active: boolean } | null;
  subs: { id: string; name: string; amount: string; budget: CatRow["budget"] }[];
};

/** Lista de categorías con barra (proporción o presupuesto) y desglose expandible por subcategoría. */
export function CategoryRows({ rows, currency, total, periodQuery, kind }: { rows: CatRow[]; currency: string; total: bigint; periodQuery: string; kind: "expense" | "income" }) {
  const [open, setOpen] = useState<string | null>(null);
  const visible = rows.filter((r) => BigInt(r.amount) !== 0n || (r.budget && r.budget.active)).sort((a, b) => Number(BigInt(b.amount) - BigInt(a.amount)));
  if (!visible.length) return null;
  return (
    <div className="stack" style={{ gap: 10 }}>
      {visible.map((r) => {
        const amt = BigInt(r.amount);
        const b = r.budget?.active ? r.budget : null;
        const pct = b ? b.pctTenths : total > 0n ? Number((amt * 1000n) / total) : 0;
        const subs = r.subs.filter((s) => BigInt(s.amount) !== 0n);
        const isOpen = open === r.id;
        const lv = b ? LEVEL[b.level] : null;
        return (
          <div key={r.id} className="card" style={b && b.level !== "ok" ? { background: `var(--${b.level === "near" ? "warning" : "danger"}-soft)` } : undefined}>
            <button className="item" aria-expanded={subs.length ? isOpen : undefined} onClick={() => subs.length && setOpen(isOpen ? null : r.id)} style={{ borderRadius: "var(--radius)" }}>
              <CatIcon icon={r.icon} color={r.color} />
              <div className="grow">
                <div className="row between"><span className="t ellipsis">{r.name}</span><Money minor={amt} currency={currency} /></div>
                <div style={{ marginTop: 8 }}>
                  {b ? <BudgetBar pctTenths={b.pctTenths} level={b.level} /> : <div className="bar"><i style={{ width: `${Math.min(pct / 10, 100)}%`, background: r.color }} /></div>}
                </div>
                <div className="row between small" style={{ marginTop: 6 }}>
                  {b ? <span className={`badge ${lv!.tone}`}><Icon name={lv!.icon} size={12} /> {pctText(b.pctTenths)} de <Money minor={b.limit} currency={currency} className="" /></span>
                    : <span className="muted">{kind === "expense" ? "Sin límite configurado" : `${pctText(pct)} del total`}</span>}
                  {b && BigInt(b.excess) > 0n && <span className="expense" style={{ fontWeight: 700 }}>Excedido en <Money minor={b.excess} currency={currency} /></span>}
                </div>
              </div>
              {subs.length > 0 && <Icon name={isOpen ? "chevronDown" : "chevronRight"} />}
            </button>
            {isOpen && (
              <div style={{ margin: "0 12px 12px", background: "var(--surface-2)", borderRadius: 12 }}>
                {subs.map((s, i) => (
                  <Link key={s.id} href={`/movimientos?subcategoryId=${s.id}&${periodQuery}`} className="row between" style={{ padding: "12px 14px", color: "var(--text)", borderTop: i ? "1px solid var(--border)" : 0 }}>
                    <span>{s.name}</span><Money minor={s.amount} currency={currency} className="" />
                  </Link>
                ))}
                <Link href={`/movimientos?categoryId=${r.id}&${periodQuery}`} className="row" style={{ padding: "10px 14px", borderTop: "1px solid var(--border)", fontWeight: 650 }}>Ver movimientos <Icon name="chevronRight" size={16} /></Link>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
