import { htmlToText } from "./html";
import { MailAuthError, type FullMessage, type MailConnector, type MessageMeta, type OAuthTokens } from "./types";

const GRAPH = "https://graph.microsoft.com/v1.0";
const tenant = () => process.env.MICROSOFT_TENANT ?? "common";
// Mail.Read (solo lectura), User.Read (identificar la cuenta), offline_access (renovación nocturna).
const SCOPES = ["offline_access", "User.Read", "Mail.Read"];

async function gfetch(token: string, url: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="text"' } });
  if (res.status === 401) throw new MailAuthError("Autorización de Outlook vencida o revocada");
  if (!res.ok) throw new Error(`Microsoft Graph respondió ${res.status}`);
  return res.json();
}

async function tokenRequest(params: Record<string, string>): Promise<OAuthTokens> {
  const res = await fetch(`https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.MICROSOFT_CLIENT_ID!, client_secret: process.env.MICROSOFT_CLIENT_SECRET!, scope: SCOPES.join(" "), ...params }),
  });
  const b = await res.json();
  if (!res.ok) {
    if (b.error === "invalid_grant" || b.error === "interaction_required") throw new MailAuthError("Microsoft requiere volver a autorizar");
    throw new Error(`Error OAuth de Microsoft: ${b.error ?? res.status}`);
  }
  return { accessToken: b.access_token, refreshToken: b.refresh_token ?? null, expiresAt: new Date(Date.now() + b.expires_in * 1000), scope: b.scope ?? SCOPES.join(" ") };
}

const fromOf = (m: { from?: { emailAddress?: { name?: string; address?: string } } }) =>
  `${m.from?.emailAddress?.name ?? ""} <${m.from?.emailAddress?.address ?? ""}>`;

export const outlookConnector: MailConnector = {
  provider: "outlook",
  label: "Microsoft Outlook",
  scopes: SCOPES,
  configured: () => Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
  authUrl({ state, codeChallenge, redirectUri }) {
    const u = new URL(`https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/authorize`);
    u.search = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!, response_type: "code", redirect_uri: redirectUri, response_mode: "query",
      scope: SCOPES.join(" "), state, code_challenge: codeChallenge, code_challenge_method: "S256", prompt: "select_account",
    }).toString();
    return u.toString();
  },
  exchangeCode: ({ code, codeVerifier, redirectUri }) => tokenRequest({ grant_type: "authorization_code", code, code_verifier: codeVerifier, redirect_uri: redirectUri }),
  refresh: (refreshToken) => tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }),
  async accountEmail(token) {
    const me = await gfetch(token, `${GRAPH}/me?$select=mail,userPrincipalName`);
    return me.mail ?? me.userPrincipalName;
  },
  async listSince(token, since, limit) {
    const out: MessageMeta[] = [];
    let url: string | undefined = `${GRAPH}/me/messages?$filter=receivedDateTime ge ${since.toISOString()}&$orderby=receivedDateTime asc&$select=id,subject,from,receivedDateTime&$top=50`;
    while (url && out.length < limit * 5) {
      const b: { value: { id: string; subject?: string; receivedDateTime: string }[]; "@odata.nextLink"?: string } = await gfetch(token, url);
      for (const m of b.value) out.push({ id: m.id, subject: m.subject ?? "", from: fromOf(m as never), receivedAt: new Date(m.receivedDateTime) });
      url = b["@odata.nextLink"];
    }
    return out;
  },
  async getMessage(token, id): Promise<FullMessage> {
    const m = await gfetch(token, `${GRAPH}/me/messages/${encodeURIComponent(id)}?$select=id,subject,from,receivedDateTime,body`);
    const content: string = m.body?.content ?? "";
    return { id, subject: m.subject ?? "", from: fromOf(m), receivedAt: new Date(m.receivedDateTime), text: m.body?.contentType === "html" ? htmlToText(content) : content };
  },
  async revoke() {
    // Microsoft no ofrece un endpoint para revocar el consentimiento de una sola aplicación desde la app.
    return {
      revoked: false,
      instructions: "Eliminamos los tokens de MisFinanzas. Para retirar también el permiso en Microsoft, entra a https://account.live.com/consent/Manage (cuentas personales) o https://myapps.microsoft.com (cuentas de trabajo) y quita MisFinanzas.",
    };
  },
};
