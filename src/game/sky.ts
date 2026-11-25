import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";

export type TimeId = "morning" | "noon" | "golden" | "overcast";

export interface Preset {
  id: TimeId;
  label: string;
  icon: string;
  elevation: number;
  azimuth: number;
  sunColor: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  fog: string;
  fogDensity: number;
  exposure: number;
  turbidity: number;
  rayleigh: number;
  mie: number;
  mieG: number;
  cloudCoverage: number;
  cloudDensity: number;
  waveAmp: number;
  bodyMul: number;
  birds: number;
  wind: number;
}

export const PRESETS: Preset[] = [
  {
    id: "morning",
    label: "Mglisty poranek",
    icon: "🌅",
    elevation: 9,
    azimuth: 95,
    sunColor: "#ffd2a0",
    sunIntensity: 2.6,
    hemiSky: "#a9bfd6",
    hemiGround: "#4d4b3d",
    hemiIntensity: 2.4,
    fog: "#c3ccd2",
    fogDensity: 0.00105,
    exposure: 0.72,
    turbidity: 8,
    rayleigh: 1.4,
    mie: 0.01,
    mieG: 0.85,
    cloudCoverage: 0.32,
    cloudDensity: 0.45,
    waveAmp: 0.5,
    bodyMul: 0.85,
    birds: 1.5,
    wind: 0.6,
  },
  {
    id: "noon",
    label: "Słoneczne południe",
    icon: "☀️",
    elevation: 52,
    azimuth: 185,
    sunColor: "#fff1da",
    sunIntensity: 3.6,
    hemiSky: "#a9c7ee",
    hemiGround: "#5b5b3f",
    hemiIntensity: 2.5,
    fog: "#c1d3e4",
    fogDensity: 0.00042,
    exposure: 0.52,
    turbidity: 3.2,
    rayleigh: 1.05,
    mie: 0.004,
    mieG: 0.8,
    cloudCoverage: 0.42,
    cloudDensity: 0.55,
    waveAmp: 1,
    bodyMul: 1,
    birds: 1,
    wind: 1,
  },
  {
    id: "golden",
    label: "Złota godzina",
    icon: "🌇",
    elevation: 5.5,
    azimuth: 262,
    sunColor: "#ffb36e",
    sunIntensity: 2.9,
    hemiSky: "#8d9fc4",
    hemiGround: "#4a3f33",
    hemiIntensity: 2.4,
    fog: "#d8bda6",
    fogDensity: 0.0008,
    exposure: 0.8,
    turbidity: 7,
    rayleigh: 2.1,
    mie: 0.009,
    mieG: 0.9,
    cloudCoverage: 0.5,
    cloudDensity: 0.6,
    waveAmp: 0.65,
    bodyMul: 0.9,
    birds: 1.2,
    wind: 0.5,
  },
  {
    id: "overcast",
    label: "Pochmurny dzień",
    icon: "☁️",
    elevation: 35,
    azimuth: 205,
    sunColor: "#e2e8f0",
    sunIntensity: 0.7,
    hemiSky: "#b6c0ca",
    hemiGround: "#5a5b4e",
    hemiIntensity: 3.0,
    fog: "#aeb8c0",
    fogDensity: 0.00095,
    exposure: 0.55,
    turbidity: 10,
    rayleigh: 0.7,
    mie: 0.02,
    mieG: 0.7,
    cloudCoverage: 0.95,
    cloudDensity: 0.85,
    waveAmp: 1.35,
    bodyMul: 0.75,
    birds: 0.5,
    wind: 1.5,
  },
];

export class Atmosphere {
  sky: Sky;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  fog: THREE.FogExp2;
  preset: Preset = PRESETS[1];
  sunDir = new THREE.Vector3();
  private target = new THREE.Object3D();
  private shadowRange: number;
  glow: THREE.Sprite;

  constructor(scene: THREE.Scene, shadowSize: number, shadowRange: number) {
    this.shadowRange = shadowRange;
    this.sky = new Sky();
    this.sky.scale.setScalar(450000);
    scene.add(this.sky);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = shadowSize > 0;
    if (shadowSize > 0) {
      this.sun.shadow.mapSize.set(shadowSize, shadowSize);
      const c = this.sun.shadow.camera;
      c.left = -shadowRange;
      c.right = shadowRange;
      c.top = shadowRange;
      c.bottom = -shadowRange;
      c.near = 10;
      c.far = 900;
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.normalBias = 0.35;
    }
    scene.add(this.sun);
    scene.add(this.target);
    this.sun.target = this.target;

    const gc = document.createElement("canvas");
    gc.width = gc.height = 256;
    const gx = gc.getContext("2d")!;
    const grad = gx.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, "rgba(255,246,220,1)");
    grad.addColorStop(0.06, "rgba(255,238,200,0.85)");
    grad.addColorStop(0.2, "rgba(255,225,170,0.28)");
    grad.addColorStop(0.5, "rgba(255,215,160,0.07)");
    grad.addColorStop(1, "rgba(255,210,150,0)");
    gx.fillStyle = grad;
    gx.fillRect(0, 0, 256, 256);
    const gtex = new THREE.CanvasTexture(gc);
    gtex.colorSpace = THREE.SRGBColorSpace;
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: gtex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, transparent: true, fog: false }));
    this.glow.scale.set(2200, 2200, 1);
    this.glow.renderOrder = 1;
    scene.add(this.glow);

    this.fog = new THREE.FogExp2(0xbcd0e4, 0.0005);
    scene.fog = this.fog;
  }

  apply(p: Preset, renderer: THREE.WebGLRenderer) {
    this.preset = p;
    const el = (p.elevation * Math.PI) / 180, az = (p.azimuth * Math.PI) / 180;
    this.sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az));
    const u = this.sky.material.uniforms;
    u.turbidity.value = p.turbidity;
    u.rayleigh.value = p.rayleigh;
    u.mieCoefficient.value = p.mie;
    u.mieDirectionalG.value = p.mieG;
    u.sunPosition.value.copy(this.sunDir).multiplyScalar(450000);
    u.cloudCoverage.value = p.cloudCoverage;
    u.cloudDensity.value = p.cloudDensity;
    u.cloudScale.value = 0.00032;
    u.cloudElevation.value = 0.55;
    this.sun.color.set(p.sunColor);
    this.sun.intensity = p.sunIntensity;
    this.hemi.color.set(p.hemiSky);
    this.hemi.groundColor.set(p.hemiGround);
    this.hemi.intensity = p.hemiIntensity;
    this.fog.color.set(p.fog);
    this.fog.density = p.fogDensity;
    renderer.toneMappingExposure = p.exposure;
    const gm = this.glow.material as THREE.SpriteMaterial;
    gm.color.set(p.sunColor);
    gm.opacity = p.id === "overcast" ? 0.1 : p.elevation < 15 ? 0.85 : 0.55;
  }

  update(cam: THREE.Vector3, dt: number) {
    const u = this.sky.material.uniforms;
    u.time.value += dt;
    // cień podąża za graczem (przyciągany do siatki texeli)
    const grid = (this.shadowRange * 2) / (this.sun.shadow.mapSize.x || 1024);
    const tx = Math.round(cam.x / grid) * grid, tz = Math.round(cam.z / grid) * grid;
    this.target.position.set(tx, cam.y - 1, tz);
    this.target.updateMatrixWorld();
    this.sun.position.copy(this.target.position).addScaledVector(this.sunDir, 400);
    this.glow.position.copy(cam).addScaledVector(this.sunDir, 5500);
  }
}
