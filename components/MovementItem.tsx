"use client";
import Link from "next/link";
import { CatIcon, Money } from "./ui";
import { Icon } from "./Icon";
import { KIND_LABEL, movementTone, SOURCE_LABEL } from "@/lib/client";

export type Mv = {
  id: string; kind: string; status: string; amountMinor: string; currency: string; occurredOn: string; occurredTime: string | null;
  description: string; merchant: string | null; counterparty: string | null; bank: string | null; accountMask: string | null; categoryId: string | null; subcategoryId: string | null;
  categorySource: string; source: string; excluded: boolean; reviewReason: string | null; notes: string | null; deletedAt: string | null;
};
export type Cat = { id: string; name: string; icon: string; color: string; parentId: string | null; kind: string; archivedAt: string | null };

export function MovementItem({ m, cats }: { m: Mv; cats: Cat[] }) {
  const cat = cats.find((c) => c.id === m.categoryId);
  const sub = cats.find((c) => c.id === m.subcategoryId);
  const tone = movementTone(m.kind);
  const icon = cat ? cat.icon : m.kind === "own_transfer" ? "swap" : m.kind === "card_payment" ? "creditCard" : m.kind === "income" ? "wallet" : "tag";
  const color = cat?.color ?? (m.kind === "income" || m.kind === "refund" ? "#11734f" : "#64708a");
  const subtitle = cat ? (sub ? `${cat.name} › ${sub.name}` : cat.name) : KIND_LABEL[m.kind];
  return (
    <Link href={`/movimientos/detalle?id=${m.id}`} className="item" style={{ color: "var(--text)", opacity: m.excluded ? 0.6 : 1 }}>
      <CatIcon icon={icon} color={color} />
      <div className="grow">
        <div className="t ellipsis">{m.merchant || m.description}</div>
        <div className="s ellipsis">
          {subtitle}
          {m.source === "email" && <> · <Icon name="mail" size={12} /> </>}
          {m.source !== "email" && m.source !== "manual" && <> · {SOURCE_LABEL[m.source]}</>}
        </div>
        <div className="row" style={{ gap: 6, marginTop: 4, flexWrap: "wrap" }}>
          {m.status === "review" && <span className="badge warn">Por revisar</span>}
          {m.status === "pending" && <span className="badge info">Pendiente</span>}
          {m.excluded && <span className="badge">Excluido</span>}
          {(m.kind === "own_transfer" || m.kind === "card_payment") && <span className="badge">No suma</span>}
        </div>
      </div>
      <div className="right">
        <Money minor={m.amountMinor} currency={m.currency} sign={tone.sign} className={tone.cls} />
        <div className="small muted">{m.occurredTime ?? ""}</div>
      </div>
    </Link>
  );
}
