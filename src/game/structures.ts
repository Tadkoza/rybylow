import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { World, BuildingRec } from "./world";
import { Acc } from "./geoutil";
import { Piers } from "./piers";
import { hash2 } from "./noise";
import { makeFacadeTexture, makeRoofTexture, patchMaterial } from "./materials";

const WALLS = [
  ["#ece7da", "#dfd8c5", "#f1ecdc", "#d9cfb8", "#e6dbc8", "#d3dad4", "#ead9c0"],
  ["#a24f3a", "#934735", "#ad5d41", "#8e4234"],
  ["#e6d6a8", "#e9d8b4", "#d8c79a"],
  ["#b3b0a8", "#a6a49d", "#bdbab2"],
];
const ROOFS = ["#a8512f", "#9a4a2b", "#b45c38", "#4f4f55", "#5a5c60", "#5b4234", "#7a3b2a", "#48494d"];
const FLAT_ROOFS = ["#5d5f60", "#6e6f6b", "#4c4e50", "#85857f"];

function obb(pts: Float64Array) {
  const n = pts.length / 2;
  let best = { area: 1e18, ax: 1, az: 0, a0: 0, a1: 0, b0: 0, b1: 0 };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    let ex = pts[j * 2] - pts[i * 2], ez = pts[j * 2 + 1] - pts[i * 2 + 1];
    const l = Math.hypot(ex, ez);
    if (l < 0.1) continue;
    ex /= l;
    ez /= l;
    let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
    for (let k = 0; k < n; k++) {
      const a = pts[k * 2] * ex + pts[k * 2 + 1] * ez, b = -pts[k * 2] * ez + pts[k * 2 + 1] * ex;
      a0 = Math.min(a0, a);
      a1 = Math.max(a1, a);
      b0 = Math.min(b0, b);
      b1 = Math.max(b1, b);
    }
    const area = (a1 - a0) * (b1 - b0);
    if (area < best.area) best = { area, ax: ex, az: ez, a0, a1, b0, b1 };
  }
  // oś a = dłuższa
  if (best.b1 - best.b0 > best.a1 - best.a0) {
    return { area: best.area, ax: -best.az, az: best.ax, a0: best.b0, a1: best.b1, b0: -best.a1, b1: -best.a0 };
  }
  return best;
}

function polyArea(pts: Float64Array) {
  let a = 0;
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += pts[i * 2] * pts[j * 2 + 1] - pts[j * 2] * pts[i * 2 + 1];
  }
  return a / 2;
}

function addBuilding(walls: Acc, roofs: Acc, b: BuildingRec) {
  const pts = b.pts;
  const n = pts.length / 2;
  const seed = Math.floor(Math.abs(pts[0] * 13 + pts[1] * 7));
  const r = hash2(seed, 1, 1), r2 = hash2(seed, 2, 2), r3 = hash2(seed, 3, 3);
  const palette = WALLS[b.wall] ?? WALLS[0];
  const wallC = new THREE.Color(palette[Math.floor(r * palette.length) % palette.length]);
  const y0 = b.floorY - 1.0;
  const y1 = b.floorY + b.h;
  const area = polyArea(pts);
  const sgn = area > 0 ? 1 : -1;

  // ściany
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = pts[i * 2], az = pts[i * 2 + 1], bx = pts[j * 2], bz = pts[j * 2 + 1];
    const ex = bx - ax, ez = bz - az;
    const len = Math.hypot(ex, ez);
    if (len < 0.05) continue;
    const nrm = [(sgn * ez) / len, 0, (-sgn * ex) / len];
    const u0 = acc / 4, u1 = (acc + len) / 4;
    acc += len;
    const v1 = (y1 - b.floorY) / 3;
    const vb = -1.0 / 3;
    const c = wallC.clone();
    walls.tri([ax, y0, az], [bx, y0, bz], [bx, y1, bz], nrm, [u0, vb], [u1, vb], [u1, v1], c);
    walls.tri([ax, y0, az], [bx, y1, bz], [ax, y1, az], nrm, [u0, vb], [u1, v1], [u0, v1], c);
  }

  // dach
  const o = obb(pts);
  const aw = o.a1 - o.a0, bw = o.b1 - o.b0;
  const fill = Math.abs(area) / Math.max(1, o.area);
  const roofC = new THREE.Color(ROOFS[Math.floor(r2 * ROOFS.length) % ROOFS.length]);
  if (b.roof !== "flat" && fill > 0.8 && bw >= 2.5 && bw < 16 && aw < 60) {
    const ov = 0.35;
    const a0 = o.a0 - ov, a1 = o.a1 + ov, b0 = o.b0 - ov, b1 = o.b1 + ov;
    const bm = (b0 + b1) / 2;
    const rise = Math.min(4.2, Math.max(0.9, (bw / 2) * (0.5 + r3 * 0.25)));
    const yr = y1 + rise;
    const P = (a: number, bb: number, y: number) => [a * o.ax - bb * o.az, y, a * o.az + bb * o.ax];
    const slope = Math.hypot(bw / 2, rise);
    const up = [0, 1, 0];
    if (b.roof === "hipped" && aw > bw) {
      const inset = bw / 2;
      const r0 = a0 + inset, r1 = a1 - inset;
      roofs.tri(P(a0, b0, y1), P(a1, b0, y1), P(r1, bm, yr), up, [0, 0], [aw / 4, 0], [aw / 4 - 0.3, slope / 2], roofC);
      roofs.tri(P(a0, b0, y1), P(r1, bm, yr), P(r0, bm, yr), up, [0, 0], [aw / 4 - 0.3, slope / 2], [0.3, slope / 2], roofC);
      roofs.tri(P(a1, b1, y1), P(a0, b1, y1), P(r0, bm, yr), up, [0, 0], [aw / 4, 0], [0.3, slope / 2], roofC);
      roofs.tri(P(a1, b1, y1), P(r0, bm, yr), P(r1, bm, yr), up, [0, 0], [0.3, slope / 2], [aw / 4 - 0.3, slope / 2], roofC);
      roofs.tri(P(a1, b0, y1), P(a1, b1, y1), P(r1, bm, yr), up, [0, 0], [bw / 4, 0], [bw / 8, slope / 2], roofC);
      roofs.tri(P(a0, b1, y1), P(a0, b0, y1), P(r0, bm, yr), up, [0, 0], [bw / 4, 0], [bw / 8, slope / 2], roofC);
    } else {
      roofs.tri(P(a0, b0, y1), P(a1, b0, y1), P(a1, bm, yr), up, [0, 0], [aw / 4, 0], [aw / 4, slope / 2], roofC);
      roofs.tri(P(a0, b0, y1), P(a1, bm, yr), P(a0, bm, yr), up, [0, 0], [aw / 4, slope / 2], [0, slope / 2], roofC);
      roofs.tri(P(a1, b1, y1), P(a0, b1, y1), P(a0, bm, yr), up, [0, 0], [aw / 4, 0], [aw / 4, slope / 2], roofC);
      roofs.tri(P(a1, b1, y1), P(a0, bm, yr), P(a1, bm, yr), up, [0, 0], [aw / 4, slope / 2], [0, slope / 2], roofC);
      // szczyty
      const wa0 = o.a0, wa1 = o.a1, wb0 = o.b0, wb1 = o.b1;
      const tw = (wb1 - wb0) / 4;
      walls.tri(P(wa0, wb0, y1 - 0.2), P(wa0, wb1, y1 - 0.2), P(wa0, bm, yr), [-o.ax, 0, -o.az], [0, 0], [tw, 0], [tw / 2, rise / 3], wallC);
      walls.tri(P(wa1, wb0, y1 - 0.2), P(wa1, wb1, y1 - 0.2), P(wa1, bm, yr), [o.ax, 0, o.az], [0, 0], [tw, 0], [tw / 2, rise / 3], wallC);
    }
  } else {
    // dach płaski – triangulacja
    const contour: THREE.Vector2[] = [];
    for (let i = 0; i < n; i++) contour.push(new THREE.Vector2(pts[i * 2], pts[i * 2 + 1]));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    const fc = new THREE.Color(FLAT_ROOFS[Math.floor(r2 * FLAT_ROOFS.length) % FLAT_ROOFS.length]);
    const yy = y1 + 0.15;
    for (const t of tris) {
      const A = contour[t[0]], B = contour[t[1]], Cc = contour[t[2]];
      roofs.tri([A.x, yy, A.y], [B.x, yy, B.y], [Cc.x, yy, Cc.y], [0, 1, 0], [A.x / 4, A.y / 4], [B.x / 4, B.y / 4], [Cc.x / 4, Cc.y / 4], fc);
    }
    // attyka
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = pts[i * 2], az = pts[i * 2 + 1], bx = pts[j * 2], bz = pts[j * 2 + 1];
      const ex = bx - ax, ez = bz - az;
      const len = Math.hypot(ex, ez);
      if (len < 0.05) continue;
      const nrm = [(sgn * ez) / len, 0, (-sgn * ex) / len];
      const c = wallC.clone().multiplyScalar(0.9);
      walls.tri([ax, y1, az], [bx, y1, bz], [bx, y1 + 0.35, bz], nrm, [0, 0], [len / 4, 0], [len / 4, 0.1], c);
      walls.tri([ax, y1, az], [bx, y1 + 0.35, bz], [ax, y1 + 0.35, az], nrm, [0, 0], [len / 4, 0.1], [0, 0.1], c);
    }
  }
}

// ------------------------------------------------------------------ drogi
const ROAD_COL = ["#4c4c50", "#9b8c72", "#7a6a50", "#a7a399"];

function buildRoadGeo(world: World, roads: typeof world.data.roads): THREE.BufferGeometry | null {
  const pos: number[] = [], col: number[] = [];
  const c = new THREE.Color(), edge = new THREE.Color();
  for (const rd of roads) {
    if (rd.bridge) continue;
    const base = new THREE.Color(ROAD_COL[rd.surf] ?? ROAD_COL[0]);
    const p = rd.p;
    const samples: { x: number; z: number; tx: number; tz: number; ok: boolean }[] = [];
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.01) continue;
      const n = Math.max(1, Math.ceil(len / 2.5));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        samples.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, tx: (bx - ax) / len, tz: (bz - az) / len, ok: true });
      }
      if (i + 4 >= p.length) samples.push({ x: bx, z: bz, tx: (bx - ax) / len, tz: (bz - az) / len, ok: true });
    }
    if (samples.length < 2) continue;
    // wygładzenie stycznych
    for (let i = 1; i < samples.length - 1; i++) {
      const dx = samples[i + 1].x - samples[i - 1].x, dz = samples[i + 1].z - samples[i - 1].z;
      const l = Math.hypot(dx, dz) || 1;
      samples[i].tx = dx / l;
      samples[i].tz = dz / l;
    }
    const hw = rd.w / 2;
    const verts: { l: number[]; r: number[]; ok: boolean; v: number }[] = samples.map((s) => {
      const nx = -s.tz, nz = s.tx;
      const lx = s.x + nx * hw, lz = s.z + nz * hw, rx = s.x - nx * hw, rz = s.z - nz * hw;
      const ok = world.sdfAt(s.x, s.z) > 0.5 && world.sdfAt(lx, lz) > -0.2 && world.sdfAt(rx, rz) > -0.2;
      const yl = world.heightAt(lx, lz) + 0.06, yr = world.heightAt(rx, rz) + 0.06, ym = world.heightAt(s.x, s.z) + 0.06;
      const y = Math.max(ym, (yl + yr) / 2);
      return { l: [lx, Math.max(yl, y - 0.25), lz], r: [rx, Math.max(yr, y - 0.25), rz], ok, v: hash2(Math.floor(s.x / 6), Math.floor(s.z / 6), 3) };
    });
    for (let i = 0; i + 1 < verts.length; i++) {
      const A = verts[i], B = verts[i + 1];
      if (!A.ok || !B.ok) continue;
      const shade = (v: number) => 0.92 + v * 0.14;
      const mk = (v: number, e: number) => {
        c.copy(base).multiplyScalar(shade(v));
        if (e) {
          edge.copy(c).multiplyScalar(rd.surf >= 1 ? 0.8 : 0.9);
          if (rd.surf === 2) edge.lerp(new THREE.Color("#5b6b32"), 0.35);
          c.copy(edge);
        }
        return [c.r, c.g, c.b];
      };
      const cA = mk(A.v, 0), cB = mk(B.v, 0), eA = mk(A.v, 1), eB = mk(B.v, 1);
      // trzy paski: lewa krawędź | środek | prawa krawędź – tu uproszczone: jeden pas ze zróżnicowanym kolorem krawędzi
      const mid = (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.01, (a[2] + b[2]) / 2];
      const mA = mid(A.l, A.r), mB = mid(B.l, B.r);
      const addQuad = (p0: number[], p1: number[], p2: number[], p3: number[], c0: number[], c1: number[], c2: number[], c3: number[]) => {
        // trójkąty ułożone tak, aby normalna wskazywała w górę
        const tri = (a: number[], b: number[], d: number[], ca: number[], cb: number[], cd: number[]) => {
          const ux = b[0] - a[0], uz = b[2] - a[2], vx = d[0] - a[0], vz = d[2] - a[2];
          const ny = uz * vx - ux * vz; // składowa y iloczynu wektorowego (u×v).y = uz*vx - ux*vz
          if (ny >= 0) {
            pos.push(...a, ...b, ...d);
            col.push(...ca, ...cb, ...cd);
          } else {
            pos.push(...a, ...d, ...b);
            col.push(...ca, ...cd, ...cb);
          }
        };
        tri(p0, p1, p2, c0, c1, c2);
        tri(p0, p2, p3, c0, c2, c3);
      };
      addQuad(A.l, mA, mB, B.l, eA, cA, cB, eB);
      addQuad(mA, A.r, B.r, mB, cA, eA, eB, cB);
    }
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const nor = new Float32Array(pos.length);
  for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  return g;
}

// ------------------------------------------------------------------ łodzie, ławki, latarnie
function boxGeo(w: number, h: number, d: number, x: number, y: number, z: number, color: string, rx = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.deleteAttribute("uv");
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  const c = new THREE.Color(color);
  const cols = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < cols.length; i += 3) {
    cols[i] = c.r;
    cols[i + 1] = c.g;
    cols[i + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  return g;
}

function benchGeometry(): THREE.BufferGeometry {
  const wood = "#9a7a52", metal = "#555b60";
  return mergeGeometries(
    [
      boxGeo(1.7, 0.06, 0.46, 0, 0.46, 0, wood),
      boxGeo(1.7, 0.4, 0.05, 0, 0.78, 0.22, wood, -0.18),
      boxGeo(0.06, 0.46, 0.5, -0.78, 0.23, 0.02, metal),
      boxGeo(0.06, 0.46, 0.5, 0.78, 0.23, 0.02, metal),
    ],
    false
  )!;
}

function lampGeometry(): THREE.BufferGeometry {
  return mergeGeometries([boxGeo(0.1, 4.6, 0.1, 0, 2.3, 0, "#33373a"), boxGeo(0.14, 0.14, 1.0, 0, 4.6, 0.4, "#33373a"), boxGeo(0.28, 0.1, 0.5, 0, 4.52, 0.8, "#d8d8c8")], false)!;
}

// ------------------------------------------------------------------ system
export class Structures {
  group = new THREE.Group();
  private roadCells: { mesh: THREE.Mesh; cx: number; cz: number }[] = [];
  private disposables: { dispose(): void }[] = [];

  constructor(world: World, opts: { shadows: boolean }) {
    const facade = makeFacadeTexture();
    const roofTex = makeRoofTexture();
    this.disposables.push(facade, roofTex);

    // ---- budynki (komórki 600 m)
    const CS = 600;
    const cells = new Map<string, { walls: Acc; roofs: Acc }>();
    for (const b of world.buildings) {
      const key = `${Math.floor((b.bbox[0] + b.bbox[2]) / 2 / CS)},${Math.floor((b.bbox[1] + b.bbox[3]) / 2 / CS)}`;
      let c = cells.get(key);
      if (!c) cells.set(key, (c = { walls: new Acc(), roofs: new Acc() }));
      addBuilding(c.walls, c.roofs, b);
    }
    const wallMat = new THREE.MeshStandardMaterial({ map: facade, vertexColors: true, roughness: 0.92, metalness: 0 });
    patchMaterial(wallMat, { detail: 0.45, detailScale: 0.9, detailFar: 50 });
    const roofMat = new THREE.MeshStandardMaterial({ map: roofTex, vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
    this.disposables.push(wallMat, roofMat);
    for (const c of cells.values()) {
      const wg = c.walls.geometry(), rg = c.roofs.geometry();
      if (wg) {
        const m = new THREE.Mesh(wg, wallMat);
        m.castShadow = opts.shadows;
        m.receiveShadow = true;
        this.group.add(m);
        this.disposables.push(wg);
      }
      if (rg) {
        const m = new THREE.Mesh(rg, roofMat);
        m.castShadow = opts.shadows;
        m.receiveShadow = true;
        this.group.add(m);
        this.disposables.push(rg);
      }
    }

    // ---- drogi (komórki 400 m)
    const RS = 400;
    const roadCells = new Map<string, typeof world.data.roads>();
    for (const r of world.data.roads) {
      const key = `${Math.floor(r.p[0] / RS)},${Math.floor(r.p[1] / RS)}`;
      let arr = roadCells.get(key);
      if (!arr) roadCells.set(key, (arr = []));
      arr.push(r);
    }
    const roadMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    patchMaterial(roadMat, { detail: 0.7, detailScale: 1.3, detailFar: 120 });
    this.disposables.push(roadMat);
    for (const [key, arr] of roadCells) {
      const g = buildRoadGeo(world, arr);
      if (!g) continue;
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, roadMat);
      m.receiveShadow = true;
      const [ix, iz] = key.split(",").map(Number);
      this.group.add(m);
      this.roadCells.push({ mesh: m, cx: (ix + 0.5) * RS, cz: (iz + 0.5) * RS });
      this.disposables.push(g);
    }

    // ---- mola (szczegółowe modele)
    const piers = new Piers(world, { shadows: opts.shadows });
    this.group.add(piers.group);
    this.disposables.push(piers);

    // ---- ławki i latarnie (instancjonowane)
    const benches: number[][] = [...world.data.benches.filter((b) => world.sdfAt(b[0], b[1]) > 0.5)];
    const sp = world.spawn;
    const fx = -Math.sin(sp.yaw), fz = -Math.cos(sp.yaw);
    for (const side of [-1, 1]) {
      const bx = sp.x + fx * 1.5 - fz * side * 6.5, bz = sp.z + fz * 1.5 + fx * side * 6.5;
      const deg = ((Math.atan2(fx, -fz) * 180) / Math.PI + 360) % 360;
      benches.push([bx, bz, deg]);
    }
    const benchMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.1 });
    this.disposables.push(benchMat);
    const inst = (geo: THREE.BufferGeometry, list: { x: number; z: number; rot: number }[]) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, benchMat, list.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      list.forEach((it, i) => {
        e.set(0, it.rot, 0);
        q.setFromEuler(e);
        m4.compose(new THREE.Vector3(it.x, world.groundY(it.x, it.z), it.z), q, new THREE.Vector3(1, 1, 1));
        im.setMatrixAt(i, m4);
      });
      im.castShadow = opts.shadows;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      this.group.add(im);
      this.disposables.push(geo, im);
    };
    inst(
      benchGeometry(),
      benches.map((b) => ({ x: b[0], z: b[1], rot: -(b[2] * Math.PI) / 180 }))
    );
    const lamps: { x: number; z: number; rot: number }[] = [];
    for (let i = 0; i < world.data.lamps.length; i += 2) {
      const x = world.data.lamps[i], z = world.data.lamps[i + 1];
      if (world.sdfAt(x, z) > 0.5) lamps.push({ x, z, rot: hash2(i, 1, 1) * 6.28 });
    }
    inst(lampGeometry(), lamps);
  }

  update(_t: number, cx: number, cz: number) {
    for (const r of this.roadCells) r.mesh.visible = Math.hypot(r.cx - cx, r.cz - cz) < 700;
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}
