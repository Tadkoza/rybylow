import * as THREE from "three";
import { mulberry32 } from "./noise";
import { GLSL_NOISE, GLSL_CAUSTIC } from "./glsl";

/** wspólne uniformy czasu / wiatru */
export const timeUniform = { value: 0 };
export const windUniform = { value: 1 };

let detailTex: THREE.DataTexture | null = null;

/** płytka, powtarzalna tekstura szumu (do detalu terenu i listowia) */
export function getDetailTexture(): THREE.DataTexture {
  if (detailTex) return detailTex;
  const size = 256;
  const rnd = mulberry32(1337);
  const octs: [number, number][] = [
    [8, 0.38],
    [16, 0.28],
    [32, 0.2],
    [64, 0.14],
  ];
  const grids = octs.map(([f]) => {
    const g = new Float32Array(f * f);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    return g;
  });
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let v = 0;
      for (let o = 0; o < octs.length; o++) {
        const [f, wgt] = octs[o];
        const u = (x / size) * f, w = (y / size) * f;
        const i0 = Math.floor(u), j0 = Math.floor(w);
        const fx = u - i0, fy = w - j0;
        const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
        const g = grids[o];
        const a = g[(j0 % f) * f + (i0 % f)], b = g[(j0 % f) * f + ((i0 + 1) % f)];
        const c = g[((j0 + 1) % f) * f + (i0 % f)], d = g[((j0 + 1) % f) * f + ((i0 + 1) % f)];
        v += wgt * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
      }
      // rozciągnięcie kontrastu
      v = Math.min(1, Math.max(0, (v - 0.5) * 1.8 + 0.5));
      const o4 = (y * size + x) * 4;
      const byte = Math.round(v * 255);
      data[o4] = data[o4 + 1] = data[o4 + 2] = byte;
      data[o4 + 3] = 255;
    }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  detailTex = tex;
  return tex;
}

function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  draw(ctx);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** elewacja z oknami: 1 kafelek = 4 m szerokości, 3 m wysokości */
export function makeFacadeTexture(): THREE.CanvasTexture {
  const rnd = mulberry32(5);
  return canvasTex(256, 192, (ctx) => {
    ctx.fillStyle = "#f2efe9";
    ctx.fillRect(0, 0, 256, 192);
    for (let i = 0; i < 1800; i++) {
      const v = 225 + Math.floor(rnd() * 30);
      ctx.fillStyle = `rgb(${v},${v - 2},${v - 6})`;
      ctx.fillRect(rnd() * 256, rnd() * 192, 1 + rnd() * 3, 1 + rnd() * 3);
    }
    // okno
    const x = 82, y = 38, w = 92, h = 100;
    ctx.fillStyle = "#d9d5cc";
    ctx.fillRect(x - 8, y - 8, w + 16, h + 16);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, "#6f879a");
    g.addColorStop(0.5, "#3c4c5a");
    g.addColorStop(1, "#27323c");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#efece4";
    ctx.fillRect(x + w / 2 - 3, y, 6, h);
    ctx.fillRect(x, y + h * 0.38, w, 5);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.moveTo(x, y + h * 0.55);
    ctx.lineTo(x + w * 0.5, y);
    ctx.lineTo(x + w * 0.75, y);
    ctx.lineTo(x, y + h * 0.9);
    ctx.fill();
    ctx.fillStyle = "#cbc6bc";
    ctx.fillRect(x - 12, y + h + 6, w + 24, 8);
  });
}

/** deski pomostu */
export function makePlankTexture(): THREE.CanvasTexture {
  const rnd = mulberry32(9);
  return canvasTex(256, 256, (ctx) => {
    const planks = 8;
    const ph = 256 / planks;
    for (let i = 0; i < planks; i++) {
      const base = 120 + Math.floor(rnd() * 40);
      ctx.fillStyle = `rgb(${base + 10},${base - 6},${base - 30})`;
      ctx.fillRect(0, i * ph, 256, ph);
      for (let k = 0; k < 90; k++) {
        const v = base - 25 + Math.floor(rnd() * 50);
        ctx.fillStyle = `rgba(${v + 10},${v - 6},${v - 30},0.5)`;
        ctx.fillRect(rnd() * 256, i * ph + rnd() * ph, 8 + rnd() * 50, 1);
      }
      ctx.fillStyle = "rgba(20,14,8,0.85)";
      ctx.fillRect(0, i * ph, 256, 3);
    }
  });
}

/** dachówka / blacha */
export function makeRoofTexture(): THREE.CanvasTexture {
  const rnd = mulberry32(21);
  return canvasTex(128, 128, (ctx) => {
    ctx.fillStyle = "#cfcfcf";
    ctx.fillRect(0, 0, 128, 128);
    const rows = 8;
    for (let r = 0; r < rows; r++) {
      const y = (r * 128) / rows;
      for (let c = 0; c < 8; c++) {
        const v = 190 + Math.floor(rnd() * 50);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(((c + (r % 2) * 0.5) * 128) / 8, y, 128 / 8 - 1, 128 / rows - 1);
      }
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0, y, 128, 2);
    }
  });
}

export function makeAsphaltTexture(): THREE.CanvasTexture {
  const rnd = mulberry32(33);
  return canvasTex(128, 128, (ctx) => {
    ctx.fillStyle = "#bdbdbd";
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 3000; i++) {
      const v = 150 + Math.floor(rnd() * 100);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(rnd() * 128, rnd() * 128, 1, 1);
    }
  });
}

/** wspólne uniformy podwodne: pochłanianie światła (na metr) i siła kaustyk */
export const uwUniforms = {
  uAbsorb: { value: new THREE.Vector3(0.62, 0.15, 0.24) },
  uCaustic: { value: 1 },
  /** kolor toni wodnej i nieba — do zamglenia i odbicia na rybach tuż pod powierzchnią */
  uHazeCol: { value: new THREE.Color(0.05, 0.14, 0.13) },
  uSkyCol: { value: new THREE.Color(0.7, 0.8, 0.9) },
};

export interface ShaderParts {
  vertexShader: string;
  fragmentShader: string;
  uniforms: { [k: string]: THREE.IUniform };
}

interface PatchOpts {
  sway?: number; // amplituda kołysania (m)
  swayHeight?: number; // wysokość odniesienia (m)
  swaySpd?: number; // prędkość kołysania (1 = domyślna)
  detail?: number; // siła szumu (0..1)
  detailScale?: number;
  detailFar?: number;
  noFlip?: boolean; // nie odwracaj normalnych na tylnych ściankach (trawa, trzciny)
  uw?: boolean; // światło pod wodą: pochłanianie + kaustyki (woda na wysokości y = 0)
  uwDefer?: boolean; // nie mnóż koloru — zrobi to własny kod (teren)
  stone?: boolean; // procedurowa skóra kamienia: ziarno, żyłki, porosty, osad glonów, mokra strefa
  extra?: (s: ShaderParts) => void; // dodatkowe podmiany w shaderach
  key?: string;
}

/** wstrzykuje kołysanie od wiatru, szum detalu, światło podwodne i skórę kamienia do materiału standardowego */
export function patchMaterial(mat: THREE.MeshStandardMaterial, o: PatchOpts) {
  const tex = getDetailTexture();
  const needNoise = !!(o.uw || o.stone);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.uniforms.uWind = windUniform;
    shader.uniforms.uDetail = { value: tex };
    shader.uniforms.uSway = { value: o.sway ?? 0 };
    shader.uniforms.uSwayH = { value: 1 / (o.swayHeight ?? 20) };
    shader.uniforms.uSwaySpd = { value: o.swaySpd ?? 1 };
    shader.uniforms.uDetailAmt = { value: o.detail ?? 0.6 };
    shader.uniforms.uDetailScale = { value: o.detailScale ?? 1.6 };
    shader.uniforms.uDetailFar = { value: o.detailFar ?? 70 };
    if (o.uw) {
      shader.uniforms.uAbsorb = uwUniforms.uAbsorb;
      shader.uniforms.uCaustic = uwUniforms.uCaustic;
    }
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uTime; uniform float uWind; uniform float uSway; uniform float uSwayH; uniform float uSwaySpd;
        varying vec3 vWPos;
        ${needNoise ? "varying vec3 vWN;" : ""}`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        {
          vec3 ip = vec3(0.0);
          #ifdef USE_INSTANCING
            ip = instanceMatrix[3].xyz;
          #endif
          float hf = clamp(position.y * uSwayH, 0.0, 1.0);
          hf *= hf;
          float ph = ip.x * 0.071 + ip.z * 0.053;
          float st = uTime * uSwaySpd;
          float w1 = sin(st * 1.15 + ph) * 0.6 + sin(st * 2.7 + ph * 1.9) * 0.4;
          float w2 = cos(st * 0.93 + ph * 1.3) * 0.7 + sin(st * 2.1 + ph) * 0.3;
          transformed.x += w1 * hf * uSway * uWind;
          transformed.z += w2 * hf * uSway * 0.7 * uWind;
          vec4 iw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            iw = instanceMatrix * iw;
          #endif
          vWPos = (modelMatrix * iw).xyz;
          ${
            needNoise
              ? `vec3 wn0 = objectNormal;
          #ifdef USE_INSTANCING
            wn0 = mat3(instanceMatrix) * wn0;
          #endif
          vWN = normalize(mat3(modelMatrix) * wn0);`
              : ""
          }
        }`
      );
    if (o.noFlip)
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <normal_fragment_begin>",
        THREE.ShaderChunk.normal_fragment_begin.replace("gl_FrontFacing ? 1.0 : - 1.0", "1.0")
      );

    const stoneCode = o.stone
      ? `
          {
            vec3 wp = vWPos;
            float lod = 1.0 - smoothstep(14.0, 55.0, dd);
            float sp1 = vn3(wp * 62.0);
            float sp2 = vn3(wp * 17.0 + 3.0);
            float sp3 = vn3(wp * 4.6 + 9.0);
            float veins = smoothstep(0.46, 0.54, vn3(wp * 3.1 + vn3(wp * 7.0) * 1.8));
            // ziarno mineralne i plamy
            float lum = 0.62 + 0.75 * sp2 + (sp1 - 0.5) * 0.5 * lod;
            diffuseColor.rgb *= mix(1.0, lum, 0.92);
            diffuseColor.rgb *= 0.86 + 0.28 * sp3;
            diffuseColor.rgb *= mix(1.0, 0.78 + 0.5 * veins, 0.55);
            float up = clamp(vWN.y, 0.0, 1.0);
            // porosty na suchych, górnych powierzchniach
            float lich = smoothstep(0.56, 0.72, vn3(wp * 6.0 + 11.0)) * smoothstep(0.25, 0.8, up) * smoothstep(0.1, 0.35, wp.y);
            float gl = dot(diffuseColor.rgb, vec3(0.333));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.7, 0.28) * gl * 1.35, lich * 0.55);
            // osad glonów pod wodą i przy linii wody
            float below = smoothstep(0.22, -0.35, wp.y);
            float film = below * smoothstep(0.05, 0.75, up + 0.35 * (vn3(wp * 9.0) - 0.5)) * (1.0 - smoothstep(1.8, 4.2, -wp.y));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.085, 0.12, 0.028) * (0.5 + 1.0 * sp2), film * 0.7);
            // pas zwilżony przy brzegu
            float wet = smoothstep(0.42, 0.0, wp.y + (sp3 - 0.5) * 0.12);
            diffuseColor.rgb *= mix(1.0, 0.58, wet);
            stoneH = (sp2 * 0.016 + sp1 * 0.0035 + sp3 * 0.02) * lod;
            stoneWet = wet;
          }`
      : "";
    const uwCode = o.uw
      ? `
          uwMul = uwLight(vWPos, uTime, dd);
          ${o.uwDefer ? "" : "diffuseColor.rgb *= uwMul;"}`
      : "";

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform sampler2D uDetail; uniform float uDetailAmt; uniform float uDetailScale; uniform float uDetailFar;
        varying vec3 vWPos;
        ${needNoise ? "uniform float uTime; varying vec3 vWN;\n" + GLSL_NOISE : ""}
        ${o.uw ? GLSL_CAUSTIC : ""}`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float stoneH = 0.0; float stoneWet = 0.0; vec3 uwMul = vec3(1.0);
        {
          float dd = length(vWPos - cameraPosition);
          float f = smoothstep(uDetailFar, uDetailFar * 0.18, dd) * uDetailAmt;
          vec3 tp = vWPos * uDetailScale;
          float n1 = texture2D(uDetail, tp.xz * 0.5 + tp.xy * 0.25 + tp.zy * 0.25).r;
          float n2 = texture2D(uDetail, tp.xz * 0.113 + vec2(0.37, 0.71)).r;
          float n = n1 * 0.65 + n2 * 0.35;
          diffuseColor.rgb *= mix(1.0, 0.5 + 0.95 * n, f);
          float gr = texture2D(uDetail, vWPos.xz * 2.7 + vWPos.y * 0.5).r;
          diffuseColor.rgb *= mix(1.0, 0.72 + 0.56 * gr, smoothstep(16.0, 2.0, dd) * uDetailAmt);
          ${stoneCode}
          ${uwCode}
        }`
      );
    if (o.stone)
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.3, stoneWet * 0.85);")
        .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n normal = bumpPerturb(-vViewPosition, normal, stoneH, faceDirection);");
    o.extra?.(shader);
  };
  mat.customProgramCacheKey = () =>
    `patch-${o.noFlip ? 1 : 0}-${o.sway ?? 0}-${o.swaySpd ?? 1}-${o.detail ?? 0.6}-${o.detailScale ?? 1.6}-${o.detailFar ?? 70}-${o.uw ? 1 : 0}${o.uwDefer ? 1 : 0}${o.stone ? 1 : 0}-${o.key ?? ""}`;
}
