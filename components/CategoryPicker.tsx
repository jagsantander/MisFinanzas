"use client";
import type { Cat } from "./MovementItem";

export function CategoryPicker({ cats, kind, categoryId, subcategoryId, onChange }: { cats: Cat[]; kind: "expense" | "income"; categoryId: string | null; subcategoryId: string | null; onChange: (c: string | null, s: string | null) => void }) {
  const parents = cats.filter((c) => !c.parentId && c.kind === kind && (!c.archivedAt || c.id === categoryId));
  const subs = categoryId ? cats.filter((c) => c.parentId === categoryId && (!c.archivedAt || c.id === subcategoryId)) : [];
  return (
    <div className="grid2">
      <div className="field">
        <label htmlFor="cat">Categoría</label>
        <select id="cat" className="input" value={categoryId ?? ""} onChange={(e) => onChange(e.target.value || null, null)}>
          <option value="">Sin categoría</option>
          {parents.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="sub">Subcategoría</label>
        <select id="sub" className="input" value={subcategoryId ?? ""} disabled={!subs.length} onChange={(e) => onChange(categoryId, e.target.value || null)}>
          <option value="">{subs.length ? "Ninguna" : "—"}</option>
          {subs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
    </div>
  );
}
