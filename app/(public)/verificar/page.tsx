import { Suspense } from "react";
import { TokenAction } from "@/components/TokenAction";

export default function VerifyPage() {
  return <Suspense><TokenAction endpoint="/api/auth/verify-email" successTitle="Correo verificado" successBody="Tu cuenta está lista. Te guiaremos en la configuración inicial." next={{ href: "/bienvenida", label: "Continuar" }} /></Suspense>;
}
