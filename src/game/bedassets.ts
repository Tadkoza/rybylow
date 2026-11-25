import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { hash2, mulberry32, vnoise, smoothstep } from "./noise";
import { patchMaterial } from "./materials";

/* =========================================================================
 *  Tekstury proceduralne
 * ========================================================================= */

function tileNoise(size: number, fx: number, fy: number, seed: number): Float32Array {
  const rnd = mulberry32(seed);
  const g = new Float32Array(fx * fy);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = (x / size) * fx, v = (y / size) * fy;
      const i0 = Math.floor(u), j0 = Math.floor(v);
      const a = u - i0, b = v - j0;
      const sx = a * a * (3 - 2 * a), sy = b * b * (3 - 2 * b);
      const p00 = g[(j0 % fy) * fx + (i0 % fx)], p10 = g[(j0 % fy) * fx + ((i0 + 1) % fx)];
      const p01 = g[((j0 + 1) % fy) * fx + (i0 % fx)], p11 = g[((j0 + 1) % fy) * fx + ((i0 + 1) % fx)];
      out[y * size + x] = p00 + (p10 - p00) * sx + (p01 - p00) * sy + (p00 - p10 - p01 + p11) * sx * sy;
    }
  return out;
}

function dataTex(w: number, h: number, data: Uint8Array, srgb: boolean): THREE.DataTexture {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

let barkTex: THREE.DataTexture | null = null;
/** kora / drewno: pionowe bruzdy, spękania i słoje */
export function getBarkTexture(): THREE.DataTexture {
  if (barkTex) return barkTex;
  const S = 256;
  const n1 = tileNoise(S, 18, 3, 11), n2 = tileNoise(S, 40, 5, 12), n3 = tileNoise(S, 9, 2, 13), n4 = tileNoise(S, 6, 6, 14), n5 = tileNoise(S, 80, 10, 15);
  const data = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    const v = 0.5 * n1[i] + 0.28 * n2[i] + 0.12 * n4[i] + 0.1 * n5[i];
    const crack = 1 - smoothstep(0, 0.06, Math.abs(n3[i] - 0.5));
    const val = Math.min(1, Math.max(0, 0.42 + 0.95 * (v - 0.45) - 0.55 * crack));
    const b = Math.round(val * 255);
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  barkTex = dataTex(S, S, data, false);
  return barkTex;
}

/* ---- atlas roślin wodnych i liści: 4 x 4 komórki po 256 px ---- */
const CELL = 256;
export const AQ = { hornwort: 0, milfoil: 1, chara: 2, pondweed: 3, hornwort2: 4, milfoil2: 5, alder: 8, birch: 9, oak: 10, willow: 11 };

export function aquaUV(cell: number): [number, number, number, number] {
  const c = cell % 4, r = Math.floor(cell / 4);
  const e = 1 / 1024; // niewielki margines
  return [c / 4 + e, 1 - (r + 1) / 4 + e, (c + 1) / 4 - e, 1 - r / 4 - e];
}

type Ctx = CanvasRenderingContext2D;
const pt = (x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, t: number): [number, number] => {
  const m = 1 - t;
  return [m * m * x0 + 2 * m * t * cx + t * t * x1, m * m * y0 + 2 * m * t * cy + t * t * y1];
};

function drawHornwort(ctx: Ctx, rnd: () => number, ox: number, oy: number, height: number, bend: number, depth: number, hue: number) {
  const nodes = Math.round(height / 8.5);
  const ph = rnd() * 6;
  const at = (t: number): [number, number] => [ox + Math.sin(t * 2.4 + ph) * 14 * t + bend * t * t, oy - t * height];
  ctx.strokeStyle = `hsl(${hue + 4}, 34%, 11%)`;
  ctx.lineWidth = 3.2 - depth;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let i = 0; i <= 24; i++) {
    const [x, y] = at(i / 24);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.stroke();
  for (let i = 2; i <= nodes; i++) {
    const t = i / nodes;
    const [px, py] = at(t);
    const len = (38 - 18 * t) * (0.8 + 0.4 * rnd()) * (1 - depth * 0.25);
    const lc = 9;
    for (let k = 0; k < lc; k++) {
      const a = -Math.PI / 2 + (k / (lc - 1) - 0.5) * (2.6 - 0.6 * t) + (rnd() - 0.5) * 0.18;
      const cxp = px + Math.cos(a) * len * 0.55, cyp = py + Math.sin(a) * len * 0.55 + 3;
      const ex = px + Math.cos(a) * len, ey = py + Math.sin(a) * len * 0.92 + 4;
      ctx.strokeStyle = `hsl(${hue + rnd() * 20}, ${34 + rnd() * 16}%, ${12 + 17 * t + rnd() * 7}%)`;
      ctx.lineWidth = 1.7 + (1 - t) * 0.5;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.quadraticCurveTo(cxp, cyp, ex, ey);
      ctx.stroke();
      const [mx, my] = pt(px, py, cxp, cyp, ex, ey, 0.62);
      ctx.lineWidth = 1.1;
      for (const s of [-0.5, 0.5]) {
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.lineTo(mx + Math.cos(a + s) * len * 0.38, my + Math.sin(a + s) * len * 0.38 + 2);
        ctx.stroke();
      }
    }
  }
  if (depth < 2 && height > 90) {
    for (let b = 0; b < 3; b++) {
      const t = 0.18 + rnd() * 0.45;
      const [bx, by] = at(t);
      const side = rnd() < 0.5 ? -1 : 1;
      drawHornwort(ctx, rnd, bx, by, height * (0.35 + rnd() * 0.25), side * (26 + rnd() * 34), depth + 1, hue);
    }
  }
}

function drawFeather(ctx: Ctx, rnd: () => number, x: number, y: number, ang: number, len: number, light: number) {
  const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
  const cx = x + Math.cos(ang) * len * 0.5, cy = y + Math.sin(ang) * len * 0.5 + len * 0.12;
  ctx.strokeStyle = `hsl(75, 26%, ${light - 6}%)`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(cx, cy, ex, ey);
  ctx.stroke();
  const n = 13;
  for (let i = 1; i <= n; i++) {
    const u = i / (n + 1);
    const [px, py] = pt(x, y, cx, cy, ex, ey, u);
    const [qx, qy] = pt(x, y, cx, cy, ex, ey, Math.min(1, u + 0.04));
    const ta = Math.atan2(qy - py, qx - px);
    const ll = len * 0.4 * (1 - u * 0.68) * (0.8 + 0.4 * rnd());
    for (const s of [-1, 1]) {
      const a = ta + s * (0.85 + rnd() * 0.3);
      ctx.strokeStyle = `hsl(${68 + rnd() * 22}, ${28 + rnd() * 14}%, ${light + rnd() * 10}%)`;
      ctx.lineWidth = 0.95;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.quadraticCurveTo(px + Math.cos(a) * ll * 0.55, py + Math.sin(a) * ll * 0.55 + 2, px + Math.cos(a + s * 0.25) * ll, py + Math.sin(a + s * 0.25) * ll + 3);
      ctx.stroke();
    }
  }
}

function drawMilfoil(ctx: Ctx, rnd: () => number, bendX: number) {
  const ox = 128, oy = 252, height = 225;
  const at = (t: number): [number, number] => [ox + bendX * t * t + Math.sin(t * 3) * 8 * t, oy - t * height];
  ctx.strokeStyle = "hsl(70, 25%, 22%)";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let i = 0; i <= 20; i++) {
    const [x, y] = at(i / 20);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.stroke();
  const nodes = 11;
  for (let i = 1; i <= nodes; i++) {
    const t = i / nodes;
    const [px, py] = at(t);
    const len = 62 - 30 * t;
    const light = 17 + 14 * t;
    drawFeather(ctx, rnd, px, py, -Math.PI / 2 - 1.0 - rnd() * 0.3, len, light);
    drawFeather(ctx, rnd, px, py, -Math.PI / 2 + 1.0 + rnd() * 0.3, len, light);
    if (i % 2) drawFeather(ctx, rnd, px, py, -Math.PI / 2 + (rnd() - 0.5) * 0.4, len * 0.85, light + 4);
  }
}

function drawChara(ctx: Ctx, rnd: () => number) {
  ctx.lineCap = "round";
  for (let s = 0; s < 15; s++) {
    const bx = 128 + (rnd() - 0.5) * 36;
    const ex = 128 + (rnd() - 0.5) * 190, ey = 252 - 90 - rnd() * 130;
    const cx = bx + (ex - bx) * 0.25, cy = 252 - (252 - ey) * 0.7;
    ctx.strokeStyle = `hsl(${88 + rnd() * 20}, ${22 + rnd() * 12}%, ${27 + rnd() * 13}%)`;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(bx, 252);
    ctx.quadraticCurveTo(cx, cy, ex, ey);
    ctx.stroke();
    const ang = Math.atan2(ey - cy, ex - cx);
    for (let k = 1; k <= 8; k++) {
      const u = k / 9;
      const [px, py] = pt(bx, 252, cx, cy, ex, ey, u);
      const bl = 15 * (1 - u * 0.5) * (0.7 + 0.6 * rnd());
      for (let w = 0; w < 6; w++) {
        const a = ang - Math.PI / 2 + (w / 5) * Math.PI + (rnd() - 0.5) * 0.3;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(a) * bl * (w === 0 || w === 5 ? 0.7 : 1), py + Math.sin(a) * bl);
        ctx.stroke();
      }
    }
  }
}

function drawPondweed(ctx: Ctx, rnd: () => number) {
  const ox = 128, oy = 252, height = 232;
  const at = (t: number): [number, number] => [ox + Math.sin(t * 2.6) * 18 * t + 10 * t, oy - t * height];
  ctx.strokeStyle = "hsl(60, 26%, 18%)";
  ctx.lineWidth = 3.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let i = 0; i <= 22; i++) {
    const [x, y] = at(i / 22);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.stroke();
  const n = 8;
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 0.6);
    const [px, py] = at(t);
    const side = i % 2 ? 1 : -1;
    const ang = -Math.PI / 2 + side * (0.75 + rnd() * 0.3);
    const rx = 36 - 10 * t + rnd() * 8, ry = 13 - 3 * t + rnd() * 3;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang + Math.PI / 2);
    ctx.translate(0, -rx * 0.9);
    ctx.rotate(-Math.PI / 2);
    const g = ctx.createLinearGradient(-rx, 0, rx, 0);
    g.addColorStop(0, "hsl(78, 30%, 20%)");
    g.addColorStop(0.6, "hsl(92, 32%, 25%)");
    g.addColorStop(1, "hsl(100, 30%, 32%)");
    ctx.fillStyle = g;
    ctx.beginPath();
    for (let k = 0; k <= 36; k++) {
      const a = (k / 36) * Math.PI * 2;
      const wave = 1 + 0.07 * Math.sin(a * 7 + i);
      const x = Math.cos(a) * rx * wave, y = Math.sin(a) * ry * wave;
      if (k) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.fill();
    ctx.strokeStyle = "hsla(90, 40%, 62%, 0.85)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-rx, 0);
    ctx.lineTo(rx, 0);
    ctx.stroke();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = "hsla(90, 40%, 58%, 0.6)";
    for (let v = -4; v <= 4; v++) {
      if (!v) continue;
      ctx.beginPath();
      ctx.moveTo(v * rx * 0.2, 0);
      ctx.quadraticCurveTo(v * rx * 0.2 + 3, Math.sign(v) * ry * 0.5, v * rx * 0.24, Math.sign(v) * ry * 0.85);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(v * rx * 0.2, 0);
      ctx.quadraticCurveTo(v * rx * 0.2 + 3, -ry * 0.5, v * rx * 0.24, -ry * 0.85);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** liść: kontur z funkcji szerokości, nerwy, gradient */
function drawLeaf(ctx: Ctx, rnd: () => number, kind: "alder" | "birch" | "oak" | "willow") {
  const L = kind === "willow" ? 210 : 190, y0 = 232, cx = 128;
  const W = kind === "willow" ? 21 : kind === "oak" ? 62 : kind === "birch" ? 58 : 66;
  const wf = (s: number): number => {
    switch (kind) {
      case "alder":
        return W * Math.sin(Math.PI * Math.pow(s, 0.78)) * (1 - Math.pow(s, 9) * 0.35);
      case "birch":
        return W * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.62)), 1.15) * (1 + 0.07 * Math.sin(s * 70));
      case "oak":
        return W * Math.sin(Math.PI * Math.pow(s, 0.75)) * (0.66 + 0.34 * Math.abs(Math.sin(s * 3.5 * Math.PI + 0.4)));
      default:
        return W * Math.sin(Math.PI * Math.pow(s, 0.85));
    }
  };
  const g = ctx.createLinearGradient(cx - W, 0, cx + W, 0);
  const hue = kind === "oak" ? 32 : kind === "birch" ? 52 : kind === "willow" ? 70 : 44;
  g.addColorStop(0, `hsl(${hue}, 46%, 24%)`);
  g.addColorStop(0.5, `hsl(${hue + 8}, 44%, 34%)`);
  g.addColorStop(1, `hsl(${hue}, 42%, 26%)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  const N = 60;
  for (let k = 0; k <= N; k++) {
    const s = k / N;
    const x = cx - wf(s), y = y0 - L * s;
    if (k) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  for (let k = N; k >= 0; k--) {
    const s = k / N;
    ctx.lineTo(cx + wf(s), y0 - L * s);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = `hsla(${hue + 10}, 40%, 52%, 0.8)`;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(cx, y0 + 18);
  ctx.lineTo(cx, y0 - L * 0.97);
  ctx.stroke();
  ctx.lineWidth = 1.1;
  const veins = kind === "willow" ? 0 : 9;
  for (let v = 1; v <= veins; v++) {
    const s = v / (veins + 1);
    const w = wf(s) * 0.92;
    for (const sd of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx, y0 - L * s);
      ctx.lineTo(cx + sd * w, y0 - L * (s + 0.09));
      ctx.stroke();
    }
  }
  // plamki i uszkodzenia
  for (let i = 0; i < 14; i++) {
    const s = 0.1 + rnd() * 0.8;
    ctx.fillStyle = `hsla(${25 + rnd() * 20}, 40%, ${14 + rnd() * 10}%, 0.35)`;
    ctx.beginPath();
    ctx.arc(cx + (rnd() - 0.5) * wf(s) * 1.5, y0 - L * s, 2 + rnd() * 6, 0, 6.3);
    ctx.fill();
  }
}

let aquaTex: THREE.DataTexture | null = null;
export function getAquaAtlas(): THREE.DataTexture {
  if (aquaTex) return aquaTex;
  const c = document.createElement("canvas");
  c.width = c.height = CELL * 4;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const cell = (i: number, fn: (rnd: () => number) => void) => {
    ctx.save();
    ctx.translate((i % 4) * CELL, Math.floor(i / 4) * CELL);
    ctx.beginPath();
    ctx.rect(0, 0, CELL, CELL);
    ctx.clip();
    fn(mulberry32(100 + i * 7));
    ctx.restore();
  };
  cell(AQ.hornwort, (r) => drawHornwort(ctx, r, 128, 250, 215, 10, 0, 92));
  cell(AQ.hornwort2, (r) => drawHornwort(ctx, r, 120, 250, 190, -30, 0, 100));
  cell(AQ.milfoil, (r) => drawMilfoil(ctx, r, 14));
  cell(AQ.milfoil2, (r) => drawMilfoil(ctx, r, -26));
  cell(AQ.chara, (r) => drawChara(ctx, r));
  cell(AQ.pondweed, (r) => drawPondweed(ctx, r));
  cell(AQ.alder, (r) => drawLeaf(ctx, r, "alder"));
  cell(AQ.birch, (r) => drawLeaf(ctx, r, "birch"));
  cell(AQ.oak, (r) => drawLeaf(ctx, r, "oak"));
  cell(AQ.willow, (r) => drawLeaf(ctx, r, "willow"));

  // dane bez premultiplikacji; odwrócenie wierszy (DataTexture nie ma flipY) i wypełnienie koloru przezroczystych pikseli
  const src = ctx.getImageData(0, 0, CELL * 4, CELL * 4);
  const W = CELL * 4;
  const out = new Uint8Array(W * W * 4);
  const avg: number[][] = [];
  for (let ci = 0; ci < 16; ci++) {
    const cx0 = (ci % 4) * CELL, cy0 = Math.floor(ci / 4) * CELL;
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = cy0; y < cy0 + CELL; y += 2)
      for (let x = cx0; x < cx0 + CELL; x += 2) {
        const o = (y * W + x) * 4;
        if (src.data[o + 3] > 140) {
          r += src.data[o];
          g += src.data[o + 1];
          b += src.data[o + 2];
          n++;
        }
      }
    avg.push(n ? [r / n, g / n, b / n] : [70, 90, 40]);
  }
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      const d = ((W - 1 - y) * W + x) * 4;
      const a = src.data[o + 3];
      const ci = Math.floor(y / CELL) * 4 + Math.floor(x / CELL);
      const av = avg[ci];
      if (a < 24) {
        out[d] = av[0];
        out[d + 1] = av[1];
        out[d + 2] = av[2];
      } else {
        out[d] = src.data[o];
        out[d + 1] = src.data[o + 1];
        out[d + 2] = src.data[o + 2];
      }
      out[d + 3] = Math.min(255, a * 1.15);
    }
  aquaTex = dataTex(W, W, out, true);
  aquaTex.anisotropy = 8;
  return aquaTex;
}

/** debug: atlas jako canvas (testy) */
export function aquaAtlasToDataURL(): string {
  const t = getAquaAtlas();
  const W = CELL * 4;
  const c = document.createElement("canvas");
  c.width = c.height = W;
  const ctx = c.getContext("2d")!;
  const id = ctx.createImageData(W, W);
  const d = t.image.data as Uint8Array;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) for (let k = 0; k < 4; k++) id.data[(y * W + x) * 4 + k] = d[((W - 1 - y) * W + x) * 4 + k];
  ctx.fillStyle = "#6a8aa0";
  ctx.fillRect(0, 0, W, W);
  const tmp = document.createElement("canvas");
  tmp.width = tmp.height = W;
  tmp.getContext("2d")!.putImageData(id, 0, 0);
  ctx.drawImage(tmp, 0, 0);
  return c.toDataURL("image/png");
}

/* =========================================================================
 *  Geometrie
 * ========================================================================= */

class Builder {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  get n() {
    return this.pos.length / 3;
  }
  v(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, vv: number, c: THREE.Color) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.uv.push(u, vv);
    this.col.push(c.r, c.g, c.b);
  }
  geometry(withUV = true, withColor = true): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    if (withUV) g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    if (withColor) g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    return g;
  }
}

/** realistyczny kamień: przecięcie półprzestrzeni (miękkie krawędzie) + szum, płaskie dno */
export function rockGeometry(seed: number, detail: number, o: { round?: number; flat?: number; elong?: number; rough?: number } = {}): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute("uv");
  g.deleteAttribute("normal");
  g = mergeVertices(g, 1e-4);
  const rnd = mulberry32(seed);
  const np = 7 + Math.floor(rnd() * 5);
  const planes: { n: THREE.Vector3; d: number }[] = [];
  for (let k = 0; k < np; k++) {
    const n = new THREE.Vector3(rnd() * 2 - 1, (rnd() * 2 - 1) * 0.8, rnd() * 2 - 1).normalize();
    planes.push({ n, d: 0.6 + rnd() * 0.3 });
  }
  const K = o.round ?? 14;
  const flat = o.flat ?? 0.7;
  const el = o.elong ?? 0.25;
  const sx = 1 + el * (rnd() - 0.3), sz = 1 - el * 0.5 * rnd();
  const rough = o.rough ?? 0.1;
  const p = g.attributes.position;
  const u = new THREE.Vector3();
  const colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    u.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    let sum = Math.exp(-K * 1.0);
    for (const pl of planes) {
      const c = u.dot(pl.n);
      if (c > 0.02) sum += Math.exp(-K * (pl.d / c));
    }
    let r = -Math.log(sum) / K;
    const nz = vnoise(u.x * 2.3 + u.z * 5.3 + seed, u.y * 2.3 - u.z * 2.7, seed) * 0.6 + vnoise(u.x * 7 + u.z * 3.1, u.y * 7 - u.z * 6.2, seed + 3) * 0.4;
    r *= 1 + rough * (nz * 2 - 1);
    const x = u.x * r * sx, z = u.z * r * sz;
    let y = u.y * r * flat;
    const yb = -0.42 * flat;
    if (y < yb) y = yb + (y - yb) * 0.12;
    p.setXYZ(i, x, y, z);
    const shade = 0.82 + 0.3 * vnoise(u.x * 3.7 + 9, u.y * 3.7 + u.z * 2.1, seed + 8);
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = shade;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** gałązka / konar / kłoda z rozwidleniami; oś główna wzdłuż +X, leży na ziemi */
export function branchGeometry(
  seed: number,
  o: { len: number; r: number; forks: number; wobble?: number; upright?: boolean; broken?: boolean; pale?: boolean; sides?: number }
): THREE.BufferGeometry {
  const rnd = mulberry32(seed);
  const b = new Builder();
  const sides = o.sides ?? 6;
  const cDark = new THREE.Color(o.pale ? "#8d8573" : "#4c3b2a");
  const cLite = new THREE.Color(o.pale ? "#b4ad9b" : "#6d5842");
  const cCut = new THREE.Color("#c9ad82");
  const tmp = new THREE.Color();
  const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), R = new THREE.Vector3();

  const tube = (pts: THREE.Vector3[], radii: number[], cap: boolean) => {
    const base = b.n;
    let acc = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], c = pts[Math.min(pts.length - 1, i + 1)];
      T.subVectors(c, a).normalize();
      R.set(0, 1, 0);
      if (Math.abs(T.y) > 0.92) R.set(1, 0, 0);
      N.crossVectors(R, T).normalize();
      B.crossVectors(T, N).normalize();
      if (i) acc += pts[i].distanceTo(pts[i - 1]);
      const t = i / (pts.length - 1);
      tmp.copy(cDark).lerp(cLite, t * 0.7 + rnd() * 0.15).multiplyScalar(0.82 + 0.3 * rnd());
      for (let k = 0; k <= sides; k++) {
        const th = (k / sides) * Math.PI * 2;
        const cs = Math.cos(th), sn = Math.sin(th);
        const nx = N.x * cs + B.x * sn, ny = N.y * cs + B.y * sn, nz = N.z * cs + B.z * sn;
        const rr = radii[i] * (1 + (hash2(k, i, seed) - 0.5) * 0.14);
        b.v(pts[i].x + nx * rr, pts[i].y + ny * rr, pts[i].z + nz * rr, nx, ny, nz, k / sides, acc * 2.2, tmp);
      }
    }
    for (let i = 0; i < pts.length - 1; i++)
      for (let k = 0; k < sides; k++) {
        const a0 = base + i * (sides + 1) + k, a1 = a0 + 1, c0 = a0 + sides + 1, c1 = c0 + 1;
        b.idx.push(a0, a1, c0, a1, c1, c0);
      }
    if (cap) {
      // zaślepka na końcu (jasne drewno przełomu)
      const last = pts.length - 1;
      const ring = base + last * (sides + 1);
      const ci = b.n;
      const tip = pts[last];
      T.subVectors(tip, pts[last - 1]).normalize();
      b.v(tip.x, tip.y, tip.z, T.x, T.y, T.z, 0.5, acc * 2.2, cCut);
      const rb = b.n;
      for (let k = 0; k <= sides; k++) {
        const x = b.pos[(ring + k) * 3], y = b.pos[(ring + k) * 3 + 1], z = b.pos[(ring + k) * 3 + 2];
        b.v(x, y, z, T.x, T.y, T.z, k / sides, acc * 2.2, cCut);
      }
      for (let k = 0; k < sides; k++) b.idx.push(ci, rb + k, rb + k + 1);
    }
  };

  const grow = (origin: THREE.Vector3, dir: THREE.Vector3, len: number, r0: number, depth: number, broken: boolean) => {
    const n = Math.min(9, Math.max(4, Math.round(len / 0.2) + 2));
    const pts: THREE.Vector3[] = [];
    const radii: number[] = [];
    const p = origin.clone();
    const d = dir.clone().normalize();
    for (let i = 0; i <= n; i++) {
      pts.push(p.clone());
      const t = i / n;
      radii.push(Math.max(0.0035, r0 * (1 - (broken ? 0.45 : 0.78) * t) * (1 + 0.1 * Math.sin(t * 9 + seed))));
      p.addScaledVector(d, len / n);
      const w = (o.wobble ?? 0.18) * (depth ? 1.6 : 1);
      d.x += (rnd() - 0.5) * w * 0.4;
      d.y += (rnd() - 0.5) * w * 0.5 + (o.upright ? 0 : 0);
      d.z += (rnd() - 0.5) * w;
      d.normalize();
    }
    tube(pts, radii, broken);
    if (depth < 2) {
      const nf = depth === 0 ? o.forks : Math.max(0, Math.round(o.forks * 0.5));
      for (let f = 0; f < nf; f++) {
        const t = 0.22 + rnd() * 0.6;
        const idx = Math.min(n - 1, Math.floor(t * n));
        const side = rnd() < 0.5 ? -1 : 1;
        const ang = side * (0.45 + rnd() * 0.55);
        const fd = pts[idx + 1].clone().sub(pts[idx]).normalize();
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const nd = new THREE.Vector3(fd.x * ca - fd.z * sa, fd.y + (o.upright ? 0.3 : 0.12 + rnd() * 0.3), fd.x * sa + fd.z * ca).normalize();
        grow(pts[idx], nd, len * (0.22 + rnd() * 0.3) * (depth ? 0.7 : 1), radii[idx] * 0.62, depth + 1, false);
      }
    }
  };
  const start = new THREE.Vector3(-o.len * 0.5, o.upright ? -0.1 : o.r * 0.9, 0);
  const dir = o.upright ? new THREE.Vector3(0.28, 1, 0.08) : new THREE.Vector3(1, 0.04, (rnd() - 0.5) * 0.2);
  grow(start, dir, o.len, o.r, 0, !!o.broken);
  const g = b.geometry();
  g.computeBoundingSphere();
  return g;
}

/** małża (skójka / szczeżuja): półskorupa z przyrostami */
export function shellGeometry(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 26, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  g.deleteAttribute("uv");
  const p = g.attributes.position;
  const cols = new Float32Array(p.count * 3);
  const dark = new THREE.Color("#2b2417"), olive = new THREE.Color("#6e6238"), lip = new THREE.Color("#a79a6a");
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const tt = x * 0.5 + 0.5;
    const taper = 0.6 + 0.4 * tt;
    const nx = x * 0.5, nz = z * 0.27 * taper, ny = y * 0.2 * (0.75 + 0.5 * tt);
    p.setXYZ(i, nx, ny, nz);
    const dist = Math.hypot((x + 0.85) * 0.7, z * 1.1);
    const ring = 0.5 + 0.5 * Math.sin(dist * 36 + vnoise(x * 4, z * 4, 5) * 3);
    c.copy(dark).lerp(olive, ring * 0.65 + 0.15);
    c.lerp(lip, smoothstep(0.82, 1, 1 - y) * 0.5);
    cols[i * 3] = c.r;
    cols[i * 3 + 1] = c.g;
    cols[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}

/** kępa wstęgowatych liści (jezierza / Vallisneria) */
export function ribbonTuftGeometry(seed = 5): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], col: number[] = [];
  const cA = new THREE.Color("#1a3010"), cB = new THREE.Color("#33581b"), cC = new THREE.Color("#5c7d2b");
  const c = new THREE.Color();
  const n = 11;
  for (let k = 0; k < n; k++) {
    const a = hash2(k, seed, 1) * Math.PI * 2;
    const rr = hash2(k, seed, 2) * 0.08;
    const L = 0.5 + hash2(k, seed, 3) * 0.8;
    const wd = 0.011 + hash2(k, seed, 4) * 0.01;
    const lean = 0.12 + hash2(k, seed, 5) * 0.4;
    const dx = Math.cos(a), dz = Math.sin(a);
    const tx = -dz, tz = dx;
    const bx = Math.cos(a + 1.1) * rr, bz = Math.sin(a + 1.1) * rr;
    const segs = 7;
    const ph = hash2(k, seed, 6) * 6;
    const ring = (s: number) => {
      const t = s / segs;
      const bend = lean * L * t * t + Math.sin(t * 5 + ph) * 0.03 * t;
      const w = wd * (1 - 0.55 * t) * (s === segs ? 0.15 : 1);
      const cx = bx + dx * bend, cz = bz + dz * bend, y = L * t * (1 - 0.1 * t);
      const tw = Math.sin(t * 4 + ph) * 0.35;
      return { l: [cx - (tx + dx * tw) * w, y, cz - (tz + dz * tw) * w], r: [cx + (tx + dx * tw) * w, y, cz + (tz + dz * tw) * w], t };
    };
    for (let s = 0; s < segs; s++) {
      const A = ring(s), B = ring(s + 1);
      for (const [v, t] of [[A.l, A.t], [A.r, A.t], [B.r, B.t], [A.l, A.t], [B.r, B.t], [B.l, B.t]] as [number[], number][]) {
        pos.push(v[0], v[1], v[2]);
        nor.push(0, 1, 0);
        c.copy(cA).lerp(cB, smoothstep(0, 0.5, t)).lerp(cC, smoothstep(0.5, 1, t)).multiplyScalar(0.9 + 0.2 * hash2(k, s, 7));
        col.push(c.r, c.g, c.b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/** skrzyżowane, pionowe karty z teksturą z atlasu; kilka rzędów, żeby kołysanie giął się płynnie */
export function aquaCardGeometry(cell: number, w: number, h: number, planes = 3, rows = 4): THREE.BufferGeometry {
  const [u0, v0, u1, v1] = aquaUV(cell);
  const b = new Builder();
  const white = new THREE.Color(1, 1, 1);
  for (let k = 0; k < planes; k++) {
    const a = (k * Math.PI) / planes + 0.35;
    const dx = Math.cos(a) * w * 0.5, dz = Math.sin(a) * w * 0.5;
    const px = -Math.sin(a), pz = Math.cos(a);
    const base = b.n;
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      const bend = 0.09 * h * t * t;
      for (const sd of [-1, 1]) b.v(sd * dx + px * bend, t * h, sd * dz + pz * bend, 0, 1, 0, sd < 0 ? u0 : u1, v0 + (v1 - v0) * t, white);
    }
    for (let r = 0; r < rows; r++) {
      const i = base + r * 2;
      b.idx.push(i, i + 1, i + 3, i, i + 3, i + 2);
    }
  }
  return b.geometry(true, false);
}

/** płaski liść leżący na dnie / pływający */
export function leafGeometry(cell: number): THREE.BufferGeometry {
  const [u0, v0, u1, v1] = aquaUV(cell);
  const b = new Builder();
  const white = new THREE.Color(1, 1, 1);
  const n = 3;
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const s = i / n, t = j / n;
      const cup = 0.1 * Math.sin(Math.PI * s) * Math.sin(Math.PI * t) + 0.04 * Math.abs(s - 0.5);
      // liść wzdłuż osi X, uv: pionowa oś liścia = długość
      b.v((s - 0.5) * 0.62, cup * 0.5 + 0.004, (t - 0.5) * 1.0, 0, 1, 0, u0 + (u1 - u0) * s, v0 + (v1 - v0) * t, white);
    }
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      b.idx.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2);
    }
  return b.geometry(true, false);
}

/** łodyga grzybienia: cienki walec od y = 0 do y = 1 */
export function stemGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.0055, 0.0075, 1, 5, 1, true);
  g.translate(0, 0.5, 0);
  g.deleteAttribute("uv");
  const cols = new Float32Array(g.attributes.position.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < g.attributes.position.count; i++) {
    c.set("#4c5a22").lerp(new THREE.Color("#7c8a3a"), g.attributes.position.getY(i));
    cols[i * 3] = c.r;
    cols[i * 3 + 1] = c.g;
    cols[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  return g;
}

/* =========================================================================
 *  Materiały
 * ========================================================================= */

export function makeStoneMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 });
  patchMaterial(m, { detail: 0.4, detailScale: 2.5, detailFar: 50, uw: true, stone: true });
  return m;
}

export function makeBarkMaterial(): THREE.MeshStandardMaterial {
  const tex = getBarkTexture();
  const m = new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 2.2, vertexColors: true, roughness: 0.93, metalness: 0 });
  patchMaterial(m, { detail: 0.35, detailScale: 3, detailFar: 30, uw: true });
  return m;
}

export function makeShellMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.05, side: THREE.DoubleSide });
  patchMaterial(m, { detail: 0.2, detailScale: 6, detailFar: 20, uw: true });
  return m;
}

export function makeAquaCardMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ map: getAquaAtlas(), alphaTest: 0.36, side: THREE.DoubleSide, roughness: 0.78, metalness: 0 });
  patchMaterial(m, { sway: 0.2, swayHeight: 1.0, swaySpd: 0.55, detail: 0, noFlip: true, uw: true });
  return m;
}

export function makeRibbonMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.62, metalness: 0 });
  patchMaterial(m, { sway: 0.3, swayHeight: 0.9, swaySpd: 0.5, detail: 0, noFlip: true, uw: true });
  return m;
}

export function makeStemMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7, metalness: 0 });
  patchMaterial(m, { sway: 0.05, swayHeight: 1.2, swaySpd: 0.5, detail: 0, uw: true });
  return m;
}
