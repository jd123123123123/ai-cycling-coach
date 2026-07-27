// readiness-aura.glsl — the flagship "Morning Readiness Moment" backdrop.
//
// A warm, joyful *sunrise bloom* of the state colour behind the readiness ring.
// This INTENTIONALLY departs from the pen's original dim, sonar-ring aura
// (product call, Jul 2026: the old one read subtle + weird, not happy). One
// state-keyed u_aura still re-tints the whole screen: #16E08A ready ·
// #FFB020 controlled · #FF9E3D rest · #FF5A3C post-ride · #3E9BFF planned-rest.
//
// Two companion tones are derived in-shader from the single u_aura so the light
// is multi-tonal and vivid instead of a flat tint; motion is a gentle
// domain-warped fbm flow + slow breath (no pulse rings).
//
// NOTE: the app's ShaderCanvas compiles from inline strings (no file loader),
// so the runtime copy lives in ShaderCanvas.tsx as the `aura` variant. That
// port is IDENTICAL except it flips uv.y (uv.y = 1.0 - uv.y) because the app's
// gl_FragCoord origin differs from the pen renderer's, and uses the shared
// u_res / hash / fbm helpers. This file is the design-provenance source.

/** @resolution */
uniform vec2 u_resolution;
/** @time */
uniform float u_time;
/** @label Base @color @default #0A0C0F */
uniform vec3 u_bg;
/** @label Aura @color @default #16E08A */
uniform vec3 u_aura;

float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
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
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 c = vec2(0.5, 0.34);
  vec2 p = (uv - c) * vec2(aspect, 1.0);
  float r = length(p);

  // Sunlit companion tones from the state colour → a happy, multi-tonal bloom.
  vec3 light = mix(u_aura, vec3(1.0, 0.98, 0.94), 0.60); // airy highlight
  vec3 deep  = mix(u_aura, u_bg, 0.30);                  // rich shoulder

  // Living light: gentle domain-warped flow + a slow breath (no sonar rings).
  float t = u_time * 0.05;
  vec2 q = vec2(fbm(p * 1.7 + t), fbm(p * 1.7 + vec2(2.7, 1.9) - t));
  float flow = fbm(p * 1.7 + 1.3 * q);
  float breath = 0.5 + 0.5 * sin(u_time * 0.6);

  // Soft radial bloom: a wide field + a brighter crown right behind the ring.
  float field = pow(smoothstep(1.02, 0.0, r), 1.3);
  float crown = smoothstep(0.60, 0.0, r);
  float intensity = (0.60 + 0.20 * breath) * field;

  vec3 col = u_bg;
  vec3 aura = mix(deep, u_aura, clamp(flow * 1.2 + 0.18, 0.0, 1.0));
  aura = mix(aura, light, clamp(crown * 0.9 + flow * 0.22, 0.0, 1.0));
  col = mix(col, aura, intensity);
  col += light * crown * (0.16 + 0.10 * breath); // luminous halo behind the ring

  // Settle into the app chrome toward the bottom for content legibility.
  col *= smoothstep(1.25, 0.10, uv.y) * 0.42 + 0.58;

  // Fine dithering against banding on the smooth gradient.
  col += (hash(gl_FragCoord.xy + u_time) - 0.5) * 0.016;

  gl_FragColor = vec4(col, 1.0);
}
