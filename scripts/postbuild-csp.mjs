// Inserta una Content-Security-Policy en cada página exportada (GitHub Pages no permite cabeceras propias).
// Los scripts en línea de Next se autorizan por su hash SHA-256: no se usa 'unsafe-inline' para scripts.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = process.argv[2] ?? "out";
const hash = (s) => `'sha256-${createHash("sha256").update(s, "utf8").digest("base64")}'`;

function* htmlFiles(dir) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) yield* htmlFiles(p);
    else if (p.endsWith(".html")) yield p;
  }
}

let n = 0;
for (const file of htmlFiles(OUT)) {
  let html = readFileSync(file, "utf8");
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => hash(m[1]));
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => hash(m[1]));
  const csp = [
    "default-src 'self'",
    `script-src 'self' https://accounts.google.com/gsi/client ${[...new Set(scripts)].join(" ")}`,
    `style-src 'self' https://accounts.google.com/gsi/style ${[...new Set(styles)].join(" ")}`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    // Script de la planilla, inicio de sesión con Google, Drive y Sheets (planilla directa) y Gemini (boletas).
    "connect-src 'self' https://script.google.com https://script.googleusercontent.com https://accounts.google.com https://www.googleapis.com https://sheets.googleapis.com https://script.googleapis.com https://generativelanguage.googleapis.com",
    "frame-src https://accounts.google.com",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
  const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}"/><meta name="referrer" content="strict-origin-when-cross-origin"/>`;
  html = html.replace(/<meta charset="utf-8"\s*\/?>/i, (m) => m + meta);
  if (!html.includes("Content-Security-Policy")) throw new Error(`No se pudo insertar la CSP en ${file}`);
  writeFileSync(file, html);
  n++;
}
console.log(`CSP insertada en ${n} páginas`);

// GitHub Pages: sin esto, Jekyll ignora la carpeta _next.
writeFileSync(path.join(OUT, ".nojekyll"), "");
