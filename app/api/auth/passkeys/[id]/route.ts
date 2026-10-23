import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { json, requireUser, route, HttpError } from "@/lib/http";
import { audit } from "@/lib/audit";

export const DELETE = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const { user } = await requireUser();
  const { id } = await params;
  const res = await getDb().delete(schema.passkeys).where(and(eq(schema.passkeys.id, id), eq(schema.passkeys.userId, user.id))).returning();
  if (!res.length) throw new HttpError(404, "Passkey no encontrada");
  await audit(user.id, "passkey.removed");
  return json({ ok: true });
});
