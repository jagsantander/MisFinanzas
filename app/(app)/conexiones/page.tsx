"use client";
import Link from "next/link";
import { useStore } from "@/lib/client";
import { Icon } from "@/components/Icon";
import { SheetConnection } from "@/components/sheet";

export default function ConnectionsPage() {
  const st = useStore();
  return (
    <main className="page">
      <Link href="/perfil" className="link-btn"><Icon name="chevronLeft" size={18} /> Perfil</Link>
      <h1 className="title">Tu planilla</h1>
      <p className="subtitle">Dónde se guardan tus datos. Puedes abrirla en Google Sheets cuando quieras: es tuya.</p>
      <SheetConnection />
      {st.connection && <Link href="/automatizacion" className="card pad row" style={{ marginTop: 12, color: "var(--text)" }}>
        <span className="ico sm" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}><Icon name="moon" /></span>
        <div className="grow"><strong>Actualización nocturna e IA</strong><div className="small muted">Configura dónde corre, tu IA y la instrucción</div></div><Icon name="chevronRight" />
      </Link>}
    </main>
  );
}
