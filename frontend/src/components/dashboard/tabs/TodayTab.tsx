import { useMemo, useRef } from 'react'
import { format } from 'date-fns'
import { motion, useInView, useReducedMotion, useScroll, useTransform } from 'motion/react'
import BodyBriefing from '../BodyBriefing'
import CoachBrief from '../CoachBrief'
import PMCChart from '../PMCChart'
import ReadinessHero from '../ReadinessHero'
import SyncButton from '../SyncButton'
import { useCoachBrief } from '../../../hooks/useCoachBrief'

/**
 * TodayTab — "Pulse 2026" edition (mobile-first).
 *
 * Sized for the smallest viewport first; wider screens just get more room
 * to breathe. Three blocks: a pulse-strip masthead, the body briefing,
 * the PMC chart, the AI prescription. Container queries handle per-cell
 * adjustments without coupling to viewport size.
 */

// ─── Motion variants ───────────────────────────────────────────────────────
const SOFT_OUT = [0.22, 1, 0.36, 1] as const

const cellVariants = {
  hidden: { opacity: 0, y: 12, filter: 'blur(5px)' },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: {
      duration: 0.5,
      delay: 0.04 + i * 0.06,
      ease: SOFT_OUT,
    },
  }),
}

// ─── PulseStrip ── animated date / context band ────────────────────────────
// Mobile: stacks vertically — eyebrow, then the giant ordinal date with the
// month annotation underneath, then the long date. From @sm onward it
// reflows into the horizontal masthead layout.

function PulseStrip() {
  const today = useMemo(() => new Date(), [])
  const dayNum = today.getDate()
  const longDate = format(today, 'EEEE, MMMM yyyy')
  const reduce = useReducedMotion()
  // Step 3 — surface activity count when >=2 sessions today so the user
  // knows the brief is recapping multiple rides above the regen.
  const { data: brief } = useCoachBrief()
  const todayCount = brief?.post_ride_review?.totals?.count ?? 0
  const showCountPill = todayCount >= 2

  return (
    <motion.header
      custom={0}
      variants={cellVariants}
      initial="hidden"
      animate="show"
      className="relative overflow-hidden rounded-[20px] sm:rounded-[28px] @container"
      style={{
        background:
          'radial-gradient(140% 120% at 0% 0%, color-mix(in srgb, var(--color-forest-2) 22%, transparent), transparent 55%), radial-gradient(120% 100% at 100% 100%, color-mix(in srgb, var(--color-amber) 18%, transparent), transparent 55%), color-mix(in srgb, var(--color-paper-2) 92%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-ink) 8%, transparent)',
        boxShadow:
          '0 1px 0 rgba(255,255,255,0.6) inset, 0 16px 40px -28px rgba(20,24,17,0.18)',
      }}
    >
      {/* Animated pulse line */}
      {!reduce && (
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-[2px] origin-left"
          style={{
            background:
              'linear-gradient(90deg, transparent, var(--color-forest-2), var(--color-amber), transparent)',
            animation: 'pulse-sweep 6.4s cubic-bezier(.4,0,.2,1) infinite',
          }}
        />
      )}

      <div className="flex flex-col @sm:flex-row @sm:items-center gap-3 @sm:gap-6 px-4 py-4 sm:px-6 sm:py-5 @md:gap-8">
        {/* Eyebrow: mobile-only label sitting above the date */}
        <span
          className="eyebrow @sm:hidden"
          style={{
            color: 'var(--color-forest-2)',
            letterSpacing: '0.32em',
            fontSize: 9.5,
            fontWeight: 600,
          }}
        >
          Today's brief
        </span>

        {/* Big ordinal date */}
        <motion.div
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.12, duration: 0.5, ease: SOFT_OUT }}
          className="flex items-baseline gap-2 shrink-0"
        >
          <span
            className="leading-none"
            style={{
              fontFamily: '"Fraunces", serif',
              fontStyle: 'italic',
              fontVariationSettings: '"opsz" 144, "SOFT" 50, "wght" 400',
              fontSize: 'clamp(56px, 14vw, 92px)',
              color: 'var(--color-ink)',
              letterSpacing: '-0.04em',
            }}
          >
            {dayNum}
          </span>
          <span
            className="num-mono shrink-0 mb-1.5 @sm:mb-2"
            style={{
              fontSize: 10.5,
              letterSpacing: '0.32em',
              color: 'var(--color-muted)',
              textTransform: 'uppercase',
              fontWeight: 500,
            }}
          >
            {format(today, 'MMM').toUpperCase()}
          </span>
        </motion.div>

        {/* Vertical hairline only when row layout is active */}
        <span
          aria-hidden
          className="hidden @sm:block self-stretch"
          style={{ width: 1, backgroundColor: 'var(--color-rule)' }}
        />

        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <span
            className="eyebrow hidden @sm:inline"
            style={{
              color: 'var(--color-forest-2)',
              letterSpacing: '0.32em',
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            Today's brief
          </span>
          <h1
            className="leading-[1.1]"
            style={{
              fontFamily: '"Fraunces", serif',
              fontStyle: 'italic',
              fontVariationSettings: '"opsz" 144, "SOFT" 30, "wght" 400',
              fontSize: 'clamp(17px, 4.6vw, 30px)',
              color: 'var(--color-ink)',
              letterSpacing: '-0.02em',
            }}
            title={longDate}
          >
            {longDate}
          </h1>
        </div>

        {/* Step 3 — multi-activity count pill. Hidden when count <= 1. */}
        {showCountPill && (
          <span
            className="num-mono inline-flex items-center gap-1 rounded-full px-2.5 py-1 shrink-0 self-start @sm:self-auto"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-paper-2) 92%, transparent)',
              border: '1px solid var(--color-rule)',
              color: 'var(--color-ink-2)',
              fontSize: 11,
              letterSpacing: '0.04em',
            }}
            aria-label={`${todayCount} activities today`}
          >
            <span style={{ fontWeight: 600 }}>{todayCount}</span>
            <span style={{ color: 'var(--color-muted)' }}>today</span>
          </span>
        )}

        {/* Sync pill — full label on @sm+, compact (dot+age only) on tiny */}
        <div className="shrink-0 self-start @sm:self-auto">
          <SyncButton className="hidden @sm:inline-flex" />
          <SyncButton compact className="@sm:hidden" />
        </div>
      </div>

      <style>{`
        @keyframes pulse-sweep {
          0%   { transform: translateX(-110%) scaleX(0.6); opacity: 0; }
          14%  { opacity: 1; }
          50%  { transform: translateX(0%)   scaleX(1.0); opacity: 1; }
          86%  { opacity: 1; }
          100% { transform: translateX(110%) scaleX(0.6); opacity: 0; }
        }
      `}</style>
    </motion.header>
  )
}

// ─── Cell ── animated bento cell ───────────────────────────────────────────
// Mobile: meaning chip sits *below* the eyebrow (one column). From @sm: the
// chip flows inline next to the eyebrow on the same row. Padding uses
// clamp() so edges don't crush on tiny screens.

interface CellProps {
  index: number
  eyebrow: string
  meaning: React.ReactNode
  accent: string
  className?: string
  children: React.ReactNode
  bare?: boolean
}

function Cell({ index, eyebrow, meaning, accent, className = '', children, bare = false }: CellProps) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.12 })
  const reduce = useReducedMotion()

  return (
    <motion.section
      ref={ref}
      custom={index}
      variants={cellVariants}
      initial="hidden"
      animate={inView ? 'show' : 'hidden'}
      whileHover={reduce ? undefined : { y: -2 }}
      whileTap={reduce ? undefined : { scale: 0.997 }}
      transition={{ duration: 0.25, ease: SOFT_OUT }}
      className={`relative @container flex flex-col gap-3 ${className}`}
      style={
        bare
          ? undefined
          : {
              borderRadius: 'clamp(16px, 4vw, 24px)',
              backgroundColor: 'var(--color-paper-2)',
              border: '1px solid var(--color-rule)',
              padding: 'clamp(12px, 3.2vw, 22px)',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.5), 0 1px 2px rgba(20,24,17,0.04)',
            }
      }
    >
      <header className="flex flex-col @sm:flex-row @sm:items-baseline gap-1.5 @sm:gap-3">
        <span className="flex items-center gap-2 shrink-0">
          <span
            aria-hidden
            className="inline-block rounded-full"
            style={{ width: 6, height: 6, backgroundColor: accent }}
          />
          <span
            className="eyebrow"
            style={{
              letterSpacing: '0.28em',
              color: 'var(--color-ink)',
              fontSize: 10.5,
              fontWeight: 600,
            }}
          >
            {eyebrow}
          </span>
        </span>
        <span
          className="text-[12px] @sm:text-[12.5px] leading-snug flex-1 min-w-0"
          style={{
            fontFamily: '"Fraunces", serif',
            fontStyle: 'italic',
            color: 'var(--color-ink-2)',
            fontVariationSettings: '"opsz" 14, "wght" 400',
            maxWidth: '52ch',
          }}
        >
          {meaning}
        </span>
      </header>
      <div className="min-w-0">{children}</div>
    </motion.section>
  )
}

// ─── ParallaxOrnament ── decorative scroll-driven mark, desktop-only ───────

function ParallaxOrnament() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], [40, -40])
  const opacity = useTransform(scrollYProgress, [0, 0.3, 0.7, 1], [0, 0.6, 0.6, 0])
  const reduce = useReducedMotion()

  return (
    <div
      ref={ref}
      aria-hidden
      className="hidden lg:flex justify-center -my-2 select-none pointer-events-none"
    >
      <motion.span
        style={reduce ? { opacity: 0.5 } : { y, opacity }}
        className="num-mono"
      >
        <span
          style={{
            fontSize: 11,
            letterSpacing: '0.6em',
            color: 'var(--color-muted)',
          }}
        >
          ◆ &nbsp; ◇ &nbsp; ◆
        </span>
      </motion.span>
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────

export default function TodayTab() {
  return (
    <div className="relative flex flex-col gap-4 sm:gap-5 lg:gap-6 min-w-0">
      <PulseStrip />

      <Cell
        index={1}
        eyebrow="The Body · Today"
        accent="var(--color-amber)"
        meaning={
          <>
            How the body reports for duty — sleep, HRV, body battery — and
            the verdict on whether to push or hold today.
          </>
        }
      >
        <div className="flex flex-col gap-3 sm:gap-4">
          <BodyBriefing />
          <ReadinessHero />
        </div>
      </Cell>

      <ParallaxOrnament />

      <Cell
        index={2}
        eyebrow="Training Load · 90 days"
        accent="var(--color-forest-2)"
        meaning={
          <>
            <strong style={{ fontStyle: 'normal' }}>CTL</strong> is fitness,{' '}
            <strong style={{ fontStyle: 'normal' }}>ATL</strong> is fatigue,{' '}
            <strong style={{ fontStyle: 'normal' }}>TSB</strong> is the gap
            between them — your form. Aim for a 3–7 TSS/day weekly ramp.
          </>
        }
        bare
      >
        <PMCChart />
      </Cell>

      <ParallaxOrnament />

      <Cell
        index={3}
        eyebrow="Today's Prescription"
        accent="var(--color-amber)"
        meaning={
          <>
            Today, specifically — written fresh by the coach, signed at the
            hour the brief was generated.
          </>
        }
        bare
      >
        <CoachBrief />
      </Cell>
    </div>
  )
}
