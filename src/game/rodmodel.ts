import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mulberry32 } from "./noise";

export interface RodModel {
  root: THREE.Group;
  segs: THREE.Group[];
  /** punkty, przez które biegnie żyłka: rolka kabłąka → przelotki → szczytówka */
  lineNodes: THREE.Object3D[];
  tip: THREE.Object3D;
  bail: THREE.Group;
  crank: THREE.Group;
  spoolLine: THREE.Mesh;
  dispose(): void;
}

function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** splot węglowy 2x2 (twill) */
function carbonTexture() {
  return canvasTex(256, 256, (ctx) => {
    const rnd = mulberry32(3);
    ctx.fillStyle = "#0e1013";
    ctx.fillRect(0, 0, 256, 256);
    const n = 16, cs = 256 / n;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const warp = (i + j) % 4 < 2;
        const x = i * cs, y = j * cs;
        const g = warp ? ctx.createLinearGradient(x, y, x, y + cs) : ctx.createLinearGradient(x, y, x + cs, y);
        const b = 46 + rnd() * 26;
        g.addColorStop(0, `rgb(${b * 0.42},${b * 0.44},${b * 0.5})`);
        g.addColorStop(0.5, `rgb(${b * 1.55},${b * 1.58},${b * 1.68})`);
        g.addColorStop(1, `rgb(${b * 0.38},${b * 0.4},${b * 0.45})`);
        ctx.fillStyle = g;
        ctx.fillRect(x + 0.6, y + 0.6, cs - 1.2, cs - 1.2);
        // pojedyncze włókna
        ctx.strokeStyle = "rgba(255,255,255,0.05)";
        ctx.lineWidth = 0.5;
        for (let k = 1; k < 4; k++) {
          ctx.beginPath();
          if (warp) {
            ctx.moveTo(x + (k * cs) / 4, y + 1);
            ctx.lineTo(x + (k * cs) / 4, y + cs - 1);
          } else {
            ctx.moveTo(x + 1, y + (k * cs) / 4);
            ctx.lineTo(x + cs - 1, y + (k * cs) / 4);
          }
          ctx.stroke();
        }
      }
  });
}

function corkTexture() {
  return canvasTex(256, 256, (ctx) => {
    const rnd = mulberry32(11);
    ctx.fillStyle = "#b88c58";
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {
      const dark = rnd() < 0.5;
      ctx.fillStyle = dark ? `rgba(112,76,40,${0.25 + rnd() * 0.4})` : `rgba(222,186,134,${0.25 + rnd() * 0.45})`;
      ctx.beginPath();
      ctx.ellipse(rnd() * 256, rnd() * 256, 0.8 + rnd() * 3.4, 0.7 + rnd() * 2.4, rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 140; i++) {
      ctx.fillStyle = `rgba(40,26,14,${0.5 + rnd() * 0.4})`;
      ctx.beginPath();
      ctx.arc(rnd() * 256, rnd() * 256, 0.6 + rnd() * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** owijka nicią: poziome nitki (wokół walca) */
function threadTexture() {
  return canvasTex(32, 64, (ctx) => {
    ctx.fillStyle = "#9a9a9a";
    ctx.fillRect(0, 0, 32, 64);
    for (let y = 0; y < 64; y += 2) {
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillRect(0, y, 32, 1);
      ctx.fillStyle = "rgba(0,0,0,0.38)";
      ctx.fillRect(0, y + 1, 32, 1);
    }
  });
}

function brushedTexture() {
  return canvasTex(128, 128, (ctx) => {
    const rnd = mulberry32(19);
    ctx.fillStyle = "#9a9ea3";
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 700; i++) {
      const l = rnd() < 0.5;
      ctx.strokeStyle = l ? `rgba(255,255,255,${rnd() * 0.12})` : `rgba(0,0,0,${rnd() * 0.14})`;
      ctx.lineWidth = 0.6 + rnd();
      const y = rnd() * 128;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(128, y + (rnd() - 0.5) * 3);
      ctx.stroke();
    }
  });
}

function lineSpoolTexture() {
  return canvasTex(64, 64, (ctx) => {
    ctx.fillStyle = "#e9eeeb";
    ctx.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 2) {
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fillRect(0, y, 64, 1);
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.fillRect(0, y + 1, 64, 1);
    }
  });
}

/** prosta „mapa otoczenia” (niebo, horyzont, ziemia) – daje wędce metaliczne odbicia */
function makeEnv(renderer: THREE.WebGLRenderer): { texture: THREE.Texture; dispose(): void } | null {
  try {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 128;
    const ctx = c.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, "#5f8ccb");
    g.addColorStop(0.42, "#d3e3f4");
    g.addColorStop(0.5, "#ffffff");
    g.addColorStop(0.53, "#8f8c7a");
    g.addColorStop(1, "#3b382c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 128);
    const rg = ctx.createRadialGradient(170, 30, 0, 170, 30, 24);
    rg.addColorStop(0, "rgba(255,250,235,1)");
    rg.addColorStop(1, "rgba(255,250,235,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, 256, 128);
    const t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.colorSpace = THREE.SRGBColorSpace;
    const pm = new THREE.PMREMGenerator(renderer);
    const rt = pm.fromEquirectangular(t);
    pm.dispose();
    t.dispose();
    return { texture: rt.texture, dispose: () => rt.dispose() };
  } catch {
    return null;
  }
}

/** walec wzdłuż osi Z: rBack przy większym z (w stronę gracza), rFront przy mniejszym */
function cylZ(rBack: number, rFront: number, zFront: number, zBack: number, seg = 20, open = false): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rBack, rFront, zBack - zFront, seg, 1, open);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, (zFront + zBack) / 2);
  return g;
}

function mergeUV(list: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!list.length) return null;
  const arr = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(n.attributes)) if (!["position", "normal", "uv"].includes(k)) n.deleteAttribute(k);
    if (!n.attributes.uv) n.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    return n;
  });
  return mergeGeometries(arr, false);
}

export function buildRod(renderer: THREE.WebGLRenderer): RodModel {
  const disposables: { dispose(): void }[] = [];
  const env = makeEnv(renderer);
  if (env) disposables.push(env);
  const envMap = env ? env.texture : null;
  const keep = <T extends { dispose(): void }>(o: T): T => {
    disposables.push(o);
    return o;
  };

  const carbonT = keep(carbonTexture());
  carbonT.repeat.set(1, 3.4);
  const corkT = keep(corkTexture());
  corkT.repeat.set(1.3, 2.2);
  const threadT = keep(threadTexture());
  threadT.repeat.set(1, 1);
  const brushT = keep(brushedTexture());
  const lineT = keep(lineSpoolTexture());
  lineT.repeat.set(1, 2);

  const std = (o: THREE.MeshStandardMaterialParameters) => keep(new THREE.MeshStandardMaterial({ envMap, ...o }));
  const blankMat = keep(
    new THREE.MeshPhysicalMaterial({ map: carbonT, roughness: 0.34, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.1, envMap, envMapIntensity: 0.85, side: THREE.DoubleSide })
  );
  const wrapMat = std({ map: threadT, color: 0xb02a22, roughness: 0.5, metalness: 0.1, envMapIntensity: 0.4 });
  const goldMat = std({ color: 0xd8b45c, roughness: 0.3, metalness: 0.9, envMapIntensity: 1 });
  const chromeMat = std({ color: 0xe0e4e7, roughness: 0.16, metalness: 1, envMapIntensity: 1 });
  const darkMat = std({ color: 0x15171a, roughness: 0.7, metalness: 0.1, envMapIntensity: 0.3 });
  const corkMat = std({ map: corkT, roughness: 0.92, metalness: 0, envMapIntensity: 0.1 });
  const graphMat = std({ color: 0x6d747c, map: brushT, roughness: 0.34, metalness: 0.85, envMapIntensity: 1 });
  const spoolMat = std({ color: 0xcaa662, map: brushT, roughness: 0.3, metalness: 0.9, envMapIntensity: 1 });
  const rotorMat = std({ color: 0x3a3f46, roughness: 0.32, metalness: 0.8, envMapIntensity: 0.9 });
  const lineMat = std({ color: 0xf4f7f5, map: lineT, roughness: 0.55, metalness: 0 });
  const knobMat = std({ color: 0x2b2a29, roughness: 0.82, metalness: 0 });

  const root = new THREE.Group();
  const add = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D = root) => {
    keep(g);
    const o = new THREE.Mesh(g, m);
    parent.add(o);
    return o;
  };

  // ---------------------------------------------------------------- rękojeść
  add(cylZ(0.0152, 0.0128, 0.03, 0.12, 24), corkMat); // przedni chwyt
  add(cylZ(0.0134, 0.0134, 0.022, 0.034, 18, true), wrapMat);
  add(cylZ(0.0188, 0.0188, 0.116, 0.13, 22), chromeMat); // nakrętka przednia
  add(cylZ(0.0158, 0.0158, 0.13, 0.2, 24), graphMat); // gniazdo kołowrotka
  add(cylZ(0.0188, 0.0188, 0.2, 0.214, 22), chromeMat); // nakrętka tylna
  add(cylZ(0.0194, 0.0172, 0.214, 0.375, 26), corkMat); // tylny chwyt
  add(cylZ(0.02, 0.0194, 0.375, 0.396, 26), darkMat); // gumowa stopka
  add(cylZ(0.0165, 0.0165, 0.396, 0.399, 22), goldMat);

  // ---------------------------------------------------------------- kołowrotek
  const ry = -0.078;
  const at = (g: THREE.BufferGeometry, x: number, y: number, z: number) => {
    g.translate(x, y, z);
    return g;
  };
  add(at(new THREE.BoxGeometry(0.016, 0.034, 0.05), 0, -0.0365, 0.168), graphMat); // stopka
  const bodyG = new THREE.SphereGeometry(1, 28, 18);
  bodyG.scale(0.029, 0.027, 0.043);
  add(at(bodyG, 0, ry, 0.172), graphMat);
  const plate = new THREE.CylinderGeometry(0.0138, 0.0138, 0.008, 18);
  plate.rotateZ(Math.PI / 2);
  add(at(plate, 0.0296, ry, 0.172), chromeMat);
  const plateL = new THREE.CylinderGeometry(0.012, 0.012, 0.006, 18);
  plateL.rotateZ(Math.PI / 2);
  add(at(plateL, -0.0292, ry, 0.172), darkMat);
  add(at(cylZ(0.0352, 0.034, 0.1, 0.132, 28), 0, ry, 0), rotorMat); // rotor
  add(at(cylZ(0.0368, 0.0368, 0.097, 0.103, 28), 0, ry, 0), graphMat);
  add(at(cylZ(0.0338, 0.0338, 0.094, 0.099, 28), 0, ry, 0), spoolMat); // szpula – kołnierz tylny
  const spoolLine = add(at(cylZ(0.0296, 0.0296, 0.074, 0.094, 28), 0, ry, 0), lineMat);
  add(at(cylZ(0.0338, 0.0338, 0.069, 0.074, 28), 0, ry, 0), spoolMat); // kołnierz przedni
  add(at(cylZ(0.0162, 0.0146, 0.056, 0.069, 20), 0, ry, 0), chromeMat); // pokrętło hamulca
  add(at(cylZ(0.0085, 0.0085, 0.053, 0.056, 14), 0, ry, 0), darkMat);

  // kabłąk (obraca się wokół osi X)
  const bail = new THREE.Group();
  bail.position.set(0, ry, 0.122);
  for (const sx of [-1, 1]) add(at(cylZ(0.0013, 0.0013, -0.062, 0, 6), sx * 0.0405, 0, 0), chromeMat, bail);
  add(at(new THREE.TorusGeometry(0.0405, 0.0015, 6, 30, Math.PI), 0, 0, -0.062), chromeMat, bail);
  const rollerG = new THREE.CylinderGeometry(0.0042, 0.0042, 0.014, 10);
  rollerG.rotateZ(Math.PI / 2);
  add(at(rollerG, 0, 0.0405, -0.062), goldMat, bail);
  const rollerNode = new THREE.Object3D();
  rollerNode.position.set(0, 0.0405, -0.062);
  bail.add(rollerNode);
  root.add(bail);

  // korbka
  const crank = new THREE.Group();
  crank.position.set(0.034, ry, 0.172);
  const shaft = new THREE.CylinderGeometry(0.0042, 0.0042, 0.036, 10);
  shaft.rotateZ(Math.PI / 2);
  add(at(shaft, 0.018, 0, 0), chromeMat, crank);
  add(at(new THREE.BoxGeometry(0.0062, 0.068, 0.0135), 0.036, -0.034, 0), chromeMat, crank);
  const knob = new THREE.CylinderGeometry(0.0108, 0.0098, 0.034, 14);
  knob.rotateZ(Math.PI / 2);
  add(at(knob, 0.054, -0.066, 0), knobMat, crank);
  root.add(crank);

  // ---------------------------------------------------------------- blank
  const N = 12, L = 0.28;
  const rAt = (i: number) => 0.0112 - (0.0082 * i) / N;
  const segs: THREE.Group[] = [];
  const lineNodes: THREE.Object3D[] = [rollerNode];
  const tip = new THREE.Object3D();
  let parent: THREE.Object3D = root;
  for (let i = 0; i < N; i++) {
    const r0 = rAt(i), r1 = rAt(i + 1);
    const holder = new THREE.Group();
    holder.position.z = i === 0 ? 0.03 : 0;
    const bg = new THREE.CylinderGeometry(r1, r0, L, 16, 1, true);
    bg.rotateX(-Math.PI / 2);
    bg.translate(0, 0, -L / 2);
    add(bg, blankMat, holder);

    const wrapG: THREE.BufferGeometry[] = [], goldG: THREE.BufferGeometry[] = [], chromeG: THREE.BufferGeometry[] = [], darkG: THREE.BufferGeometry[] = [];
    if (i > 0) darkG.push(cylZ(r0 * 1.34, r0 * 1.2, -0.011, 0, 16));
    if (i >= 1) {
      const zc = -L * 0.52;
      const rg = r0 + (r1 - r0) * 0.52;
      wrapG.push(cylZ(rg + 0.0006, rg + 0.0006, zc - 0.016, zc + 0.016, 14, true));
      goldG.push(cylZ(rg + 0.0007, rg + 0.0007, zc - 0.0195, zc - 0.016, 14, true), cylZ(rg + 0.0007, rg + 0.0007, zc + 0.016, zc + 0.0195, 14, true));
      const foot = new THREE.BoxGeometry(0.0034, 0.0016, 0.036);
      foot.translate(0, -(rg + 0.0012), zc);
      chromeG.push(foot);
      const leg = new THREE.CylinderGeometry(0.0007, 0.0007, 0.0105, 5);
      leg.translate(0, -(rg + 0.0012 + 0.0052), zc);
      chromeG.push(leg);
      const ringR = 0.0092;
      const yc = -(rg + 0.0117) - ringR - 0.0012;
      const ring = new THREE.TorusGeometry(ringR, 0.0012, 6, 18);
      ring.translate(0, yc, zc);
      chromeG.push(ring);
      const ins = new THREE.TorusGeometry(ringR - 0.0014, 0.0007, 5, 16);
      ins.translate(0, yc, zc);
      darkG.push(ins);
      const node = new THREE.Object3D();
      node.position.set(0, yc, zc);
      holder.add(node);
      lineNodes.push(node);
    }
    for (const [list, mat] of [
      [wrapG, wrapMat],
      [goldG, goldMat],
      [chromeG, chromeMat],
      [darkG, darkMat],
    ] as [THREE.BufferGeometry[], THREE.Material][]) {
      const m = mergeUV(list);
      list.forEach((g) => g.dispose());
      if (m) add(m, mat, holder);
    }

    const next = new THREE.Group();
    next.position.set(0, 0, -L);
    holder.add(next);
    if (i === N - 1) {
      // szczytówka: przelotka szczytowa
      const ring = new THREE.TorusGeometry(0.0046, 0.0009, 6, 14);
      add(ring, chromeMat, next);
      add(cylZ(r1 * 1.1, r1 * 0.9, -0.004, 0.012, 8), goldMat, next);
      next.add(tip);
      lineNodes.push(tip);
    }
    parent.add(holder);
    segs.push(holder);
    parent = next;
  }

  return {
    root,
    segs,
    lineNodes,
    tip,
    bail,
    crank,
    spoolLine,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
