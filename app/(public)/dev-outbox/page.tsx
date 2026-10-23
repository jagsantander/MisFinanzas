"use client";
import { useApi, fmtDateTime } from "@/lib/client";
import { ErrorState, Loading, Notice } from "@/components/ui";

/** Solo desarrollo: muestra correos que NO se enviaron por falta de SMTP. */
export default function DevOutbox() {
  const { data, error, loading, reload } = useApi<{ emails: { id: string; to: string; subject: string; text: string; createdAt: string }[] }>("/api/dev/outbox");
  return (
    <>
      <h1 className="title">Bandeja de desarrollo</h1>
      <Notice tone="warn"><p>Estos correos <strong>no fueron enviados</strong>. Se muestran aquí porque no hay SMTP configurado. Esta página no existe en producción.</p></Notice>
      <div className="stack" style={{ marginTop: 16 }}>
        {loading ? <Loading /> : error ? <ErrorState error={error} retry={reload} /> : data!.emails.map((m) => (
          <div key={m.id} className="card pad">
            <div className="small muted">{fmtDateTime(m.createdAt)} · para {m.to}</div>
            <strong>{m.subject}</strong>
            <pre className="instruction" style={{ marginTop: 8 }}>{m.text.split(/(https?:\/\/\S+)/).map((part, i) => /^https?:\/\//.test(part) ? <a key={i} href={part}>{part}</a> : part)}</pre>
          </div>
        ))}
      </div>
    </>
  );
}
