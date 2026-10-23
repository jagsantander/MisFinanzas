import { Suspense } from "react";
import { TokenAction } from "@/components/TokenAction";

export default function ConfirmEmailPage() {
  return <Suspense><TokenAction endpoint="/api/auth/confirm-email-change" successTitle="Correo actualizado" successBody="El correo de tu cuenta fue cambiado. El correo conectado para importar movimientos no cambia." next={{ href: "/perfil", label: "Ir a mi perfil" }} /></Suspense>;
}
