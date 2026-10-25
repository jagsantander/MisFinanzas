import { BackLink } from "@/components/BackLink";

export const metadata = { title: "Ayuda" };
const QA: [string, string][] = [
  ["¿Dónde están mis datos?", "En una planilla de Google Sheets tuya, con una copia en cada dispositivo donde uses la app. MisFinanzas no tiene servidor: ni siquiera nosotros podemos verlos."],
  ["¿Qué movimientos detecta?", "Solo los que tu banco u otras entidades informan por correo en la cuenta conectada. No es una conciliación bancaria: si un movimiento no genera correo, regístralo a mano."],
  ["¿Cómo funciona la actualización nocturna?", "Elige una de dos modalidades. En la de Google, el script de tu planilla se ejecuta cada noche en tu cuenta de Google, lee Gmail y analiza los avisos con tu clave de IA. En la de Claude, una tarea programada de tu cuenta de Claude lee Gmail con su conector y envía los movimientos a tu planilla. Ninguna necesita la app abierta."],
  ["¿Cuánto cuesta?", "MisFinanzas es gratis. La modalidad Google puede ser gratuita con el nivel gratuito de la API de Gemini; con OpenAI o Anthropic pagas a ese proveedor según tu uso. La modalidad Claude usa tu suscripción Pro o superior."],
  ["¿Por qué Google dice que la app no está verificada?", "Porque el script es tuyo y no está publicado en Google. Al autorizarlo, le das permisos a tu propio script, no a un tercero."],
  ["¿Los presupuestos bloquean compras?", "No. Son informativos y se calculan con los movimientos registrados; las alertas no son bancarias en tiempo real."],
  ["Corregí una categoría, ¿la sincronización la cambiará?", "No. La actualización nocturna solo agrega movimientos nuevos; nunca sobrescribe tus correcciones."],
  ["Eliminé un movimiento importado, ¿volverá?", "No. Queda registrado como eliminado y no se vuelve a importar. Puedes restaurarlo desde «Ver eliminados»."],
  ["¿Cómo la instalo?", "En Android/Chrome usa «Instalar app» o la APK. En iPhone abre el menú Compartir de Safari y elige «Agregar a pantalla de inicio». En computador, el ícono de instalar en la barra de direcciones de Chrome o Edge."],
];
export default function Help() {
  return (
    <main className="page">
      <BackLink href="/perfil" label="Perfil" />
      <h1 className="title">Ayuda</h1>
      <div className="stack" style={{ marginTop: 12 }}>
        {QA.map(([q, a]) => <details key={q} className="card pad"><summary>{q}</summary><p style={{ marginBottom: 0 }}>{a}</p></details>)}
      </div>
    </main>
  );
}
