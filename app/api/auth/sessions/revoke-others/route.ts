import { json, requireUser, route } from "@/lib/http";
import { revokeOtherSessions } from "@/lib/auth/session";
import { audit } from "@/lib/audit";

export const POST = route(async () => {
  const { user, session } = await requireUser();
  const n = await revokeOtherSessions(user.id, session.id);
  await audit(user.id, "auth.sessions_revoked", { count: n });
  return json({ ok: true, revoked: n });
});
