import { htmlToText } from "./html";
import { MailAuthError, type FullMessage, type MailConnector, type MessageMeta, type OAuthTokens } from "./types";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";
// Permiso mínimo que permite leer el contenido de los avisos: solo lectura.
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

async function gfetch(token: string, url: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) throw new MailAuthError("Autorización de Gmail vencida o revocada");
  if (!res.ok) throw new Error(`Gmail respondió ${res.status}`);
  return res.json();
}

async function tokenRequest(params: Record<string, string>): Promise<OAuthTokens> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...params }),
  });
  const b = await res.json();
  if (!res.ok) {
    if (b.error === "invalid_grant") throw new MailAuthError("Google revocó o venció la autorización");
    throw new Error(`Error OAuth de Google: ${b.error ?? res.status}`);
  }
  return { accessToken: b.access_token, refreshToken: b.refresh_token ?? null, expiresAt: new Date(Date.now() + b.expires_in * 1000), scope: b.scope ?? SCOPES.join(" ") };
}

type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] };
function extractBody(p: Part): { text: string; html: string } {
  let text = "", html = "";
  const walk = (x: Part) => {
    const data = x.body?.data ? Buffer.from(x.body.data, "base64url").toString("utf8") : "";
    if (x.mimeType === "text/plain") text += data + "\n";
    else if (x.mimeType === "text/html") html += data + "\n";
    x.parts?.forEach(walk); // los adjuntos no se descargan (solo se leen partes de texto)
  };
  walk(p);
  return { text, html };
}
const header = (hs: { name: string; value: string }[] = [], n: string) => hs.find((h) => h.name.toLowerCase() === n)?.value ?? "";

export const gmailConnector: MailConnector = {
  provider: "gmail",
  label: "Gmail",
  scopes: SCOPES,
  configured: () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  authUrl({ state, codeChallenge, redirectUri }) {
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.search = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: redirectUri, response_type: "code", scope: SCOPES.join(" "),
      access_type: "offline", prompt: "consent", state, code_challenge: codeChallenge, code_challenge_method: "S256",
    }).toString();
    return u.toString();
  },
  exchangeCode: ({ code, codeVerifier, redirectUri }) => tokenRequest({ grant_type: "authorization_code", code, code_verifier: codeVerifier, redirect_uri: redirectUri }),
  refresh: (refreshToken) => tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }),
  async accountEmail(token) {
    return (await gfetch(token, `${API}/profile`)).emailAddress;
  },
  async listSince(token, since, limit) {
    const q = `after:${Math.floor(since.getTime() / 1000)} -in:spam -in:trash -in:drafts -in:sent`;
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const u = new URL(`${API}/messages`);
      u.searchParams.set("q", q);
      u.searchParams.set("maxResults", "100");
      if (pageToken) u.searchParams.set("pageToken", pageToken);
      const b = await gfetch(token, u.toString());
      ids.push(...(b.messages ?? []).map((m: { id: string }) => m.id));
      pageToken = b.nextPageToken;
    } while (pageToken && ids.length < limit * 5);
    const out: MessageMeta[] = [];
    for (const id of ids.slice(0, limit * 5)) {
      const m = await gfetch(token, `${API}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`);
      out.push({ id, from: header(m.payload?.headers, "from"), subject: header(m.payload?.headers, "subject"), receivedAt: new Date(Number(m.internalDate)) });
    }
    return out.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
  },
  async getMessage(token, id): Promise<FullMessage> {
    const m = await gfetch(token, `${API}/messages/${id}?format=full`);
    const { text, html } = extractBody(m.payload ?? {});
    return {
      id, from: header(m.payload?.headers, "from"), subject: header(m.payload?.headers, "subject"),
      receivedAt: new Date(Number(m.internalDate)), text: text.trim() ? text : htmlToText(html),
    };
  },
  async revoke(tokens) {
    const t = tokens.refreshToken ?? tokens.accessToken;
    const res = await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t)}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    if (res.ok) return { revoked: true };
    return { revoked: false, instructions: "Revisa https://myaccount.google.com/permissions y quita el acceso de MisFinanzas." };
  },
};
