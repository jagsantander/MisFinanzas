"use client";
import Link from "next/link";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { ReviewInstruction } from "@/components/ReviewInstruction";

function Inner() {
  const router = useRouter();
  const approved = useSearchParams().get("ver") === "aprobada";
  return (
    <main className="page">
      <Link href="/automatizacion" className="link-btn"><Icon name="chevronLeft" size={18} /> Actualización nocturna</Link>
      <h1 className="title">{approved ? "Instrucción aprobada" : "Revisa y autoriza tu actualización nocturna"}</h1>
      <div style={{ marginTop: 12 }}>
        <ReviewInstruction showApproved={approved} onApproved={() => router.push("/automatizacion")} onCancel={() => router.push("/automatizacion")} />
      </div>
    </main>
  );
}
export default function ReviewPage() { return <Suspense><Inner /></Suspense>; }
