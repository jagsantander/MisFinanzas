import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number, opts: object) => Promise<Buffer>;

// Parámetros recomendados por OWASP para scrypt (N=2^17, r=8, p=1).
const N = 1 << 17, R = 8, P = 1, KEYLEN = 64;
const MAXMEM = 256 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt") return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password.normalize("NFKC"), Buffer.from(salt, "base64"), expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: MAXMEM,
  });
  return timingSafeEqual(expected, actual);
}

const COMMON = new Set(["password", "contraseña", "12345678", "123456789", "1234567890", "qwertyuiop", "misfinanzas", "iloveyou", "11111111", "abcdefgh"]);

export function passwordProblem(password: string, ctx: { email?: string; name?: string } = {}): string | null {
  if (password.length < 10) return "La contraseña debe tener al menos 10 caracteres.";
  if (password.length > 200) return "La contraseña es demasiado larga.";
  if (COMMON.has(password.toLowerCase())) return "Esa contraseña es demasiado común.";
  if (ctx.email && password.toLowerCase().includes(ctx.email.split("@")[0].toLowerCase()) && ctx.email.split("@")[0].length >= 4)
    return "La contraseña no debe contener tu correo.";
  return null;
}

/** Hash ficticio para igualar tiempos cuando el usuario no existe. */
export const DUMMY_HASH = "scrypt$131072$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(64).toString("base64");
