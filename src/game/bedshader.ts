import type { ShaderParts } from "./materials";

/**
 * Procedurowy shader dna jeziora i brzegu (wstrzykiwany do materiału terenu).
 * aBed = (piasek, żwir, muł, szczątki organiczne)
 */
const BED_COMMON = /* glsl */ `
varying vec4 vBed;
vec3 pebCol(float c) {
  vec3 col = mix(vec3(0.28, 0.27, 0.25), vec3(0.5, 0.48, 0.44), smoothstep(0.0, 0.85, c));
  col = mix(col, vec3(0.56, 0.47, 0.36), smoothstep(0.8, 0.9, c) * 0.85);
  col = mix(col, vec3(0.48, 0.34, 0.27), smoothstep(0.93, 0.97, c) * 0.75);
  col = mix(col, vec3(0.68, 0.65, 0.58), smoothstep(0.985, 1.0, c));
  return col;
}
`;

const BED_ALBEDO = /* glsl */ `
float bedH = 0.0; float bedWet = 0.0; float bedMask = 0.0;
{
  float sumW = vBed.x + vBed.y + vBed.z;
  bedMask = clamp(sumW * 1.6, 0.0, 1.0);
  float ddb = length(vWPos - cameraPosition);
  float yy = vWPos.y;
  bedWet = (1.0 - smoothstep(0.02, 0.34, yy + (vn2(vWPos.xz * 0.7) - 0.5) * 0.18)) * bedMask;
  if (bedMask > 0.01 && ddb < 62.0) {
    float fade = 1.0 - smoothstep(10.0, 55.0, ddb);
    float nearF = 1.0 - smoothstep(1.8, 15.0, ddb);
    vec3 wt = vBed.xyz / max(sumW, 0.001);
    float depth = max(0.0, -yy);
    vec2 p = vWPos.xz;
    // pozorna refrakcja: wzór dna lekko faluje pod powierzchnią
    vec2 pr = p + (vec2(vn2(p * 1.4 + uTime * 0.33), vn2(p * 1.4 - uTime * 0.27 + 9.0)) - 0.5) * 0.05 * min(depth, 1.5);
    vec3 base = diffuseColor.rgb;
    vec3 aSum = vec3(0.0);
    float hSum = 0.0, wUsed = 0.0;

    // ---------- piasek: zmarszczki falowe, ziarno, ciemne minerały
    if (wt.x > 0.01) {
      float ang = vn2(pr * 0.07) * 6.2832;
      vec2 rd = vec2(cos(ang), sin(ang));
      float warp = vn2(pr * 1.6) * 2.2 + vn2(pr * 0.4 + 4.0) * 5.0;
      float rip = 0.5 + 0.5 * sin(dot(pr, rd) * 36.0 + warp);
      float ripAmt = smoothstep(0.05, 0.4, depth) * (1.0 - smoothstep(2.0, 3.6, depth)) * (0.35 + 0.65 * smoothstep(0.3, 0.6, vn2(pr * 0.13 + 3.0)));
      float grain = vn2(pr * 190.0);
      float spk = h21(floor(pr * 320.0));
      float hs = rip * 0.009 * ripAmt + (grain - 0.5) * 0.0016 * nearF + (vn2(pr * 38.0) - 0.5) * 0.004;
      vec3 a = base * (1.0 + (rip - 0.5) * 0.28 * ripAmt) * (0.92 + 0.16 * grain * nearF);
      a *= 1.0 - 0.22 * step(0.965, spk) * nearF;
      a += vec3(0.07, 0.065, 0.05) * step(0.994, spk) * nearF;
      aSum += a * wt.x; hSum += hs * wt.x; wUsed += wt.x;
    }
    // ---------- żwir i otoczaki (voronoi)
    if (wt.y > 0.01) {
      vec2 gp = pr + (vec2(vn2(pr * 2.3), vn2(pr * 2.3 + 5.0)) - 0.5) * 0.35 + (vec2(vn2(pr * 9.0), vn2(pr * 9.0 + 3.0)) - 0.5) * 0.05;
      float cob = smoothstep(0.58, 0.78, vn2(pr * 0.3 + 11.0)) * 0.8;
      float in1 = 0.0, c1 = 0.0, dome1 = 0.0, in2 = 0.0, c2 = 0.0, dome2 = 0.0;
      if (cob < 0.7) {
        vec4 v1 = voro(gp * 21.0);
        in1 = smoothstep(0.02, 0.3, v1.w - v1.x);
        c1 = h21(v1.yz);
        dome1 = in1 * (0.5 + 0.5 * c1) * (1.0 - 0.6 * v1.x);
      }
      if (cob > 0.04) {
        vec4 v2 = voro(gp * 8.0 + 7.0);
        in2 = smoothstep(0.02, 0.26, v2.w - v2.x);
        c2 = h21(v2.yz + 3.0);
        dome2 = in2 * (0.5 + 0.5 * c2) * (1.0 - 0.5 * v2.x);
      }
      float hg = mix(dome1 * 0.016, dome2 * 0.036, cob);
      vec3 pc = pebCol(mix(c1, c2, cob));
      pc = pc * pc * 1.05;
      float ao = mix(in1, in2, cob);
      // szczeliny wypełnia piasek i drobny żwir
      vec3 fill = base * (0.75 + 0.4 * vn2(pr * 70.0));
      pc = mix(fill, pc * (0.7 + 0.3 * ao) * (0.85 + 0.3 * vn2(pr * 55.0)), smoothstep(0.0, 0.45, ao));
      vec3 a = mix(base, pc, 0.25 + 0.75 * fade);
      aSum += a * wt.y; hSum += hg * wt.y; wUsed += wt.y;
    }
    // ---------- muł: osad, plamy, ciemne punkty materii organicznej
    if (wt.z > 0.01) {
      float f1 = fbm2(pr * 5.0);
      float silt = smoothstep(0.45, 0.8, fbm2(pr * 2.1 + 20.0));
      vec3 a = base * (0.72 + 0.6 * f1);
      a = mix(a, a * 1.5 + vec3(0.02, 0.02, 0.015), silt * 0.45);
      float spot = 0.0;
      if (nearF > 0.02) {
        vec4 vm = voro(pr * 30.0 + 3.0);
        spot = (1.0 - smoothstep(0.08, 0.22, vm.x)) * step(0.55, h21(vm.yz)) * nearF;
      }
      a *= 1.0 - spot * 0.5;
      aSum += a * wt.z;
      hSum += ((f1 - 0.5) * 0.02 + (vn2(pr * 55.0) - 0.5) * 0.004 * nearF - spot * 0.003) * wt.z;
      wUsed += wt.z;
    }
    vec3 alb = aSum / max(wUsed, 0.001);
    // ---------- zbutwiałe liście
    if (vBed.w > 0.02 && ddb < 55.0) {
      vec4 vl = voro(pr * 10.0 + 31.0);
      float lr = h21(vl.yz + 1.7);
      float lm = (1.0 - smoothstep(0.17 + 0.12 * lr, 0.28 + 0.14 * lr, vl.x)) * step(lr, vBed.w * 0.85);
      vec3 lc = mix(vec3(0.2, 0.1, 0.035), vec3(0.19, 0.17, 0.05), h21(vl.yz + 9.0));
      lc = mix(lc, vec3(0.3, 0.17, 0.05), step(0.82, h21(vl.yz + 4.0)));
      lc *= 0.75 + 0.5 * vn2(pr * 70.0);
      alb = mix(alb, lc, lm * 0.9 * (0.5 + 0.5 * fade));
      hSum += lm * 0.004;
    }
    float mixK = bedMask * (0.4 + 0.6 * fade);
    diffuseColor.rgb = mix(base, alb, mixK);
    bedH = hSum * fade;
  }
  // mokry piasek / ziemia przy linii wody
  diffuseColor.rgb *= mix(1.0, 0.6, bedWet);
  // światło podwodne (pochłanianie + kaustyki) na końcu, żeby objęło też kolory warstw powyżej
  diffuseColor.rgb *= uwMul;
}
`;

export function terrainBedPatch(s: ShaderParts) {
  s.vertexShader = s.vertexShader
    .replace("#include <common>", "#include <common>\nattribute vec4 aBed;\nvarying vec4 vBed;")
    .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBed = aBed;");
  s.fragmentShader = s.fragmentShader
    .replace("#include <common>", `#include <common>\n${BED_COMMON}`)
    .replace("#include <alphatest_fragment>", `#include <alphatest_fragment>\n${BED_ALBEDO}`)
    .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.4, bedWet * 0.8);")
    .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nif (bedMask > 0.01) normal = bumpPerturb(-vViewPosition, normal, bedH, faceDirection);");
}
