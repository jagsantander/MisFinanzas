"use client";
import Link from "next/link";
import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { ErrorState, Notice, useToast } from "@/components/ui";
import { AiConnection, ConnectionsLoading, MailConnection, useConnections } from "@/components/connections";
import { useApi } from "@/lib/client";

function Inner() {
  const sp = useSearchParams();
  const toast = useToast();
  const { data, error, loading, reload } = useConnections();
  const auto = useApi<{ automation: { status: string } | null }>("/api/automation");
  useEffect(() => { if (sp.get("ok") === "mail") toast({ text: "Correo conectado" }); }, [sp, toast]);
  return (
    <main className="page">
      <Link href="/perfil" className="link-btn"><Icon name="chevronLeft" size={18} /> Perfil</Link>
      <h1 className="title">Conexiones</h1>
      <p className="subtitle">El correo que conectes aquí puede ser distinto del correo de tu cuenta.</p>
      {sp.get("error") && <Notice tone="danger"><p>{sp.get("error")}</p></Notice>}
      {loading && !data ? <ConnectionsLoading /> : error ? <ErrorState error={error} retry={reload} /> : data && (
        <div className="stack">
          <h2 className="section">Correo para importar movimientos</h2>
          <MailConnection conns={data} onChange={() => { reload(); auto.reload(); }} automationActive={auto.data?.automation?.status === "active"} />
          <h2 className="section">Tu proveedor de IA</h2>
          <AiConnection conns={data} onChange={reload} />
          <Notice><p className="small">Conectar cuentas no activa la automatización. Para eso debes <Link href="/automatizacion">revisar y validar la instrucción nocturna</Link>. Desconectar no borra tus movimientos.</p></Notice>
        </div>
      )}
    </main>
  );
}
export default function ConnectionsPage() { return <Suspense><Inner /></Suspense>; }
