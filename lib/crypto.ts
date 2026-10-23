import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Cifrado de credenciales (tokens OAuth, claves de API) con AES-256-GCM.
 * El AAD vincula cada secreto a su propietario y propósito: un blob copiado
 * a otro usuario no se puede descifrar.
 * Formato: v1.<keyId>.<iv>.<tag>.<ciphertext> (base64url)
 */
type Key = { id: string; key: Buffer };

function loadKeys(): { current: Key; all: Map<string, Buffer> } {
  const cur = process.env.ENCRYPTION_KEY;
  if (!cur) throw new Error("ENCRYPTION_KEY no está definida");
  const curKey = Buffer.from(cur, "base64");
  if (curKey.length !== 32) throw new Error("ENCRYPTION_KEY debe ser de 32 bytes en base64");
  const curId = process.env.ENCRYPTION_KEY_ID ?? "k1";
  const all = new Map<string, Buffer>([[curId, curKey]]);
  const prev = process.env.ENCRYPTION_KEY_PREVIOUS; // formato id:base64
  if (prev) {
    const [pid, pkey] = prev.split(":");
    all.set(pid, Buffer.from(pkey, "base64"));
  }
  return { current: { id: curId, key: curKey }, all };
}

export function encryptSecret(plaintext: string, aad: string): string {
  const { current } = loadKeys();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", current.key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", current.id, iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(blob: string, aad: string): string {
  const [v, keyId, iv, tag, ct] = blob.split(".");
  if (v !== "v1") throw new Error("Formato de secreto desconocido");
  const key = loadKeys().all.get(keyId);
  if (!key) throw new Error("Clave de cifrado no disponible");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** HMAC para seudonimizar (p. ej. IP) sin guardar el valor original. */
export function pseudonymize(value: string): string {
  const secret = process.env.SESSION_SECRET ?? process.env.ENCRYPTION_KEY ?? "";
  return createHmac("sha256", secret).update(value).digest("hex").slice(0, 32);
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Muestra solo inicio y final: "sk-…a1B2". */
export function maskSecret(secret: string): string {
  const s = secret.trim();
  const prefix = s.match(/^(sk-ant-|sk-proj-|sk-|AIza)/)?.[0] ?? "";
  return `${prefix}…${s.slice(-4)}`;
}

/** usuario@dominio.cl → us•••@dominio.cl */
export function maskEmail(email: string): string {
  const [u, d] = email.split("@");
  if (!d) return "•••";
  return `${u.slice(0, 2)}•••@${d}`;
}
