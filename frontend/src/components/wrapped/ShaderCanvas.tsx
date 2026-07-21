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

export type ShaderVariant = 'iri' | 'topo' | 'burst'

export interface ShaderUniforms {
  [name: string]: string | number
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

const FRAG: Record<ShaderVariant, string> = {
  // Iridescent: two-level domain warp, then blend three brand colours by the
  // warped field. Soft vignette + subtle grain keeps it from banding.
  iri: `${COMMON}
uniform vec3 u_a; uniform vec3 u_b; uniform vec3 u_c;
void main(){
  vec2 uv=gl_FragCoord.xy/u_res;
  vec2 p=uv*2.4;
  float t=u_time*0.06;
  vec2 q=vec2(fbm(p+t), fbm(p+vec2(5.2,1.3)-t));
  vec2 r=vec2(fbm(p+1.8*q+vec2(1.7,9.2)+t*0.7), fbm(p+1.8*q+vec2(8.3,2.8)-t*0.5));
  float f=fbm(p+2.4*r);
  vec3 col=mix(u_a,u_b,clamp(f*1.6,0.,1.));
  col=mix(col,u_c,clamp(length(r)*0.9,0.,1.));
  col=mix(col,u_a,clamp((q.x-0.4)*0.9,0.,1.));
  col+=0.05*vec3(sin(uv.y*8.0+u_time*0.3), sin(uv.x*8.0+u_time*0.2), sin((uv.x+uv.y)*6.0-u_time*0.25));
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
  float t=u_time*0.04;
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
}

// Which colour uniforms each variant consumes, in declaration order.
const COLOR_UNIFORMS: Record<ShaderVariant, string[]> = {
  iri: ['u_a', 'u_b', 'u_c'],
  topo: ['u_base', 'u_glow', 'u_line'],
  burst: ['u_accent', 'u_base', 'u_core', 'u_glow'],
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
  className?: string
  style?: React.CSSProperties
}

export default function ShaderCanvas({ variant, uniforms, className, style }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Keep the latest colours without re-initialising the GL program.
  const uniformsRef = useRef(uniforms)
  uniformsRef.current = uniforms

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

    const reduce = prefersReducedMotion()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

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
