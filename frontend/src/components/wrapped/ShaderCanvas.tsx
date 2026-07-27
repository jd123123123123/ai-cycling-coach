/**
 * ShaderCanvas — a reusable animated WebGL fragment-shader background for the
 * Weekly Wrapped story cards. Raw WebGL 1.0 on a single fullscreen quad (no
 * three.js / no dependency — these are 2D fullscreen effects, so a 3D scene
 * graph would be pure bundle bloat).
 *
 * Three variants match the pen's SHADER fills 1:1:
 *   · iri   — flowing iridescent gradient (domain-warped fbm blending u_a/b/c)
 *   · topo  — dark base with glowing animated topographic contour lines
 *   · burst — radial power burst from centre with rotating accent rays
 *
 * Honesty/perf contract:
 *   · prefers-reduced-motion → the time uniform freezes at a pleasant phase
 *     (a static gradient, no motion), per WCAG 2.3.3.
 *   · An IntersectionObserver pauses the RAF loop whenever the canvas is
 *     offscreen, and a devicePixelRatio cap keeps it at 60fps on mobile.
 */
import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from '../../utils/motion'
import type { RoadProfile } from '../../utils/roadProfile'

export type ShaderVariant = 'iri' | 'topo' | 'burst' | 'aura' | 'road'

export interface ShaderUniforms {
  [name: string]: string | number
}

/** Packed RGBA bytes for a width×1 data texture (GL texture unit 0). */
export interface ShaderTexture { data: Uint8Array; width: number }

/** Height scale: R encodes watts/CP across 0..2, so CP lands mid-scale. */
const HEIGHT_RANGE = 2

/**
 * Pack a road profile into a width×1 RGBA texture:
 *   R = watts / CP over 0..2   (1.0 → 128 = the CP waterline)
 *   G = zone / 7               (terrain tint)
 *   B = W′bal / W′             (255 when CP/W′ unknown — a full tank is the
 *                               honest neutral; the shader hides the battery
 *                               entirely in that case via u_waterline = 0)
 *   A = blockIndex / 255       (scrub → block mapping)
 * With no CP, height falls back to watts against the session's own peak so the
 * terrain still shows relative effort — but never against an invented CP.
 */
// (Pure data helper colocated with the component per the ShaderCanvas
// texture-transport contract; it has no component state to lose on a
// fast-refresh remount.)
// eslint-disable-next-line react-refresh/only-export-components
export function packRoadTexture(profile: RoadProfile): ShaderTexture {
  const n = profile.samples.length
  if (n === 0) return { data: new Uint8Array([128, 0, 255, 0]), width: 1 }

  const peak = Math.max(...profile.samples.map((s) => s.watts), 1)
  const ref = profile.cp ?? peak
  const wPrime = profile.wPrime
  const data = new Uint8Array(n * 4)

  profile.samples.forEach((s, i) => {
    const h = Math.max(0, Math.min(s.watts / ref, HEIGHT_RANGE)) / HEIGHT_RANGE
    const bal = s.wbal != null && wPrime != null ? Math.max(0, Math.min(1, s.wbal / wPrime)) : 1
    data[i * 4 + 0] = Math.round(h * 255)
    data[i * 4 + 1] = Math.round((Math.min(s.zone, 7) / 7) * 255)
    data[i * 4 + 2] = Math.round(bal * 255)
    data[i * 4 + 3] = Math.min(255, s.blockIndex)
  })
  return { data, width: n }
}

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`

// Shared noise/fbm helpers prepended to every fragment shader.
const COMMON = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
vec3 hex(float r,float g,float b){return vec3(r,g,b);}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
  vec2 i=floor(p);vec2 f=fract(p);
  float a=hash(i),b=hash(i+vec2(1.,0.)),c=hash(i+vec2(0.,1.)),d=hash(i+vec2(1.,1.));
  vec2 u=f*f*(3.-2.*f);
  return mix(a,b,u.x)+(c-a)*u.y*(1.-u.x)+(d-b)*u.x*u.y;
}
float fbm(vec2 p){
  float v=0.,a=0.5;
  for(int i=0;i<5;i++){v+=a*noise(p);p*=2.02;a*=0.5;}
  return v;
}
`

// Aura: the flagship "Morning Readiness" backdrop — a warm, joyful *sunrise
// bloom* of the state colour blooming from behind the readiness ring.
// INTENTIONALLY departs from the pen's dim, sonar-ring aura (product call:
// the old one read subtle + weird, not happy): two companion tones are
// derived in-shader from the single u_aura so the light is multi-tonal and
// vivid instead of a flat dim tint; motion is a gentle domain-warped fbm
// flow + slow breath (no technical pulse rings); it lifts bright up top and
// settles into the app-dark (u_bg) toward the bottom so content keeps
// contrast. One colour in (u_aura) still re-tints the whole screen per state.
const FRAG_AURA = `${COMMON}
uniform vec3 u_aura; uniform vec3 u_bg;
void main(){
  vec2 uv=gl_FragCoord.xy/u_res;
  uv.y=1.0-uv.y;
  float aspect=u_res.x/u_res.y;
  vec2 c=vec2(0.5,0.34);
  vec2 p=(uv-c)*vec2(aspect,1.0);
  float r=length(p);

  // Sunlit companion tones from the state colour → a happy, multi-tonal bloom.
  vec3 light=mix(u_aura,vec3(1.0,0.98,0.94),0.60); // airy highlight
  vec3 deep=mix(u_aura,u_bg,0.30);                 // rich shoulder

  // Living light: gentle domain-warped flow + a slow breath (no sonar rings).
  float t=u_time*0.05;
  vec2 q=vec2(fbm(p*1.7+t),fbm(p*1.7+vec2(2.7,1.9)-t));
  float flow=fbm(p*1.7+1.3*q);
  float breath=0.5+0.5*sin(u_time*0.6);

  // Soft radial bloom: a wide field + a brighter crown right behind the ring.
  float field=pow(smoothstep(1.02,0.0,r),1.3);
  float crown=smoothstep(0.60,0.0,r);
  float intensity=(0.60+0.20*breath)*field;

  vec3 col=u_bg;
  vec3 aura=mix(deep,u_aura,clamp(flow*1.2+0.18,0.0,1.0));
  aura=mix(aura,light,clamp(crown*0.9+flow*0.22,0.0,1.0));
  col=mix(col,aura,intensity);
  col+=light*crown*(0.16+0.10*breath);            // luminous halo behind the ring

  // Settle into the app chrome toward the bottom so cards/text keep contrast.
  col*=smoothstep(1.25,0.10,uv.y)*0.42+0.58;

  // Fine dithering against banding on the smooth gradient.
  col+=(hash(gl_FragCoord.xy+u_time)-0.5)*0.016;
  gl_FragColor=vec4(col,1.0);
}
`

// Road: the Today tab's landscape. Ground level IS Critical Power — above
// the waterline the athlete spends W′ (a climb), below it the reserve
// reconstitutes (a descent). The Skiba differential model rendered as
// gravity. The shader performs NO physiology; it draws exactly what the
// data texture says (packed by packRoadTexture() above) and roadProfile.ts
// owns every physiological decision. u_mode indices come from
// roadModeIndex() in roadMode.ts and must stay in sync: 0 prescribed ·
// 1 ridden · 2 flat-calm · 3 flat-done · 4 flat-unlit · 5 bare. u_waterline
// is 0 whenever CP is unknown, and the shader then draws no waterline at
// all — the project's honest-data rule.
//
// NOTE: this is a port of src/shaders/todays-road.glsl (the design-
// provenance source, kept in sync by hand). It is IDENTICAL except it
// drops the `/** @... */` annotations, drops the u_resolution/u_time
// uniform declarations and the local hash/noise/fbm helpers (all supplied
// by the shared COMMON prelude above), and renames u_resolution → u_res.
const FRAG_ROAD = `${COMMON}
uniform vec3 u_aura; uniform vec3 u_bg;
uniform sampler2D u_data;
uniform float u_dataW;
uniform float u_travel;
uniform float u_mode;
uniform float u_hasRoad;
uniform float u_waterline;
const float HORIZON = 0.42;
const float RELIEF  = 0.30;
float surfaceAt(float x, out float zone, out float bal){
  vec4 s = texture2D(u_data, vec2(clamp(x, 0.0, 1.0), 0.5));
  zone = s.g; bal = s.b;
  float flat = step(1.5, u_mode);
  float h = mix(s.r, 0.5, flat);
  return HORIZON + (h - 0.5) * RELIEF * 2.0;
}
void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  float zone = 0.0, bal = 1.0;
  float surf = surfaceAt(uv.x, zone, bal);
  vec3 light = mix(u_aura, vec3(1.0, 0.98, 0.94), 0.60);
  vec3 deep  = mix(u_aura, u_bg, 0.30);
  vec2 c = vec2(0.5, 0.72);
  vec2 p = (uv - c) * vec2(u_res.x / u_res.y, 1.0);
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
    float ground = smoothstep(surf + 0.004, surf - 0.004, uv.y);
    float depth = clamp((surf - uv.y) * 3.0, 0.0, 1.0);
    vec3 cool = mix(u_bg, u_aura, 0.35);
    vec3 hot  = mix(u_aura, vec3(1.0, 0.42, 0.24), 0.55);
    vec3 land = mix(cool, hot, smoothstep(0.35, 0.75, zone));
    land *= mix(0.42, 1.0, bal);
    land *= mix(1.0, 0.55, depth);
    land += 0.05 * fbm(vec2(uv.x * 34.0, uv.y * 12.0));
    land = mix(land, mix(u_bg, land, 0.30), step(3.5, u_mode) * step(u_mode, 4.5));
    float ridge = smoothstep(0.010, 0.0, abs(uv.y - surf));
    land += light * ridge * 0.55;
    col = mix(col, land, ground);
    float wl = smoothstep(0.0018, 0.0, abs(uv.y - HORIZON));
    col += vec3(1.0) * wl * 0.30 * u_waterline;
    float zTravel, bTravel;
    float sTravel = surfaceAt(u_travel, zTravel, bTravel);
    vec2 rider = vec2(u_travel, sTravel + 0.012);
    float dr = length((uv - rider) * vec2(u_res.x / u_res.y, 1.0));
    col += light * pow(smoothstep(0.10, 0.0, dr), 2.0) * (0.55 + 0.25 * breath);
    col += vec3(1.0) * smoothstep(0.011, 0.0, dr);
  }
  col *= smoothstep(-0.15, 0.30, uv.y) * 0.34 + 0.66;
  col += (hash(gl_FragCoord.xy + u_time) - 0.5) * 0.016;
  gl_FragColor = vec4(col, 1.0);
}
`

const FRAG: Record<ShaderVariant, string> = {
  // Iridescent: two-level domain warp, then blend three brand colours by the
  // warped field. Soft vignette + subtle grain keeps it from banding.
  iri: `${COMMON}
uniform vec3 u_a; uniform vec3 u_b; uniform vec3 u_c;
void main(){
  vec2 uv=gl_FragCoord.xy/u_res;
  vec2 p=uv*2.4;
  float t=u_time*0.12;
  vec2 q=vec2(fbm(p+t), fbm(p+vec2(5.2,1.3)-t));
  vec2 r=vec2(fbm(p+1.8*q+vec2(1.7,9.2)+t*0.7), fbm(p+1.8*q+vec2(8.3,2.8)-t*0.5));
  float f=fbm(p+2.4*r);
  vec3 col=mix(u_a,u_b,clamp(f*1.6,0.,1.));
  col=mix(col,u_c,clamp(length(r)*0.9,0.,1.));
  col=mix(col,u_a,clamp((q.x-0.4)*0.9,0.,1.));
  col+=0.05*vec3(sin(uv.y*8.0+u_time*0.55), sin(uv.x*8.0+u_time*0.4), sin((uv.x+uv.y)*6.0-u_time*0.48));
  float vig=smoothstep(1.25,0.25,length(uv-0.5));
  col*=0.82+0.18*vig;
  col+=(hash(uv*u_res)-0.5)*0.02;
  gl_FragColor=vec4(col,1.0);
}
`,
  // Topographic: fbm height field, glowing contour bands via fract() of the
  // field, over a dark base that lifts toward the bottom.
  topo: `${COMMON}
uniform vec3 u_base; uniform vec3 u_glow; uniform vec3 u_line;
void main(){
  vec2 uv=gl_FragCoord.xy/u_res;
  vec2 p=uv*vec2(3.0,3.4);
  float t=u_time*0.085;
  float h=fbm(p+vec2(t,t*0.6));
  h+=0.5*fbm(p*2.0-vec2(t*0.8,0.0));
  float bands=fract(h*6.0);
  float line=smoothstep(0.42,0.5,bands)*smoothstep(0.58,0.5,bands);
  float glow=pow(1.0-abs(bands-0.5)*2.0,3.0);
  vec3 col=u_base;
  col+=u_glow*glow*0.35*(0.4+0.6*uv.y);
  col+=u_line*line*1.1;
  col+=u_glow*0.10*smoothstep(0.0,1.0,uv.y);
  float vig=smoothstep(1.3,0.35,length(uv-0.5));
  col*=0.7+0.3*vig;
  gl_FragColor=vec4(col,1.0);
}
`,
  // Radial burst: bright core over base, animated accent rays, soft bloom.
  burst: `${COMMON}
uniform vec3 u_accent; uniform vec3 u_base; uniform vec3 u_core; uniform vec3 u_glow;
void main(){
  vec2 uv=gl_FragCoord.xy/u_res;
  vec2 c=uv-0.5; c.x*=u_res.x/u_res.y;
  float d=length(c);
  float ang=atan(c.y,c.x);
  float rays=0.5+0.5*sin(ang*22.0+u_time*0.5+fbm(vec2(ang*3.0,u_time*0.1))*4.0);
  rays*=smoothstep(0.65,0.05,d);
  float core=pow(smoothstep(0.6,0.0,d),2.2);
  float bloom=pow(smoothstep(1.0,0.0,d),1.4);
  vec3 col=u_base;
  col=mix(col,u_glow,bloom*0.55);
  col+=u_accent*rays*0.5;
  col=mix(col,u_core,core);
  col+=u_glow*core*0.4;
  col+=(hash(uv*u_res)-0.5)*0.02;
  gl_FragColor=vec4(col,1.0);
}
`,
  aura: FRAG_AURA,
  road: FRAG_ROAD,
}

// Which colour uniforms each variant consumes, in declaration order.
const COLOR_UNIFORMS: Record<ShaderVariant, string[]> = {
  iri: ['u_a', 'u_b', 'u_c'],
  topo: ['u_base', 'u_glow', 'u_line'],
  burst: ['u_accent', 'u_base', 'u_core', 'u_glow'],
  aura: ['u_aura', 'u_bg'],
  road: ['u_aura', 'u_bg'],
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = h.length === 3
    ? h.split('').map((c) => c + c).join('')
    : h.slice(0, 6)
  const int = parseInt(n, 16)
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255]
}

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type)
  if (!s) return null
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    gl.deleteShader(s)
    return null
  }
  return s
}

interface Props {
  variant: ShaderVariant
  uniforms: ShaderUniforms
  /** Optional width×1 RGBA data texture, bound to unit 0 as `u_data`. */
  texture?: ShaderTexture | null
  className?: string
  style?: React.CSSProperties
}

export default function ShaderCanvas({ variant, uniforms, texture, className, style }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Keep the latest colours without re-initialising the GL program.
  const uniformsRef = useRef(uniforms)
  uniformsRef.current = uniforms
  const textureRef = useRef(texture)
  textureRef.current = texture

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false })
    if (!gl) return

    const vs = compile(gl, gl.VERTEX_SHADER, VERT)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG[variant])
    if (!vs || !fs) return
    const prog = gl.createProgram()
    if (!prog) return
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'a_pos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const uRes = gl.getUniformLocation(prog, 'u_res')
    const uTime = gl.getUniformLocation(prog, 'u_time')
    const colorLocs = COLOR_UNIFORMS[variant].map((n) => gl.getUniformLocation(prog, n))

    // Every non-colour numeric uniform is uploaded as a float by name.
    const scalarLocs = new Map<string, WebGLUniformLocation | null>()
    const scalarNames = Object.keys(uniformsRef.current).filter(
      (n) => !COLOR_UNIFORMS[variant].includes(n) && typeof uniformsRef.current[n] === 'number',
    )
    scalarNames.forEach((n) => scalarLocs.set(n, gl.getUniformLocation(prog, n)))

    const uData = gl.getUniformLocation(prog, 'u_data')
    const uDataW = gl.getUniformLocation(prog, 'u_dataW')
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    let uploadedWidth = -1

    const reduce = prefersReducedMotion()
    // The terrain pass is heavier per-fragment than the gradient variants, so
    // it renders at a lower DPR cap to hold 60 fps on a phone.
    const dpr = Math.min(window.devicePixelRatio || 1, variant === 'road' ? 1.5 : 2)

    const resize = () => {
      const w = Math.max(1, Math.floor(canvas.clientWidth * dpr))
      const h = Math.max(1, Math.floor(canvas.clientHeight * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      gl.viewport(0, 0, canvas.width, canvas.height)
    }

    let raf = 0
    let visible = true
    const start = performance.now()
    // A pleasant frozen phase for reduced-motion / paused states.
    const FROZEN = 6.0

    const render = (now: number) => {
      resize()
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform1f(uTime, reduce ? FROZEN : (now - start) / 1000)
      COLOR_UNIFORMS[variant].forEach((n, i) => {
        const v = uniformsRef.current[n]
        if (typeof v === 'string') gl.uniform3fv(colorLocs[i], hexToRgb(v))
      })
      scalarNames.forEach((n) => {
        const v = uniformsRef.current[n]
        const loc = scalarLocs.get(n)
        if (typeof v === 'number' && loc) gl.uniform1f(loc, v)
      })
      const t = textureRef.current
      if (t && uData) {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, tex)
        // CONTRACT: this guard keys on t.width ONLY — it re-uploads when the
        // sample COUNT changes, not when sample CONTENT changes. A new
        // RoadProfile that resamples to the same width (e.g. both hit
        // MAX_SAMPLES, or an edited plan keeps the same block count) will
        // NOT trigger a re-upload here, and the GPU will keep rendering the
        // previous profile's texture. Callers MUST force a fresh upload by
        // remounting ShaderCanvas with a React `key` derived from the
        // profile's identity (not just its width) whenever the profile
        // changes.
        if (uploadedWidth !== t.width) {
          gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, t.width, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, t.data)
          uploadedWidth = t.width
        }
        gl.uniform1i(uData, 0)
        if (uDataW) gl.uniform1f(uDataW, t.width)
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    const loop = (now: number) => {
      render(now)
      if (!reduce && visible) raf = requestAnimationFrame(loop)
    }

    // Draw at least one static frame immediately.
    render(start)
    canvas.dataset.scReady = '1'
    // Under reduced-motion we still redraw on size changes so the first
    // (pre-layout) frame can't leave us with a stale/blank buffer.
    const ro = new ResizeObserver(() => render(performance.now()))
    ro.observe(canvas)
    if (!reduce) raf = requestAnimationFrame(loop)

    const io = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? true
      if (visible && !reduce && !raf) raf = requestAnimationFrame(loop)
      if (!visible && raf) { cancelAnimationFrame(raf); raf = 0 }
    }, { threshold: 0.01 })
    io.observe(canvas)

    return () => {
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      gl.deleteProgram(prog)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      gl.deleteBuffer(buf)
      gl.deleteTexture(tex)
    }
  }, [variant])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
      style={{ display: 'block', width: '100%', height: '100%', ...style }}
    />
  )
}
