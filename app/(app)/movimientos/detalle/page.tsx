"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError, fmtDate, fmtDateTime, KIND_LABEL, movementTone, useApi, SOURCE_LABEL } from "@/lib/client";
import { CategoryPicker } from "@/components/CategoryPicker";
import { ConfirmSheet, ErrorState, Loading, Money, Notice, Sheet, useToast } from "@/components/ui";
import { Icon } from "@/components/Icon";
import type { Cat, Mv } from "@/components/MovementItem";
import { minorToDecimalString } from "@/lib/money";

type Detail = {
  movement: Mv & { receivedAt: string | null; sourceMessageId: string | null; confidence: number | null; operationRef: string | null; suggestedCategory: string | null; lockedFields: string[]; reviewedAt: string | null; possibleDuplicateOf: string | null; relatedMovementId: string | null; senderDomain: string | null };
  changes: { id: string; actor: string; action: string; changes: Record<string, { from: unknown; to: unknown }> | null; createdAt: string }[];
  sources: { messageId: string; receivedAt: string | null }[];
  connection: { provider: string; account: string } | null;
  rule: { id: string; name: string } | null;
  related: Mv | null;
  duplicateOf: Mv | null;
};
const CATEGORY_SOURCE_LABEL: Record<string, string> = { manual: "Corrección manual", rule: "Regla", ai: "Propuesta de IA", none: "Sin clasificar" };
const ACTOR: Record<string, string> = { user: "Tú", sync: "Sincronización", rule: "Regla", system: "Sistema" };
const ACTION: Record<string, string> = { created: "Creado", imported: "Importado desde correo", edit: "Editado", reviewed: "Marcado como revisado", deleted: "Eliminado", restored: "Restaurado", merged_into: "Fusionado en otro movimiento", merged_from: "Recibió un duplicado", category_reassigned: "Categoría reasignada" };

export default function MovementDetailPage() { return <Suspense><MovementDetail /></Suspense>; }

function MovementDetail() {
  const id = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<Detail>(`/api/movements/${id}`);
  const cats = useApi<{ categories: Cat[] }>("/api/categories");
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [cat, setCat] = useState<{ c: string | null; s: string | null }>({ c: null, s: null });
  const [reclass, setReclass] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const m = data?.movement;
  useEffect(() => {
    if (!m) return;
    setEdit({ amount: minorToDecimalString(BigInt(m.amountMinor), m.currency).replace(".", ","), occurredOn: m.occurredOn, occurredTime: m.occurredTime ?? "", description: m.description, merchant: m.merchant ?? "", accountMask: m.accountMask ?? "", notes: m.notes ?? "", kind: m.kind });
    setCat({ c: m.categoryId, s: m.subcategoryId });
  }, [m]);

  async function patch(body: Record<string, unknown>, msg: string) {
    setErr(null);
    try { await api(`/api/movements/${id}`, { method: "PATCH", body }); toast({ text: msg }); reload(); }
    catch (e) { setErr((e as ApiError).message); }
  }
  async function remove() {
    await api(`/api/movements/${id}`, { method: "DELETE" });
    setConfirmDelete(false);
    toast({ text: "Movimiento eliminado", action: { label: "Deshacer", run: async () => { await api(`/api/movements/${id}/restore`, { body: {} }); router.push(`/movimientos/detalle?id=${id}`); } } });
    router.push("/movimientos");
  }
  if (loading && !data) return <main className="page"><Loading rows={4} /></main>;
  if (error || !m) return <main className="page"><ErrorState error={error} retry={reload} /></main>;
  const tone = movementTone(m.kind);
  const catKind = m.kind === "income" ? "income" : "expense";
  const dirty = m.kind !== edit.kind || edit.description !== m.description || edit.occurredOn !== m.occurredOn || (edit.occurredTime || null) !== m.occurredTime || (edit.merchant || null) !== m.merchant || (edit.accountMask || null) !== m.accountMask || (edit.notes || null) !== m.notes || edit.amount !== minorToDecimalString(BigInt(m.amountMinor), m.currency).replace(".", ",");

  return (
    <main className="page">
      <button className="link-btn" onClick={() => router.back()}><Icon name="chevronLeft" size={18} /> Volver</button>
      <div className="card pad" style={{ textAlign: "center", marginTop: 8 }}>
        <div className="muted small">{KIND_LABEL[m.kind]} · {fmtDate(m.occurredOn, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
        <div style={{ fontSize: 34, margin: "6px 0" }}><Money minor={m.amountMinor} currency={m.currency} sign={tone.sign} className={tone.cls} /></div>
        <div style={{ fontWeight: 700 }}>{m.merchant || m.description}</div>
        <div className="row" style={{ justifyContent: "center", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {m.source === "email" ? <span className="badge info"><Icon name="mail" size={12} /> Importado</span> : m.source === "manual" ? <span className="badge">Manual</span> : <span className="badge info">{SOURCE_LABEL[m.source]}</span>}
          {m.status === "review" && <span className="badge warn">Por revisar</span>}
          {m.status === "pending" && <span className="badge info">Pendiente (no suma)</span>}
          {m.excluded && <span className="badge">Excluido de informes</span>}
          {m.deletedAt && <span className="badge danger">Eliminado</span>}
        </div>
      </div>

      {m.deletedAt && <div style={{ marginTop: 12 }}><Notice tone="warn"><p>Este movimiento está eliminado y no se volverá a importar.</p><button className="link-btn" onClick={async () => { await api(`/api/movements/${id}/restore`, { body: {} }); reload(); }}>Restaurar</button></Notice></div>}
      {m.status === "review" && m.reviewReason && !m.deletedAt && (
        <div style={{ marginTop: 12 }}><Notice tone="warn"><p><strong>Motivo de revisión:</strong> {m.reviewReason}</p>
          <div className="row" style={{ flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            <button className="btn sm primary" onClick={() => patch({ reviewed: true }, "Marcado como revisado")}><Icon name="check" size={16} /> Está correcto</button>
            {data!.duplicateOf && <button className="btn sm" onClick={async () => { await api(`/api/movements/${id}/merge`, { body: { intoId: data!.duplicateOf!.id } }); toast({ text: "Duplicado fusionado" }); router.push(`/movimientos/detalle?id=${data!.duplicateOf!.id}`); }}>Fusionar con el original</button>}
          </div>
        </Notice></div>
      )}
      {data!.duplicateOf && (
        <div className="card pad small" style={{ marginTop: 12 }}>Posible duplicado de <Link href={`/movimientos/detalle?id=${data!.duplicateOf.id}`}>{data!.duplicateOf.merchant || data!.duplicateOf.description} ({data!.duplicateOf.occurredOn})</Link>. No se elimina automáticamente.</div>
      )}
      {data!.related && <div className="card pad small" style={{ marginTop: 12 }}>Devolución relacionada con <Link href={`/movimientos/detalle?id=${data!.related.id}`}>{data!.related.merchant || data!.related.description} ({data!.related.occurredOn})</Link>. Se aplica en la fecha de la devolución.</div>}

      {!m.deletedAt && <>
        <h2 className="section">Clasificación</h2>
        <div className="card pad">
          {cats.data && (m.kind === "expense" || m.kind === "income" || m.kind === "refund" || m.kind === "reversal") ? (
            <>
              <CategoryPicker cats={cats.data.categories} kind={catKind} categoryId={cat.c} subcategoryId={cat.s} onChange={(c, s) => setCat({ c, s })} />
              <div className="small muted" style={{ marginBottom: 10 }}>Origen: {CATEGORY_SOURCE_LABEL[m.categorySource]}{data!.rule ? ` (“${data!.rule.name}”)` : ""}{m.suggestedCategory && m.categorySource !== "ai" ? ` · La IA sugirió: ${m.suggestedCategory}` : ""}</div>
              <button className="btn primary block" disabled={cat.c === m.categoryId && cat.s === m.subcategoryId} onClick={() => setReclass(true)}>Cambiar categoría…</button>
            </>
          ) : <p className="small muted">{KIND_LABEL[m.kind]}: no suma en ingresos, gastos ni presupuestos.</p>}
        </div>

        <h2 className="section">Detalle</h2>
        <form className="card pad" onSubmit={(e) => { e.preventDefault(); patch({ ...edit, occurredTime: edit.occurredTime || null, merchant: edit.merchant || null, accountMask: edit.accountMask || null, notes: edit.notes || null }, "Cambios guardados"); }}>
          <div className="field"><label htmlFor="k">Tipo de operación</label>
            <select id="k" className="input" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}>{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <span className="hint">Las transferencias propias y los pagos de tarjeta no inflan ingresos ni gastos.</span></div>
          <div className="grid2">
            <div className="field"><label htmlFor="a">Monto ({m.currency})</label><input id="a" className="input" inputMode="decimal" value={edit.amount ?? ""} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} /></div>
            <div className="field"><label htmlFor="d">Fecha</label><input id="d" type="date" className="input" value={edit.occurredOn ?? ""} onChange={(e) => setEdit({ ...edit, occurredOn: e.target.value })} /></div>
          </div>
          <div className="field"><label htmlFor="ds">Descripción</label><input id="ds" className="input" value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
          <div className="grid2">
            <div className="field"><label htmlFor="mr">Comercio</label><input id="mr" className="input" value={edit.merchant ?? ""} onChange={(e) => setEdit({ ...edit, merchant: e.target.value })} /></div>
            <div className="field"><label htmlFor="ac">Cuenta</label><input id="ac" className="input" value={edit.accountMask ?? ""} onChange={(e) => setEdit({ ...edit, accountMask: e.target.value })} /></div>
          </div>
          <div className="field"><label htmlFor="nt">Notas</label><textarea id="nt" className="input" value={edit.notes ?? ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></div>
          {err && <Notice tone="danger"><p>{err}</p></Notice>}
          <button className="btn primary block" disabled={!dirty}>Guardar cambios</button>
          {m.source !== "manual" && <p className="small muted" style={{ marginTop: 8 }}>Tus correcciones quedan protegidas: las sincronizaciones no las sobrescriben.</p>}
        </form>

        <div className="stack" style={{ marginTop: 12 }}>
          <button className="btn block" onClick={() => patch({ excluded: !m.excluded }, m.excluded ? "Incluido en informes" : "Excluido de informes")}>{m.excluded ? "Incluir en informes" : "Excluir de informes"}</button>
          <button className="btn danger block" onClick={() => setConfirmDelete(true)}><Icon name="trash" size={18} /> Eliminar</button>
        </div>
      </>}

      <h2 className="section">Origen</h2>
      <div className="card pad small stack" style={{ gap: 6 }}>
        <div>{m.source === "email" ? <>Importado desde {data!.connection ? `${data!.connection.provider === "gmail" ? "Gmail" : "Outlook"} (${data!.connection.account})` : "un correo"}{m.receivedAt ? ` · recibido ${fmtDateTime(m.receivedAt)}` : ""}</> : m.source === "manual" ? "Registrado manualmente" : ({ notification: "Leído de una notificación del teléfono", shared: "Compartido o pegado en MiSaldo", shortcut: "Enviado por un Atajo de iPhone", statement: "Importado de una cartola" } as Record<string, string>)[m.source]}{m.source === "notification" && m.senderDomain ? ` (${m.senderDomain})` : ""}</div>
        {m.source !== "manual" && m.source !== "email" && m.notes && <div className="muted">Texto original: «{m.notes}»</div>}
        {m.bank && <div>Banco: {m.bank}</div>}
        {m.operationRef && <div>Id de operación: {m.operationRef}</div>}
        {m.confidence != null && <div>Confianza de la extracción: {Math.round(m.confidence * 100)}%</div>}
        {data!.sources.length > 0 && <div>Referencias de correo: {data!.sources.map((s) => <code key={s.messageId} style={{ display: "block", wordBreak: "break-all" }}>{s.messageId}</code>)}</div>}
      </div>

      <h2 className="section">Registro de cambios</h2>
      <div className="list">
        {data!.changes.map((c) => (
          <div key={c.id} className="item" style={{ cursor: "default", alignItems: "flex-start" }}>
            <div className="grow small">
              <div><strong>{ACTION[c.action] ?? c.action}</strong> · {ACTOR[c.actor] ?? c.actor}</div>
              {c.changes && Object.entries(c.changes).filter(([k]) => k !== "categorySource").map(([k, v]) => <div key={k} className="muted">{k}: {String(v.from ?? "—")} → {String(v.to ?? "—")}</div>)}
            </div>
            <span className="small muted">{fmtDateTime(c.createdAt)}</span>
          </div>
        ))}
      </div>

      <ReclassifySheet open={reclass} onClose={() => setReclass(false)} movement={m} categoryId={cat.c} subcategoryId={cat.s} onDone={() => { setReclass(false); reload(); }} />
      <ConfirmSheet open={confirmDelete} onClose={() => setConfirmDelete(false)} danger title="¿Eliminar movimiento?" confirmLabel="Eliminar"
        body={<p>Podrás deshacerlo. Si vino de un correo, no se volverá a importar.</p>} onConfirm={remove} />
    </main>
  );
}

/** Reclasificación con alcance y vista previa antes de cambios masivos. */
function ReclassifySheet({ open, onClose, movement, categoryId, subcategoryId, onDone }: { open: boolean; onClose: () => void; movement: Detail["movement"]; categoryId: string | null; subcategoryId: string | null; onDone: () => void }) {
  const toast = useToast();
  const [scope, setScope] = useState<"only" | "similar" | "rule">("only");
  const [applyExisting, setApplyExisting] = useState(true);
  const [merchant, setMerchant] = useState(movement.merchant ?? "");
  const [preview, setPreview] = useState<{ count: number; skippedManual: number; preview: { id: string; occurredOn: string; description: string; merchant: string | null; amountMinor: string; currency: string }[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setPreview(null); }, [scope, merchant, applyExisting, open]);
  const payload = (dryRun: boolean) => ({
    movementId: movement.id, categoryId, subcategoryId, scope, applyToExisting: scope === "rule" ? applyExisting : false, dryRun,
    conditions: scope === "only" ? undefined : { merchantContains: merchant || undefined, kind: movement.kind === "income" ? "income" : "expense" },
  });
  async function run(dryRun: boolean) {
    if (!categoryId) { setErr("Elige una categoría"); return; }
    setBusy(true); setErr(null);
    try {
      const r = await api("/api/movements/bulk", { body: payload(dryRun) });
      if (dryRun) setPreview(r);
      else { toast({ text: `${r.updated} movimiento(s) actualizados${r.ruleId ? " · regla creada" : ""}` }); onDone(); }
    } catch (e) { setErr((e as ApiError).message); } finally { setBusy(false); }
  }
  const needsPreview = scope === "similar" || (scope === "rule" && applyExisting);
  return (
    <Sheet open={open} onClose={onClose} title="Cambiar categoría">
      <div className="stack">
        {([["only", "Aplicar solo a este movimiento"], ["similar", "Aplicar también a movimientos similares existentes"], ["rule", "Crear regla para futuros movimientos"]] as const).map(([v, l]) => (
          <label key={v} className="check"><input type="radio" name="scope" checked={scope === v} onChange={() => setScope(v)} /><span>{l}</span></label>
        ))}
        {scope !== "only" && (
          <div className="field"><label htmlFor="mc">Comercio contiene</label><input id="mc" className="input" value={merchant} onChange={(e) => setMerchant(e.target.value)} /><span className="hint">Las correcciones manuales previas de otros movimientos no se modifican.</span></div>
        )}
        {scope === "rule" && <label className="check"><input type="checkbox" checked={applyExisting} onChange={(e) => setApplyExisting(e.target.checked)} /><span>Aplicar también a los movimientos existentes que coincidan</span></label>}
        {err && <Notice tone="danger"><p>{err}</p></Notice>}
        {needsPreview && !preview && <button className="btn block" disabled={busy} onClick={() => run(true)}>Ver vista previa</button>}
        {preview && (
          <div className="card pad small">
            <strong>{preview.count} movimiento(s) cambiarán</strong>{preview.skippedManual ? ` · ${preview.skippedManual} con corrección manual se mantendrán` : ""}
            <ul style={{ paddingLeft: 18, maxHeight: 200, overflow: "auto" }}>{preview.preview.map((p) => <li key={p.id}>{p.occurredOn} · {p.merchant || p.description} · <Money minor={p.amountMinor} currency={p.currency} className="" /></li>)}</ul>
          </div>
        )}
        <button className="btn primary block" disabled={busy || (needsPreview && !preview)} onClick={() => run(false)}>Confirmar cambio</button>
      </div>
    </Sheet>
  );
}
