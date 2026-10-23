import { z } from "zod";
import { and, eq, isNull, max } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { body, json, requireUser, route, HttpError } from "@/lib/http";
import { listCategories } from "@/lib/categories/service";
import { CATEGORY_ICONS } from "@/lib/categories/defaults";

export const GET = route(async (req) => {
  const { user } = await requireUser();
  const rows = await listCategories(getDb(), user.id, req.nextUrl.searchParams.get("archived") === "1");
  return json({ categories: rows, icons: CATEGORY_ICONS });
});

export const POST = route(async (req) => {
  const { user } = await requireUser();
  const d = await body(req, z.object({
    name: z.string().trim().min(2).max(40), kind: z.enum(["expense", "income"]), parentId: z.uuid().nullable().default(null),
    icon: z.enum(CATEGORY_ICONS as [string, ...string[]]).default("dots"), color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#0f8a7e"),
  }));
  const db = getDb();
  if (d.parentId) {
    const [p] = await db.select().from(schema.categories).where(and(eq(schema.categories.id, d.parentId), eq(schema.categories.userId, user.id), isNull(schema.categories.parentId)));
    if (!p) throw new HttpError(400, "Categoría principal no encontrada");
    if (p.kind !== d.kind) throw new HttpError(400, "La subcategoría debe ser del mismo tipo");
  }
  const [{ o }] = await db.select({ o: max(schema.categories.sortOrder) }).from(schema.categories).where(eq(schema.categories.userId, user.id));
  const [c] = await db.insert(schema.categories).values({ userId: user.id, ...d, sortOrder: (o ?? 0) + 1 }).returning();
  return json({ ok: true, category: c }, 201);
});
