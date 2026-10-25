import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const font = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Mi saldo", template: "%s · Mi saldo" },
  description: "Controla tus ingresos y gastos personales",
  manifest: `${BASE}/manifest.webmanifest`,
  appleWebApp: { capable: true, title: "Mi saldo", statusBarStyle: "default" },
  icons: { icon: `${BASE}/icons/icon-192.png`, apple: `${BASE}/icons/apple-touch-icon.png` },
};

export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#faf8f4" }, { media: "(prefers-color-scheme: dark)", color: "#0d1315" }],
};

// Aplica el tema guardado antes de pintar (evita parpadeo).
const themeScript = `try{var t=localStorage.getItem('mf-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL" className={font.variable} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}</body>
    </html>
  );
}
