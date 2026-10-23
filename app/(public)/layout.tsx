import { ToastProvider } from "@/components/ui";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <main className="page" style={{ paddingTop: 32 }}>
        <div className="brand" style={{ marginBottom: 24 }}>
          <img src="/icons/icon-192.png" alt="" width={44} height={44} style={{ borderRadius: 12 }} />
          <span>Mis<b>Finanzas</b></span>
        </div>
        {children}
      </main>
    </ToastProvider>
  );
}
