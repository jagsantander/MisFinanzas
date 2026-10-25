"use client";
import { exportData } from "@/lib/local/api";
import { useStore } from "@/lib/client";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";

export default function DataPage() {
  const st = useStore();
  return (
    <main className="page">
      <BackLink href="/perfil" label="Perfil" />
      <h1 className="title">Tus datos</h1>
      <h2 className="section">Exportar movimientos</h2>
      <div className="card pad stack">
        <p className="small" style={{ margin: 0 }}>Toda tu planilla, con categorías, origen y notas. No incluye tokens ni el contenido de tus correos.</p>
        <div className="grid2"><button className="btn" onClick={() => exportData("xlsx")}><Icon name="download" size={18} /> Excel</button><button className="btn" onClick={() => exportData("csv")}><Icon name="download" size={18} /> CSV</button></div>
      </div>
      <h2 className="section">Copia de seguridad</h2>
      <div className="card pad stack">
        <p className="small" style={{ margin: 0 }}>{st.connection ? "Tus datos ya están en tu planilla de Google, que Google respalda y versiona (Archivo → Historial de versiones)." : "Tus datos están solo en este dispositivo: conecta una planilla para respaldarlos."} También puedes descargar una copia completa:</p>
        <button className="btn" onClick={() => exportData("json")}><Icon name="cloud" size={18} /> Descargar copia completa (JSON)</button>
      </div>
      <h2 className="section">Eliminar datos</h2>
      <div className="card pad stack small">
        <p style={{ margin: 0 }}>Mi saldo no guarda tus datos en ningún servidor propio. Para eliminarlos:</p>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li><strong>Planilla:</strong> bórrala en Google Drive. Así eliminas los movimientos, el script, sus disparadores y la clave de IA guardada.</li>
          <li><strong>Este dispositivo:</strong> Perfil → Seguridad → Olvidar este dispositivo.</li>
          <li><strong>Tarea de Claude:</strong> elimínala en claude.ai/code/routines.</li>
          <li><strong>Permisos de Google:</strong> retíralos en myaccount.google.com/permissions.</li>
        </ul>
      </div>
    </main>
  );
}
