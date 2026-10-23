// Genera los iconos PNG de la PWA sin dependencias (zlib nativo).
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

function crc32(buf) { let c, crc = ~0; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png(size, draw) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; for (let x = 0; x < size; x++) { const [r, g, b, a] = draw(x + 0.5, y + 0.5); const o = y * (size * 4 + 1) + 1 + x * 4; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
// Letra "M" como polígono en coordenadas unitarias.
const M = [[0.26, 0.72], [0.26, 0.3], [0.36, 0.3], [0.5, 0.5], [0.64, 0.3], [0.74, 0.3], [0.74, 0.72], [0.64, 0.72], [0.64, 0.47], [0.5, 0.66], [0.36, 0.47], [0.36, 0.72]];
function inPoly(x, y, poly) { let ins = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins; } return ins; }
function icon(size, { maskable }) {
  const radius = maskable ? 0 : 0.22, scale = maskable ? 0.8 : 1;
  return png(size, (px, py) => {
    const u = px / size, v = py / size;
    const dx = Math.max(radius - u, 0, u - (1 - radius)), dy = Math.max(radius - v, 0, v - (1 - radius));
    if (radius && Math.hypot(dx, dy) > radius) return [0, 0, 0, 0];
    const t = (u + v) / 2;
    const bg = [Math.round(15 - 5 * t), Math.round(125 - 30 * t), Math.round(112 - 27 * t), 255];
    const mu = 0.5 + (u - 0.5) / scale, mv = 0.5 + (v - 0.5) / scale;
    return inPoly(mu, mv, M) ? [255, 255, 255, 255] : bg;
  });
}
mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", icon(192, { maskable: false }));
writeFileSync("public/icons/icon-512.png", icon(512, { maskable: false }));
writeFileSync("public/icons/icon-maskable-512.png", icon(512, { maskable: true }));
writeFileSync("public/icons/apple-touch-icon.png", icon(180, { maskable: true }));
console.log("Iconos generados en public/icons");

// Iconos de la app Android (TWA)
const RES = "android/app/src/main/res";
for (const [dens, size] of [["mdpi", 48], ["hdpi", 72], ["xhdpi", 96], ["xxhdpi", 144], ["xxxhdpi", 192]]) {
  mkdirSync(`${RES}/mipmap-${dens}`, { recursive: true });
  writeFileSync(`${RES}/mipmap-${dens}/ic_launcher.png`, icon(size, { maskable: false }));
}
writeFileSync(`${RES}/drawable/splash.png`, icon(384, { maskable: false }));
console.log("Iconos Android generados en android/app/src/main/res");
