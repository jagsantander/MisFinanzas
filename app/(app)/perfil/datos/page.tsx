"use client";
import { useState } from "react";
import { exportData } from "@/lib/local/api";
import { useStore } from "@/lib/client";
import { disconnect, forgetDevice } from "@/lib/local/store";
import { disableLock } from "@/lib/local/lock";
import { ConfirmSheet } from "@/components/ui";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";

export default function DataPage() {
  const st = useStore();
  const [confirm, setConfirm] = useState(false);
  return (
    <main className="page">
      <BackLink href="/perfil" label="Perfil" />
      <h1 className="title">Exportar movimientos</h1>
      <div className="card pad stack" style={{ marginTop: 12 }}>
        <p className="small" style={{ margin: 0 }}>Descarga todos tus movimientos, con categorías y notas.</p>
        <button className="btn" onClick={() => exportData("xlsx")}><Icon name="download" size={18} /> Excel</button>
        <button className="btn" onClick={() => exportData("csv")}><Icon name="download" size={18} /> CSV</button>
        <button className="btn" onClick={() => exportData("pdf")}><Icon name="download" size={18} /> PDF</button>
      </div>
      <h2 className="section">Eliminar datos</h2>
      <div className="card pad stack small">
        <p style={{ margin: 0 }}>MiSaldo no guarda tus datos en ningún servidor propio. Para eliminarlos:</p>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li><strong>Planilla:</strong> bórrala en Google Drive.</li>
          <li><strong>Este teléfono:</strong> usa el botón de abajo.</li>
          <li><strong>Permisos de Google:</strong> retíralos en myaccount.google.com/permissions.</li>
        </ul>
        <button className="btn danger block" onClick={() => setConfirm(true)}>Borrar MiSaldo de este teléfono</button>
      </div>
      <ConfirmSheet open={confirm} onClose={() => setConfirm(false)} danger title="¿Borrar MiSaldo de este teléfono?" confirmLabel="Borrar de este teléfono"
        body={<><p>Se borran los datos guardados en este teléfono.{st.pending.length ? ` Hay ${st.pending.length} cambios que aún no llegan a tu planilla y se perderán.` : ""}</p>{st.connection && <p><strong>Tu planilla de Google no se modifica.</strong></p>}</>}
        onConfirm={async () => { disconnect(); disableLock(); await forgetDevice(); location.reload(); }} />
    </main>
  );
}
