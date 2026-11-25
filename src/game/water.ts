import * as THREE from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { World, GW, CELL, WORLD_HALF } from "./world";
import { timeUniform } from "./materials";

const VERT = /* glsl */ `
uniform mat4 textureMatrix;
varying vec4 vUv;
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vUv = textureMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
uniform vec3 color;
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uBody;
uniform vec3 uShallow;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uGrid;
uniform float uHalf;
uniform float uCell;
uniform float uWaveAmp;
uniform float uReflect;
varying vec4 vUv;
varying vec3 vWorld;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
vec2 wv(vec2 p, vec2 dir, float lambda, float a, float t, float dist) {
  float k = 6.2831853 / lambda;
  float ph = dot(dir, p) * k + t * sqrt(9.8 * k) * 0.55;
  float fade = 1.0 - smoothstep(lambda * 14.0, lambda * 60.0, dist);
  return dir * (cos(ph) * k * a * fade);
}

void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec2 p = vWorld.xz;
  float t = uTime;

  vec2 s = vec2(0.0);
  s += wv(p, normalize(vec2(0.92, 0.39)), 17.0, 0.060, t, dist);
  s += wv(p, normalize(vec2(-0.35, 0.94)), 9.3, 0.032, t, dist);
  s += wv(p, normalize(vec2(0.71, -0.70)), 4.1, 0.014, t, dist);
  s += wv(p, normalize(vec2(-0.82, -0.57)), 2.3, 0.0075, t, dist);
  s += wv(p, normalize(vec2(0.18, 0.98)), 1.15, 0.0042, t, dist);
  s += wv(p, normalize(vec2(-0.97, 0.22)), 0.62, 0.0024, t, dist);
  // mikro-zmarszczki (dwie warstwy) i płaty wiatru
  vec2 q1 = p * 3.3 + vec2(t * 0.31, -t * 0.19);
  vec2 q2 = p * 7.9 + vec2(-t * 0.23, t * 0.37);
  float mf = 1.0 - smoothstep(6.0, 70.0, dist);
  s += ((vec2(vn(q1), vn(q1 + 19.3)) - 0.5) * 0.035 + (vec2(vn(q2), vn(q2 + 7.7)) - 0.5) * 0.02) * mf;
  float gust = 0.45 + 1.0 * smoothstep(0.3, 0.72, vn(p * 0.011 + vec2(t * 0.012, t * 0.008)));
  s *= uWaveAmp * gust;

  vec3 N = normalize(vec3(-s.x, 1.0, -s.y));
  float cosT = clamp(dot(V, N), 0.0, 1.0);
  float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);

  vec2 ruv = vUv.xy / vUv.w;
  ruv += N.xz * 0.05 * mix(1.0, 0.4, smoothstep(20.0, 400.0, dist));
  vec3 refl = texture2D(tDiffuse, ruv).rgb;
  refl = mix(uFogColor, refl, uReflect);

  vec2 duv = ((p + uHalf) / uCell + 0.5) / uGrid;
  float depth = texture2D(tDepth, duv).r;

  // droga światła w wodzie (po załamaniu promienia) -> czysta woda, dno widoczne w płytkiej części
  float cosR = sqrt(max(0.0, 1.0 - (1.0 - V.y * V.y) / 1.78));
  float path = depth / max(cosR, 0.22);
  float bodyA = 1.0 - exp(-path * 0.33);
  vec3 body = mix(uShallow, uBody, smoothstep(0.0, 3.5, depth));
  float alpha = F + (1.0 - F) * bodyA;
  vec3 col = (refl * F + body * (1.0 - F) * bodyA) / max(alpha, 0.001);

  // połysk słońca
  vec3 R = reflect(-V, N);
  float sp = pow(max(dot(R, uSunDir), 0.0), 900.0);
  col += uSunColor * sp * 4.0;
  alpha = max(alpha, clamp(sp * 3.0, 0.0, 1.0));

  // piana i falowanie przy brzegu
  float lap = smoothstep(0.30, 0.0, depth) * (0.5 + 0.5 * sin(depth * 26.0 - t * 1.3 + vn(p * 0.8) * 6.0));
  float foamN = smoothstep(0.5, 0.8, vn(p * 1.3 + t * 0.04));
  float foam = lap * foamN * 0.35;
  col = mix(col, vec3(0.75, 0.78, 0.75) * (0.4 + 0.6 * length(uSunColor)), foam);
  alpha = max(alpha, foam * 0.8);

  alpha *= smoothstep(0.0, 0.1, depth);

  if (cameraPosition.y < 0.0) {
    col = uBody * 2.2 + vec3(0.01, 0.035, 0.03);
    alpha = 0.95;
  }

  float ff = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  col = mix(col, uFogColor, ff);

  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Water {
  mesh: Reflector;
  private world: World;
  private uniforms!: Record<string, THREE.IUniform>;
  private fallback: THREE.DataTexture;
  private renderTarget: THREE.WebGLRenderTarget;
  private origBefore: Reflector["onBeforeRender"];
  reflectionsOn = true;
  onReflectionStart: (() => void) | null = null;
  onReflectionEnd: (() => void) | null = null;

  constructor(world: World, texW: number, texH: number, samples: number) {
    this.world = world;
    const bb = world.lakeBBox;
    const pad = 40;
    const w = bb[2] - bb[0] + pad * 2, h = bb[3] - bb[1] + pad * 2;
    const geo = new THREE.PlaneGeometry(w, h, 1, 1);

    // tekstura głębokości (half float, metry)
    const data = new Uint16Array(GW * GW);
    for (let j = 0; j < GW; j++)
      for (let i = 0; i < GW; i++) {
        const o = j * GW + i;
        const sd = world.SDF[o];
        if (sd > 30) continue;
        const m = world.H[o];
        if (m < -9) {
          data[o] = THREE.DataUtils.toHalfFloat(9);
          continue;
        }
        const x = -WORLD_HALF + i * CELL, z = -WORLD_HALF + j * CELL;
        const dep = -world.heightAt(x, z);
        data[o] = dep <= 0 ? 0 : THREE.DataUtils.toHalfFloat(Math.min(9, dep));
      }
    const depthTex = new THREE.DataTexture(data, GW, GW, THREE.RedFormat, THREE.HalfFloatType);
    depthTex.magFilter = depthTex.minFilter = THREE.LinearFilter;
    depthTex.wrapS = depthTex.wrapT = THREE.ClampToEdgeWrapping;
    depthTex.needsUpdate = true;

    const [r, g, b] = world.info.waterColor;
    const initial: Record<string, THREE.IUniform> = {
      color: { value: null },
      tDiffuse: { value: null },
      textureMatrix: { value: null },
      tDepth: { value: depthTex },
      uTime: timeUniform,
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(1, 1, 1) },
      uBody: { value: new THREE.Color(r, g, b) },
      uShallow: { value: new THREE.Color(r * 2.2, g * 1.9, b * 1.4) },
      uFogColor: { value: new THREE.Color(0.7, 0.8, 0.9) },
      uFogDensity: { value: 0.0006 },
      uGrid: { value: GW },
      uHalf: { value: WORLD_HALF },
      uCell: { value: CELL },
      uWaveAmp: { value: 1 },
      uReflect: { value: 1 },
    };

    this.mesh = new Reflector(geo, {
      textureWidth: texW,
      textureHeight: texH,
      clipBias: 0.02,
      multisample: samples,
      shader: { name: "LakeWater", uniforms: initial, vertexShader: VERT, fragmentShader: FRAG },
    });
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set((bb[0] + bb[2]) / 2, 0, (bb[1] + bb[3]) / 2);
    this.mesh.renderOrder = 5;
    const mat = this.mesh.material as THREE.ShaderMaterial;
    // Reflector klonuje uniformy – podmieniamy na współdzielone obiekty
    mat.uniforms.tDepth.value = depthTex;
    mat.uniforms.uTime = timeUniform;
    this.uniforms = mat.uniforms;
    mat.transparent = true;
    mat.depthWrite = false;
    mat.side = THREE.DoubleSide;
    this.renderTarget = this.mesh.getRenderTarget();

    // awaryjna tekstura gdy odbicia są wyłączone
    this.fallback = new THREE.DataTexture(new Uint8Array([160, 190, 215, 255]), 1, 1, THREE.RGBAFormat);
    this.fallback.needsUpdate = true;

    this.origBefore = this.mesh.onBeforeRender;
    const orig = this.origBefore;
    this.mesh.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
      if (!this.reflectionsOn) return;
      this.onReflectionStart?.();
      orig.call(this.mesh, renderer, scene, camera, geometry, material, group);
      this.onReflectionEnd?.();
    };
  }

  setReflections(on: boolean) {
    this.reflectionsOn = on;
    this.uniforms.uReflect.value = on ? 1 : 0;
    const mat = this.mesh.material as THREE.ShaderMaterial;
    mat.uniforms.tDiffuse.value = on ? this.renderTarget.texture : this.fallback;
  }

  setSize(w: number, h: number) {
    this.renderTarget.setSize(Math.max(64, Math.floor(w)), Math.max(64, Math.floor(h)));
  }

  setAtmosphere(p: { sunDir: THREE.Vector3; sunColor: THREE.Color; fogColor: THREE.Color; fogDensity: number; waveAmp: number; bodyMul: number }) {
    (this.uniforms.uSunDir.value as THREE.Vector3).copy(p.sunDir);
    (this.uniforms.uSunColor.value as THREE.Color).copy(p.sunColor);
    (this.uniforms.uFogColor.value as THREE.Color).copy(p.fogColor);
    this.uniforms.uFogDensity.value = p.fogDensity;
    this.uniforms.uWaveAmp.value = p.waveAmp;
    const [r, g, b] = this.world.info.waterColor;
    (this.uniforms.uBody.value as THREE.Color).setRGB(r * p.bodyMul, g * p.bodyMul, b * p.bodyMul);
    (this.uniforms.uShallow.value as THREE.Color).setRGB(r * 2.2 * p.bodyMul, g * 1.9 * p.bodyMul, b * 1.4 * p.bodyMul);
  }

  dispose() {
    this.mesh.dispose();
    this.mesh.geometry.dispose();
    (this.uniforms.tDepth.value as THREE.Texture).dispose();
    this.fallback.dispose();
  }
}
