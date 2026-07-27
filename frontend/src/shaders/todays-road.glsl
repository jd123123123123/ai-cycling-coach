// todays-road.glsl — the Today tab's landscape.
//
// The terrain IS the day's prescribed session and ground level IS Critical
// Power: above the waterline the athlete spends W′ (a climb), below it the
// reserve reconstitutes (a descent). That is the Skiba differential model
// rendered as gravity — see
// docs/superpowers/specs/2026-07-27-todays-road-design.md.
//
// The shader performs NO physiology. It draws what the data texture says;
// roadProfile.ts owns every physiological decision.
//
// Data texture (width×1, RGBA), packed by packRoadTexture():
//   R = watts / CP over 0..2  (0.5 = the CP waterline)
//   G = zone / 7
//   B = W′bal / W′
//   A = blockIndex / 255
//
// u_mode: 0 prescribed · 1 ridden · 2 flat-calm · 3 flat-done · 4 flat-unlit
//         · 5 bare  (see roadMode.ts — the indices must stay in sync)
//
// NOTE: the app compiles shaders from inline strings, so the runtime copy
// lives in ShaderCanvas.tsx as the `road` variant. That port is IDENTICAL
// except it uses the shared u_res / hash / fbm helpers from COMMON.

/** @resolution */
uniform vec2 u_resolution;
/** @time */
uniform float u_time;
/** @label Base @color @default #0A0C0F */
uniform vec3 u_bg;
/** @label Aura @color @default #16E08A */
uniform vec3 u_aura;

uniform sampler2D u_data;
uniform float u_travel;     // scrub position, 0..1
uniform float u_mode;       // roadModeIndex()
uniform float u_hasRoad;    // 0 = draw no terrain at all
uniform float u_waterline;  // 0 = CP unknown → never draw the waterline

const float HORIZON = 0.42;  // screen y of the CP waterline
const float RELIEF  = 0.30;  // vertical scale of one full CP of relief

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

/** Terrain surface height (screen y) at horizontal position x. */
float surfaceAt(float x, out float zone, out float bal){
  vec4 s = texture2D(u_data, vec2(clamp(x, 0.0, 1.0), 0.5));
  zone = s.g;
  bal  = s.b;
  // Flat modes ignore the profile entirely — a calm valley at the waterline.
  float isFlat = step(1.5, u_mode);
  float h = mix(s.r, 0.5, isFlat);
  return HORIZON + (h - 0.5) * RELIEF * 2.0;
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;

  float zone = 0.0, bal = 1.0;
  float surf = surfaceAt(uv.x, zone, bal);

  // ── Sky: the existing readiness aura, blooming from behind the ring ──────
  vec3 light = mix(u_aura, vec3(1.0, 0.98, 0.94), 0.60);
  vec3 deep  = mix(u_aura, u_bg, 0.30);
  vec2 c = vec2(0.5, 0.72);
  vec2 p = (uv - c) * vec2(u_resolution.x / u_resolution.y, 1.0);
  float r = length(p);
  float t = u_time * 0.05;
  vec2 q = vec2(fbm(p * 1.7 + t), fbm(p * 1.7 + vec2(2.7, 1.9) - t));
  float flow = fbm(p * 1.7 + 1.3 * q);
  float breath = 0.5 + 0.5 * sin(u_time * 0.6);
  float field = pow(smoothstep(1.02, 0.0, r), 1.3);
  float crown = smoothstep(0.60, 0.0, r);

  vec3 sky = u_bg;
  vec3 aura = mix(deep, u_aura, clamp(flow * 1.2 + 0.18, 0.0, 1.0));
  aura = mix(aura, light, clamp(crown * 0.9 + flow * 0.22, 0.0, 1.0));
  sky = mix(sky, aura, (0.60 + 0.20 * breath) * field);
  sky += light * crown * (0.16 + 0.10 * breath);

  vec3 col = sky;

  if (u_hasRoad > 0.5) {
    // ── Ground ────────────────────────────────────────────────────────────
    float ground = smoothstep(surf + 0.004, surf - 0.004, uv.y);
    float depth = clamp((surf - uv.y) * 3.0, 0.0, 1.0);

    // Zone tint: cool at endurance, hot at threshold and above.
    vec3 cool = mix(u_bg, u_aura, 0.35);
    vec3 hot  = mix(u_aura, vec3(1.0, 0.42, 0.24), 0.55);
    vec3 land = mix(cool, hot, smoothstep(0.35, 0.75, zone));
    // W′ remaining dims the road: an emptying tank literally darkens the way.
    land *= mix(0.42, 1.0, bal);
    land *= mix(1.0, 0.55, depth);            // falls into shadow with depth
    land += 0.05 * fbm(vec2(uv.x * 34.0, uv.y * 12.0)); // road grain

    // Unlit rest day: the road is there, you are just not riding it.
    land = mix(land, mix(u_bg, land, 0.30), step(3.5, u_mode) * step(u_mode, 4.5));

    // Ridge highlight where the surface meets the sky. Flat modes have no
    // silhouette to highlight — and every flat mode sits surf == HORIZON, so
    // leaving this on would paint a false waterline where u_waterline says
    // there must be none. Only lit for prescribed/ridden, where there is a
    // real ridge.
    float ridge = smoothstep(0.010, 0.0, abs(uv.y - surf)) * step(u_mode, 1.5);
    land += light * ridge * 0.55;

    col = mix(col, land, ground);

    // ── The CP waterline ──────────────────────────────────────────────────
    // Only ever drawn when CP is actually known.
    float wl = smoothstep(0.0018, 0.0, abs(uv.y - HORIZON));
    col += vec3(1.0) * wl * 0.30 * u_waterline;

    // ── The rider ─────────────────────────────────────────────────────────
    float sTravel;
    float zTravel, bTravel;
    sTravel = surfaceAt(u_travel, zTravel, bTravel);
    vec2 rider = vec2(u_travel, sTravel + 0.012);
    float dr = length((uv - rider) * vec2(u_resolution.x / u_resolution.y, 1.0));
    col += light * pow(smoothstep(0.10, 0.0, dr), 2.0) * (0.55 + 0.25 * breath);
    col += vec3(1.0) * smoothstep(0.011, 0.0, dr);
  }

  // Settle toward the app chrome at the very bottom so cards keep contrast.
  col *= smoothstep(-0.15, 0.30, uv.y) * 0.34 + 0.66;
  col += (hash(gl_FragCoord.xy + u_time) - 0.5) * 0.016;
  gl_FragColor = vec4(col, 1.0);
}
