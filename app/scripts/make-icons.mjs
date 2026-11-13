// 依存なしでアイコン PNG を生成: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const out = (n) => fileURLToPath(new URL(`../icons/${n}`, import.meta.url));
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const t = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
function png(size, pix, rgb = false) {
  const bpp = rgb ? 3 : 4, stride = size * bpp + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) { raw[y * stride] = 0; for (let x = 0; x < size; x++) { const c = pix(x, y); raw.set(rgb ? c.slice(0, 3) : c, y * stride + 1 + x * bpp); } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = rgb ? 2 : 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const GREEN = [0x29, 0x4e, 0x42], PAPER = [0xf7, 0xf4, 0xed], LINE = [0xdd, 0xdc, 0xd3];
// 単位正方形 (0..1) で描く。見開き手帳: 緑地に2枚の紙と中央の折り目。
function shade(u, v, maskable) {
  const inRR = (x0, y0, x1, y1, r) => { const cx = Math.min(Math.max(u, x0 + r), x1 - r), cy = Math.min(Math.max(v, y0 + r), y1 - r); return (u - cx) ** 2 + (v - cy) ** 2 <= r * r && u >= x0 && u <= x1 && v >= y0 && v <= y1; };
  const bg = maskable ? true : inRR(0, 0, 1, 1, 0.22);
  if (!bg) return [0, 0, 0, 0];
  const s = maskable ? 0.8 : 1; // maskable は安全域のため縮小
  const U = (u - 0.5) / s + 0.5, V = (v - 0.5) / s + 0.5;
  const page = (x0, x1) => { const r = 0.05; const cx = Math.min(Math.max(U, x0 + r), x1 - r), cy = Math.min(Math.max(V, 0.24 + r), 0.76 - r); return (U - cx) ** 2 + (V - cy) ** 2 <= r * r; };
  if (U > 0.488 && U < 0.512 && V > 0.22 && V < 0.78) return [...LINE, 255];
  if (page(0.2, 0.488) || page(0.512, 0.8)) {
    // 左ページに日付の点、右ページに罫
    for (const [cx, cy] of [[0.3, 0.4], [0.38, 0.4], [0.3, 0.52], [0.38, 0.52]]) if ((U - cx) ** 2 + (V - cy) ** 2 < 0.0009) return [...GREEN, 255];
    if (U > 0.57 && U < 0.74 && [0.38, 0.5, 0.62].some((y) => Math.abs(V - y) < 0.008)) return [...LINE, 255];
    return [...PAPER, 255];
  }
  return [...GREEN, 255];
}
function icon(size, maskable = false, rgb = false) {
  return png(size, (x, y) => {
    let r = 0, g = 0, b = 0, a = 0; const n = 2;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const c = shade((x + (i + 0.5) / n) / size, (y + (j + 0.5) / n) / size, maskable); r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3]; }
    return a ? [Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round(a / (n * n))] : [0, 0, 0, 0];
  }, rgb);
}
writeFileSync(out('icon-192.png'), icon(192));
writeFileSync(out('icon-512.png'), icon(512));
writeFileSync(out('icon-maskable-512.png'), icon(512, true));
writeFileSync(out('apple-touch-icon.png'), icon(180, true));
// iOS (Capacitor) 用: アルファなし 1024 アイコンと単色スプラッシュ。ios/ が無ければ省略。
const ios = fileURLToPath(new URL('../ios/App/App/Assets.xcassets/', import.meta.url));
if (existsSync(ios)) {
  writeFileSync(ios + 'AppIcon.appiconset/AppIcon-512@2x.png', icon(1024, true, true));
  const splash = png(2732, () => PAPER, true);
  for (const n of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) writeFileSync(ios + 'Splash.imageset/' + n, splash);
}
writeFileSync(out('icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="113" fill="#294e42"/><rect x="102" y="123" width="296" height="266" rx="26" fill="#f7f4ed"/><rect x="244" y="113" width="24" height="286" fill="#ddd9d3"/><g fill="#294e42"><circle cx="154" cy="205" r="14"/><circle cx="194" cy="205" r="14"/><circle cx="154" cy="266" r="14"/><circle cx="194" cy="266" r="14"/></g><g stroke="#ddd9d3" stroke-width="8" stroke-linecap="round"><path d="M293 195h80M293 256h80M293 317h80"/></g></svg>`);
console.log('icons written');
