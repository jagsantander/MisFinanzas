import { BackLink } from "@/components/BackLink";

export const metadata = { title: "Ayuda" };
const QA: [string, string][] = [
  ["¿Dónde están mis datos?", "En una planilla de Google Sheets tuya, con una copia en cada dispositivo donde uses la app. MiSaldo no tiene servidor: ni siquiera nosotros podemos verlos."],
  ["¿Por qué conectar una planilla de Google?", "La planilla es tu respaldo y sincroniza tus dispositivos. Es opcional: sin ella, los datos quedan solo en este dispositivo."],
  ["¿Cómo vinculo mi IA Gemini?", "En Perfil → Vincula tu IA Gemini. Crea una clave gratis en aistudio.google.com/apikey con tu cuenta de Google, pégala y toca «Vincular». La clave queda solo en tu teléfono."],
  ["¿Cómo registro una boleta?", "En «Agregar movimiento» toca «Sacar foto» o «Adjuntar foto» (también sirve un PDF). Tu IA lee el total, la fecha y el comercio y sugiere una categoría; revisas y guardas. La foto no se guarda."],
  ["¿Cómo subo la cartola del banco?", "En Perfil → Registro automático → Cartola del banco. Descarga la cartola desde el sitio de tu banco (Excel, CSV o PDF) y súbela: verás la lista antes de importar y lo ya importado no se repite."],
  ["¿Los movimientos pueden llegar solos?", "Sí. En Android, la app MiSaldo anota los avisos de pago de tu banco. En iPhone, el atajo MiSaldo anota cada pago con Apple Pay. Configúralo en Perfil → Registro automático."],
  ["¿Cuánto cuesta?", "MiSaldo es gratis, y la clave de Gemini también (tiene límites diarios que alcanzan para uso personal)."],
  ["¿Los presupuestos bloquean compras?", "No. Son informativos y se calculan con los movimientos registrados; las alertas no son bancarias en tiempo real."],
  ["Eliminé un movimiento importado, ¿volverá?", "No. Queda registrado como eliminado y no se vuelve a importar. Puedes restaurarlo desde «Ver eliminados»."],
  ["¿Cómo la instalo?", "En Android descarga la app en jagsantander.github.io/MisFinanzas/descargas/MiSaldo.apk (Android pedirá permitir instalar apps de esa fuente). En iPhone abre el menú Compartir de Safari y elige «Agregar a pantalla de inicio». En computador, el ícono de instalar en la barra de direcciones de Chrome o Edge."],
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
