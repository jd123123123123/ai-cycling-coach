import { useEffect, useRef, useState } from 'react'
import { RIDR_MARK_FRAG } from './ridrMarkShader'
import RidrMark, { RIDR_LIME } from './RidrMark'

/**
 * The launch mark: the Ridr R drawing itself on its lime tile.
 *
 * IT DEGRADES TO THE STILL MARK, always. This runs on the very first screen of
 * a cold start, which is exactly where a browser is most likely to refuse a GL
 * context — a locked-down webview, a machine with no GPU process, a device that
 * has hit its context limit. Every failure path here falls back to
 * `<RidrMark>`, the same geometry as a plain SVG, rather than to an empty
 * square where the logo should be.
 *
 * REDUCED MOTION GETS THE FINISHED MARK, not a frozen half-drawn one: the
 * shader's `u_freeze` is pinned to 1.0, which renders the last frame of the
 * loop — the complete R — with no animation loop running at all.
 *
 * The loop stops itself when the element leaves the screen or the tab is
 * hidden. A logo that keeps a rAF alive behind a backgrounded tab is a battery
 * cost for a picture nobody is looking at.
 */

const VERT = `attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`

const TILE = '#C6F53C'
const INK = '#0A0A0C'

/** "#RRGGBB" → the 0..1 triple a `vec3` uniform wants. */
function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)
  if (!sh) return null
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh)
    return null
  }
  return sh
}

/**
 * THE APP INTRODUCES ITSELF ONCE, NOT ONCE PER GATE.
 *
 * A cold open passes through three loaders in a row — App's <Suspense>
 * fallback while the route chunk arrives, <ProtectedRoute> while auth
 * resolves, then <W3Guard> while the garage read lands. Each is a fresh mount
 * of this component, so the mark drew itself, vanished, drew itself again, and
 * drew itself a third time before the first screen appeared. Reported exactly
 * as it looks: "the logo tries 3 times to render."
 *
 * Module scope, deliberately, not React state: the whole point is to survive
 * being unmounted. The first mark in a page session draws; every one after it
 * renders the finished R with the same bloom behind it, so the loaders look
 * like one continuous wait instead of three false starts.
 *
 * It resets on a full page load, which is right — a genuinely new session
 * deserves the introduction again.
 */
let INTRODUCED = false

export default function RidrMarkAnimated({ size = 210 }: { size?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  // Starts false and is only ever set on a real failure, so the shader gets
  // its chance and the still mark is never a flash before it.
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    // Freeze for the same reason reduced motion freezes: the draw-on has
    // already happened and repeating it is the bug, not the feature.
    const frozen = reduce || INTRODUCED
    INTRODUCED = true
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(size * dpr)
    canvas.height = Math.round(size * dpr)

    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false })
    if (!gl) { setFailed(true); return }

    const vs = compile(gl, gl.VERTEX_SHADER, VERT)
    const fs = compile(gl, gl.FRAGMENT_SHADER, RIDR_MARK_FRAG)
    const prog = vs && fs ? gl.createProgram() : null
    if (!vs || !fs || !prog) { setFailed(true); return }
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { setFailed(true); return }
    gl.useProgram(prog)

    // One full-screen quad; the mark is entirely the fragment stage's work.
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'a_pos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const u = (name: string) => gl.getUniformLocation(prog, name)
    gl.uniform2f(u('u_resolution'), canvas.width, canvas.height)
    gl.uniform3fv(u('u_bg'), rgb(TILE))
    gl.uniform3fv(u('u_ink'), rgb(INK))
    gl.uniform3fv(u('u_ping'), rgb(INK))
    gl.uniform1f(u('u_stroke'), 15)
    gl.uniform1f(u('u_zoom'), 0.72)
    gl.uniform1f(u('u_loop'), 4.2)
    // 1.0 renders the END of the loop: the finished R, no motion.
    gl.uniform1f(u('u_freeze'), frozen ? 1 : 0)
    const uTime = u('u_time')

    gl.viewport(0, 0, canvas.width, canvas.height)

    const draw = (t: number) => {
      gl.uniform1f(uTime, t)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    // One frame and stop — no rAF loop for a mark that is not animating.
    // A frozen mark spinning a render loop would burn battery to draw the
    // same pixels, and this component exists precisely when things are slow.
    if (frozen) { draw(0); return }

    let raf = 0
    let start = performance.now()
    let running = true
    const frame = (now: number) => {
      if (!running) return
      draw((now - start) / 1000)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    // Pause with the tab, and resume from the top rather than jumping to
    // wherever the clock got to while nobody was watching.
    const onVisibility = () => {
      if (document.hidden) {
        running = false
        cancelAnimationFrame(raf)
      } else if (!running) {
        running = true
        start = performance.now()
        raf = requestAnimationFrame(frame)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVisibility)
      // THE CONTEXT IS NOT DESTROYED HERE, deliberately. `WEBGL_lose_context`
      // stood in this line and made the component fall back to the still mark
      // in every development build: StrictMode runs the effect, tears it down
      // and runs it again, `getContext` hands back the SAME object it just
      // lost, and every shader compiled against it fails. A lost context is
      // indistinguishable from a real GPU failure, so the fallback fired and
      // the animation was never seen. The canvas is dropped with the element
      // and the context goes with it.
    }
  }, [size])

  if (failed) {
    return (
      <div style={{
        width: size, height: size, borderRadius: size * 0.235,
        background: TILE, display: 'grid', placeItems: 'center',
      }}>
        <RidrMark size={size * 0.62} color={INK} />
      </div>
    )
  }

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label="Ridr"
      style={{
        width: size, height: size, display: 'block',
        // The tile's own corner, from the design file: 49.35 on a 210 box.
        borderRadius: size * 0.235,
        // Painted under the canvas so the corner radius has something to cut
        // into during the frame before the first draw lands.
        background: RIDR_LIME,
      }} />
  )
}
