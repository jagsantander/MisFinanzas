"use client";
import { useState } from "react";
import { api, ApiError } from "@/lib/client";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
import { Notice, Sheet } from "@/components/ui";

export default function DataPage() {
  const [del, setDel] = useState<null | "movements" | "account">(null);
  const [pw, setPw] = useState("");
  const [txt, setTxt] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const expected = del === "account" ? "ELIMINAR MI CUENTA" : "BORRAR MOVIMIENTOS";
  return (
    <main className="page">
      <BackLink href="/perfil" label="Perfil" />
      <h1 className="title">Tus datos</h1>
      <h2 className="section">Exportar movimientos</h2>
      <div className="card pad stack">
        <p className="small" style={{ margin: 0 }}>Toda tu planilla, con categorías, origen y notas. No incluye credenciales ni contenido de correos.</p>
        <div className="grid2"><a className="btn" href="/api/export?format=xlsx"><Icon name="download" size={18} /> Excel</a><a className="btn" href="/api/export?format=csv"><Icon name="download" size={18} /> CSV</a></div>
      </div>
      <h2 className="section">Copia de seguridad</h2>
      <div className="card pad stack">
        <p className="small" style={{ margin: 0 }}>Descarga una copia completa (JSON) de categorías, reglas, presupuestos y movimientos. Además, el operador del servidor realiza copias de la base de datos según el procedimiento documentado.</p>
        <a className="btn" href="/api/export?format=json"><Icon name="cloud" size={18} /> Descargar copia completa</a>
      </div>
      <h2 className="section" id="eliminar">Eliminar datos</h2>
      <div className="card pad stack">
        <p className="small" style={{ margin: 0 }}>Desconectar el correo o la IA <strong>no</strong> borra tus movimientos. Si quieres borrar datos, hazlo aquí.</p>
        <button className="btn danger" onClick={() => { setDel("movements"); setErr(null); setTxt(""); setPw(""); }}>Borrar todos mis movimientos</button>
        <button className="btn danger" onClick={() => { setDel("account"); setErr(null); setTxt(""); setPw(""); }}>Eliminar mi cuenta y todos los datos</button>
      </div>
      <Sheet open={Boolean(del)} onClose={() => setDel(null)} title={del === "account" ? "Eliminar cuenta" : "Borrar movimientos"}>
        <Notice tone="danger"><p>{del === "account" ? "Se eliminarán tu cuenta, movimientos, reglas, presupuestos, conexiones (se intentará revocar el acceso al correo), instrucciones y notificaciones. No se puede deshacer." : "Se borrarán todos tus movimientos y el historial de correos procesados. Categorías, reglas y presupuestos se mantienen. No se puede deshacer."}</p></Notice>
        <div className="field" style={{ marginTop: 12 }}><label htmlFor="ct">Escribe «{expected}»</label><input id="ct" className="input" value={txt} onChange={(e) => setTxt(e.target.value)} autoComplete="off" /></div>
        <div className="field"><label htmlFor="dp">Contraseña</label><input id="dp" type="password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></div>
        {err && <Notice tone="danger"><p>{err}</p></Notice>}
        <button className="btn danger block" disabled={txt.trim().toUpperCase() !== expected || !pw} onClick={async () => {
          setErr(null);
          try { await api("/api/account", { method: "DELETE", body: { password: pw, confirmText: txt, scope: del } }); if (del === "account") location.href = "/entrar"; else { setDel(null); location.href = "/"; } }
          catch (e) { setErr((e as ApiError).message); }
        }}>Confirmar</button>
      </Sheet>
    </main>
  );
}
