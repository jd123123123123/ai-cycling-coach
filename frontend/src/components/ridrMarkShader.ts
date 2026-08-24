/* eslint-disable */
/**
 * The Ridr mark, drawing itself.
 *
 * Ported verbatim from the design file's `ridr-mark.glsl` (frame `Anim 210`),
 * with two changes a raw WebGL context needs and the design tool supplied for
 * free: the `precision` qualifier, and `u_freeze` promoted from an editor
 * slider to the reduced-motion switch.
 *
 * WHY A SHADER AND NOT AN SVG STROKE-DASH. The reveal runs along the path's
 * ARC LENGTH, and the mark crosses itself where the stem meets the bowl
 * baseline: a dash offset would draw those pixels twice and bite a notch out of
 * the stem. `consider()` resolves it by taking the EARLIEST arc-length that
 * covers a pixel rather than the nearest — which is a decision about the whole
 * field at once, not about one path, and that is what a fragment shader is.
 */
export const RIDR_MARK_FRAG = `precision highp float;
/** @resolution */
uniform vec2 u_resolution;

/** @time */
uniform float u_time;

/**
 * @label Tile
 * @color
 * @default #C6F53C
 */
uniform vec3 u_bg;

/**
 * @label Ink
 * @color
 * @default #0A0A0C
 */
uniform vec3 u_ink;

/**
 * @label Ping
 * @color
 * @default #0A0A0C
 */
uniform vec3 u_ping;

/**
 * @label Stroke
 * @range 6, 30
 * @default 15
 */
uniform float u_stroke;

/**
 * @label Zoom
 * @range 0.4, 1.2
 * @default 0.72
 */
uniform float u_zoom;

/**
 * @label Loop Seconds
 * @range 2, 10
 * @default 4.2
 */
uniform float u_loop;

/**
 * @label Freeze At
 * @range 0, 1
 * @default 0
 */
uniform float u_freeze;

const float PI = 3.14159265;
const float T1 = 136.0;
const float T2 = 186.0;
const float T3 = 299.1;
const float T4 = 349.1;
const float T5 = 395.1;
const float TOTAL = 475.1;

vec2 bez(float s) {
  vec2 p0 = vec2(100.0, 112.0);
  vec2 p1 = vec2(132.0, 128.0);
  vec2 p2 = vec2(138.0, 152.0);
  vec2 p3 = vec2(172.0, 140.0);
  float u = 1.0 - s;
  return u * u * u * p0 + 3.0 * u * u * s * p1 + 3.0 * u * s * s * p2 + s * s * s * p3;
}

float segD(vec2 p, vec2 a, vec2 b, out float h) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

// bd = nearest distance to the whole path.
// bt = the EARLIEST arc-length that covers this pixel. Taking the earliest rather
// than the nearest matters where the stem crosses the bowl baseline: those pixels
// are nearest to a late segment, so a nearest-based reveal bites a notch out of
// the stem while the bowl is still being drawn.
void consider(inout float bd, inout float bt, float d, float t) {
  bd = min(bd, d);
  if (d < u_stroke + 2.0) bt = min(bt, t);
}

vec2 pathPoint(float t) {
  if (t < T1) return mix(vec2(54.0, 176.0), vec2(54.0, 40.0), t / T1);
  if (t < T2) return mix(vec2(54.0, 40.0), vec2(104.0, 40.0), (t - T1) / 50.0);
  if (t < T3) {
    float a = -PI * 0.5 + (t - T2) / 113.1 * PI;
    return vec2(104.0, 76.0) + 36.0 * vec2(cos(a), sin(a));
  }
  if (t < T4) return mix(vec2(104.0, 112.0), vec2(54.0, 112.0), (t - T3) / 50.0);
  if (t < T5) return mix(vec2(54.0, 112.0), vec2(100.0, 112.0), (t - T4) / 46.0);
  return bez(clamp((t - T5) / 80.0, 0.0, 1.0));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 p = vec2(uv.x, 1.0 - uv.y) * 200.0;
  p = (p - 100.0) / u_zoom + 100.0;
  p += vec2(13.0, 8.0);

  float bd = 1e6;
  float bt = 1e6;
  float h = 0.0;
  float d = 0.0;

  d = segD(p, vec2(54.0, 176.0), vec2(54.0, 40.0), h);
  consider(bd, bt, d, h * T1);

  d = segD(p, vec2(54.0, 40.0), vec2(104.0, 40.0), h);
  consider(bd, bt, d, T1 + h * 50.0);

  vec2 c = vec2(104.0, 76.0);
  vec2 q = p - c;
  float ca = clamp(atan(q.y, q.x), -PI * 0.5, PI * 0.5);
  vec2 nr = c + 36.0 * vec2(cos(ca), sin(ca));
  d = length(p - nr);
  consider(bd, bt, d, T2 + (ca + PI * 0.5) / PI * 113.1);

  d = segD(p, vec2(104.0, 112.0), vec2(54.0, 112.0), h);
  consider(bd, bt, d, T3 + h * 50.0);

  for (int i = 0; i < 10; i++) {
    float s0 = float(i) / 10.0;
    float s1 = float(i + 1) / 10.0;
    d = segD(p, bez(s0), bez(s1), h);
    consider(bd, bt, d, T5 + (s0 + (s1 - s0) * h) * 80.0);
  }

  float px = 200.0 / (u_resolution.x * u_zoom) * 1.4;

  float T = mod(u_time, u_loop);
  if (u_freeze > 0.0) T = u_freeze * u_loop;
  float e = clamp(T / (u_loop * 0.62), 0.0, 1.0);
  e = e * e * (3.0 - 2.0 * e);
  // Overshoot past TOTAL so the final end cap resolves fully opaque instead of
  // sitting on the midpoint of the reveal smoothstep.
  float prog = e * (TOTAL + 10.0);

  float shape = 1.0 - smoothstep(u_stroke - px, u_stroke + px, bd);
  float reveal = 1.0 - smoothstep(prog - 1.0, prog + 1.0, bt);
  float a = shape * reveal;

  vec2 dp = pathPoint(prog);
  float dotR = u_stroke * 1.5;
  float fade = 1.0 - smoothstep(u_loop * 0.55, u_loop * 0.63, T);
  float dotA = (1.0 - smoothstep(dotR - px, dotR + px, length(p - dp))) * fade;

  vec3 col = u_bg;
  col = mix(col, u_ink, a);
  col = mix(col, u_ping, dotA);
  gl_FragColor = vec4(col, 1.0);
}
`
