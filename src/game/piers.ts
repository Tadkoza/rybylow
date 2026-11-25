import * as THREE from "three";
import { World, PIER_DECK } from "./world";
import { mulberry32, clamp, smoothstep } from "./noise";
import { Acc, beam, mergeParts, paint } from "./geoutil";
import { patchMaterial } from "./materials";

function plankCanvas(bump: boolean): HTMLCanvasElement {
  const S = 512;
  const c = document.createElement("canvas");
  c.width = c.height = 1024;
  const ctx = c.getContext("2d")!;
  ctx.scale(2, 2);
  const rnd = mulberry32(7);
  const rows = 12, ph = S / rows;
  for (let r = 0; r < rows; r++) {
    const lum = 0.62 + rnd() * 0.32;
    const warm = rnd();
    if (bump) ctx.fillStyle = `rgb(${150 + (rnd() - 0.5) * 20},${150},${150})`;
    else ctx.fillStyle = `rgb(${(168 + warm * 14) * lum},${(140 + warm * 6) * lum},${(106 - warm * 4) * lum})`;
    ctx.fillRect(0, r * ph, S, ph);
    // słoje
    for (let k = 0; k < 90; k++) {
      const y = r * ph + 2 + rnd() * (ph - 4);
      const x0 = rnd() * S, len = 60 + rnd() * 380;
      const dark = rnd() < 0.6;
      const a = 0.06 + rnd() * 0.18;
      ctx.strokeStyle = bump ? (dark ? `rgba(60,60,60,${a})` : `rgba(210,210,210,${a})`) : dark ? `rgba(40,28,18,${a})` : `rgba(235,215,185,${a * 0.8})`;
      ctx.lineWidth = 0.7 + rnd() * 1.1;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.quadraticCurveTo(x0 + len / 2, y + (rnd() - 0.5) * 4, x0 + len, y + (rnd() - 0.5) * 3);
      ctx.stroke();
    }
    // sęki
    if (rnd() < 0.55) {
      const kx = rnd() * S, ky = r * ph + ph * (0.3 + rnd() * 0.4);
      for (let q = 3; q > 0; q--) {
        ctx.strokeStyle = bump ? `rgba(40,40,40,0.5)` : `rgba(45,30,18,${0.25 + 0.15 * q})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(kx, ky, 4 + q * 5, 2 + q * 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // szczeliny
    ctx.fillStyle = bump ? "rgb(25,25,25)" : "rgba(22,15,9,0.92)";
    ctx.fillRect(0, r * ph, S, 3.5);
    ctx.fillStyle = bump ? "rgb(190,190,190)" : "rgba(255,240,210,0.18)";
    ctx.fillRect(0, r * ph + 3.5, S, 1.2);
    // gwoździe
    for (const nx of [24, S - 24]) {
      ctx.fillStyle = bump ? "rgb(70,70,70)" : "rgba(30,26,24,0.95)";
      ctx.beginPath();
      ctx.arc(nx, r * ph + ph * 0.5, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(120,60,30,0.55)";
      ctx.lineWidth = 1.2;
      if (!bump) {
        ctx.beginPath();
        ctx.moveTo(nx, r * ph + ph * 0.5 + 3);
        ctx.lineTo(nx + 1, r * ph + ph * 0.5 + 12);
        ctx.stroke();
      }
    }
  }
  // zabrudzenia i plamy
  for (let i = 0; i < 1800; i++) {
    const a = rnd() * 0.12;
    ctx.fillStyle = bump ? `rgba(${rnd() < 0.5 ? 0 : 255},0,0,0)` : rnd() < 0.55 ? `rgba(20,16,10,${a})` : `rgba(200,195,180,${a})`;
    ctx.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 5, 1 + rnd() * 2);
  }
  if (!bump) {
    for (let i = 0; i < 20; i++) {
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 40 + rnd() * 70);
      g.addColorStop(0, "rgba(40,50,30,0.22)");
      g.addColorStop(1, "rgba(40,50,30,0)");
      ctx.save();
      ctx.translate(rnd() * S, rnd() * S);
      ctx.scale(1.6, 0.6);
      ctx.fillStyle = g;
      ctx.fillRect(-120, -120, 240, 240);
      ctx.restore();
    }
  }
  return c;
}

function toNormalMap(src: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const S = src.width;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d")!;
  const sd = src.getContext("2d")!.getImageData(0, 0, S, S).data;
  const out = ctx.createImageData(S, S);
  const h = (x: number, y: number) => sd[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = h(x + 1, y - 1) + 2 * h(x + 1, y) + h(x + 1, y + 1) - (h(x - 1, y - 1) + 2 * h(x - 1, y) + h(x - 1, y + 1));
      const dy = h(x - 1, y + 1) + 2 * h(x, y + 1) + h(x + 1, y + 1) - (h(x - 1, y - 1) + 2 * h(x, y - 1) + h(x + 1, y - 1));
      let nx = -dx * strength, ny = dy * strength, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const o = (y * S + x) * 4;
      out.data[o] = (nx * 0.5 + 0.5) * 255;
      out.data[o + 1] = (ny * 0.5 + 0.5) * 255;
      out.data[o + 2] = (nz * 0.5 + 0.5) * 255;
      out.data[o + 3] = 255;
    }
  ctx.putImageData(out, 0, 0);
  return c;
}

function plankTextures() {
  const col = new THREE.CanvasTexture(plankCanvas(false));
  col.wrapS = col.wrapT = THREE.RepeatWrapping;
  col.colorSpace = THREE.SRGBColorSpace;
  col.anisotropy = 8;
  const bmp = new THREE.CanvasTexture(toNormalMap(plankCanvas(true), 3.4));
  bmp.wrapS = bmp.wrapT = THREE.RepeatWrapping;
  bmp.anisotropy = 8;
  return { col, bmp };
}

export class Piers {
  group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];

  constructor(world: World, opts: { shadows: boolean }) {
    const deck = new Acc();
    const wood: THREE.BufferGeometry[] = [];
    const metal: THREE.BufferGeometry[] = [];
    const rings: number[] = [];
    const white = new THREE.Color("#ffffff");
    const sideC = new THREE.Color("#8f7f6c");
    const Y = PIER_DECK;
    const rnd = mulberry32(5);
    const tmp = new THREE.Color();

    const post = (px: number, pz: number, tall: boolean) => {
      const ground = world.heightAt(px, pz);
      const bottom = Math.min(ground, 0) - 0.5;
      const top = Y + (tall ? 0.62 : 0.1);
      const g = new THREE.CylinderGeometry(0.095, 0.118, top - bottom, 8, 7, false);
      g.deleteAttribute("uv");
      g.translate(px, (top + bottom) / 2, pz);
      const p = g.attributes.position;
      const cols = new Float32Array(p.count * 3);
      const mul = 0.82 + rnd() * 0.3;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        tmp.set("#8d8070");
        const wet = 1 - smoothstep(0.1, 0.6, y);
        tmp.lerp(new THREE.Color("#4b4a3a"), wet * 0.6);
        const algae = smoothstep(-0.5, -0.1, y) * (1 - smoothstep(0.0, 0.32, y));
        tmp.lerp(new THREE.Color("#3f5230"), algae * 0.7);
        tmp.lerp(new THREE.Color("#262620"), smoothstep(-0.5, -0.9, y) * 0.8);
        tmp.multiplyScalar(mul * (0.9 + 0.2 * Math.sin(i * 12.9)));
        cols[i * 3] = tmp.r;
        cols[i * 3 + 1] = tmp.g;
        cols[i * 3 + 2] = tmp.b;
      }
      g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
      wood.push(g);
      if (ground < -0.05) rings.push(px, pz);
    };

    for (const pier of world.piers) {
      if (pier.poly) {
        const n = pier.pts.length / 2;
        const contour: THREE.Vector2[] = [];
        for (let i = 0; i < n; i++) contour.push(new THREE.Vector2(pier.pts[i * 2], pier.pts[i * 2 + 1]));
        for (const t of THREE.ShapeUtils.triangulateShape(contour, [])) {
          const [A, B, C] = [contour[t[0]], contour[t[1]], contour[t[2]]];
          deck.tri([A.x, Y, A.y], [B.x, Y, B.y], [C.x, Y, C.y], [0, 1, 0], [A.x / 1.5, A.y / 1.44], [B.x / 1.5, B.y / 1.44], [C.x / 1.5, C.y / 1.44], white);
        }
        continue;
      }
      const hw = pier.w / 2;
      const pts = pier.pts;
      let along = 0;
      let row = 0;
      let totalLen = 0;
      for (let i = 0; i + 3 < pts.length; i += 2) totalLen += Math.hypot(pts[i + 2] - pts[i], pts[i + 3] - pts[i + 1]);

      for (let i = 0; i + 3 < pts.length; i += 2) {
        const ax = pts[i], az = pts[i + 1], bx = pts[i + 2], bz = pts[i + 3];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.2) continue;
        const dx = (bx - ax) / len, dz = (bz - az) / len;
        const nx = -dz, nz = dx;
        const L = [ax + nx * hw, az + nz * hw], R = [ax - nx * hw, az - nz * hw];
        const L2 = [bx + nx * hw, bz + nz * hw], R2 = [bx - nx * hw, bz - nz * hw];
        const v0 = along / 1.44, v1 = (along + len) / 1.44;
        const uw = pier.w / 1.5;
        const shade = 0.92 + rnd() * 0.12;
        tmp.setScalar(shade);
        deck.tri([L[0], Y, L[1]], [L2[0], Y, L2[1]], [R2[0], Y, R2[1]], [0, 1, 0], [0, v0], [0, v1], [uw, v1], tmp);
        deck.tri([L[0], Y, L[1]], [R2[0], Y, R2[1]], [R[0], Y, R[1]], [0, 1, 0], [0, v0], [uw, v1], [uw, v0], tmp);
        for (const [P0, P1, nn] of [
          [L, L2, [nx, 0, nz]],
          [R, R2, [-nx, 0, -nz]],
        ] as [number[], number[], number[]][]) {
          deck.tri([P0[0], Y, P0[1]], [P1[0], Y, P1[1]], [P1[0], Y - 0.25, P1[1]], nn, [0, 0.0], [len / 1.5, 0.0], [len / 1.5, 0.17], sideC);
          deck.tri([P0[0], Y, P0[1]], [P1[0], Y - 0.25, P1[1]], [P0[0], Y - 0.25, P0[1]], nn, [0, 0.0], [len / 1.5, 0.17], [0, 0.17], sideC);
        }
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        for (const sgn of [1, -1]) {
          // listwy krawędziowe
          wood.push(beam(len, 0.09, 0.07, mx + nx * (hw - 0.04) * sgn, Y + 0.045, mz + nz * (hw - 0.04) * sgn, dx, 0, dz, "#7a6a58"));
        }
        for (const off of [-0.75, 0, 0.75]) wood.push(beam(len, 0.14, 0.1, mx + nx * hw * off, Y - 0.32, mz + nz * hw * off, dx, 0, dz, "#4f4438"));

        const nrows = Math.max(1, Math.round(len / 2.8));
        const prev: { x: number; z: number }[] = [];
        for (let k = i === 0 ? 0 : 1; k <= nrows; k++) {
          const t = k / nrows;
          const cx = ax + (bx - ax) * t, cz = az + (bz - az) * t;
          wood.push(beam(pier.w + 0.12, 0.13, 0.13, cx, Y - 0.5, cz, nx, 0, nz, "#4a4034"));
          const tall = row % 3 === 0;
          for (const sgn of [1, -1]) post(cx + nx * hw * 0.88 * sgn, cz + nz * hw * 0.88 * sgn, tall);
          prev.push({ x: cx, z: cz });
          row++;
        }
        // zastrzały
        if (len > 4) {
          for (let k = 0; k < nrows; k++) {
            const t0 = k / nrows, t1 = (k + 1) / nrows;
            for (const sgn of [1, -1]) {
              const x0 = ax + (bx - ax) * t0 + nx * hw * 0.88 * sgn, z0 = az + (bz - az) * t0 + nz * hw * 0.88 * sgn;
              const x1 = ax + (bx - ax) * t1 + nx * hw * 0.88 * sgn, z1 = az + (bz - az) * t1 + nz * hw * 0.88 * sgn;
              if (world.heightAt((x0 + x1) / 2, (z0 + z1) / 2) > Y - 1.5) continue;
              const up = (k + (sgn > 0 ? 0 : 1)) % 2 === 0;
              const ya = up ? Y - 1.45 : Y - 0.5, yb = up ? Y - 0.5 : Y - 1.45;
              const vx = x1 - x0, vy = yb - ya, vz = z1 - z0;
              wood.push(beam(Math.hypot(vx, vy, vz), 0.09, 0.04, (x0 + x1) / 2, (ya + yb) / 2, (z0 + z1) / 2, vx, vy, vz, "#463c31"));
            }
          }
        }
        along += len;

        // drabinka na końcu pomostu
        if (i + 5 >= pts.length && totalLen > 9 && world.heightAt(bx, bz) < -0.8) {
          const cx = bx - dx * 0.9 + nx * (hw + 0.05), cz = bz - dz * 0.9 + nz * (hw + 0.05);
          for (const s2 of [-0.2, 0.2]) {
            const rx = cx + dx * s2, rz = cz + dz * s2;
            const g1 = new THREE.CylinderGeometry(0.022, 0.022, Y + 0.95 + 1.1, 6);
            g1.translate(rx, (Y + 0.95 - 1.1) / 2, rz);
            metal.push(paint(g1, "#b7bcc0"));
          }
          for (let yy = Y - 0.1; yy > -1.0; yy -= 0.3) metal.push(beam(0.42, 0.03, 0.03, cx, yy, cz, dx, 0, dz, "#b7bcc0"));
          const gb = new THREE.CylinderGeometry(0.022, 0.022, 0.46, 6);
          gb.rotateZ(Math.PI / 2);
          gb.rotateY(Math.atan2(-dz, dx));
          gb.translate(cx, Y + 0.95, cz);
          metal.push(paint(gb, "#b7bcc0"));
        }
      }

      // koło ratunkowe przy początku
      if (totalLen > 12) {
        const dx = (pts[2] - pts[0]) / Math.hypot(pts[2] - pts[0], pts[3] - pts[1]), dz = (pts[3] - pts[1]) / Math.hypot(pts[2] - pts[0], pts[3] - pts[1]);
        const nx = -dz, nz = dx;
        const px = pts[0] + dx * 1.6 + nx * (hw - 0.12), pz = pts[1] + dz * 1.6 + nz * (hw - 0.12);
        const pg = new THREE.CylinderGeometry(0.045, 0.05, 1.3, 7);
        pg.translate(px, Y + 0.65, pz);
        wood.push(paint(pg, "#6b5a47"));
        const tg = new THREE.TorusGeometry(0.24, 0.058, 8, 22);
        const tp = tg.attributes.position;
        const tcols = new Float32Array(tp.count * 3);
        const cc = new THREE.Color();
        for (let q = 0; q < tp.count; q++) {
          const ang = Math.atan2(tp.getY(q), tp.getX(q));
          const band = Math.floor(((ang + Math.PI) / (Math.PI / 2)) % 4) % 2;
          cc.set(band ? "#e9e6dc" : "#c8382b");
          tcols[q * 3] = cc.r;
          tcols[q * 3 + 1] = cc.g;
          tcols[q * 3 + 2] = cc.b;
        }
        tg.setAttribute("color", new THREE.BufferAttribute(tcols, 3));
        tg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(nx, 0, nz)));
        tg.translate(px + nx * 0.1, Y + 0.85, pz + nz * 0.1);
        wood.push(tg);
      }
    }

    const { col, bmp } = plankTextures();
    this.disposables.push(col, bmp);
    const deckGeo = deck.geometry();
    if (deckGeo) {
      const mat = new THREE.MeshStandardMaterial({ map: col, normalMap: bmp, normalScale: new THREE.Vector2(1.15, 1.15), vertexColors: true, roughness: 0.88, metalness: 0 });
      const m = new THREE.Mesh(deckGeo, mat);
      m.castShadow = opts.shadows;
      m.receiveShadow = true;
      this.group.add(m);
      this.disposables.push(deckGeo, mat);
    }
    const woodGeo = mergeParts(wood);
    if (woodGeo) {
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 });
      patchMaterial(mat, { detail: 0.6, detailScale: 3.5, detailFar: 30 });
      const m = new THREE.Mesh(woodGeo, mat);
      m.castShadow = opts.shadows;
      m.receiveShadow = true;
      this.group.add(m);
      this.disposables.push(woodGeo, mat);
    }
    const metalGeo = mergeParts(metal);
    if (metalGeo) {
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.55 });
      const m = new THREE.Mesh(metalGeo, mat);
      m.castShadow = opts.shadows;
      this.group.add(m);
      this.disposables.push(metalGeo, mat);
    }
    // pianka wokół słupów przy linii wody
    if (rings.length) {
      const rg = new THREE.RingGeometry(0.11, 0.34, 16);
      rg.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ color: 0xdfe9e6, transparent: true, opacity: 0.38, depthWrite: false });
      const im = new THREE.InstancedMesh(rg, mat, rings.length / 2);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < rings.length; i += 2) {
        const s = 0.9 + ((i * 7919) % 100) / 250;
        m4.makeScale(s, 1, s).setPosition(rings[i], 0.025, rings[i + 1]);
        im.setMatrixAt(i / 2, m4);
      }
      im.renderOrder = 6;
      im.frustumCulled = false;
      this.group.add(im);
      this.disposables.push(rg, mat, im);
    }
    void clamp;
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}
