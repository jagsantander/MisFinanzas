export const metadata = { title: "Tratamiento de datos" };
export default function Privacy() {
  return (
    <article>
      <h1 className="title">Tratamiento de datos</h1>
      <p className="muted">Texto base: adáptalo a la Ley 19.628 y a la Ley 21.719 de protección de datos personales antes de operar.</p>
      <h2 className="section">Qué guardamos</h2>
      <ul>
        <li>Datos de cuenta: nombre, correo, hash de la contraseña (scrypt), passkeys (solo clave pública; nunca datos biométricos).</li>
        <li>Movimientos, categorías, reglas y presupuestos.</li>
        <li>Tokens de acceso al correo y claves de IA, cifrados (AES-256-GCM) y asociados solo a tu usuario.</li>
        <li>No guardamos el cuerpo completo de los correos: solo la referencia al mensaje y los datos extraídos.</li>
      </ul>
      <h2 className="section">Qué enviamos a tu proveedor de IA</h2>
      <p>Remitente, asunto, fecha y el texto reducido de los avisos financieros (sin enlaces, adjuntos ni imágenes; números de tarjeta y RUT enmascarados), más los nombres de tus categorías.</p>
      <h2 className="section">Tus derechos</h2>
      <p>Puedes exportar tus datos, desconectar el correo o la IA (se eliminan los tokens y claves), y eliminar tu cuenta con todos sus datos desde Perfil.</p>
    </article>
  );
}
