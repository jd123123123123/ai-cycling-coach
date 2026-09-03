import { useState, type CSSProperties } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, Search, Users, X } from 'lucide-react'
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
 *
 * `actions` is the pen's right column: two `W3HeadAction`s in a row with a
 * gap of 8, which is the 84 the frame reserves. It is a slot rather than a
 * prop pair because the head is also mounted on screens that carry one
 * control, or none.
 */
export function W3FeedHead({ eyebrow, title, actions }: {
  eyebrow: string
  title: string
  actions?: React.ReactNode
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', gap: 12, width: '100%',
      // The pen's header is 358 wide inside a 390 frame, i.e. 16 of padding.
      // It stays at 20 here because the filter row, the posts and the foot
      // below it are all on the column's 20 — a header inset two pixels
      // further than everything under it reads as a misalignment, not as
      // fidelity to a frame nobody else in the column follows.
      padding: '0 20px', boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
        <W3Eyebrow>{eyebrow}</W3Eyebrow>
        {/* 30/700, the pen's own size. It was 34, which is a different note:
            at 34 the title outweighed Today's hero number and the feed —
            a list of other people's rides — became the loudest screen in the
            app. Tracking follows the size down from -1.4 to -1.2. */}
        <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: -1.2, lineHeight: 1, color: T.ink }}>
          {title}
        </span>
      </div>
      {actions}
    </div>
  )
}

/**
 * A 38×38 icon button for the head's right column.
 *
 * A SQUIRCLE, NOT A CIRCLE. Every round control in this app means "press the
 * thing in the middle of it" — the Beitragen pill, the chips, the coin. The
 * pen draws these two as rounded rects because they are FRAMES holding a
 * glyph, and the 12 radius against the 100 of everything else is what tells
 * a rider they are furniture rather than the screen's action.
 */
export function W3HeadAction({ icon, label, onClick, dot }: {
  /** A lucide icon element, already sized 17 — the pen's glyph box. */
  icon: React.ReactNode
  label: string
  onClick?: () => void
  /** The acid unread dot, top-right of the glyph. */
  dot?: boolean
}) {
  // :focus-visible cannot be written inline, and the app's stylesheet is not
  // this component's to extend, so the state is read off the element itself.
  // It defaults to shown if the engine cannot answer: a keyboard rider losing
  // the ring is a real failure, a mouse rider seeing one is a blemish.
  const [ring, setRing] = useState(false)

  return (
    <button
      type="button" onClick={onClick} aria-label={label}
      onFocus={(e) => {
        let visible = true
        try { visible = e.currentTarget.matches(':focus-visible') } catch { visible = true }
        setRing(visible)
      }}
      onBlur={() => setRing(false)}
      style={{
        position: 'relative', flex: 'none', width: 38, height: 38,
        display: 'grid', placeItems: 'center',
        border: 0, borderRadius: 12, background: T.d1,
        cursor: 'pointer', padding: 0, color: T.ink,
        outline: ring ? `2px solid ${T.acid}` : 'none', outlineOffset: 2,
      }}>
      <span style={{ position: 'relative', display: 'grid', placeItems: 'center', color: T.ink }}>
        {icon}
        {dot && (
          // On the GLYPH's corner, not the button's: hung off the button it
          // sat on the frame's own edge and read as a rendering artefact.
          <span aria-hidden style={{
            position: 'absolute', top: -2, right: -3, width: 7, height: 7,
            borderRadius: 100, background: T.acid,
          }} />
        )}
      </span>
    </button>
  )
}

/**
 * THE SEARCH FIELD THAT REPLACES THE HEAD.
 *
 * Not a field that opens under the title: at 390 the head is already the
 * whole width, and pushing a second full-width row in shifts every post down
 * the moment a rider taps a magnifier. It stands in the head's place, on the
 * head's own 20, so nothing below it moves at all.
 */
export function W3FeedSearch({ value, onChange, onClose }: {
  value: string
  onChange: (v: string) => void
  onClose: () => void
}) {
  const reduce = useReducedMotion()
  const [ring, setRing] = useState(false)

  return (
    <div
      style={{ width: '100%', padding: '0 20px', boxSizing: 'border-box' }}
      // Escape closes wherever focus sits in the row — the input or the X.
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}>
      <motion.div
        initial={reduce ? false : { opacity: 0, scaleX: 0.94 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={reduce ? { duration: 0 } : { duration: 0.24, ease: EASE }}
        style={{
          transformOrigin: 'right center',
          display: 'flex', alignItems: 'center', gap: 10,
          width: '100%', minWidth: 0, boxSizing: 'border-box',
          height: 44, padding: '0 12px', borderRadius: 14, background: T.d1,
        }}>
        <Search size={17} color={T.mid} strokeWidth={2} style={{ flex: 'none' }} aria-hidden />
        <input
          autoFocus
          // NOT type="search": WebKit hangs its own clear button inside the
          // field, which would put a second X beside the one this row draws.
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Feed durchsuchen"
          placeholder="Fahrer oder Fahrt suchen"
          className="w3-share-edit"
          style={{
            flex: 1, minWidth: 0, width: '100%',
            border: 0, outline: 'none', background: 'transparent',
            fontFamily: FONT, fontSize: 14, fontWeight: 600,
            color: T.ink, caretColor: T.acid,
            // `::placeholder` cannot be written inline; the class above reads
            // this variable, which is how the share sheet's fields already
            // colour theirs without a hex literal reaching the stylesheet.
            ['--w3-ph' as string]: T.quiet,
          } as CSSProperties} />
        <button
          type="button" onClick={onClose} aria-label="Suche schließen"
          onFocus={(e) => {
            let visible = true
            try { visible = e.currentTarget.matches(':focus-visible') } catch { visible = true }
            setRing(visible)
          }}
          onBlur={() => setRing(false)}
          style={{
            flex: 'none', width: 28, height: 28, display: 'grid', placeItems: 'center',
            border: 0, borderRadius: 100, background: 'transparent', padding: 0,
            cursor: 'pointer', color: T.mid,
            outline: ring ? `2px solid ${T.acid}` : 'none', outlineOffset: 1,
          }}>
          <X size={16} color={T.mid} strokeWidth={2.2} />
        </button>
      </motion.div>
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
      display: 'flex', gap: 7, width: '100%', overflowX: 'auto',
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
              // THE PEN'S OWN CHIP, and it has to be: `dly9G` carries FOUR of
              // them across 358px. At 13/700 on 18px padding the row measured
              // ~370 and "Rekorde" hung off the right edge of a 390 phone —
              // the chips scrolled, so nothing looked broken, it was just
              // permanently half a chip short of complete.
              padding: '8px 13px', cursor: empty ? 'default' : 'pointer',
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
              position: 'relative', fontSize: 12, letterSpacing: -0.1,
              // The pen weights the lit chip 700 and the rest 600. One row of
              // four 700s is the weight inflation this design system keeps
              // catching itself doing.
              fontWeight: on ? 700 : 600,
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
