import { useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'

/** Scratch probe: candidate "light in the dark" auras, rendered side by side
 *  against the CURRENT shader so the difference is judged in pixels, not prose.
 *  Not shipped — deleted once a direction is chosen. */

const COMMON = `
precision highp float;
uniform vec2 u_res; uniform float u_time; uniform vec3 u_aura; uniform vec3 u_bg; uniform float u_gain;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);
 float a=hash(i),b=hash(i+vec2(1.,0.)),c=hash(i+vec2(0.,1.)),d=hash(i+vec2(1.,1.));
 vec2 u=f*f*(3.-2.*f);return mix(a,b,u.x)+(c-a)*u.y*(1.-u.x)+(d-b)*u.x*u.y;}
float fbm(vec2 p){float v=0.,a=0.5;for(int i=0;i<5;i++){v+=a*noise(p);p*=2.02;a*=0.5;}return v;}
`

// A — CURRENT shipped aura, for reference.
const CURRENT = `${COMMON}
void main(){
  vec2 uv=gl_FragCoord.xy/u_res; uv.y=1.0-uv.y;
  float aspect=u_res.x/u_res.y; vec2 c=vec2(0.5,0.34);
  vec2 p=(uv-c)*vec2(aspect,1.0); float r=length(p);
  vec3 light=mix(u_aura,vec3(1.0,0.98,0.94),0.60);
  vec3 deep=mix(u_aura,u_bg,0.30);
  float t=u_time*0.05;
  vec2 q=vec2(fbm(p*1.7+t),fbm(p*1.7+vec2(2.7,1.9)-t));
  float flow=fbm(p*1.7+1.3*q); float breath=0.5+0.5*sin(u_time*0.6);
  float field=pow(smoothstep(1.02,0.0,r),1.3);
  float crown=smoothstep(0.60,0.0,r);
  float intensity=(0.60+0.20*breath)*field;
  vec3 col=u_bg;
  vec3 aura=mix(deep,u_aura,clamp(flow*1.2+0.18,0.0,1.0));
  aura=mix(aura,light,clamp(crown*0.9+flow*0.22,0.0,1.0));
  col=mix(col,aura,intensity);
  col+=light*crown*(0.16+0.10*breath);
  col*=smoothstep(1.25,0.10,uv.y)*0.42+0.58;
  col+=(hash(gl_FragCoord.xy+u_time)-0.5)*0.016;
  gl_FragColor=vec4(col,1.0);
}`

// B — tight bloom, hard falloff, true black. Colour reads as emitted light.
const TIGHT = `${COMMON}
void main(){
  vec2 uv=gl_FragCoord.xy/u_res; uv.y=1.0-uv.y;
  float aspect=u_res.x/u_res.y; vec2 c=vec2(0.5,0.26);
  vec2 p=(uv-c)*vec2(aspect,1.0); float r=length(p);
  float t=u_time*0.04;
  vec2 q=vec2(fbm(p*2.1+t),fbm(p*2.1+vec2(2.7,1.9)-t));
  float flow=fbm(p*2.1+1.1*q); float breath=0.5+0.5*sin(u_time*0.5);
  // Tight core + wide but very faint halo, over TRUE black.
  float core=pow(smoothstep(0.52,0.0,r),2.6);
  float halo=pow(smoothstep(1.10,0.0,r),3.4)*0.30;
  vec3 hot=mix(u_aura,vec3(1.0,0.99,0.96),0.42);
  vec3 col=u_bg;
  col+=u_aura*halo*(0.55+0.10*breath)*(0.75+0.5*flow);
  col+=hot*core*(0.72+0.14*breath);
  col*=smoothstep(1.30,0.06,uv.y)*0.72+0.28;   // real darkness at the bottom
  col+=(hash(gl_FragCoord.xy+u_time)-0.5)*0.018;
  gl_FragColor=vec4(col,1.0);
}`

// C — directional spill from the top edge, like light entering a dark room.
const SPILL = `${COMMON}
void main(){
  vec2 uv=gl_FragCoord.xy/u_res; uv.y=1.0-uv.y;
  float aspect=u_res.x/u_res.y; vec2 p=(uv-vec2(0.5,-0.10))*vec2(aspect,1.0);
  float r=length(p);
  float t=u_time*0.035;
  vec2 q=vec2(fbm(p*1.9+t),fbm(p*1.9+vec2(3.1,1.3)-t));
  float flow=fbm(p*1.9+1.2*q); float breath=0.5+0.5*sin(u_time*0.45);
  float spill=pow(smoothstep(0.95,0.0,r),2.2);
  float lip=pow(smoothstep(0.30,0.0,uv.y),2.0);   // bright lip along the top
  vec3 hot=mix(u_aura,vec3(1.0,0.99,0.97),0.50);
  vec3 col=u_bg;
  col+=u_aura*spill*(0.50+0.12*breath)*(0.70+0.55*flow);
  col+=hot*lip*(0.40+0.10*breath);
  col*=smoothstep(1.15,0.02,uv.y)*0.80+0.20;
  col+=(hash(gl_FragCoord.xy+u_time)-0.5)*0.018;
  gl_FragColor=vec4(col,1.0);
}`


// D — C's structure with the source pushed ABOVE the viewport, so the visible
// band is mid-intensity where the header text sits. Peak brightness happens
// off-canvas; we only see the falloff. Protects contrast, keeps the range.
const SPILL_HI = `${COMMON}
void main(){
  vec2 uv=gl_FragCoord.xy/u_res; uv.y=1.0-uv.y;
  float aspect=u_res.x/u_res.y; vec2 p=(uv-vec2(0.5,-0.42))*vec2(aspect,1.0);
  float r=length(p);
  float t=u_time*0.035;
  vec2 q=vec2(fbm(p*1.9+t),fbm(p*1.9+vec2(3.1,1.3)-t));
  float flow=fbm(p*1.9+1.2*q); float breath=0.5+0.5*sin(u_time*0.45);
  float spill=pow(smoothstep(1.25,0.0,r),2.0);
  // Warm hues desaturate toward brown as they darken, so the light needs a
  // bright, near-white core to read as a SOURCE rather than as mud. Chroma is
  // carried by the wide spill; luminance by the core.
  vec3 hot=mix(u_aura,vec3(1.0,0.98,0.95),0.55);
  vec3 col=u_bg;
  col+=u_aura*spill*(0.52+0.10*breath)*(0.72+0.50*flow)*u_gain;
  col+=hot*pow(spill,3.0)*0.62*u_gain;
  col*=smoothstep(1.15,0.0,uv.y)*0.82+0.18;
  col+=(hash(gl_FragCoord.xy+u_time)-0.5)*0.018;
  gl_FragColor=vec4(col,1.0);
}`

// Kept as the labelled index of the four shader candidates this probe compared,
// even though the render below reaches for them individually — it is the only
// place the variant names are written down. Exported so the file typechecks in
// the production build without deleting that record.
export const VARIANTS: Record<string, string> = { 'A · current': CURRENT, 'B · tight bloom': TIGHT, 'C · top spill': SPILL, 'D · spill, source raised': SPILL_HI }

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

function Canvas({ frag, color, gain }: { frag: string; color: string; gain: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current!
    const gl = cv.getContext('webgl')!
    const mk = (t: number, s: string) => { const sh = gl.createShader(t)!; gl.shaderSource(sh, s); gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(sh)); return sh }
    const prog = gl.createProgram()!
    gl.attachShader(prog, mk(gl.VERTEX_SHADER, 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}'))
    gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, frag))
    gl.linkProgram(prog); gl.useProgram(prog)
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const dpr = Math.min(devicePixelRatio, 2)
    cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr
    gl.viewport(0, 0, cv.width, cv.height)
    gl.uniform2f(gl.getUniformLocation(prog, 'u_res'), cv.width, cv.height)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_time'), 6.0)
    gl.uniform3fv(gl.getUniformLocation(prog, 'u_aura'), hexToRgb(color))
    gl.uniform3fv(gl.getUniformLocation(prog, 'u_bg'), hexToRgb('#0A0C0F'))
    gl.uniform1f(gl.getUniformLocation(prog, 'u_gain'), gain)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }, [frag, color, gain])
  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
}

const card = {
  borderRadius: 14, background: 'color-mix(in srgb, #14181D 72%, transparent)',
  backdropFilter: 'blur(14px) saturate(1.2)', border: '1px solid #232A31',
  padding: 12, fontSize: 13, color: '#E8EDF2',
} as const

function Cell({ label, frag, color, gain }: { label: string; frag: string; color: string; gain: number }) {
  return (
    <div style={{ position: 'relative', width: 152, height: 600, overflow: 'hidden', flex: '0 0 auto' }}>
      <Canvas frag={frag} color={color} gain={gain} />
      <div style={{ position: 'relative', padding: 16, fontFamily: 'system-ui' }}>
        <div style={{ fontSize: 10, opacity: 0.55, letterSpacing: 1.5, color: '#E8EDF2' }}>{label.toUpperCase()}</div>
        <div style={{ fontSize: 27, marginTop: 6, color: '#E8EDF2' }}>Guten Morgen</div>
        <div style={{ ...card, marginTop: 16, height: 130 }}>Bereitschaft 78</div>
        <div style={{ ...card, marginTop: 12, height: 160 }}>Einheit des Tages</div>
      </div>
    </div>
  )
}

// Every flagship state through variant D — a hue that works in green can
// still go muddy in amber or coral.
const STATE_COLORS: [string, string, number][] = [
  ['ready', '#16E08A', 1.0], ['controlled', '#FFC53D', 1.45], ['rest', '#FFA340', 1.40],
  ['post', '#FF4D6D', 1.15], ['planned-rest', '#3E9BFF', 1.0], ['pending', '#5A6B85', 1.0],
]
createRoot(document.getElementById('r')!).render(
  <div style={{ display: 'flex', gap: 8, padding: 8 }}>
    {STATE_COLORS.map(([label, color, gain]) => (
      <Cell key={label} label={label} frag={SPILL_HI} color={color} gain={gain} />
    ))}
  </div>,
)
