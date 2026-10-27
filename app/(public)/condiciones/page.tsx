export const metadata = { title: "Condiciones de uso" };
export default function Terms() {
  return (
    <article>
      <h1 className="title">Condiciones de uso</h1>
      <p className="muted">Texto base: revísalo con asesoría legal antes de ofrecer la app a terceros.</p>
      <h2 className="section">Servicio</h2>
      <p>MiSaldo es una herramienta personal y gratuita para registrar ingresos y gastos. Los movimientos importados provienen de los avisos, boletas y cartolas que tú entregas; no es una conciliación bancaria ni reemplaza tu cartola.</p>
      <h2 className="section">Tus cuentas</h2>
      <p>La lectura de boletas y cartolas usa tu propia clave de Gemini. Su uso se rige por las condiciones y límites de Google.</p>
      <h2 className="section">Presupuestos y alertas</h2>
      <p>Los límites son informativos: no bloquean compras ni operaciones bancarias. Las alertas se generan al sincronizar y no son en tiempo real.</p>
      <h2 className="section">Responsabilidad</h2>
      <p>Revisa los movimientos marcados «Por revisar». La IA puede equivocarse; MiSaldo valida montos y fechas, pero la información final es tu responsabilidad.</p>
    </article>
  );
}
