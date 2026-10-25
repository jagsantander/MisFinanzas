export const metadata = { title: "Tratamiento de datos" };
export default function Privacy() {
  return (
    <article>
      <h1 className="title">Tratamiento de datos</h1>
      <p className="muted">Texto base: adáptalo a la Ley 19.628 y a la Ley 21.719 antes de ofrecer la app a terceros.</p>
      <h2 className="section">Sin servidor propio</h2>
      <p>MiSaldo es una página estática. Tus datos se guardan en tu propia planilla de Google Sheets y en los dispositivos donde usas la app. Quien publica MiSaldo no recibe ni almacena tus movimientos, tus correos ni tus claves.</p>
      <h2 className="section">Qué se guarda y dónde</h2>
      <ul>
        <li>En tu planilla: movimientos, categorías, reglas, presupuestos, avisos y el registro de ejecuciones.</li>
        <li>En las propiedades privadas de tu script: los tokens de acceso y, si la usas, la clave de tu IA.</li>
        <li>En tu dispositivo: una copia de los datos, el acceso a tu planilla y, si la agregas, tu clave de Gemini para leer boletas.</li>
        <li>No se guarda el cuerpo de los correos: solo el identificador del mensaje y los datos extraídos.</li>
      </ul>
      <h2 className="section">Inicio de sesión con Google</h2>
      <p>Si usas «Continuar con Google», MiSaldo pide dos permisos: ver tu dirección de correo (para mostrar con qué cuenta estás conectado) y ver, crear y modificar <strong>solo los archivos de Google Drive que la propia app crea</strong> (la planilla «MiSaldo»). No puede ver el resto de tu Drive ni tu Gmail. El permiso queda en tu navegador, dura una hora y no pasa por ningún servidor de MiSaldo. Puedes retirarlo en myaccount.google.com/permissions.</p>
      <h2 className="section">Qué se envía a tu proveedor de IA</h2>
      <p>En la modalidad Google: remitente, asunto, fecha y el texto reducido de los avisos financieros, sin enlaces ni adjuntos y con tarjetas y RUT enmascarados. En la modalidad Claude, la lectura ocurre dentro de tu cuenta de Claude con su conector de Gmail. Al fotografiar una boleta, la imagen reducida va a tu IA (desde tu script o directo desde tu teléfono a Gemini) y no se guarda.</p>
      <h2 className="section">Tus derechos</h2>
      <p>Puedes exportar tus datos, desconectar o eliminar la planilla, retirar los permisos de Google y borrar los datos de cada dispositivo cuando quieras.</p>
    </article>
  );
}
