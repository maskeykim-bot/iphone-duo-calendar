// Capacitor 用 www/ を生成 (pages.yml と同じファイル群): node scripts/build-www.mjs
import { rmSync, mkdirSync, cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const www = root + 'www';
rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
for (const f of ['index.html', 'manifest.json', 'sw.js', 'css', 'js', 'icons']) cpSync(root + f, `${www}/${f}`, { recursive: true });
console.log('www built');
