export type MailProvider = "gmail" | "outlook";

export type OAuthTokens = { accessToken: string; refreshToken: string | null; expiresAt: Date; scope: string };

export type MessageMeta = { id: string; from: string; subject: string; receivedAt: Date };
export type FullMessage = MessageMeta & { text: string };

export class MailAuthError extends Error {
  constructor(message: string) { super(message); }
}

export interface MailConnector {
  provider: MailProvider;
  label: string;
  scopes: string[];
  configured(): boolean;
  authUrl(p: { state: string; codeChallenge: string; redirectUri: string }): string;
  exchangeCode(p: { code: string; codeVerifier: string; redirectUri: string }): Promise<OAuthTokens>;
  refresh(refreshToken: string): Promise<OAuthTokens>;
  accountEmail(accessToken: string): Promise<string>;
  /** Mensajes recibidos desde `since` (solo metadatos: remitente, asunto, fecha). */
  listSince(accessToken: string, since: Date, limit: number): Promise<MessageMeta[]>;
  getMessage(accessToken: string, id: string): Promise<FullMessage>;
  /** Revoca la autorización en el proveedor si existe un mecanismo oficial. */
  revoke(tokens: OAuthTokens): Promise<{ revoked: boolean; instructions?: string }>;
}
