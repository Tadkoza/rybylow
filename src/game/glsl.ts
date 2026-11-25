/** wspólne fragmenty GLSL: szumy, voronoi, kaustyki, pochłanianie światła w wodzie, bump-mapping */

export const GLSL_NOISE = /* glsl */ `
float h21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 h22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float h31(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float vn2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float vn3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(h31(i), h31(i + vec3(1.0, 0.0, 0.0)), f.x), mix(h31(i + vec3(0.0, 1.0, 0.0)), h31(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(h31(i + vec3(0.0, 0.0, 1.0)), h31(i + vec3(1.0, 0.0, 1.0)), f.x), mix(h31(i + vec3(0.0, 1.0, 1.0)), h31(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
float fbm2(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vn2(p);
    p = p * 2.03 + vec2(17.1, 9.3);
    a *= 0.5;
  }
  return s * 1.0667;
}
/** voronoi: (odległość do najbliższego punktu, id komórki xy, odległość do drugiego punktu) */
vec4 voro(vec2 p) {
  vec2 ip = floor(p), fp = fract(p);
  float d1 = 9.0, d2 = 9.0;
  vec2 id = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = h22(ip + g);
      vec2 r = g + o * 0.86 + 0.07 - fp;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; id = ip + g; }
      else if (d < d2) { d2 = d; }
    }
  }
  return vec4(sqrt(d1), id, sqrt(d2));
}
/** bump-mapping z wysokości w metrach (pochodne ekranowe) */
vec3 bumpPerturb(vec3 surfPos, vec3 surfNorm, float h, float faceDir) {
  vec3 sx = dFdx(surfPos);
  vec3 sy = dFdy(surfPos);
  vec3 r1 = cross(sy, surfNorm);
  vec3 r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDir;
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * surfNorm - grad);
}
`;

export const GLSL_CAUSTIC = /* glsl */ `
float caustic(vec2 uv, float time) {
  vec2 p = mod(uv * 6.28318, 6.28318) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float tt = time * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}
uniform vec3 uAbsorb;
uniform float uCaustic;
/** mnożnik światła na dnie / roślinach pod wodą: pochłanianie (czerwień znika pierwsza) + kaustyki */
vec3 uwLight(vec3 wp, float time, float dist) {
  float d = -wp.y;
  if (d <= 0.0) return vec3(1.0);
  vec3 ab = exp(-uAbsorb * d);
  float cf = uCaustic * smoothstep(3.8, 0.15, d) * smoothstep(0.0, 0.12, d) * (1.0 - smoothstep(14.0, 48.0, dist));
  float cs = 0.0;
  if (cf > 0.01) {
    vec2 q = wp.xz * 0.24 + (vec2(vn2(wp.xz * 0.9 + time * 0.05), vn2(wp.xz * 0.9 + 7.0)) - 0.5) * 0.06;
    cs = caustic(q, time * 0.5);
  }
  return ab * (1.0 + cs * cf * 1.7);
}
`;
