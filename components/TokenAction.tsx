"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/client";
import { Loading, Notice } from "./ui";

/** Consume un enlace de un solo uso (verificación o cambio de correo). */
export function TokenAction({ endpoint, successTitle, successBody, next }: { endpoint: string; successTitle: string; successBody: string; next: { href: string; label: string } }) {
  const sp = useSearchParams();
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [msg, setMsg] = useState("");
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const token = sp.get("token");
    if (!token) { setState("error"); setMsg("Falta el código del enlace."); return; }
    api(endpoint, { body: { token } }).then(() => setState("ok")).catch((e: ApiError) => { setState("error"); setMsg(e.message); });
  }, [endpoint, sp]);
  if (state === "loading") return <Loading rows={2} />;
  if (state === "error") return <div className="stack"><Notice tone="danger"><p>{msg}</p></Notice><Link className="btn block" href="/entrar">Volver</Link></div>;
  return <div className="stack"><h1 className="title">{successTitle}</h1><p>{successBody}</p><Link className="btn primary block" href={next.href}>{next.label}</Link></div>;
}
