"use client";
/**
 * Lo que llega a la app por el fragmento de la dirección (#…), que el navegador nunca envía al servidor:
 * - #ms=…   desde la app Android: avisos capturados (notificaciones y «Compartir») y si el permiso está activo.
 * - #atajo  desde un Atajo de iPhone: monto=…&comercio=…&tipo=gasto|ingreso
 * Se guarda en el dispositivo, se borra de la dirección y se importa cuando el almacén está listo.
 */
import { idbGet, idbSet } from "../local/idb";
import { parseAmount } from "../money";
import { importMovements, importNotices, type CapturedMovement, type CapturedNotice, type ImportResult } from "./import";

const PENDING = "capturePending";
const ANDROID_KEY = "mf-android";

export type AndroidStatus = { listener: boolean; at: string } | null;
export function androidStatus(): AndroidStatus {
  try { return JSON.parse(localStorage.getItem(ANDROID_KEY) ?? "null"); } catch { return null; }
}

type Pending = { notices: CapturedNotice[]; shortcuts: { id: string; monto: string; comercio: string; tipo: string; nota: string }[] };

function fromBase64Url(s: string) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return new TextDecoder().decode(Uint8Array.from(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0)));
}

/** Lee el fragmento al abrir la página. Devuelve true si había algo para importar. */
export async function captureIncomingHash(): Promise<boolean> {
  const hash = location.hash.slice(1);
  const ms = /(?:^|&)ms=([A-Za-z0-9_-]+)/.exec(hash)?.[1];
  const atajo = /^atajo(&|$)/.test(hash) ? new URLSearchParams(hash.replace(/^atajo&?/, "")) : null;
  if (!ms && !atajo) return false;
  history.replaceState(null, "", location.pathname + location.search);
  const pending: Pending = { notices: [], shortcuts: [], ...((await idbGet<Pending>(PENDING)) ?? {}) };
  if (ms) {
    try {
      const d = JSON.parse(fromBase64Url(ms)) as { listener?: boolean; items?: CapturedNotice[] };
      try { localStorage.setItem(ANDROID_KEY, JSON.stringify({ listener: Boolean(d.listener), at: new Date().toISOString() })); } catch { /* sin almacenamiento */ }
      for (const it of d.items ?? []) if (it?.id && typeof it.text === "string") pending.notices.push({ id: String(it.id), source: it.source === "shared" ? "shared" : "notification", text: it.text, app: it.app ?? null, postedAt: it.postedAt ?? null });
    } catch { /* fragmento dañado: se ignora */ }
  }
  if (atajo?.get("monto")) {
    const minute = new Date().toISOString().slice(0, 16);
    pending.shortcuts.push({ id: atajo.get("id") || `${atajo.get("monto")}|${atajo.get("comercio") ?? ""}|${minute}`, monto: atajo.get("monto")!, comercio: atajo.get("comercio") ?? "", tipo: atajo.get("tipo") ?? "gasto", nota: atajo.get("tarjeta") ?? "" });
  }
  await idbSet(PENDING, pending);
  return pending.notices.length + pending.shortcuts.length > 0;
}

/** Importa lo pendiente (llamar con el almacén ya cargado). */
export async function importPendingCaptures(currency: string): Promise<ImportResult | null> {
  const pending = await idbGet<Pending>(PENDING);
  if (!pending || (!pending.notices?.length && !pending.shortcuts?.length)) return null;
  await idbSet(PENDING, { notices: [], shortcuts: [] });
  const a = importNotices(pending.notices ?? []);
  const moves: CapturedMovement[] = [];
  let bad = 0;
  for (const s of pending.shortcuts ?? []) {
    const cur = /us\$|usd/i.test(s.monto) ? "USD" : currency;
    const amount = parseAmount(s.monto.replace(/[^\d.,$USDCLusdcl ]/g, ""), cur);
    if (!amount || amount <= 0n) { bad++; continue; }
    const kind = /^ingreso|^abono/i.test(s.tipo) ? "income" : "expense";
    moves.push({ id: `atajo:${s.id}`, source: "shortcut", kind, amountMinor: amount.toString(), currency: cur, merchant: s.comercio || null, description: s.comercio || "Pago con Apple Pay", note: s.nota || null, confidence: s.comercio ? 0.9 : 0.7 });
  }
  const b = importMovements(moves);
  return { created: a.created + b.created, review: a.review + b.review, skipped: a.skipped + b.skipped, unrecognized: a.unrecognized + b.unrecognized + bad };
}
