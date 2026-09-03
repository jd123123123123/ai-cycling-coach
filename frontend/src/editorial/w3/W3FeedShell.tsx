import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, Users } from 'lucide-react'
import { T, FONT, EASE } from './w3tokens'
// The crew's own violet, not a new token: `THEM_TINT` is already what every
// crew-mate's post is tinted with, and the collective card is the same crew.
import { THEM_TINT } from './w3crew'
import { lux, TNUM } from './w3surfaces'
import W3Eyebrow from './W3Eyebrow'

/**
 * W3 · THE FEED'S OWN FURNITURE — pen frame `dly9G`.
 *
 * The header, the filter row and the collective goal card. Each is here rather
 * than inside `W3CrewView` because the crew screen is already four hundred
 * lines of standings, and these three belong to the FEED that now sits under
 * them.
 */

// ── the head ────────────────────────────────────────────────────────────────

/**
 * A dated eyebrow over the title.
 *
 * The pen prints "MITTWOCH · 18:24", and the clock is the part worth thinking
 * about: a time rendered once at mount is wrong within the minute and stays
 * wrong for as long as the screen is open. This prints the DAY and the hour
 * the feed was last brought up to date, which is a fact that does not rot —
 * and it is what a rider actually wants to know about a feed.
 */
export function W3FeedHead({ eyebrow, title, actions }: {
  eyebrow: string
  title: string
  actions?: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, width: '100%', padding: '0 20px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
        <W3Eyebrow>{eyebrow}</W3Eyebrow>
        <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: -1.4, lineHeight: 1, color: T.ink }}>
          {title}
        </span>
      </div>
      {actions}
    </div>
  )
}

// ── the filters ─────────────────────────────────────────────────────────────

export interface W3FeedFilter<K extends string> { key: K; label: string; count?: number }

/**
 * THE CHIPS FILTER SOMETHING, OR THEY ARE NOT DRAWN.
 *
 * The pen shows Crew / Alle / Challenges / Rekorde. Two of those have nothing
 * behind them in this app — there is no non-crew feed to widen to, and no
 * per-member record flag to filter on — so the row carries the three cuts the
 * data can actually make. A chip that filters nothing is a dead control, and
 * this repository grows those faster than it removes them.
 *
 * A cut with no rides is rendered DISABLED rather than hidden: a row that
 * changes length as rides arrive is a row a rider cannot aim at.
 */
export function W3FeedFilters<K extends string>({ value, options, onChange, layoutId }: {
  value: K
  options: W3FeedFilter<K>[]
  onChange: (k: K) => void
  /**
   * UNIQUE PER MOUNTED ROW, and this is not optional when two rows exist.
   *
   * The lit pill is a shared-layout element. Two rows carrying the same id
   * make Framer treat them as ONE pill and fly it from the first row to the
   * second — so the first row's selected chip is left with no pill under it,
   * and since its label is dark-on-acid it becomes dark-on-nothing. The chip
   * does not look wrong; it disappears.
   *
   * `W3GrainSwitch` documents this hazard and takes the id as a prop. This
   * component hardcoded one, and the moment the crew screen grew a second row
   * the tab row's "Feed" vanished.
   */
  layoutId: string
}) {
  const reduce = useReducedMotion()
  return (
    <div role="tablist" style={{
      display: 'flex', gap: 8, width: '100%', overflowX: 'auto',
      padding: '0 20px', scrollbarWidth: 'none',
    }}>
      {options.map((o) => {
        const on = o.key === value
        const empty = o.count === 0
        return (
          <button
            key={o.key} role="tab" aria-selected={on} disabled={empty}
            onClick={() => onChange(o.key)}
            style={{
              position: 'relative', flex: 'none', border: 0, borderRadius: 100,
              padding: '10px 18px', cursor: empty ? 'default' : 'pointer',
              background: on ? 'transparent' : T.surface2,
              fontFamily: FONT, opacity: empty ? 0.4 : 1,
            }}>
            {on && (
              <motion.span
                layoutId={layoutId}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
                style={{ position: 'absolute', inset: 0, borderRadius: 100, background: T.acid }}
              />
            )}
            <span style={{
              position: 'relative', fontSize: 13, fontWeight: 700, letterSpacing: -0.2,
              color: on ? T.bg : T.mid,
            }}>{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── the crew's shared goal ──────────────────────────────────────────────────

/**
 * KOLLEKTIV · WOCHENZIEL, drawn as a segmented meter.
 *
 * The pen gives this card its own violet, and it keeps it: this is the one
 * block on the feed that is about the crew as a body rather than any rider in
 * it, and it is the only place the app's second colour means something rather
 * than decorating. Every other accent on the screen is acid.
 *
 * The meter is 22 steps, the same count as the docks on Today, Fahrten and
 * Erfolge, so a rider reads one meter language across the whole app.
 */
export function W3CollectiveGoal({
  km, goalKm, pct, riders, daysLeft, onContribute,
}: {
  km: number
  goalKm: number
  pct: number
  riders: number
  /** Null when the goal has no end date — the card then simply does not say. */
  daysLeft: number | null
  onContribute?: () => void
}) {
  const reduce = useReducedMotion()
  const SEGMENTS = 22
  const filled = Math.round(Math.max(0, Math.min(1, pct)) * SEGMENTS)
  const nf = new Intl.NumberFormat('de-DE')

  return (
    <div style={{
      ...lux(26), padding: '18px 18px 16px', gap: 14,
      // The card's own ground, not a flat tile: the crew block is the one
      // object on the feed that is not a rider's post, and it has to read as
      // a different KIND of thing at a glance.
      background: `linear-gradient(155deg, ${THEM_TINT}2E, ${T.surface} 62%)`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
        <Users size={13} color={THEM_TINT} strokeWidth={2.2} />
        <W3Eyebrow tone={THEM_TINT}>Kollektiv · Wochenziel</W3Eyebrow>
        <span style={{ marginLeft: 'auto', ...TNUM, fontSize: 19, fontWeight: 700, letterSpacing: -0.6, color: THEM_TINT }}>
          {Math.round(pct * 100)} %
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.6, color: T.ink, textWrap: 'balance' }}>
          {nf.format(goalKm)} km mit der Crew
        </span>
        {daysLeft != null && (
          <span style={{ flex: 'none', fontSize: 11, fontWeight: 600, color: T.mid }}>
            {daysLeft === 1 ? '1 Tag übrig' : `${daysLeft} Tage übrig`}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 3, width: '100%', height: 22, alignItems: 'flex-end' }} aria-hidden>
        {Array.from({ length: SEGMENTS }).map((_, i) => (
          <motion.span key={i}
            initial={reduce ? false : { opacity: 0.25, scaleY: 0.5 }}
            animate={{ opacity: 1, scaleY: 1 }}
            transition={{ duration: 0.3, ease: EASE, delay: reduce ? 0 : (i < filled ? i * 0.016 : 0) }}
            style={{
              flex: 1, height: '100%', borderRadius: 3, transformOrigin: 'bottom',
              background: i < filled ? THEM_TINT : `${T.ink}12`,
            }} />
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
        {/* ONE LINE, OR IT COLLIDES. At "782 / 1.000 km · 9 Fahrer:innen" this
            wrapped and the second line ran under the button. The count keeps
            its own word and the line truncates rather than reflowing. */}
        <span style={{
          ...TNUM, fontSize: 12, fontWeight: 600, color: T.mid, minWidth: 0,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {/* "Fahrer:innen" truncated to "Fahrer:i…" beside the button. The
              short form fits whole, and a word that fits beats a longer one
              that does not. */}
          {nf.format(Math.round(km))} / {nf.format(goalKm)} km · {riders} dabei
        </span>
        {onContribute && (
          <button type="button" onClick={onContribute}
            style={{
              marginLeft: 'auto', flex: 'none', border: 0, borderRadius: 100,
              padding: '10px 16px', background: THEM_TINT, color: T.ink,
              fontFamily: FONT, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
            Beitragen <ArrowRight size={13} color={T.ink} />
          </button>
        )}
      </div>
    </div>
  )
}

/** The line the feed ends on. It exists so the column has a floor — a list
 *  that simply stops reads as one that failed to load its next page. */
export function W3FeedFoot({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '22px 20px 0' }}>
      <span style={{ width: 26, height: 1, background: T.rule }} />
      <span style={{ fontSize: 11.5, fontWeight: 600, color: T.quiet }}>{text}</span>
    </div>
  )
}
