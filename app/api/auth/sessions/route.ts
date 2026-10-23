import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { json, requireUser, route } from "@/lib/http";
import { deviceLabel } from "@/lib/auth/webauthn";

export const GET = route(async () => {
  const { user, session } = await requireUser();
  const rows = await getDb().select().from(schema.sessions)
    .where(and(eq(schema.sessions.userId, user.id), isNull(schema.sessions.revokedAt), gt(schema.sessions.expiresAt, new Date())))
    .orderBy(desc(schema.sessions.lastSeenAt));
  return json({
    sessions: rows.map((s) => ({
      id: s.id, device: deviceLabel(s.userAgent), method: s.authMethod, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, current: s.id === session.id,
    })),
  });
});
