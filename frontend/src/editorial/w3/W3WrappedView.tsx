import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { X, Share2, ChevronRight } from 'lucide-react'
import { T, FONT, EASE } from './w3tokens'
import { TNUM } from './w3surfaces'
import { sceneFor, type Scene } from './w3wrapped'
import './w3.css'

/**
 * W3 · DEINE WOCHE — the week as a story deck.
 *
 * WHAT MAKES WRAPPED WORK, AND IT IS NOT THE STATISTICS. Spotify's version is
 * a well-built piece of behavioural design and it is worth naming the parts,
 * because a deck that only shows numbers gets none of the effect:
 *
 *  1. ANTICIPATION BEFORE PAYOFF. It opens on a slide that promises rather than
 *     tells. The first card here says what week it was and nothing else — the
 *     numbers start on slide two.
 *  2. ESCALATION. Each reveal is bigger than the last. The order below climbs:
 *     distance, then time, then the single hardest thing you did, then what it
 *     changed. Never the reverse — a deck that opens on its best number has
 *     nowhere to go.
 *  3. SUPERLATIVES THAT ARE ABOUT YOU, not about a leaderboard. "Deine längste
 *     seit Mai" beats "top 5% of riders": one is a fact about the rider, the
 *     other is a fact about a population they did not ask to join.
 *  4. A COMPARISON WITH THEMSELVES. Last week is the only fair opponent, and
 *     the payload carries it.
 *  5. AN END CARD BUILT TO LEAVE. The last slide is the shareable one, because
 *     the point of the ritual is that it gets shown to somebody.
 *
 *  6. AND CONTROL. Story mechanics are not decoration: tap advances, hold
 *     pauses, and the progress bars say how much is left. A deck that
 *     auto-advances with no way to stop is a deck people close.
 *
 * REGISTER: pen frames `BMzgQ` (viewfinder), `D1SQI` (broadsheet), `pi5Hm`
 * (effort). Those are the same three registers the share cards use, so a slide
 * and the card it exports as are visibly the same object.
 *
 * TYPOGRAPHY: the w3:ride ceiling — nothing heavier than SemiBold, presence
 * from SIZE, display numerals 44–109px, headings set essentially solid.
 * See `docs/research/2026-08-w3ride`.
 *
 * Every number is real or its slide is not built. A Wrapped that invents a
 * statistic is worse than a short one.
 */

// ── view model ──────────────────────────────────────────────────────────────

export type W3SlideKind = 'open' | 'figure' | 'effort' | 'broadsheet' | 'compare' | 'finale'

export interface W3WrappedSlide {
  key: string
  kind: W3SlideKind
  /** The small caps line above everything. */
  eyebrow: string
  /** The display figure. Absent on `open` and `broadsheet`. */
  value?: string
  unit?: string
  /** The sentence. Two weights: `lead` in ink, `accent` in the slide's colour. */
  lead: string
  accent?: string
  /** A quiet line beneath — the comparison, the date, the method. */
  foot?: string
  /** 0–1 bars for the slide's own graphic. Empty draws none. */
  series?: number[]
  /** `compare`: this week against last, both already formatted. */
  versus?: { thisWeek: string; lastWeek: string; frac: number }
  /** THE RIDER'S OWN PICTURE, full bleed behind the type — their composed ride
   *  scene, or their bike. Wrapped's cards are built on the listener's own
   *  album art; ours are built on the machine and the road. Absent → the
   *  slide's colour field carries it alone. */
  image?: string | null
  /** The week's route as [lat, lng] pairs. Drawn enormous, edge to edge. */
  route?: [number, number][] | null
}

export interface W3WrappedVm {
  weekLabel: string
  slides: W3WrappedSlide[]
  shareLabel: string
}

// ── the deck ────────────────────────────────────────────────────────────────

/** How long a slide holds before it advances itself. Long enough to read the
 *  number, short enough that the deck keeps moving — Wrapped runs about five. */
const SLIDE_MS = 5200

/**
 * EVERY SLIDE IS ITS OWN POSTER.
 *
 * The first build of this deck drew type on the app's near-black and it was
 * dead on the screen — correct, honest, and boring, which for a thing whose
 * entire purpose is to be screenshotted is the same as broken. Wrapped's visual
 * argument is not decoration: each card is a SATURATED FIELD, they alternate
 * light-on-dark with dark-on-light, and no two in a row look alike. That
 * variety is what makes a deck feel like an event instead of a report.
 *
 * The colours are the w3:ride art direction, which was never near-black — the
 * Cycl:R series is hot violet, cobalt, acid and orange on vivid grounds. Every
 * value below is a token, so `isolation.test` still holds: this is the app's
 * own palette turned up, not a second palette smuggled in.
 *
 * `ink` flips with the ground. A slide is only legible if the type was chosen
 * for the field it sits on, and half of these fields are bright.
 */
// Scenes live in `w3wrapped` so the CARD PAINTER can use the same ones —
// an exported slide that differs from the slide on screen is a broken promise.


function Bars({ series, tint, reduce }: { series: number[]; tint: string; reduce: boolean | null }) {
  if (series.length === 0) return null
  const peak = Math.max(...series, 0.0001)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 74 }}>
      {series.slice(0, 28).map((v, i) => (
        <motion.div key={i}
          initial={reduce ? false : { scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.25 + i * 0.03 }}
          style={{
            flex: 1, transformOrigin: 'bottom', borderRadius: 2,
            height: `${Math.max(6, (v / peak) * 100)}%`,
            background: v / peak >= 0.86 ? tint : `${tint}4D`,
          }} />
      ))}
    </div>
  )
}

/** The display size that keeps a figure and its unit inside a 390 card. */
/**
 * THE ROUTE, DRAWN AS BIG AS THE CARD ALLOWS.
 *
 * Not a map — a shape. A rider recognises their own week from the outline of
 * where they went, and at this size it reads as a mark rather than as data.
 */
function RouteMark({ points, tint, reduce }: {
  points: [number, number][]; tint: string; reduce: boolean | null
}) {
  if (points.length < 2) return null
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const [lat, lng] of points) {
    minX = Math.min(minX, lng); maxX = Math.max(maxX, lng)
    minY = Math.min(minY, lat); maxY = Math.max(maxY, lat)
  }
  const spanX = Math.max(1e-6, maxX - minX)
  const spanY = Math.max(1e-6, maxY - minY)
  const d = points
    .map(([lat, lng], i) =>
      `${i === 0 ? 'M' : 'L'}${((lng - minX) / spanX) * 100} ${((maxY - lat) / spanY) * 100}`)
    .join(' ')
  return (
    <svg viewBox="-6 -6 112 112" preserveAspectRatio="xMidYMid meet"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      <motion.path d={d} fill="none" stroke={tint} strokeWidth={2.2}
        strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
        initial={reduce ? false : { pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 0.9 }}
        transition={{ duration: 1.6, ease: EASE }} />
    </svg>
  )
}

/** Grain. Every printed poster has it and every flat gradient looks like a
 *  screenshot without it — one SVG turbulence, no image request. */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")"

function figureSize(value: string): number {
  const glyphs = value.length
  if (glyphs <= 3) return 132
  if (glyphs === 4) return 116
  if (glyphs === 5) return 96
  return 82
}

function Slide({ s, sc, reduce }: { s: W3WrappedSlide; sc: Scene; reduce: boolean | null }) {
  const rise = reduce ? {} : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 } }

  return (
    <div style={{
      // CENTRED, NOT BOTTOM-STACKED. Every slide sat on the floor of the frame
      // with two-thirds of a saturated field empty above it — which reads as a
      // caption on a colour swatch rather than as a poster. Wrapped's cards put
      // their type where the eye already is and let the field run past it on
      // both sides.
      flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
      justifyContent: 'center',
      gap: 16, padding: '0 26px 20px',
    }}>
      <motion.span {...rise} transition={{ duration: 0.5, ease: EASE }}
        style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.6, color: sc.accent, opacity: 0.85 }}>
        {s.eyebrow.toUpperCase()}
      </motion.span>

      {/* THE DISPLAY TIER. 104 is the top of w3:ride's range and this is what
          that range is for — one number a week, arriving on its own slide. */}
      {s.value && (
        <motion.div {...rise} transition={{ duration: 0.6, ease: EASE, delay: 0.08 }}
          style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0, maxWidth: '100%' }}>
          <span style={{
            // BIG, BUT INSIDE THE FRAME. 124 is the size a number wants to be
            // before it stops reading as a statistic and starts being the
            // picture — and at five or six glyphs it pushed its own unit off
            // the right edge of a 390 card. The figure steps down as it gets
            // longer so "214,6 km" and "9" both fill the width instead of one
            // of them overflowing it.
            fontSize: s.kind === 'figure' ? figureSize(s.value ?? '') : 74,
            fontWeight: 600,
            letterSpacing: s.kind === 'figure' ? -6 : -3.2, lineHeight: 0.84,
            color: sc.ink, ...TNUM,
          }}>{s.value}</span>
          {s.unit && (
            <span style={{ fontSize: s.kind === 'figure' ? 30 : 22, fontWeight: 600, color: sc.accent }}>
              {s.unit}
            </span>
          )}
        </motion.div>
      )}

      {s.versus && (
        <motion.div {...rise} transition={{ duration: 0.6, ease: EASE, delay: 0.12 }}
          style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {/* Last week is the only fair opponent, so it is drawn as the track
              and this week as the fill. The gap IS the story. */}
          <div style={{ height: 12, borderRadius: 100, background: `${sc.ink}1F`, overflow: 'hidden' }}>
            <motion.div
              initial={reduce ? false : { width: 0 }}
              animate={{ width: `${Math.round(Math.max(0, Math.min(1.4, s.versus.frac)) / 1.4 * 100)}%` }}
              transition={{ duration: 0.9, ease: EASE, delay: 0.2 }}
              style={{ height: '100%', borderRadius: 100, background: sc.ink }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: sc.ink, ...TNUM }}>{s.versus.thisWeek}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: sc.ink, opacity: 0.55, ...TNUM }}>{s.versus.lastWeek}</span>
          </div>
        </motion.div>
      )}

      {s.series && s.series.length > 0 && (
        <Bars series={s.series} tint={sc.ink} reduce={reduce} />
      )}

      {/* The sentence, set solid at the w3:ride heading ratio. */}
      <motion.div {...rise} transition={{ duration: 0.6, ease: EASE, delay: 0.16 }}
        style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{
          fontSize: s.kind === 'broadsheet' ? 44 : 30, fontWeight: 600,
          letterSpacing: s.kind === 'broadsheet' ? -1.8 : -1.1, lineHeight: 1.06, color: sc.ink,
        }}>{s.lead}</span>
        {s.accent && (
          <span style={{
            fontSize: s.kind === 'broadsheet' ? 44 : 30, fontWeight: 600,
            letterSpacing: s.kind === 'broadsheet' ? -1.8 : -1.1, lineHeight: 1.06, color: sc.accent,
          }}>{s.accent}</span>
        )}
      </motion.div>

      {s.foot && (
        <motion.span {...rise} transition={{ duration: 0.6, ease: EASE, delay: 0.22 }}
          style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.4, color: sc.ink, opacity: 0.62 }}>
          {s.foot}
        </motion.span>
      )}
    </div>
  )
}

export default function W3WrappedView({ vm, onClose, onShare }: {
  vm: W3WrappedVm
  onClose?: () => void
  /** EVERY slide is shareable, so the handler is told WHICH one. A rider who
   *  wants to post the slide where they beat a moped should not have to post
   *  the summary instead. */
  onShare?: (slide: W3WrappedSlide) => void
}) {
  const reduce = useReducedMotion()
  const [i, setI] = useState(0)
  const [held, setHeld] = useState(false)
  // Initialised to 0 rather than to `Date.now()`: a ref initialiser runs
  // DURING render, and calling an impure function there gives an unstable value
  // whenever React re-renders for any other reason. The effect below stamps it
  // at the moment the slide actually starts, which is the moment that matters.
  const startedAt = useRef<number>(0)
  // ELAPSED IS STATE, NOT A REF, because the progress bar's transition duration
  // is computed from it during render — and reading `ref.current` while
  // rendering is exactly the rule that stops a component updating when you
  // expect it to. State is the legal way to have render depend on a value.
  const [elapsedMs, setElapsedMs] = useState(0)

  const n = vm.slides.length
  const slide = vm.slides[Math.min(i, n - 1)]
  const last = i >= n - 1

  const go = useCallback((d: 1 | -1) => {
    setI((prev) => Math.max(0, Math.min(n - 1, prev + d)))
    setElapsedMs(0)
    startedAt.current = Date.now()
  }, [n])

  // Auto-advance, pausable. `held` freezes the clock rather than restarting it,
  // so lifting a finger resumes where the slide was rather than replaying it.
  useEffect(() => {
    if (held || last) return
    const id = window.setTimeout(() => go(1), Math.max(0, SLIDE_MS - elapsedMs))
    startedAt.current = Date.now()
    return () => {
      window.clearTimeout(id)
      // Freeze the clock rather than restart it: lifting a finger resumes the
      // slide where it was instead of replaying it from the top.
      const spent = Date.now() - startedAt.current
      setElapsedMs((e) => Math.min(SLIDE_MS, e + spent))
    }
  }, [i, held, last, go, elapsedMs])

  // Each slide brings its own field, ink and accent — see `SCENES`.
  const sc = sceneFor(slide.key)

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{
        fontFamily: FONT, background: T.bg, minHeight: '100dvh',
        display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
      }}>
        {/* THE FIELD. Full bleed, and it changes with every slide — this is the
            difference between a deck and a report. Cross-faded rather than cut
            so the colour arrives as a mood change, not a flash. */}
        <motion.div aria-hidden key={slide.key}
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.55, ease: EASE }}
          style={{ position: 'absolute', inset: 0, background: sc.ground, pointerEvents: 'none' }} />

        {/* One soft orb, off-centre, in the slide's own colour. Wrapped's cards
            are never flat fills — there is always a shape behind the type. */}
        {/* THE RIDER'S OWN PICTURE. Wrapped is built on the listener's album
            art; this is built on their machine and the road they rode. It sits
            under a scrim heavy enough for type and light enough to still be a
            photograph. */}
        {slide.image && (
          <motion.div aria-hidden key={`${slide.key}-img`}
            initial={reduce ? false : { opacity: 0, scale: 1.08 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.4, ease: EASE }}
            style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              backgroundImage: `url(${slide.image})`,
              backgroundSize: 'cover', backgroundPosition: 'center',
            }} />
        )}
        {slide.image && (
          <div aria-hidden style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: `linear-gradient(180deg, ${sc.ground.includes(T.acid) ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.42)'} 0%, rgba(0,0,0,0.14) 34%, rgba(0,0,0,0.86) 100%)`,
          }} />
        )}

        {/* The week's shape, enormous, behind everything. */}
        {slide.route && slide.route.length > 1 && (
          <div aria-hidden style={{ position: 'absolute', inset: '12% 6% 22%', pointerEvents: 'none' }}>
            <RouteMark points={slide.route} tint={sc.accent} reduce={reduce} />
          </div>
        )}

        {/* One soft orb, off-centre, in the slide's own colour. Wrapped's cards
            are never flat fills — there is always a shape behind the type. */}
        <motion.div aria-hidden key={`${slide.key}-orb`}
          initial={reduce ? false : { opacity: 0, scale: 0.82 }}
          animate={{ opacity: slide.image ? 0.22 : 0.5, scale: 1 }}
          transition={{ duration: 0.9, ease: EASE }}
          style={{
            position: 'absolute', left: '-18%', top: '14%', width: 460, height: 460,
            borderRadius: '50%', pointerEvents: 'none',
            background: `radial-gradient(circle, ${sc.orb}, transparent 66%)`,
            filter: 'blur(18px)',
          }} />

        {/* A ring, cropped by the frame — the geometry Wrapped puts behind its
            type so a card never reads as a plain rectangle. */}
        <motion.div aria-hidden key={`${slide.key}-ring`}
          initial={reduce ? false : { opacity: 0, rotate: -14 }}
          animate={{ opacity: 0.3, rotate: 0 }}
          transition={{ duration: 1.2, ease: EASE }}
          style={{
            position: 'absolute', right: '-38%', bottom: '-16%', width: 420, height: 420,
            borderRadius: '50%', pointerEvents: 'none',
            border: `2px solid ${sc.accent}`,
          }} />

        {/* Grain over the lot. */}
        <div aria-hidden style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: GRAIN, opacity: 0.16, mixBlendMode: 'overlay',
        }} />

        {/* Progress — one bar per slide, the one Wrapped taught everybody. */}
        <div style={{ display: 'flex', gap: 4, padding: '14px 20px 0', position: 'relative' }}>
          {vm.slides.map((s, idx) => (
            <div key={s.key} style={{ flex: 1, height: 2.5, borderRadius: 100, background: `${sc.ink}2E`, overflow: 'hidden' }}>
              <motion.div
                initial={false}
                animate={{ width: idx < i ? '100%' : idx === i ? '100%' : '0%' }}
                transition={idx === i && !held
                  ? { duration: Math.max(0, SLIDE_MS - elapsedMs) / 1000, ease: 'linear' }
                  : { duration: 0.2 }}
                style={{ height: '100%', background: sc.ink, borderRadius: 100 }} />
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px 0', position: 'relative' }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.4, color: sc.ink, opacity: 0.6 }}>
            {vm.weekLabel.toUpperCase()}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {/* On every slide. The finale keeps its big pill as the deck's
                closing move, but a rider should never have to reach the end to
                post the one card they actually liked. */}
            <button onClick={() => onShare?.(slide)} aria-label="Diese Karte teilen"
              style={{ width: 34, height: 34, borderRadius: 100, background: 'transparent', border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
              <Share2 size={16} color={sc.ink} />
            </button>
            <button onClick={onClose} aria-label="Schließen"
              style={{ width: 34, height: 34, borderRadius: 100, background: 'transparent', border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
              <X size={18} color={sc.ink} />
            </button>
          </div>
        </div>

        {/* Tap zones. Left third goes back, the rest goes forward — the
            convention every story UI shares, so nobody has to learn it. */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', position: 'relative' }}>
          <Slide s={slide} sc={sc} reduce={reduce} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
            <button aria-label="Zurück" onClick={() => go(-1)}
              onPointerDown={() => setHeld(true)} onPointerUp={() => setHeld(false)} onPointerLeave={() => setHeld(false)}
              style={{ width: '32%', background: 'transparent', border: 0, cursor: 'pointer' }} />
            <button aria-label="Weiter" onClick={() => go(1)}
              onPointerDown={() => setHeld(true)} onPointerUp={() => setHeld(false)} onPointerLeave={() => setHeld(false)}
              style={{ flex: 1, background: 'transparent', border: 0, cursor: 'pointer' }} />
          </div>
        </div>

        {/* The end card is built to leave: the share sits on the last slide,
            because the ritual only completes when it gets shown to somebody. */}
        {last && (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE, delay: 0.3 }}
            style={{ padding: '0 26px calc(30px + env(safe-area-inset-bottom))', position: 'relative' }}>
            <button onClick={() => onShare?.(slide)}
              style={{
                width: '100%', height: 56, borderRadius: 100, border: 0, background: T.acid,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                cursor: 'pointer', fontFamily: FONT,
              }}>
              <Share2 size={17} color={T.bg} />
              <span style={{ fontSize: 15, fontWeight: 600, color: T.bg }}>{vm.shareLabel}</span>
            </button>
          </motion.div>
        )}

        {!last && (
          <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 'calc(18px + env(safe-area-inset-bottom))', position: 'relative' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 600, color: sc.ink, opacity: 0.5 }}>
              Tippen <ChevronRight size={11} />
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
