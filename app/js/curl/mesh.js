// めくる紙の網目（2pt）。方向ごとに1つ。
export function buildMesh(gl, s, grid) {
  const nx = Math.ceil((s.x1 - s.x0) / grid) + 1, ny = Math.ceil((s.py1 - s.py0) / grid) + 1;
  const v = new Float32Array(nx * ny * 2); let k = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { v[k++] = Math.min(s.x1, s.x0 + i * grid); v[k++] = Math.min(s.py1, s.py0 + j * grid); }
  const idx = new Uint32Array((nx - 1) * (ny - 1) * 6); k = 0;
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i; idx[k++] = a; idx[k++] = a + 1; idx[k++] = a + nx; idx[k++] = a + 1; idx[k++] = a + nx + 1; idx[k++] = a + nx; }
  gl.getExtension('OES_element_index_uint');
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  return { vb, ib, n: idx.length, verts: nx * ny };
}
export function freeMesh(gl, m) { gl.deleteBuffer(m.vb); gl.deleteBuffer(m.ib); }
