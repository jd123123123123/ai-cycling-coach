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
  /** THE ROW. Three figures of equal weight, the way pen `XLPb0` sets them —
   *  "52,4 km · 1:47:32 · 612 hm". Not one hero and two footnotes. */
  stats?: { label: string; value: string; unit: string }[]
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




/**
 * THE ROUTE, SMALL AND LOW-LEFT — the size pen `XLPb0` draws it. It is a
 * signature on the card, not the subject of it: the photograph is the subject.
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
    <svg viewBox="-4 -4 108 108" preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: '100%' }}>
      <motion.path d={d} fill="none" stroke={tint} strokeWidth={2.6}
        strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
        initial={reduce ? false : { pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.4, ease: EASE }} />
    </svg>
  )
}

/** Grain. Every printed poster has it and every flat gradient looks like a
 *  screenshot without it — one SVG turbulence, no image request. */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")"


function Slide({ s, sc, reduce }: { s: W3WrappedSlide; sc: Scene; reduce: boolean | null }) {
  const rise = reduce ? {} : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 } }

  return (
    /* ── THE SAFE BAND ──────────────────────────────────────────────────
       Pen `XLPb0` marks the two zones a story card must keep clear: 250px at
       the top for Instagram's own header, avatar and menu, and 370px at the
       bottom for the caption, reply bar and link sticker. On a 1920 frame that
       is 13% and 19%; the content lives between them or Instagram covers it.
       Designing to the middle band is the difference between a card that was
       made for the platform and one that was made and then cropped by it. */
    <div style={{
      flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
      justifyContent: 'flex-end', gap: 14,
      padding: '13% 26px 19%',
    }}>
      {/* Chapter line: the route and the date, the way the template sets it. */}
      <motion.span {...rise} transition={{ duration: 0.5, ease: EASE }}
        style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 1.5, color: sc.ink, opacity: 0.72 }}>
        {s.eyebrow.toUpperCase()}
      </motion.span>

      {/* The sentence leads. In the real product the type is modest and the
          PICTURE is the spectacle — a number the height of the frame is a
          poster about a statistic, which is not what these cards are. */}
      <motion.div {...rise} transition={{ duration: 0.55, ease: EASE, delay: 0.08 }}
        style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 30, fontWeight: 600, letterSpacing: -1.1, lineHeight: 1.08, color: sc.ink }}>
          {s.lead}
        </span>
        {s.accent && (
          <span style={{ fontSize: 30, fontWeight: 600, letterSpacing: -1.1, lineHeight: 1.08, color: sc.accent }}>
            {s.accent}
          </span>
        )}
      </motion.div>

      {/* ── THE STAT ROW ───────────────────────────────────────────────
          `XLPb0` sets "52,4 km · 1:47:32 · 612 hm" as three figures of EQUAL
          weight on one line, unit small on the baseline. Not one hero number
          and two footnotes — the row is the composition, and it is what makes
          these cards recognisably the same object as the ride shares. */}
      {(s.value || (s.stats && s.stats.length > 0)) && (
        <motion.div {...rise} transition={{ duration: 0.55, ease: EASE, delay: 0.14 }}
          style={{ display: 'flex', alignItems: 'baseline', gap: 20, flexWrap: 'wrap' }}>
          {s.value && (
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
              <span style={{ fontSize: 34, fontWeight: 600, letterSpacing: -1.2, color: sc.ink, ...TNUM }}>{s.value}</span>
              {s.unit && <span style={{ fontSize: 13, fontWeight: 600, color: sc.ink, opacity: 0.6, ...TNUM }}>{s.unit}</span>}
            </span>
          )}
          {(s.stats ?? []).map((st) => (
            <span key={st.label} style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
              <span style={{ fontSize: 34, fontWeight: 600, letterSpacing: -1.2, color: sc.ink, ...TNUM }}>{st.value}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: sc.ink, opacity: 0.6, ...TNUM }}>{st.unit}</span>
            </span>
          ))}
        </motion.div>
      )}

      {s.versus && (
        <motion.div {...rise} transition={{ duration: 0.55, ease: EASE, delay: 0.18 }}
          style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={{ height: 8, borderRadius: 100, background: `${sc.ink}1F`, overflow: 'hidden' }}>
            <motion.div
              initial={reduce ? false : { width: 0 }}
              animate={{ width: `${Math.round(Math.max(0, Math.min(1.4, s.versus.frac)) / 1.4 * 100)}%` }}
              transition={{ duration: 0.9, ease: EASE, delay: 0.24 }}
              style={{ height: '100%', borderRadius: 100, background: sc.accent }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: sc.accent, ...TNUM }}>{s.versus.thisWeek}</span>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: sc.ink, opacity: 0.5, ...TNUM }}>{s.versus.lastWeek}</span>
          </div>
        </motion.div>
      )}

      {s.foot && (
        <motion.span {...rise} transition={{ duration: 0.55, ease: EASE, delay: 0.22 }}
          style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.4, color: sc.ink, opacity: 0.55 }}>
          {s.foot}
        </motion.span>
      )}

      {/* The mark, small, where the template puts it. */}
      <motion.div {...rise} transition={{ duration: 0.55, ease: EASE, delay: 0.28 }}
        style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 2 }}>
        <span style={{ width: 5, height: 5, borderRadius: 100, background: T.acid }} />
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: sc.ink, opacity: 0.7 }}>Ridr</span>
      </motion.div>
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
          <div aria-hidden style={{
            // ABOVE THE TYPE, NOT ON IT. At bottom:30% the trace landed across
            // the headline and the stat row — a signature drawn over the thing
            // it signs. It sits in the clear band between the photo and the
            // copy now, which is where `XLPb0` puts it.
            position: 'absolute', left: 26, bottom: '43%', width: 76, height: 76, pointerEvents: 'none',
            opacity: 0.9,
          }}>
            <RouteMark points={slide.route} tint={T.acid} reduce={reduce} />
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
