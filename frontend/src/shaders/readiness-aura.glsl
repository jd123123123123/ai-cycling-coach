// readiness-aura.glsl — the flagship "Morning Readiness Moment" backdrop.
//
// EXACT mirror of the pen's shader (sibling of pencil-new.pen). The pen's four
// flagship frames (ZnwNp/w3oJHa/ci0e7/MPMY2) fill with this, one state-keyed
// u_aura re-tinting the whole screen: recovery/green ready · #FF9E3D rest ·
// #FF5A3C post-ride · #3E9BFF planned-rest.
//
// NOTE: the app's ShaderCanvas compiles from inline strings (no file loader),
// so the runtime copy lives in ShaderCanvas.tsx as the `aura` variant. That
// port is IDENTICAL except it flips uv.y (uv.y = 1.0 - uv.y) because the app's
// gl_FragCoord origin differs from the pen renderer's, and uses the shared
// u_res / hash. This file is the design-provenance source.

/** @resolution */
uniform vec2 u_resolution;
/** @time */
uniform float u_time;
/** @label Base @color @default #0A0C0F */
uniform vec3 u_bg;
/** @label Aura @color @default #16E08A */
uniform vec3 u_aura;

float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

void main(){
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 c = vec2(0.5, 0.34);
  vec2 p = (uv - c) * vec2(aspect, 1.0);
  float r = length(p);

  vec3 col = u_bg;

  // breathing core glow behind the ring
  float breath = 0.5 + 0.5 * sin(u_time * 1.15);
  float glow = smoothstep(0.72, 0.0, r) * (0.34 + 0.24 * breath);
  col += u_aura * glow;

  // slow pulse rings emanating outward (a living aura)
  float wave = sin(r * 13.0 - u_time * 2.0);
  float rings = smoothstep(0.55, 1.0, wave) * smoothstep(0.95, 0.18, r) * 0.05;
  col += u_aura * rings;

  // gentle bottom darkening for content legibility
  col *= smoothstep(1.25, 0.15, uv.y) * 0.45 + 0.62;

  // fine grain
  col += (hash(gl_FragCoord.xy + u_time) - 0.5) * 0.028;

  gl_FragColor = vec4(col, 1.0);
}
