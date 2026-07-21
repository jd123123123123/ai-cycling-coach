// Dependency-free, CSP-safe canvas confetti. No external assets, no npm dep —
// a plain <canvas> particle sim on a full-screen, pointer-events:none, fixed
// overlay. Animated with requestAnimationFrame and torn down after the burst.
//
// Respects prefers-reduced-motion: fireConfetti() no-ops entirely (the
// celebration overlay still shows a calm, static badge — see CelebrationOverlay).
// GPU-cheap (dpr capped at 2, single clearRect per frame), auto-cleanup, no
// layout shift (fixed + pointer-events:none), z-index above the overlay.

const DEFAULT_COLORS = [
  '#FF5A3C', // coral accent
  '#16E08A', // forest / good
  '#38B6FF', // strain blue
  '#FFD166', // gold
  '#8B5CF6', // violet
  '#FFFFFF', // white sparkle
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
  round: boolean
}

export interface ConfettiOptions {
  /** Total particle count (before dpr/intensity scaling). Default 150. */
  count?: number
  /** Palette override. Defaults to the app token palette. */
  colors?: string[]
  /** Burst origins as fractions of the viewport. Default two near top-third. */
  origins?: { x: number; y: number }[]
  /** Burst duration in ms before teardown. Default 2200. */
  durationMs?: number
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * Fire a one-shot confetti burst. Returns a cancel function that tears the
 * canvas down early (used when a celebration is dismissed mid-flight).
 */
export function fireConfetti(opts: ConfettiOptions = {}): () => void {
  const noop = () => {}
  if (typeof document === 'undefined') return noop
  // Respect reduced-motion: skip the burst entirely (the overlay stays static).
  if (prefersReducedMotion()) return noop

  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = window.innerWidth
  const h = window.innerHeight
  const colors = opts.colors && opts.colors.length ? opts.colors : DEFAULT_COLORS
  const originFracs = opts.origins ?? [
    { x: 0.28, y: 0.34 },
    { x: 0.72, y: 0.34 },
  ]
  const origins = originFracs.map((o) => ({ x: o.x * w, y: o.y * h }))
  const DURATION = opts.durationMs ?? 2200
  const COUNT = opts.count ?? 150

  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(w * dpr)
  canvas.height = Math.floor(h * dpr)
  canvas.style.position = 'fixed'
  canvas.style.top = '0'
  canvas.style.left = '0'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.style.pointerEvents = 'none'
  canvas.style.zIndex = '2147483000'
  canvas.setAttribute('aria-hidden', 'true')
  document.body.appendChild(canvas)

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    canvas.remove()
    return noop
  }
  ctx.scale(dpr, dpr)

  const particles: Particle[] = []
  for (let i = 0; i < COUNT; i++) {
    const o = origins[i % origins.length]
    const angle = Math.random() * Math.PI * 2
    const speed = 4 + Math.random() * 8
    particles.push({
      x: o.x,
      y: o.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 4, // bias upward for a celebratory pop
      size: 5 + Math.random() * 7,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      round: Math.random() < 0.28,
    })
  }

  const gravity = 0.2
  const drag = 0.99
  const start = performance.now()
  let raf = 0
  let cancelled = false

  const teardown = () => {
    if (cancelled) return
    cancelled = true
    cancelAnimationFrame(raf)
    canvas.remove()
  }

  function frame(now: number) {
    if (cancelled) return
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
      if (p.round) {
        ctx!.beginPath()
        ctx!.arc(0, 0, p.size * 0.42, 0, Math.PI * 2)
        ctx!.fill()
      } else {
        ctx!.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.55)
      }
      ctx!.restore()
    }

    if (elapsed < DURATION) {
      raf = requestAnimationFrame(frame)
    } else {
      teardown()
    }
  }

  raf = requestAnimationFrame(frame)
  return teardown
}

/**
 * Backward-compatible one-shot burst (no return value needed by legacy callers
 * such as BreakthroughCelebration and SocialTab).
 */
export function celebrate(opts: ConfettiOptions = {}): void {
  fireConfetti(opts)
}
