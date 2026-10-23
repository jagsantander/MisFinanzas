import { and, eq, isNull } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { DEFAULT_EXPENSE, DEFAULT_INCOME } from "./defaults";

export async function seedDefaultCategories(db: DB, userId: string) {
  const existing = await db.select({ id: schema.categories.id }).from(schema.categories).where(eq(schema.categories.userId, userId)).limit(1);
  if (existing.length) return;
  let order = 0;
  for (const [kind, list] of [["expense", DEFAULT_EXPENSE], ["income", DEFAULT_INCOME]] as const) {
    for (const c of list) {
      const [parent] = await db.insert(schema.categories).values({ userId, kind, name: c.name, icon: c.icon, color: c.color, sortOrder: order++ }).returning();
      if (c.subs?.length) {
        await db.insert(schema.categories).values(c.subs.map((s, i) => ({ userId, kind, parentId: parent.id, name: s, icon: c.icon, color: c.color, sortOrder: i })));
      }
    }
  }
}

/** Verifica que la categoría/subcategoría pertenezcan al usuario y sean coherentes. */
export async function assertCategoryPair(db: DB, userId: string, categoryId: string | null, subcategoryId: string | null) {
  if (!categoryId) {
    if (subcategoryId) throw new Error("Subcategoría sin categoría");
    return null;
  }
  const cats = await db.select().from(schema.categories).where(and(eq(schema.categories.userId, userId)));
  const cat = cats.find((c) => c.id === categoryId && !c.parentId);
  if (!cat) throw new Error("Categoría no encontrada");
  if (subcategoryId) {
    const sub = cats.find((c) => c.id === subcategoryId && c.parentId === categoryId);
    if (!sub) throw new Error("Subcategoría no corresponde a la categoría");
  }
  return cat;
}

export async function listCategories(db: DB, userId: string, includeArchived = false) {
  const where = includeArchived ? eq(schema.categories.userId, userId)
    : and(eq(schema.categories.userId, userId), isNull(schema.categories.archivedAt));
  return db.select().from(schema.categories).where(where).orderBy(schema.categories.sortOrder);
}
