// 設計の計算（duo-calendar-team/design/img/colors36-lib.mjs・colors37-lib.mjs）から、単体テストの突き合わせ用の値を書き出す。
// 実行: node scripts/gen-colors-fixture.mjs [設計の img の場所]  → test-unit/fixtures/colors36-37.json
// 値は設計の式が出したもの（手で書かない・丸めない）。設計が変わったらここを回し直す。
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const dir = resolve(process.argv[2] || '/workspace/duo-calendar-team/design/img');
const M = await import(pathToFileURL(`${dir}/colors36-lib.mjs`).href);
const F = await import(pathToFileURL(`${dir}/colors37-lib.mjs`).href);
const pick = (s) => ({ light: { fill: s.light.fill, tint: s.light.tint, line: s.light.line, mark: s.light.mark }, dark: { fill: s.dark.fill, tint: s.dark.tint, line: s.dark.line, mark: s.dark.mark } });
const palette = M.PALETTE.map((p) => ({ n: p.n, name: p.name, hex: p.light, ...pick(M.withMark(p.light, M.setOf(p.light, p.n), false)) }));
const autoList = [...M.EXTRA.map((e) => [e.name, e.light]), ...M.IPHONE.map((c) => ['iPhone ' + c.name, c.hex]), ...M.IPHONE_MOCK.map((c) => ['モック ' + c.name, c.hex]),
  ['1枚目 紺青', '#1264A0'], ['1枚目 水色', '#34AADC'], ['1枚目 赤茶', '#B93B18'], ['1枚目 桃', '#FF2968'], ['1枚目 黄緑', '#9AA615'], ['白', '#FFFFFF'], ['黒', '#000000'], ['純赤', '#FF0000'], ['純黄', '#FFFF00']];
const auto = autoList.map(([name, hex]) => ({ name, hex, ...pick(M.withMark(hex, M.setOfAuto(hex), true)) }));
const sets13 = [...M.PALETTE.map((p) => M.setOf(p.light, p.n)), M.setOfAuto('#68716A')];
const out = {};
for (const mode of ['light', 'dark']) { const o = M.outMonth(mode, sets13); out[mode] = { text: o.text, textAlpha: o.textAlpha, tintAlpha: o.tintAlpha, lineAlpha: o.lineAlpha, tints: o.tints, lines: o.lines }; }
const flick = F.SETS.map((f) => ({ id: f.id, name: f.name, light: { tint: f.s.light.tint, line: f.s.light.line, dL: f.s.light.dL }, dark: { tint: f.s.dark.tint, line: f.s.dark.line, dL: f.s.dark.dL } }));
const data = { from: 'colors36-lib.mjs / colors37-lib.mjs', criteria: M.CRITERIA, bg: M.BG, ink: M.INK, satCol: M.SAT_COL, weekendA: M.WEEKEND.A, moreN: M.MORE_N, shape: M.SHAPE, palette, auto, out, flick };
writeFileSync(new URL('../test-unit/fixtures/colors36-37.json', import.meta.url), JSON.stringify(data, null, 1) + '\n');
console.log('palette', palette.length, 'auto', auto.length, 'flick', flick.length, 'out', out.light.text, out.dark.text, out.light.lineAlpha, out.dark.lineAlpha);
