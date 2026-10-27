"use client";
import { BackLink } from "@/components/BackLink";
import { DeviceAiSetup } from "@/components/automation";

export default function AiPage() {
  return (
    <main className="page">
      <BackLink href="/perfil" label="Perfil" />
      <h1 className="title">Vincula tu IA Gemini</h1>
      <p className="subtitle">Con tu clave gratuita de Gemini, MiSaldo lee fotos de boletas y cartolas del banco y completa los movimientos por ti.</p>
      <DeviceAiSetup />
    </main>
  );
}
