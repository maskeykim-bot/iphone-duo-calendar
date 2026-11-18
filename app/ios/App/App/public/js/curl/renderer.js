// WebGL の描画器：見開き全体を1枚の canvas に描く。紙は細かい網目を頂点シェーダで筒に巻き、明暗と影はフラグメントで計算する。
// curl-webgl-r3.js の WebGLCurl から、寸法（固定の 458・484・860・8・661 など）を引数にし、ページの絵（テクスチャ）の作り方を外へ出した形。
import { K, LIGHT, DARK } from './params.js';
import { VS, FS_BASE, FS_PAPER } from './shaders.js';
import { makeSet, shape } from './geom.js';
import { buildMesh, freeMesh } from './mesh.js';

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
function prog(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); gl.attachShader(p, sh); gl.deleteShader(sh); }
  gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p;
}
const MAP = { ampR0: 'kAmpR0', ampR1: 'kAmpR1', dkFm: 'kDkFm', hiMinW: 'kHiMinW', hiDark: 'kHiDark', hiMask: 'kHiMask', show: 'kShow', backLine: 'kBackLine', hiF: 'kHiF', hiFdeg: 'kHiFd', hiFw: 'kHiFw', dkF0: 'kDkF0', dkF1: 'kDkF1', dkFa: 'kDkFa', dkFb: 'kDkFb', dkB: 'kDkB', hiB: 'kHiB', hiBdeg: 'kHiBd', hiBw: 'kHiBw', flatB: 'kFlatB', flatBw: 'kFlatBw', rootA0: 'kRootA0', rootAK: 'kRootAK', rootIn: 'kRootIn', rootOut0: 'kRootOut0', rootOutK: 'kRootOutK', groove: 'kGroove' };

// opts: { dims:{ W,H（canvas の大きさ pt）, spine, edge, py0, py1, lx0, lx1 }, dpr, dark, colors, k, preserve, onLost, onRestored }
export class CurlRenderer {
  constructor(canvas, opts = {}) {
    const d = this.dims = { ...opts.dims };
    this.cv = canvas; this.dpr = opts.dpr || (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) || 1; this.dark = !!opts.dark;
    this.colors = { ...(this.dark ? DARK : LIGHT), ...(opts.colors || {}) };
    this.K = { ...K, ...(opts.k || {}) }; // この描画器だけの上書き（試験用）。K 自体は凍結のまま
    this.W = d.W; this.H = d.H; this.set = makeSet(d);
    this.onLost = opts.onLost; this.onRestored = opts.onRestored; this.preserve = !!opts.preserve;
    canvas.width = Math.round(this.W * this.dpr); canvas.height = Math.round(this.H * this.dpr);
    canvas.style.width = this.W + 'px'; canvas.style.height = this.H + 'px';
    const gl = this.gl = canvas.getContext('webgl', { antialias: true, alpha: false, preserveDrawingBuffer: this.preserve });
    if (!gl) throw new Error('WebGL なし');
    this.lost = false; this.textures = new Set(); this.cur = null; this.land = null;
    this._lost = (e) => { e.preventDefault(); this.lost = true; this.cur = null; for (const h of this.textures) h.t = null; this.textures.clear(); this.meshes = {}; this.onLost?.(this); };
    // 復帰：GPU の中身は失われているので、絵は持ち主が作り直して setScene する（それまで draw は null を返す）
    this._restored = () => { this._init(); this.lost = false; this.cur = null; this.land = null; this.onRestored?.(this); };
    canvas.addEventListener('webglcontextlost', this._lost); canvas.addEventListener('webglcontextrestored', this._restored);
    this._init();
  }
  _init() {
    const gl = this.gl;
    this.pBase = prog(gl, 'attribute vec2 aX;uniform vec2 uView;varying vec2 vX;void main(){vX=aX;gl_Position=vec4(aX.x/uView.x*2.-1.,1.-aX.y/uView.y*2.,0.9,1.);}', FS_BASE);
    this.pPaper = prog(gl, VS, FS_PAPER);
    this.quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, this.W, 0, 0, this.H, this.W, this.H]), gl.STATIC_DRAW);
    this.meshes = {};
  }
  mesh(dir) { return this.meshes[dir] || (this.meshes[dir] = buildMesh(this.gl, this.set[dir], this.K.grid)); }
  // ページの絵（canvas・ImageBitmap など）を GPU へ。返す：{ t, ms }（t が null なら失われている）。捨てるときは deleteTexture。
  createTexture(src) {
    const gl = this.gl, t1 = performance.now(), t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.finish();
    const h = { t, ms: performance.now() - t1, w: src.width, h: src.height }; this.textures.add(h); return h;
  }
  deleteTexture(h) { if (!h) return; if (h.t && !this.lost) this.gl.deleteTexture(h.t); h.t = null; this.textures.delete(h); }
  // 1回のめくりで使う絵と向きを決める。scene = { dir, Lo, Ln, Ro, Rn, front, next, frontRect }（絵は createTexture の戻り値）
  // Lo/Ln＝左ページの今・次、Ro/Rn＝右ページの今・次、front＝めくる紙の表、next＝裏の着地用、frontRect＝表の絵を置く矩形 [x0,y0,x1,y1]
  setScene(scene) {
    const dir = scene.dir;
    this.cur = { ...scene };
    // 着地の見せ方（design/21 §6.11）。landing.js（④）がこの値を動かす
    this.land = { stripMix: 0, Lnew: dir === 'forward' ? 0 : 1, Rnew: dir === 'forward' ? 1 : 0, paperA: 1, showMul: 1 }; // 第18.2版：めくった下には最初から次のページ（前へ＝次の右・戻り＝次の左）
    this.mesh(dir);
  }
  uni(p, name, ...v) { const l = this.gl.getUniformLocation(p, name); if (l == null) return; if (v.length === 1) this.gl.uniform1f(l, v[0]); else if (v.length === 2) this.gl.uniform2f(l, ...v); else if (v.length === 3) this.gl.uniform3f(l, ...v); else this.gl.uniform4f(l, ...v); }
  draw(g, f) {
    if (this.lost || !this.cur) return null;
    const gl = this.gl, d = this.dims, k = this.K, c = this.colors, cur = this.cur, s = this.set[cur.dir];
    const sh = shape(s, g, f) || { P: [s.edge + 9999 * s.sgn, 0], n: [s.sgn, 0], r: 0, lift: 0 };
    gl.viewport(0, 0, this.cv.width, this.cv.height); gl.clearColor(0.97, 0.96, 0.93, 1); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const rect = [s.x0, d.py0, s.x1, d.py1];
    // 第18.3版：背より左へ寄せる量。前へは紙の端（指）の進み具合 0→1（着地で左ページ x8〜465.5 とぴったり重なる）
    // 第18.5版：戻りも進み具合で 1→0（左ページ 457.5 から右ページ 365.5 へ。着地は右ページそのもの）。寄せる幅 mr は 1−w に比例（着地・始めで 0）
    const prog = Math.min(1, Math.max(0, (s.edge - f[0]) / (s.edge - (2 * s.spine - s.edge))));
    const mw = this.mapW = !(k.fitLeft ?? 1) ? 0 : cur.dir === 'forward' ? prog : 1 - prog, mr = k.fitRamp ?? 120, mf = cur.dir === 'forward' ? mw : (k.fitLeft ?? 1) ? 1 : 0;
    const setCommon = (p) => {
      this.uni(p, 'uP', ...sh.P); this.uni(p, 'uN', ...sh.n); this.uni(p, 'uR', sh.r); this.uni(p, 'uLift', sh.lift); this.uni(p, 'uRect', ...rect); this.uni(p, 'uView', this.W, this.H);
      this.uni(p, 'uGx', d.lx1, d.spine);
      for (const n of ['shOp0', 'shOpK', 'shBl0', 'shBlK', 'shOff0', 'shOffK']) this.uni(p, 'k' + n[0].toUpperCase() + n.slice(1), k[n]);
      this.uni(p, 'uSp', d.spine); this.uni(p, 'uMw', mw); this.uni(p, 'uMr', mr); this.uni(p, 'uMf', mf); const fit = (k.fitLeft ?? 1) ? 1 : 0; this.uni(p, 'uMs', fit ? (d.lx1 - d.lx0) / (d.edge - d.spine) : 1); this.uni(p, 'uMg', fit ? d.spine - d.lx1 : 0);
      this.uni(p, 'uDark', this.dark ? 1 : 0); this.uni(p, 'kSgn', s.sgn); this.uni(p, 'kShadowMul', (this.dark ? k.darkShadow : 1) * this.land.paperA);
    };
    // 下の見開き（左右のページ・溝）と落ちる影
    let p = this.pBase; gl.useProgram(p); gl.disable(gl.DEPTH_TEST); setCommon(p);
    this.uni(p, 'rL', d.lx0, d.py0, d.lx1, d.py1); this.uni(p, 'rR', d.spine, d.py0, d.edge, d.py1);
    this.uni(p, 'bg', ...hex(c.bg)); this.uni(p, 'groove', ...hex(c.groove));
    // 第18.3版：左の帯だけの入れ替えはやめた（紙が左ページ全体を覆う）。uStripX を画面の外へ
    const L = this.land; this.uni(p, 'uStripX', -1e4); this.uni(p, 'uStripMix', L.stripMix); this.uni(p, 'uLnew', L.Lnew); this.uni(p, 'uRnew', L.Rnew); this.uni(p, 'uPaperA', L.paperA);
    ['Lo', 'Ln', 'Ro', 'Rn'].forEach((n, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, cur[n].t); gl.uniform1i(gl.getUniformLocation(p, 't' + n), i); });
    let loc = gl.getAttribLocation(p, 'aX'); gl.bindBuffer(gl.ARRAY_BUFFER, this.quad); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // めくる紙
    p = this.pPaper; gl.useProgram(p); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); setCommon(p);
    if (L.paperA < 1) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); } else gl.disable(gl.BLEND);
    this.uni(p, 'uC', this.W / 2, this.H / 2); this.uni(p, 'uPersp', k.persp);
    for (const [n, u] of Object.entries(MAP)) this.uni(p, u, k[n]);
    this.uni(p, 'kShow', k.show * (L.showMul ?? 1)); // §6.11-10：着地前に透かしを消す
    this.uni(p, 'kNext', Math.max(k.nextOnBack ?? 0, L.landingFace ? 1 : 0)); this.uni(p, 'uSpine', d.spine); this.uni(p, 'uBackRect', ...(cur.backRect || [d.lx0, d.py0, d.lx1, d.py1])); this.uni(p, 'uDebug', k.debug || 0); this.uni(p, 'uPaperA', L.paperA); this.uni(p, 'uFrontRect', ...cur.frontRect); this.uni(p, 'frontPaper', ...hex(c.paper));
    this.uni(p, 'backPaper', ...hex(c.back)); this.uni(p, 'lineCol', ...hex(c.line)); this.uni(p, 'edgeCol', ...hex(c.edge));
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, cur.front.t); gl.uniform1i(gl.getUniformLocation(p, 'tF'), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, cur.next.t); gl.uniform1i(gl.getUniformLocation(p, 'tN'), 1);
    const m = this.mesh(cur.dir); loc = gl.getAttribLocation(p, 'aX'); gl.bindBuffer(gl.ARRAY_BUFFER, m.vb); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib); gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_INT, 0);
    return sh;
  }
  // 試験用：直前の draw の結果を読む（draw と同じタスクの中で呼ぶ）。rect はアプリ座標 pt { x, y, w, h }。返す：{ width, height, data（RGBA、上の行から） }
  readPixels({ x, y, w, h }) {
    const gl = this.gl, dpr = this.dpr, pw = Math.round(w * dpr), ph = Math.round(h * dpr), px = Math.round(x * dpr), py = this.cv.height - Math.round(y * dpr) - ph;
    const buf = new Uint8Array(pw * ph * 4); gl.readPixels(px, py, pw, ph, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const data = new Uint8Array(buf.length); for (let r = 0; r < ph; r++) data.set(buf.subarray((ph - 1 - r) * pw * 4, (ph - r) * pw * 4), r * pw * 4);
    return { width: pw, height: ph, data };
  }
  dispose() {
    this.cv.removeEventListener('webglcontextlost', this._lost); this.cv.removeEventListener('webglcontextrestored', this._restored);
    const gl = this.gl;
    if (!this.lost) {
      for (const h of this.textures) if (h.t) gl.deleteTexture(h.t);
      for (const m of Object.values(this.meshes)) freeMesh(gl, m);
      gl.deleteBuffer(this.quad); gl.deleteProgram(this.pBase); gl.deleteProgram(this.pPaper);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    for (const h of this.textures) h.t = null;
    this.textures.clear(); this.meshes = {}; this.cur = null; this.lost = true;
  }
}
export const createRenderer = (canvas, opts) => new CurlRenderer(canvas, opts);
