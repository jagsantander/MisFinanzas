import { NextResponse, type NextRequest } from "next/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { appUrl } from "@/lib/http";
import { getCurrentSession } from "@/lib/auth/session";
import { CONNECTORS, encryptTokens } from "@/lib/mail";
import { syncAutomationStatus } from "@/lib/automation/service";
import { audit } from "@/lib/audit";
import { log, safeErrorMessage } from "@/lib/log";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const db = getDb();
  const back = (path: string, q: Record<string, string>) => NextResponse.redirect(`${appUrl()}${path}?${new URLSearchParams(q)}`);
  const state = p.get("state") ?? "";
  const [st] = await db.delete(schema.oauthStates).where(and(eq(schema.oauthStates.state, state), gt(schema.oauthStates.expiresAt, new Date()))).returning();
  if (!st) return back("/conexiones", { error: "La solicitud de autorización venció. Inténtalo de nuevo." });
  const cur = await getCurrentSession();
  if (!cur || cur.user.id !== st.userId) return back("/entrar", { error: "Inicia sesión con la misma cuenta para completar la conexión." });
  if (p.get("error")) return back(st.returnTo, { error: "No se otorgó el permiso. El correo no quedó conectado." });
  const connector = CONNECTORS[st.provider as "gmail" | "outlook"];
  try {
    const tokens = await connector.exchangeCode({ code: p.get("code") ?? "", codeVerifier: st.codeVerifier, redirectUri: `${appUrl()}/api/connections/mail/callback` });
    const granted = tokens.scope.split(" ");
    const missing = connector.scopes.filter((s) => s !== "offline_access" && !granted.some((g) => g.toLowerCase().endsWith(s.toLowerCase())));
    if (missing.length) return back(st.returnTo, { error: "No se concedió el permiso de lectura necesario." });
    const email = await connector.accountEmail(tokens.accessToken);
    await db.transaction(async (tx) => {
      // Una sola cuenta de correo conectada: la anterior se desconecta y se borran sus tokens.
      await tx.update(schema.mailConnections).set({ status: "disconnected", encryptedTokens: null, disconnectedAt: new Date() })
        .where(and(eq(schema.mailConnections.userId, st.userId), isNull(schema.mailConnections.disconnectedAt)));
      const [conn] = await tx.insert(schema.mailConnections).values({
        userId: st.userId, provider: st.provider, accountEmail: email, scopes: tokens.scope, status: "active",
        financialReadConsentAt: new Date(), accessTokenExpiresAt: tokens.expiresAt,
      }).returning();
      await tx.update(schema.mailConnections).set({ encryptedTokens: encryptTokens(st.userId, conn.id, tokens) }).where(eq(schema.mailConnections.id, conn.id));
    });
    await syncAutomationStatus(db, st.userId);
    await audit(st.userId, "mail.connected", { provider: st.provider });
    return back(st.returnTo, { ok: "mail" });
  } catch (e) {
    log.error("mail.callback_failed", { provider: st.provider, error: safeErrorMessage(e) });
    return back(st.returnTo, { error: "No se pudo completar la conexión con el proveedor de correo." });
  }
}
