export const metadata = { title: "Condiciones de uso" };
export default function Terms() {
  return (
    <article>
      <h1 className="title">Condiciones de uso</h1>
      <p className="muted">Texto base: revísalo con asesoría legal antes de ofrecer la app a terceros.</p>
      <h2 className="section">Servicio</h2>
      <p>MisFinanzas es una herramienta personal y gratuita para registrar ingresos y gastos. Los movimientos importados provienen solo de los avisos de correo accesibles; no es una conciliación bancaria ni reemplaza tu cartola.</p>
      <h2 className="section">Tus cuentas</h2>
      <p>La actualización nocturna corre en tu cuenta de Google o de Claude, con tus permisos y tus credenciales. El consumo de tu proveedor de IA se rige por sus propias condiciones y precios.</p>
      <h2 className="section">Presupuestos y alertas</h2>
      <p>Los límites son informativos: no bloquean compras ni operaciones bancarias. Las alertas se generan al sincronizar y no son en tiempo real.</p>
      <h2 className="section">Responsabilidad</h2>
      <p>Revisa los movimientos marcados «Por revisar». La IA puede equivocarse; MisFinanzas valida montos y fechas, pero la información final es tu responsabilidad.</p>
    </article>
  );
}
