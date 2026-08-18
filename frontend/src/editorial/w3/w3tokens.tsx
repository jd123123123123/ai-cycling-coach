import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

/** Shared W3 tokens + tiny primitives, so W3TodayView and W3Sections render
 *  from one source. Values transcribed from `w3.pen`. */
export const T = {
  bg: '#0B0B0B', surface: '#161616', surface2: '#202020',
  // Surface LEVELS for the lit-card treatment (see w3surfaces.ts). They belong
  // in the palette, not inline in a style: `editorial` forbids raw hex in code
  // (isolation.test.ts), and a gradient invented at the call site is exactly
  // how a design system starts to drift.
  cardTop: '#1A1A1A', cardMid: '#151515', cardBot: '#131313',
  sheet: '#171717', tile: '#1E1E1E',
  // The bike stage. A DRAWN bike has near-black parts (standard saddle, matte
  // frames, deep carbon rims) that disappear on the app's dark ground, so every
  // surface showing a bike lights it the way the photographs used to light
  // themselves. One triple, so the garage, the shop and the first-bike screen
  // cannot end up with three different studios.
  stageHi: '#E8E9E6', stageMid: '#C9CBC7', stageLo: '#A9ACA8',
  shadowSoft: '#00000059',
  acid: '#C8FF00', acidDim: '#C8FF001F', acidDeep: '#8FBF00',
  ink: '#FFFFFF', mid: '#9BA0A6', quiet: '#6E7379',
  rule: '#FFFFFF14', stroke: '#FFFFFF1A',
  d2: '#FFFFFF33', d3: '#FFFFFF4D', d4: '#FFFFFF8C',
  training: '#2BE68F', evening: '#7B5CFF', cool: '#6B8CFF',
  warn: '#FFB020', bad: '#FF4356',
}
export const FONT = '"Inter Tight", ui-sans-serif, system-ui, sans-serif'
export const EASE = [0.22, 1, 0.36, 1] as const
export const grow = (delay: number) => ({ duration: 0.55, ease: EASE, delay })
export const DASH = '—'

export const Kicker = ({ children }: { children: ReactNode }) => (
  <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: T.quiet }}>{children}</span>
)

/** Full-width band on w-bg (the pen's section wrapper). */
export const band = (padBottom: number) => ({ display: 'flex', flexDirection: 'column' as const, width: '100%', background: T.bg, padding: `0 20px ${padBottom}px` })

/**
 * A section that arrives as you reach it.
 *
 * Today is a long scroll of bands, and a long scroll that is entirely static
 * reads as a list. Each band lifts 14px and fades as it enters, ONCE — so the
 * page answers the scroll without ever re-animating content the rider has
 * already read, which is what makes reveal effects tiring.
 *
 * `amount: 0.15` fires as the band's top edge arrives rather than waiting for
 * most of it to be on screen: these bands are taller than the viewport, so the
 * 0.8 threshold used for small in-card bars would never trigger for some of
 * them and those sections would simply never appear.
 *
 * NO TRANSFORM AT REST. `y` animates to 0 and motion clears the transform, so
 * a band never becomes a containing block for the fixed tab bar or the action
 * button that render inside this tree.
 */
export function Reveal({ children, style, delay = 0, amount = 0.15 }: {
  children: ReactNode
  style?: CSSProperties
  delay?: number
  amount?: number
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [shown, setShown] = useState(false)
  const [instant, setInstant] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Asked for less motion → the content is simply there. `instant` drops the
    // transition too, so it does not even cross-fade in: a reveal that still
    // fades is still motion, which is the thing that was opted out of.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setInstant(true); setShown(true); return
    }
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      setShown(true)
      io.disconnect()          // `once` — never re-animate what has been read
    }, { threshold: amount })
    io.observe(el)
    // A band TALLER than the viewport can never reach its ratio, so it would
    // hang at opacity 0 forever. The rootMargin-free observer above answers the
    // common case; this covers the tall one by also accepting "top edge passed".
    const onScroll = () => {
      const b = el.getBoundingClientRect()
      if (b.top < window.innerHeight * 0.9) { setShown(true); io.disconnect(); window.removeEventListener('scroll', onScroll) }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => { io.disconnect(); window.removeEventListener('scroll', onScroll) }
  }, [amount])

  return (
    <div
      ref={ref}
      data-w3-reveal={shown ? 'in' : 'out'}
      style={{
        ...style,
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : 'translateY(14px)',
        transition: instant
          ? undefined
          : `opacity 0.55s cubic-bezier(0.22,1,0.36,1) ${delay}s, transform 0.55s cubic-bezier(0.22,1,0.36,1) ${delay}s`,
      }}
    >
      {children}
    </div>
  )
}
/** Surface card, r24. */
export const card = () => ({ background: T.surface, borderRadius: 24, padding: 20, display: 'flex', flexDirection: 'column' as const, width: '100%' })

// The surface + rhythm primitives (S / lux / hairline / TNUM) live in
// `w3surfaces.ts` — a pure module, so they don't add to this file's
// react-refresh violations. Import them from there.

/**
 * Style for an `<input type="file">` that is opened programmatically.
 *
 * NOT `display: none`. A display:none input is out of the layout entirely, and
 * iOS Safari will not open the picker for `ref.current.click()` on one — the tap
 * silently does nothing, no request is ever made, and it looks exactly like a
 * broken upload pipeline from the outside. Keep the input rendered but
 * invisible and parked off-screen instead.
 */
export const HIDDEN_FILE_INPUT = {
  position: 'absolute' as const,
  left: -9999,
  width: 1,
  height: 1,
  opacity: 0,
  pointerEvents: 'none' as const,
}
