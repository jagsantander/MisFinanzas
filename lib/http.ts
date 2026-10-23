import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { getCurrentSession, type CurrentSession } from "./auth/session";
import { log, safeErrorMessage } from "./log";

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

const replacer = (_k: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);

export function json(data: unknown, status = 200, headers?: Record<string, string>) {
  return new NextResponse(JSON.stringify(data, replacer), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

/** Envuelve un route handler: errores controlados, validación y CSRF por Origin. */
export function route<C = unknown>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) assertSameOrigin(req);
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message, code: err.code }, err.status);
      if (err instanceof ZodError) {
        return json({ error: err.issues[0]?.message ?? "Datos inválidos", issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
      }
      log.error("api.unhandled", { path: req.nextUrl.pathname, message: safeErrorMessage(err) });
      return json({ error: "Ocurrió un error inesperado. Inténtalo nuevamente." }, 500);
    }
  };
}

function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  const allowed = new Set([req.nextUrl.origin]);
  if (process.env.APP_URL) allowed.add(new URL(process.env.APP_URL).origin);
  if (!origin || !allowed.has(origin)) throw new HttpError(403, "Origen no permitido", "bad_origin");
}

export async function body<T extends z.ZodType>(req: NextRequest, schema: T): Promise<z.infer<T>> {
  let data: unknown;
  try { data = await req.json(); } catch { throw new HttpError(400, "Cuerpo JSON inválido"); }
  return schema.parse(data);
}

export async function requireUser(opts: { allowLocked?: boolean; requireVerified?: boolean } = {}): Promise<CurrentSession> {
  const cur = await getCurrentSession();
  if (!cur) throw new HttpError(401, "Debes iniciar sesión", "unauthenticated");
  if (cur.session.lockedAt && !opts.allowLocked) throw new HttpError(423, "Sesión bloqueada por inactividad", "locked");
  if (opts.requireVerified && !cur.user.emailVerifiedAt) throw new HttpError(403, "Verifica tu correo para usar esta función", "email_unverified");
  return cur;
}

export function clientIp(req: NextRequest): string {
  if (process.env.TRUST_PROXY === "1") {
    const fwd = req.headers.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0].trim();
  }
  return req.headers.get("x-real-ip") ?? "local";
}

export const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";
