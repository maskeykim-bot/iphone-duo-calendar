// めくりの部品の入口（骨組み）。アプリからはまだ呼ばない（第18版 PR4 で組み込む）。
// createCurl({ canvas, dims, dpr, dark, colors, k })：dark は強制（既定は false。DARK.enabled が true になるまでアプリは渡さない）。

import { makeSet } from './geom.js';
import { CurlRenderer } from './renderer.js';

export function createCurl({ canvas, dims, dpr, dark = false, colors, k, preserve, onLost, onRestored } = {}) {
  const renderer = new CurlRenderer(canvas, { dims, dpr, dark: dark === true, colors, k, preserve, onLost, onRestored });
  return { renderer, set: makeSet(dims), dims: renderer.dims, dispose: () => renderer.dispose() };
}
// WebGL が使えるか（使えないときは今の横すべりに逃げる。④で使う）
export function webglAvailable() {
  try { const c = document.createElement('canvas'); const gl = c.getContext('webgl'); const ok = !!gl; gl?.getExtension('WEBGL_lose_context')?.loseContext(); return ok; } catch { return false; }
}
export * from './params.js';
export * from './geom.js';
