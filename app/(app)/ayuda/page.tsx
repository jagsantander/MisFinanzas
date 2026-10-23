import { BackLink } from "@/components/BackLink";

export const metadata = { title: "Ayuda" };
const QA: [string, string][] = [
  ["¿Qué movimientos detecta MisFinanzas?", "Solo los que tu banco u otras entidades informan por correo en la cuenta que conectaste. No es una conciliación bancaria: si un movimiento no genera correo, regístralo manualmente."],
  ["¿Cuándo se actualiza?", "Todas las noches a la hora que elijas (por defecto 03:00, hora de Santiago), en el servidor. No necesitas tener la app abierta ni el teléfono encendido. También puedes usar «Ejecutar ahora»."],
  ["¿Por qué necesito una clave de API?", "MisFinanzas usa tu propio proveedor de IA para interpretar los avisos. Una suscripción a ChatGPT, Claude o Gemini no incluye necesariamente acceso a sus APIs: la API se contrata y factura aparte."],
  ["¿Qué ve la IA?", "Solo los avisos que parecen financieros, reducidos a texto, sin enlaces ni adjuntos y con números de tarjeta y RUT enmascarados. Nunca tus contraseñas ni tokens."],
  ["¿Los presupuestos bloquean compras?", "No. Son informativos y se calculan con los movimientos registrados al sincronizar; las alertas no son bancarias en tiempo real."],
  ["Corregí una categoría, ¿la sincronización la cambiará?", "No. Tus correcciones manuales tienen prioridad sobre reglas y sugerencias de la IA, y no se sobrescriben."],
  ["Eliminé un movimiento importado, ¿volverá?", "No. MisFinanzas recuerda tu decisión y no lo vuelve a importar. Puedes restaurarlo desde «Ver eliminados»."],
  ["¿Cómo instalo la app?", "En Android/Chrome usa «Instalar app». En iPhone abre el menú Compartir de Safari y elige «Agregar a pantalla de inicio»."],
];
export default function Help() {
  return (
    <main className="page">
      <BackLink href="/perfil" label="Perfil" />
      <h1 className="title">Ayuda y soporte</h1>
      <div className="stack" style={{ marginTop: 12 }}>
        {QA.map(([q, a]) => <details key={q} className="card pad"><summary>{q}</summary><p style={{ marginBottom: 0 }}>{a}</p></details>)}
      </div>
      <p className="small muted" style={{ marginTop: 16 }}>¿Necesitas más ayuda? Escribe al soporte configurado por el operador de tu instancia de MisFinanzas.</p>
    </main>
  );
}
