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
    </main>
  );
}
