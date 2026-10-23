export const metadata = { title: "Condiciones de uso" };
export default function Terms() {
  return (
    <article>
      <h1 className="title">Condiciones de uso</h1>
      <p className="muted">Versión 2026-10. Texto base: revísalo con asesoría legal antes de operar comercialmente.</p>
      <h2 className="section">Servicio</h2>
      <p>MisFinanzas es una herramienta personal para registrar ingresos y gastos. Los movimientos importados provienen solo de los avisos de correo accesibles; no es una conciliación bancaria ni reemplaza tu cartola.</p>
      <h2 className="section">Presupuestos y alertas</h2>
      <p>Los límites son informativos: no bloquean compras ni operaciones bancarias. Las alertas se generan al sincronizar y no son en tiempo real.</p>
      <h2 className="section">Proveedores externos</h2>
      <p>Si conectas tu proveedor de IA, el contenido financiero necesario se envía a ese proveedor con tu propia credencial, y el consumo se factura en tu cuenta con ese proveedor. Una suscripción a ChatGPT, Claude o Gemini no incluye necesariamente acceso o saldo para sus APIs.</p>
      <h2 className="section">Responsabilidad</h2>
      <p>Revisa los movimientos marcados «Por revisar». La IA puede equivocarse; MisFinanzas valida montos y fechas, pero la información final es tu responsabilidad.</p>
    </article>
  );
}
