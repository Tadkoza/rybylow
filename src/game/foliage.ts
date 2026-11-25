import * as THREE from "three";
import { mulberry32 } from "./noise";

/**
 * Atlas liści 1024x512 (4x2 komórki po 256 px), skala szarości + alfa.
 * Kolor nadają wierzchołki. Komórki: 0 liściaste, 1 brzoza, 2 gałązka świerka, 3 pęk igieł sosny, 4 wierzba, 7 pełna (kora).
 */
export const SOLID_UV: [number, number] = [0.875, 0.25];

export function cellUV(i: number): [number, number, number, number] {
  const col = i % 4, row = Math.floor(i / 4);
  const pad = 0.003;
  return [col / 4 + pad, 1 - (row + 1) / 2 + pad * 2, (col + 1) / 4 - pad, 1 - row / 2 - pad * 2];
}

export interface CardSet {
  pos: number[];
  nor: number[];
  uv: number[];
  col: number[];
}
export const newCardSet = (): CardSet => ({ pos: [], nor: [], uv: [], col: [] });

type V3 = [number, number, number];

/** kwadrat (karta) o środku c i półosiach r (poziomo) oraz u (pionowo w teksturze) */
export function addCard(set: CardSet, c: V3, r: V3, u: V3, n: V3, cell: number, color: THREE.Color, mirror = false) {
  let [u0, v0, u1, v1] = cellUV(cell);
  if (mirror) [u0, u1] = [u1, u0];
  const P = (sr: number, su: number): V3 => [c[0] + r[0] * sr + u[0] * su, c[1] + r[1] * sr + u[1] * su, c[2] + r[2] * sr + u[2] * su];
  const corners: [V3, number, number][] = [
    [P(-1, -1), u0, v0],
    [P(1, -1), u1, v0],
    [P(1, 1), u1, v1],
    [P(-1, 1), u0, v1],
  ];
  for (const k of [0, 1, 2, 0, 2, 3]) {
    const [p, tu, tv] = corners[k];
    set.pos.push(p[0], p[1], p[2]);
    set.nor.push(n[0], n[1], n[2]);
    set.uv.push(tu, tv);
    set.col.push(color.r, color.g, color.b);
  }
}

export function cardsToGeometry(set: CardSet): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(set.pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(set.nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(set.uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(set.col, 3));
  return g;
}

const gray = (l: number, a = 1) => `rgba(${l | 0},${l | 0},${l | 0},${a})`;

function leaf(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, wid: number, lum: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(wid * 0.62, len * 0.22, wid * 0.5, len * 0.7, 0, len);
  ctx.bezierCurveTo(-wid * 0.5, len * 0.7, -wid * 0.62, len * 0.22, 0, 0);
  ctx.closePath();
  ctx.fillStyle = gray(lum);
  ctx.fill();
  ctx.strokeStyle = gray(lum * 0.62, 0.8);
  ctx.lineWidth = Math.max(0.7, wid * 0.07);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, len * 0.92);
  ctx.stroke();
  ctx.restore();
}

function begin(ctx: CanvasRenderingContext2D, col: number, row: number) {
  ctx.save();
  ctx.translate(col * 256, row * 256);
  ctx.beginPath();
  ctx.rect(2, 2, 252, 252);
  ctx.clip();
}

function drawLeafCluster(ctx: CanvasRenderingContext2D, col: number, row: number, seed: number, count: number, radius: number, lmin: number, lmax: number, wmin: number, wmax: number, droop: number) {
  const rnd = mulberry32(seed);
  begin(ctx, col, row);
  // gałązki
  ctx.strokeStyle = gray(95);
  ctx.lineCap = "round";
  for (let k = 0; k < 9; k++) {
    const a = rnd() * Math.PI * 2, r = radius * (0.5 + rnd() * 0.5);
    ctx.lineWidth = 1.6 + rnd() * 1.4;
    ctx.beginPath();
    ctx.moveTo(128, 128);
    ctx.quadraticCurveTo(128 + Math.cos(a) * r * 0.5, 128 + Math.sin(a) * r * 0.5 + droop * 10, 128 + Math.cos(a) * r, 128 + Math.sin(a) * r + droop * 22);
    ctx.stroke();
  }
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const rr = Math.sqrt(rnd()) * radius;
    const x = 128 + Math.cos(a) * rr, y = 128 + Math.sin(a) * rr + droop * rr * 0.2;
    const ang = a - Math.PI / 2 + (rnd() - 0.5) * 1.6 + (droop ? (Math.PI / 2 - (a - Math.PI / 2)) * 0 : 0);
    const len = lmin + rnd() * (lmax - lmin);
    const wid = wmin + rnd() * (wmax - wmin);
    const lum = 105 + rnd() * 150 * (0.6 + 0.4 * (1 - (y - 20) / 220));
    leaf(ctx, x, y, ang + Math.PI, len, wid, Math.min(255, lum));
  }
  ctx.restore();
}

function drawSpruce(ctx: CanvasRenderingContext2D) {
  const rnd = mulberry32(77);
  begin(ctx, 2, 0);
  ctx.lineCap = "round";
  // pień gałązki
  ctx.strokeStyle = gray(85);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(128, 252);
  ctx.lineTo(128, 6);
  ctx.stroke();
  for (let i = 0; i < 230; i++) {
    const s = Math.pow(rnd(), 0.8);
    const y = 248 - s * 240;
    const maxW = 118 * Math.pow(1 - s, 0.62) + 8;
    for (const side of [-1, 1]) {
      const ang = (55 + rnd() * 25) * (Math.PI / 180);
      const len = maxW * (0.55 + rnd() * 0.5);
      const ex = 128 + side * Math.sin(ang) * len, ey = y - Math.cos(ang) * len * 0.55 + len * 0.15;
      ctx.strokeStyle = gray(120 + rnd() * 120);
      ctx.lineWidth = 2 + rnd() * 1.3;
      ctx.beginPath();
      ctx.moveTo(128, y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawPine(ctx: CanvasRenderingContext2D) {
  const rnd = mulberry32(55);
  begin(ctx, 3, 0);
  ctx.lineCap = "round";
  const tufts: [number, number][] = [
    [70, 228],
    [186, 236],
    [128, 170],
  ];
  for (const [tx, ty] of tufts) {
    ctx.strokeStyle = gray(90);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(tx, ty + 20);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    for (let k = 0; k < 44; k++) {
      const a = (rnd() - 0.5) * 2.6;
      const len = 70 + rnd() * 52;
      ctx.strokeStyle = gray(130 + rnd() * 120);
      ctx.lineWidth = 1.5 + rnd() * 0.8;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.quadraticCurveTo(tx + Math.sin(a) * len * 0.5, ty - Math.cos(a) * len * 0.6, tx + Math.sin(a) * len * 0.95 + (rnd() - 0.5) * 8, ty - Math.cos(a) * len);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawWillow(ctx: CanvasRenderingContext2D) {
  const rnd = mulberry32(99);
  begin(ctx, 0, 1);
  ctx.lineCap = "round";
  for (let s = 0; s < 11; s++) {
    const x0 = 22 + s * 21 + (rnd() - 0.5) * 8;
    const L = 150 + rnd() * 95;
    const ph = rnd() * 6;
    ctx.strokeStyle = gray(100);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let t = 0; t <= 1.001; t += 0.05) {
      const x = x0 + Math.sin(t * 4 + ph) * 6, y = 4 + t * L;
      t === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    for (let t = 0.06; t < 1; t += 0.07) {
      const x = x0 + Math.sin(t * 4 + ph) * 6, y = 4 + t * L;
      for (const side of [-1, 1]) leaf(ctx, x, y, Math.PI - side * (0.55 + rnd() * 0.4) + Math.PI, 26 + rnd() * 8, 6.5, 140 + rnd() * 110);
    }
  }
  ctx.restore();
}

let atlas: THREE.CanvasTexture | null = null;
export function getFoliageAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  drawLeafCluster(ctx, 0, 0, 11, 150, 108, 26, 38, 14, 20, 0);
  drawLeafCluster(ctx, 1, 0, 23, 210, 110, 15, 23, 10, 15, 0.6);
  drawSpruce(ctx);
  drawPine(ctx);
  drawWillow(ctx);
  ctx.fillStyle = "rgb(210,210,210)";
  ctx.fillRect(3 * 256, 256, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  atlas = t;
  return t;
}

/** atlas roślin przyziemnych 1024x256: 0 paproć, 1 jaskier, 2 stokrotki, 3 koniczyna/wyka (kolorowy) */
let groundAtlas: THREE.CanvasTexture | null = null;
export function getGroundAtlas(): THREE.CanvasTexture {
  if (groundAtlas) return groundAtlas;
  const c = document.createElement("canvas");
  c.width = 1536;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const rnd = mulberry32(404);
  const cellBegin = (i: number) => {
    ctx.save();
    ctx.translate(i * 256, 0);
    ctx.beginPath();
    ctx.rect(2, 2, 252, 252);
    ctx.clip();
    ctx.lineCap = "round";
  };
  const hsl = (h: number, s: number, l: number) => `hsl(${h},${s}%,${l}%)`;
  // paproć
  cellBegin(0);
  for (let f = 0; f < 8; f++) {
    const a = -Math.PI / 2 + (f - 3.5) * 0.3 + (rnd() - 0.5) * 0.12;
    const L = 150 + rnd() * 80;
    const pts: [number, number][] = [];
    for (let t = 0; t <= 1.001; t += 0.05) {
      const bend = t * t * 0.9 * (f - 3.5) * 0.28;
      const aa = a + bend;
      pts.push([128 + Math.cos(a) * L * t * 0.95 + Math.sin(bend) * 30 * t, 250 + Math.sin(a) * L * t + (Math.cos(aa) - Math.cos(a)) * 40 * t + t * t * 36]);
    }
    ctx.strokeStyle = hsl(98, 45, 26);
    ctx.lineWidth = 3;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    for (let i = 3; i < pts.length - 1; i++) {
      const [x, y] = pts[i], [nx, ny] = pts[i + 1];
      const ang = Math.atan2(ny - y, nx - x);
      const sz = 34 * (1 - i / pts.length) + 6;
      for (const sd of [-1, 1]) {
        ctx.strokeStyle = hsl(96 + rnd() * 14, 52, 28 + rnd() * 18);
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(ang + sd * 1.15) * sz, y + Math.sin(ang + sd * 1.15) * sz);
        ctx.stroke();
      }
    }
  }
  ctx.restore();

  const flowers = (cell: number, headCol: string, centerCol: string, petals: number, headR: number, count: number, hue: number) => {
    cellBegin(cell);
    // listki przy ziemi
    for (let k = 0; k < 9; k++) {
      const a = -Math.PI / 2 + (rnd() - 0.5) * 2.3;
      ctx.fillStyle = hsl(hue, 45, 22 + rnd() * 14);
      ctx.save();
      ctx.translate(128 + (rnd() - 0.5) * 70, 252);
      ctx.rotate(a + Math.PI / 2);
      ctx.beginPath();
      ctx.ellipse(0, -28, 8, 30, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    for (let k = 0; k < count; k++) {
      const x0 = 128 + (rnd() - 0.5) * 120, h = 110 + rnd() * 110;
      const x1 = x0 + (rnd() - 0.5) * 40, y1 = 250 - h;
      ctx.strokeStyle = hsl(100, 45, 30);
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(128 + (x0 - 128) * 0.3, 252);
      ctx.quadraticCurveTo(x0, 250 - h * 0.5, x1, y1);
      ctx.stroke();
      ctx.fillStyle = headCol;
      for (let p = 0; p < petals; p++) {
        const a = (p / petals) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(x1 + Math.cos(a) * headR * 0.75, y1 + Math.sin(a) * headR * 0.75, headR * 0.55, headR * 0.28, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = centerCol;
      ctx.beginPath();
      ctx.arc(x1, y1, headR * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };
  flowers(1, "#f4d52c", "#d9a000", 9, 13, 7, 100);
  flowers(2, "#f6f4ea", "#f0c419", 13, 14, 6, 102);
  // koniczyna / wyka: kulisty kwiatostan
  cellBegin(3);
  for (let k = 0; k < 9; k++) {
    const x0 = 128 + (rnd() - 0.5) * 130, h = 90 + rnd() * 110;
    ctx.strokeStyle = hsl(100, 40, 28);
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(128 + (x0 - 128) * 0.3, 252);
    ctx.quadraticCurveTo(x0, 250 - h * 0.5, x0 + (rnd() - 0.5) * 24, 250 - h);
    ctx.stroke();
    const hx = x0, hy = 250 - h;
    for (let q = 0; q < 14; q++) {
      ctx.fillStyle = hsl(285 + rnd() * 30, 45 + rnd() * 20, 48 + rnd() * 16);
      ctx.beginPath();
      ctx.ellipse(hx + (rnd() - 0.5) * 20, hy + (rnd() - 0.5) * 20, 4.5, 7, rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const sd of [-1, 1]) {
      ctx.fillStyle = hsl(104, 42, 30);
      ctx.beginPath();
      ctx.ellipse(x0 + sd * 15, 250 - h * 0.45, 7, 14, sd * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // kępa soczystej trawy
  cellBegin(4);
  for (let b = 0; b < 56; b++) {
    const x0 = 128 + (rnd() - 0.5) * 100, spread = (rnd() - 0.5) * 1.6, h = 110 + rnd() * 125;
    const hue = 86 + rnd() * 24;
    const w = 3.5 + rnd() * 5;
    const tipx = x0 + spread * h * 0.45 + (rnd() - 0.5) * 24, tipy = 253 - h;
    const midx = x0 + spread * h * 0.18, midy = 253 - h * 0.55;
    const gr = ctx.createLinearGradient(0, 253, 0, tipy);
    gr.addColorStop(0, hsl(hue, 48, 17));
    gr.addColorStop(0.55, hsl(hue, 55, 33));
    gr.addColorStop(1, hsl(hue - 8, 62, 50));
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.moveTo(x0 - w, 253);
    ctx.quadraticCurveTo(midx - w * 0.6, midy, tipx, tipy);
    ctx.quadraticCurveTo(midx + w * 0.6, midy, x0 + w, 253);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,220,0.16)";
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(x0, 250);
    ctx.quadraticCurveTo(midx, midy, tipx, tipy + 4);
    ctx.stroke();
  }
  ctx.restore();

  // wysoka, podsychająca trawa z kłosami
  cellBegin(5);
  for (let b = 0; b < 34; b++) {
    const x0 = 128 + (rnd() - 0.5) * 96, h = 130 + rnd() * 112;
    const lean = (rnd() - 0.5) * 70;
    const hue = 52 + rnd() * 26;
    ctx.strokeStyle = hsl(hue, 38 + rnd() * 12, 34 + rnd() * 14);
    ctx.lineWidth = 2 + rnd() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x0, 253);
    ctx.quadraticCurveTo(x0 + lean * 0.3, 253 - h * 0.55, x0 + lean, 253 - h);
    ctx.stroke();
    // liść
    ctx.fillStyle = hsl(hue + 18, 42, 32 + rnd() * 10);
    ctx.beginPath();
    ctx.moveTo(x0, 253 - h * 0.25);
    ctx.quadraticCurveTo(x0 + lean * 0.45 + 22, 253 - h * 0.5, x0 + lean * 0.4 + 46, 253 - h * 0.62);
    ctx.quadraticCurveTo(x0 + lean * 0.3 + 12, 253 - h * 0.42, x0, 253 - h * 0.25);
    ctx.fill();
    // kłos
    for (let q = 0; q < 9; q++) {
      const t = 1 - q * 0.032;
      const hx = x0 + lean * t, hy = 253 - h * t;
      ctx.fillStyle = hsl(hue + 4, 45, 48 + rnd() * 12);
      ctx.beginPath();
      ctx.ellipse(hx + (q % 2 ? 4 : -4), hy, 3.2, 8, (q % 2 ? 0.5 : -0.5), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  groundAtlas = t;
  return t;
}

/** zwraca prostokąt UV komórki atlasu roślin przyziemnych */
export function groundCellUV(i: number): [number, number, number, number] {
  const pad = 0.003;
  return [i / 6 + pad, 0.01, (i + 1) / 6 - pad, 0.99];
}
