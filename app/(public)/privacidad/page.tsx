export const metadata = { title: "Tratamiento de datos" };
export default function Privacy() {
  return (
    <article>
      <h1 className="title">Tratamiento de datos</h1>
      <p className="muted">Texto base: adáptalo a la Ley 19.628 y a la Ley 21.719 antes de ofrecer la app a terceros.</p>
      <h2 className="section">Sin servidor propio</h2>
      <p>MiSaldo es una página estática. Tus datos se guardan en tu propia planilla de Google Sheets y en los dispositivos donde usas la app. Quien publica MiSaldo no recibe ni almacena tus movimientos ni tus claves.</p>
      <h2 className="section">Qué se guarda y dónde</h2>
      <ul>
        <li>En tu planilla: movimientos, categorías, reglas, presupuestos, avisos y el registro de ejecuciones.</li>
        <li>En tu dispositivo: una copia de los datos, el acceso a tu planilla y, si la agregas, tu clave de Gemini para leer boletas.</li>
      </ul>
      <h2 className="section">Inicio de sesión con Google</h2>
      <p>Si usas «Continuar con Google», MiSaldo pide dos permisos: ver tu dirección de correo (para mostrar con qué cuenta estás conectado) y ver, crear y modificar <strong>solo los archivos de Google Drive que la propia app crea</strong> (la planilla «MiSaldo»). No puede ver el resto de tu Drive ni tu Gmail. El permiso queda en tu navegador, dura una hora y no pasa por ningún servidor de MiSaldo. Puedes retirarlo en myaccount.google.com/permissions.</p>
      <h2 className="section">Qué se envía a tu proveedor de IA</h2>
      <p>Al leer una boleta o una cartola, el archivo va directo desde tu teléfono a Gemini con tu clave y no se guarda. Los avisos de pago que capta la app Android no salen de tu teléfono.</p>
      <h2 className="section">Tus derechos</h2>
      <p>Puedes exportar tus datos, desconectar o eliminar la planilla, retirar los permisos de Google y borrar los datos de cada dispositivo cuando quieras.</p>
    </article>
  );
}
