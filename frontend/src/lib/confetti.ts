// Dependency-free, CSP-safe canvas confetti. No external assets, no inline
// styles beyond programmatic canvas positioning — safe under a strict CSP.
//
// celebrate() spawns a short burst of colored particles on a full-screen,
// pointer-events:none, fixed canvas, animates them with requestAnimationFrame,
// and tears the canvas down after ~2s. When the user prefers reduced motion it
// no-ops (a tiny, single fade is fine but we simply skip the animation).

const COLORS = [
  '#FF5A3C', // coral accent
  '#16E08A', // green
  '#38B6FF', // blue
]

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  rot: number
  vr: number
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export function celebrate(): void {
  if (typeof document === 'undefined') return
  // Respect reduced-motion: skip the burst entirely (no-op).
  if (prefersReducedMotion()) return

  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = window.innerWidth
  const h = window.innerHeight

  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(w * dpr)
  canvas.height = Math.floor(h * dpr)
  canvas.style.position = 'fixed'
  canvas.style.top = '0'
  canvas.style.left = '0'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.style.pointerEvents = 'none'
  canvas.style.zIndex = '9999'
  document.body.appendChild(canvas)

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    canvas.remove()
    return
  }
  ctx.scale(dpr, dpr)

  // Two burst origins near the top-third for a celebratory "pop".
  const origins = [
    { x: w * 0.3, y: h * 0.32 },
    { x: w * 0.7, y: h * 0.32 },
  ]
  const particles: Particle[] = []
  const COUNT = 140
  for (let i = 0; i < COUNT; i++) {
    const o = origins[i % origins.length]
    const angle = Math.random() * Math.PI * 2
    const speed = 4 + Math.random() * 7
    particles.push({
      x: o.x,
      y: o.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 3, // bias upward
      size: 5 + Math.random() * 6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
    })
  }

  const gravity = 0.18
  const drag = 0.99
  const start = performance.now()
  const DURATION = 2000
  let raf = 0

  function frame(now: number) {
    const elapsed = now - start
    const fade = Math.max(0, 1 - elapsed / DURATION)
    ctx!.clearRect(0, 0, w, h)

    for (const p of particles) {
      p.vx *= drag
      p.vy = p.vy * drag + gravity
      p.x += p.vx
      p.y += p.vy
      p.rot += p.vr

      ctx!.save()
      ctx!.translate(p.x, p.y)
      ctx!.rotate(p.rot)
      ctx!.globalAlpha = fade
      ctx!.fillStyle = p.color
      ctx!.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
      ctx!.restore()
    }

    if (elapsed < DURATION) {
      raf = requestAnimationFrame(frame)
    } else {
      cancelAnimationFrame(raf)
      canvas.remove()
    }
  }

  raf = requestAnimationFrame(frame)
}
