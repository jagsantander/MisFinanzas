// Sirve la exportación estática bajo /MisFinanzas/ como lo hace GitHub Pages (solo para probar).
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve("out"), BASE = "/MisFinanzas", PORT = Number(process.env.PORT ?? 4000);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".woff2": "font/woff2", ".txt": "text/plain", ".gs": "text/plain; charset=utf-8", ".svg": "image/svg+xml" };
createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (!url.startsWith(BASE)) { res.writeHead(302, { Location: BASE + "/" }); return res.end(); }
  let file = path.join(ROOT, url.slice(BASE.length));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!existsSync(file)) { res.writeHead(404, { "content-type": TYPES[".html"] }); return res.end(readFileSync(path.join(ROOT, "404.html"))); }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
}).listen(PORT, () => console.log(`http://localhost:${PORT}${BASE}/`));
