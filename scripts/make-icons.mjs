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
// Logo de MiSaldo: una moneda (anillo) con el signo $ en blanco, dibujada con distancias para bordes suaves.
const segDist = (px, py, [ax, ay], [bx, by]) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};
const arc = (cx, cy, r, from, to, n = 40) => Array.from({ length: n + 1 }, (_, i) => {
  const a = ((from + ((to - from) * i) / n) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
});
// La «S» del signo: arco superior (de la derecha, por arriba, hasta el centro) y arco inferior (del centro, por abajo, a la izquierda).
const S = [...arc(0.5, 0.415, 0.085, -15, 270), ...arc(0.5, 0.585, 0.085, 90, -195).slice(1)];
const BARS = [[[0.5, 0.265], [0.5, 0.735]]];
function logoCoverage(u, v, px) {
  const ring = Math.abs(Math.hypot(u - 0.5, v - 0.5) - 0.315) - 0.022;
  let s = Infinity;
  for (let i = 1; i < S.length; i++) s = Math.min(s, segDist(u, v, S[i - 1], S[i]));
  for (const [a, b] of BARS) s = Math.min(s, segDist(u, v, a, b));
  const d = Math.min(ring, s - 0.03);
  return Math.max(0, Math.min(1, 0.5 - d / px)); // antialiasing de un píxel
}
function icon(size, { maskable }) {
  const radius = maskable ? 0 : 0.22, scale = maskable ? 0.8 : 1;
  return png(size, (px, py) => {
    const u = px / size, v = py / size;
    const dx = Math.max(radius - u, 0, u - (1 - radius)), dy = Math.max(radius - v, 0, v - (1 - radius));
    if (radius && Math.hypot(dx, dy) > radius) return [0, 0, 0, 0];
    const t = (u + v) / 2;
    const bg = [Math.round(18 - 8 * t), Math.round(140 - 45 * t), Math.round(122 - 37 * t)];
    const k = logoCoverage(0.5 + (u - 0.5) / scale, 0.5 + (v - 0.5) / scale, 1 / (size * scale));
    return [...bg.map((c) => Math.round(c + (255 - c) * k)), 255];
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
