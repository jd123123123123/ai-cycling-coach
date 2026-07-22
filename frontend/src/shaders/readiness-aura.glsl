// readiness-aura.glsl — the flagship "Morning Readiness Moment" backdrop.
//
// Source of truth for the aura fill referenced by pencil-new.pen's four
// flagship frames (ZnwNp / w3oJHa / ci0e7 / MPMY2). A near-black base
// (u_bg #0A0C0F) with a single state-keyed aura (u_aura) blooming from the
// upper-centre — behind the readiness ring — gently flowing via domain-warped
// fbm. One colour re-tints the whole screen per state (green ready / amber
// rest / coral post-ride / teal planned-rest / muted pending).
//
// NOTE: the app's ShaderCanvas component compiles fragment shaders from inline
// strings (raw WebGL 1.0, no file loader), so the runtime copy of this shader
// lives in ShaderCanvas.tsx as the `aura` variant and is kept in sync with
// this file. This file is the design-provenance mirror of the pen fill.

precision highp float;

/** @resolution */
uniform vec2 u_res;
/** @time */
uniform float u_time;

/**
 * @label Aura
 * @color
 * @default #16E08A
 */
uniform vec3 u_aura;

/**
 * @label Background
 * @color
 * @default #0A0C0F
 */
uniform vec3 u_bg;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++){ v += a * noise(p); p *= 2.02; a *= 0.5; }
  return v;
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 center = vec2(0.5, 0.72);
  vec2 p = uv * 2.1;
  float t = u_time * 0.07;
  vec2 q = vec2(fbm(p + t), fbm(p + vec2(3.1, 1.7) - t * 0.8));
  float flow = fbm(p + 1.7 * q + vec2(2.2, 4.4) + t * 0.5);
  float d = distance(uv, center);
  float bloom = smoothstep(0.95, 0.0, d) * (0.45 + 0.8 * flow);
  float halo = pow(smoothstep(0.55, 0.0, d), 2.4);
  vec3 col = u_bg;
  col = mix(col, u_aura, clamp(bloom * 0.5, 0.0, 1.0));
  col += u_aura * halo * 0.32;
  col += 0.028 * u_aura * sin((uv.x + uv.y) * 7.0 - u_time * 0.5);
  float vig = smoothstep(1.15, 0.15, length(uv - 0.5));
  col *= 0.55 + 0.45 * vig;
  col += (hash(uv * u_res) - 0.5) * 0.015;
  gl_FragColor = vec4(col, 1.0);
}
