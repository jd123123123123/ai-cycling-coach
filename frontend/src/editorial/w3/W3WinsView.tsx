import type { ReactNode } from 'react'
import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ChevronDown, ChevronRight, Lock, Share2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { T, FONT, DASH, EASE, Reveal, band } from './w3tokens'
import { lux, hairline, TNUM } from './w3surfaces'
import W3WinsRhythm, { W3ConsistencyGrid, type W3RhythmVm } from './W3WinsRhythm'
import type { W3WinsDockVm } from './W3WinsDockPanel'
import './w3.css'

/**
 * W3 · 20 ERFOLGE — the rider's own record, in six chapters.
 *
 * Transcribed from pen frame `chj4T`. What changed on the way in, and why:
 *
 * ── THE CARDS ARE LIT, NOT FRAMED ────────────────────────────────────────
 * The pen draws every card with a 1px stroke and a radial wash. That is the
 * older idiom — house rule 2, and `W3TodayView` carries zero borders. A screen
 * of stroked cards reads as a stack of boxes; `lux()` gives the same objects
 * depth from tone and light instead. Composition, order and every instrument
 * are the pen's; the edge treatment is the app's.
 *
 * ── THE BIKE IS THE TOP OF THE SCREEN ────────────────────────────────────
 * The pen opens on its own hero card. In the app this screen is a room — the
 * same mounted stage Today and the rides use — so the machine stands above and
 * this page's summary rides in the panel over the floor (`useHeroPanel`). The
 * pen's hero becomes chapter 01, which is where it always belonged: it is the
 * screen's first ARGUMENT, not its title.
 *
 * ── EVERY SENTENCE IS COMPUTED ───────────────────────────────────────────
 * The pen's statements carry drawn-in specifics ("284 Fahrten", "Vier davon hat
 * vor dir niemand in deiner Crew geholt"). The last of those is a claim this
 * app cannot check, and house rule 9 is that a section which cannot be true
 * gets deleted rather than polished. So the voice is the pen's and the numbers
 * are the rider's: the page composes each line from what actually resolved, and
 * a chapter whose data is missing does not render at all.
 *
 * The register is plain and descriptive — the sentence states what the number
 * is, and stops. No aphorisms, nothing the rider has to decode.
 */

// ── the view model ──────────────────────────────────────────────────────────

export interface W3WinsLedgerItem {
  key: string
  value: string
  unit?: string | null
  label: string
}

/** One bar of the threshold history, oldest first. `pct` is its height as a
 *  share of the highest measurement, so the series is read against itself. */
export interface W3FtpPoint { pct: number; current: boolean }

export interface W3FtpChapter {
  eyebrow: string
  statement: string
  firstLabel: string
  firstValue: string
  nowLabel: string
  nowValue: string
  unit: string
  points: W3FtpPoint[]
  caption: string
}

export interface W3Milestone {
  key: string
  icon: LucideIcon
  title: string
  value: string
  pct: number | null
  /** What the badge actually asks of the rider — the server's own `detail`.
   *  It was always in the payload and this screen never drew it. */
  detail: string | null
  /** How much is left, already worded ("noch 16 Fahrten"). */
  remaining: string | null
}

export interface W3MilestoneChapter {
  eyebrow: string
  statement: string
  rows: W3Milestone[]
}

/** Season, month and week are one chapter with a switch, not three chapters —
 *  see `W3WinsRhythm` for why. The 52-week grid lives inside it. */
export interface W3RhythmChapter {
  eyebrow: string
  statement: string
  rhythm: W3RhythmVm
}

/** The 52-week heat grid. Its own chapter because it answers a different
 *  question from the rhythm card — "did you show up", not "how much" — and one
 *  instrument trying to be both is what made the card unreadable. */
export interface W3ConsistencyChapter {
  eyebrow: string
  statement: string
  streakLabel: string
  streak: string
  weeks: { start: string; rides: number; minutes: number }[]
}

export interface W3Beam {
  key: string
  label: string
  /** The rider's ALL-TIME best at this duration — the track's full length. */
  value: string
  unit: string
  /** The fill: their best in the trailing 90 days, as a share of the record.
   *  0 when they have not ridden that duration hard recently at all. */
  frac: number
  /** That recent best in watts, and as a percentage of the record. */
  recent: string | null
  pct: number | null
  date: string | null
  fresh: boolean
  /** Recent equals the record — they are on their best right now. */
  atBest: boolean
}

export interface W3BeamChapter {
  eyebrow: string
  statement: string
  colLeft: string
  colRight: string
  beams: W3Beam[]
}

export interface W3Medal {
  key: string
  icon: LucideIcon
  title: string
  /** Earned: the month it landed. Locked: how far along, as a percentage. */
  note: string
  earned: boolean
  /** The server's `detail` — what it took, or what it will take. */
  detail: string | null
  /** Earned badges: the full date. Locked: the progress line. */
  sub: string | null
  pct: number | null
}

export interface W3MedalChapter {
  eyebrow: string
  counter: string
  statement: string
  medals: W3Medal[]
}

export interface W3BiggestDayChapter {
  eyebrow: string
  statement: string
  title: string
  km: string
  kmUnit: string
  time: string
  ascent: string
  ascentUnit: string
  badges: { label: string; icon: LucideIcon }[]
  cta: string
  onShare?: () => void
}

export interface W3WinsVm {
  micro: string
  ledger: W3WinsLedgerItem[]
  dock: W3WinsDockVm
  ftp: W3FtpChapter | null
  milestones: W3MilestoneChapter | null
  rhythm: W3RhythmChapter | null
  consistency: W3ConsistencyChapter | null
  beams: W3BeamChapter | null
  medals: W3MedalChapter | null
  biggestDay: W3BiggestDayChapter | null
  /** The door to the challenges surface — live counts, no fixture. Null while
   *  the feed is unresolved. The nav menu used to promise "Challenges" under
   *  Erfolge while the tab held none; now the tab holds the door. */
  challenges: { line: string; sub: string; onOpen: () => void } | null
  /** Shown only when NOTHING resolved — a rider with no rides yet. */
  empty: string | null
  /** Nothing has arrived yet. Distinct from `empty`, which is a FINDING; this
   *  is the absence of one, and the two used to be conflated into a body that
   *  rendered nothing at all. */
  loading: boolean
}

// ── the parts ───────────────────────────────────────────────────────────────

/**
 * ── THE PAGE HAS TIERS NOW, AND THEY ARE MADE BY RESTRAINT ────────────────
 *
 * Six chapters used to open identically: an acid eyebrow and a 19px/700
 * statement, every one. Nineteen acid references and nineteen 700-weights on
 * one screen, which is this app's documented recurring design bug — the page
 * was loud rather than wrong, and a reader scanning it found no argument
 * because every chapter insisted equally.
 *
 * The fix is NOT a louder hero. Tier 1 keeps exactly what all six used to
 * have; tiers 2 and 3 give some of it back. The accent now marks the two
 * chapters that carry the page — the rider's rhythm and their biggest day —
 * and the supporting chapters are set in ink and the lists in mid. Contrast
 * comes from the quiet ones being quiet.
 */
type Tier = 1 | 2 | 3

const EYEBROW_TONE: Record<Tier, string> = { 1: T.acid, 2: T.mid, 3: T.quiet }
const STATEMENT_SIZE: Record<Tier, number> = { 1: 22, 2: 19, 3: 15.5 }
const STATEMENT_TONE: Record<Tier, string> = { 1: T.ink, 2: T.ink, 3: T.mid }

function Eyebrow({ text, counter, tier = 2 }: { text: string; counter?: string; tier?: Tier }) {
  return (
    <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.4, color: EYEBROW_TONE[tier] }}>{text}</span>
      {counter && (
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.2, color: T.quiet, ...TNUM }}>{counter}</span>
      )}
    </div>
  )
}

/** The chapter's one sentence. It says what the number is; it does not sell. */
function Statement({ children, tier = 2 }: { children: ReactNode; tier?: Tier }) {
  return (
    <span style={{
      fontSize: STATEMENT_SIZE[tier],
      fontWeight: tier === 3 ? 600 : 700,
      letterSpacing: tier === 3 ? -0.2 : -0.6,
      lineHeight: 1.2, color: STATEMENT_TONE[tier], textWrap: 'balance',
    }}>
      {children}
    </span>
  )
}

function Chapter({ children, pad = 30 }: { children: ReactNode; pad?: number }) {
  return (
    <Reveal style={{ width: '100%' }}>
      <div style={{ ...band(pad), gap: 14 }}>{children}</div>
    </Reveal>
  )
}

/** A quiet all-caps label — the one text rung every card head uses. */
function Cap({ children }: { children: ReactNode }) {
  return <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1.2, color: T.quiet }}>{children}</span>
}

// ── 01 · the threshold ──────────────────────────────────────────────────────

/** The floor of the truncated axis, as a fraction of the lowest reading. 0.92
 *  leaves the smallest bar a visible stub rather than a hairline. */
const FTP_FLOOR = 0.92
const FTP_TRACK = 56

function barHeight(pct: number, all: W3FtpPoint[]): number {
  const floor = Math.min(...all.map((p) => p.pct)) * FTP_FLOOR
  const span = 1 - floor
  const h = span > 0 ? (pct - floor) / span : 1
  return Math.round(6 + Math.max(0, Math.min(1, h)) * (FTP_TRACK - 6))
}

function FtpCard({ c }: { c: W3FtpChapter }) {
  const reduce = useReducedMotion()
  return (
    <div style={{ ...lux(24), padding: '18px 18px 16px', gap: 16 }}>
      <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Cap>{c.firstLabel}</Cap>
          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }}>
            <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: -1, lineHeight: 1, color: T.mid, ...TNUM }}>{c.firstValue}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: T.quiet, paddingBottom: 2 }}>{c.unit}</span>
          </div>
        </div>
        <span aria-hidden style={{ fontSize: 17, color: T.quiet, lineHeight: 1 }}>→</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end' }}>
          <Cap>{c.nowLabel}</Cap>
          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }}>
            <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: -1, lineHeight: 1, color: T.acid, ...TNUM }}>{c.nowValue}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: T.quiet, paddingBottom: 2 }}>{c.unit}</span>
          </div>
        </div>
      </div>

      <div style={hairline(0)} />

      {/* Every measurement the app has kept. The current one is the lit bar; the
          others are the same colour held back, so the series reads as one thing
          getting brighter.

          THE AXIS IS TRUNCATED, ON PURPOSE AND SAFELY. Zero-based, a threshold
          series is unreadable: 214 → 292 W means every bar lands between 73%
          and 100% of the same height, and a 36% gain draws as a flat wall (seen
          at 390x844 before this). The floor sits just under the lowest
          measurement so the growth is legible — and it is only ever paired with
          BOTH endpoints printed in full above it, which is what keeps a
          truncated axis honest rather than flattering. */}
      <div style={{ display: 'flex', width: '100%', height: 56, alignItems: 'flex-end', gap: 4 }}>
        {c.points.map((p, i) => (
          <motion.div
            key={i}
            initial={reduce ? false : { height: 6 }}
            animate={{ height: barHeight(p.pct, c.points) }}
            transition={{ duration: 0.5, delay: reduce ? 0 : i * 0.03 }}
            style={{ flex: 1, borderRadius: 3, background: p.current ? T.acid : `${T.acid}52` }} />
        ))}
      </div>

      <span style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.45, color: T.mid }}>{c.caption}</span>
    </div>
  )
}

// ── 02 · the milestones ─────────────────────────────────────────────────────

/**
 * A milestone row that OPENS. Apple's Fitness badges work this way and it is
 * the right instinct: the grid is for scanning, the detail is for the one you
 * cared enough to touch.
 *
 * What it opens onto was never invented for this — `detail` has been in the
 * `/achievements/mine` payload since the endpoint was written, carrying the
 * badge's actual condition in the rider's own language, and this screen threw
 * it away and drew a bar. Finished machinery with no door, which is this
 * repository's most expensive recurring shape.
 */
function MilestoneRow({ m }: { m: W3Milestone }) {
  const Ic = m.icon
  const reduce = useReducedMotion()
  const [open, setOpen] = useState(false)
  const pct = m.pct != null ? Math.round(Math.max(0, Math.min(1, m.pct)) * 100) : null
  const openable = !!(m.detail || m.remaining)

  return (
    <button
      onClick={() => openable && setOpen((o) => !o)}
      aria-expanded={openable ? open : undefined}
      style={{
        display: 'flex', width: '100%', gap: 14, alignItems: 'flex-start', padding: '14px 0',
        border: 0, background: 'transparent', textAlign: 'left', fontFamily: FONT,
        cursor: openable ? 'pointer' : 'default',
      }}
    >
      <div style={{ width: 40, height: 40, borderRadius: 100, flex: 'none', background: T.tile, display: 'grid', placeItems: 'center' }}>
        <Ic size={19} strokeWidth={1.8} color={T.acid} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 9, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.title}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: T.quiet, ...TNUM }}>{m.value}</span>
            {openable && (
              <motion.span
                animate={{ rotate: open ? 180 : 0 }}
                transition={{ duration: reduce ? 0 : 0.22, ease: EASE }}
                style={{ display: 'grid', placeItems: 'center' }}
              >
                <ChevronDown size={13} color={T.quiet} />
              </motion.span>
            )}
          </span>
        </div>
        <div style={{ width: '100%', height: 3, borderRadius: 100, background: T.d1, overflow: 'hidden' }}>
          {m.pct != null && (
            <motion.div
              initial={reduce ? false : { width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              style={{ height: 3, borderRadius: 100, background: T.acid }} />
          )}
        </div>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={reduce ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={reduce ? undefined : { height: 0, opacity: 0 }}
              transition={{ duration: 0.26, ease: EASE }}
              style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 5 }}
            >
              {m.detail && (
                <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.45, color: T.mid, paddingTop: 2 }}>{m.detail}</span>
              )}
              <div style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
                {pct != null && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.acid, ...TNUM }}>{pct} %</span>
                )}
                {m.remaining && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: T.quiet }}>{m.remaining}</span>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </button>
  )
}

// ── 03 · the rhythm ────────────────────────────────────────────────────────
// Season, month and week now live in `W3WinsRhythm` as one switchable card.
// The 52-week grid went with them: it is the WEEK grain of that instrument,
// and leaving a copy here would have been two places to keep in step.

// ── 04 · the power curve ────────────────────────────────────────────────────

/**
 * One duration of the rider's curve, drawn as a filled rail.
 *
 * The readout FLIPS: on a wide bar it sits inside in dark ink, on a narrow one
 * it sits outside in light. A number half-on and half-off its own bar is the
 * failure mode, and at 254px the 5-second peak fills nearly everything while
 * the 20-minute one fills a third.
 */
/**
 * ── THE BAR IS NOT A SHARE OF THE BIGGEST NUMBER ANY MORE ─────────────────
 *
 * It used to be each duration as a fraction of the rider's 5-second peak,
 * which drew a true but useless picture: a sprint is always bigger than an
 * hour, so the chart said "you are a human" and nothing about this rider.
 *
 * Now the TRACK IS THE RECORD and the FILL IS TODAY. Every duration's track
 * is the same length because every one is that duration's all-time best — the
 * envelope has no date filter, so it IS the record book — and the fill is
 * their best over the trailing 90 days. So a full bar means "on my best right
 * now" and a half-empty one means "my record here is old", which is the
 * comparison a rider actually wants and the one the page never offered.
 *
 * An untested duration draws EMPTY, not full. No recent effort is not the
 * same as a maintained one, and a full bar would have claimed the opposite.
 */
function Beam({ b }: { b: W3Beam }) {
  const reduce = useReducedMotion()
  const pctW = Math.round(Math.max(0, Math.min(1, b.frac)) * 100)
  const lit = b.fresh || b.atBest
  // Only the LEFT readout sits inside the bar, so only it has to ask what it
  // is standing on. The comparison moved out to its own column (below), which
  // is what stopped it straddling the fill edge at 88 % and being half dark
  // text on acid and half on the track.
  const onFill = lit && pctW > 34
  return (
    <div style={{ display: 'flex', width: '100%', gap: 9, alignItems: 'center' }}>
      <span style={{ width: 46, flex: 'none', fontSize: 12, fontWeight: 700, letterSpacing: -0.2, color: T.ink }}>{b.label}</span>
      <div style={{ position: 'relative', flex: 1, height: 34 }}>
        {/* The record: the full track, always. */}
        <div style={{ position: 'absolute', inset: 0, borderRadius: 9, background: T.d1 }} />
        <motion.div
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${pctW}%` }}
          transition={{ duration: 0.6, ease: EASE }}
          style={{
            position: 'absolute', left: 0, top: 0, height: 34, borderRadius: 9,
            background: lit ? T.acid : T.d2,
          }} />
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: 6,
          justifyContent: 'space-between', padding: '0 12px',
        }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{
              fontSize: 15.5, fontWeight: 700, letterSpacing: -0.4, ...TNUM,
              color: onFill ? T.bg : T.ink,
            }}>{b.value}</span>
            <span style={{ fontSize: 9.5, fontWeight: 600, color: onFill ? `${T.bg}A6` : T.quiet }}>{b.unit}</span>
          </span>
          {b.fresh && (
            <span style={{
              fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, borderRadius: 100, padding: '3px 7px',
              flex: 'none', background: onFill ? `${T.bg}1F` : T.acidDim, color: onFill ? T.bg : T.acid,
            }}>NEU</span>
          )}
        </div>
      </div>
      {/* HOW CLOSE TODAY IS TO THE RECORD, in its own column on the card's own
          ground. Outside the bar it never fights the fill for contrast, and
          six of them line up as a column a rider can read down. */}
      <span style={{
        width: 40, flex: 'none', textAlign: 'right', fontSize: 10, fontWeight: 700, ...TNUM,
        color: b.atBest ? T.acid : b.pct == null ? T.quiet : T.mid,
      }}>{b.atBest ? 'BEST' : b.pct == null ? DASH : `${b.pct} %`}</span>
    </div>
  )
}

/**
 * A badge that OPENS, the way Apple's Fitness awards do.
 *
 * The disc alone can only say earned-or-not. Everything that makes a badge
 * mean anything — what it took, when it landed, how close the locked one is —
 * was already in the payload and had nowhere to go: the grid printed a title
 * and a month and threw `detail` away.
 *
 * The panel opens BELOW THE WHOLE SHELF rather than inside the tile, because a
 * tile is 90px wide and a sentence is not. One open at a time, so the shelf
 * never reflows into a column of essays.
 */
function Medal({ m, open, onToggle }: { m: W3Medal; open: boolean; onToggle: () => void }) {
  const Ic = m.earned ? m.icon : Lock
  const reduce = useReducedMotion()
  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      aria-label={m.title}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9, width: 90,
        border: 0, background: 'transparent', cursor: 'pointer', fontFamily: FONT, padding: 0,
      }}
    >
      <motion.div
        animate={reduce ? undefined : { scale: open ? 1.08 : 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 26 }}
        style={{
          width: 62, height: 62, borderRadius: 100, display: 'grid', placeItems: 'center',
          background: m.earned ? T.acid : T.tile,
          // The open badge is ringed rather than recoloured: the acid already
          // means "earned" here and must not also come to mean "selected".
          boxShadow: open
            ? `0 0 0 2px ${T.ink}, 0 0 22px ${m.earned ? `${T.acid}3D` : 'transparent'}`
            : m.earned ? `0 0 22px ${T.acid}3D` : 'none',
        }}>
        <Ic size={25} strokeWidth={m.earned ? 1.9 : 2.2} color={m.earned ? T.bg : T.quiet} />
      </motion.div>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.8, color: m.earned ? T.ink : T.quiet, textAlign: 'center', lineHeight: 1.25 }}>{m.title}</span>
      <span style={{ fontSize: 9, fontWeight: 600, color: T.quiet, ...TNUM }}>{m.note}</span>
    </button>
  )
}

/** The panel the open badge drops into, under the shelf. */
function MedalDetail({ m }: { m: W3Medal }) {
  const reduce = useReducedMotion()
  const Ic = m.earned ? m.icon : Lock
  return (
    <motion.div
      initial={reduce ? false : { height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={reduce ? undefined : { height: 0, opacity: 0 }}
      transition={{ duration: 0.26, ease: EASE }}
      style={{ overflow: 'hidden', width: '100%' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 18 }}>
        <div style={hairline(0)} />
        <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', paddingTop: 14 }}>
          <Ic size={16} strokeWidth={1.9} color={m.earned ? T.acid : T.quiet} style={{ flex: 'none', marginTop: 1 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: -0.2, color: T.ink }}>{m.title}</span>
            {m.detail && (
              <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.45, color: T.mid }}>{m.detail}</span>
            )}
            {m.sub && (
              <span style={{ fontSize: 11, fontWeight: 600, color: m.earned ? T.acid : T.quiet, ...TNUM }}>{m.sub}</span>
            )}
            {!m.earned && m.pct != null && (
              <div style={{ width: '100%', height: 3, borderRadius: 100, background: T.d1, overflow: 'hidden', marginTop: 3 }}>
                <motion.div
                  initial={reduce ? false : { width: 0 }}
                  animate={{ width: `${Math.round(Math.max(0, Math.min(1, m.pct)) * 100)}%` }}
                  transition={{ duration: 0.5, ease: EASE }}
                  style={{ height: 3, borderRadius: 100, background: T.acid }} />
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

/** The shelf, holding which badge is open. */
function MedalShelf({ medals }: { medals: W3Medal[] }) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [all, setAll] = useState(false)
  // Six on the shelf, the whole cabinet behind one press. The open detail
  // panel keeps working across the fold because `open` is looked up in the
  // full list, not the visible slice.
  const visible = all ? medals : medals.slice(0, 6)
  const open = visible.find((m) => m.key === openKey) ?? null
  return (
    <div style={{ ...lux(24), padding: '24px 18px 22px', gap: 0 }}>
      <div style={{ display: 'flex', width: '100%', flexWrap: 'wrap', rowGap: 26, justifyContent: 'space-between' }}>
        {visible.map((m) => (
          <Medal key={m.key} m={m} open={m.key === openKey}
                 onToggle={() => setOpenKey((k) => (k === m.key ? null : m.key))} />
        ))}
      </div>
      <AnimatePresence initial={false}>
        {open && <MedalDetail key={open.key} m={open} />}
      </AnimatePresence>
      {medals.length > 6 && (
        <button type="button" onClick={() => setAll((v) => !v)}
          style={{
            marginTop: 18, height: 42, borderRadius: 100, border: 0, width: '100%',
            background: T.tile, color: T.mid, fontSize: 12, fontWeight: 700,
            cursor: 'pointer', fontFamily: FONT,
          }}>
          {all ? 'Weniger anzeigen' : `Alle ${medals.length} anzeigen`}
        </button>
      )}
    </div>
  )
}

// ── 06 · the biggest day ────────────────────────────────────────────────────

function BiggestDayCard({ c }: { c: W3BiggestDayChapter }) {
  return (
    <div style={{ ...lux(24), position: 'relative', overflow: 'hidden', padding: '22px 18px 18px', gap: 18 }}>
      {/* The one glow on the page. It marks the single best thing the rider
          has done, which is the only place a flourish is not decoration. */}
      <div aria-hidden style={{
        position: 'absolute', top: -120, right: -70, width: 300, height: 300, borderRadius: '50%',
        background: `radial-gradient(closest-side, ${T.acid}2E, transparent)`, pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Cap>{c.title}</Cap>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end' }}>
            <span style={{ fontSize: 56, fontWeight: 700, letterSpacing: -2.4, lineHeight: 0.9, color: T.ink, ...TNUM }}>{c.km}</span>
            <span style={{ fontSize: 18, fontWeight: 600, color: T.quiet, paddingBottom: 5 }}>{c.kmUnit}</span>
          </div>
          <div style={{ display: 'flex', gap: 18, paddingBottom: 5 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Cap>ZEIT</Cap>
              <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.3, color: T.ink, ...TNUM }}>{c.time}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Cap>HÖHE</Cap>
              <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.3, color: T.ink, ...TNUM }}>
                {c.ascent}<span style={{ fontSize: 10, fontWeight: 600, color: T.quiet }}> {c.ascentUnit}</span>
              </span>
            </div>
          </div>
        </div>

        {c.badges.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {c.badges.map((b) => {
              const Ic = b.icon
              return (
                <span key={b.label} style={{
                  display: 'flex', alignItems: 'center', gap: 5, borderRadius: 100, padding: '6px 11px',
                  background: T.tile, fontSize: 9, fontWeight: 700, letterSpacing: 1, color: T.ink,
                }}>
                  <Ic size={11} color={T.acid} />{b.label}
                </span>
              )
            })}
          </div>
        )}

        <button onClick={c.onShare} style={{
          width: '100%', height: 46, borderRadius: 100, border: 0, background: T.acid, color: T.bg,
          fontFamily: FONT, fontSize: 14.5, fontWeight: 700, cursor: 'pointer',
          display: 'flex', gap: 7, justifyContent: 'center', alignItems: 'center',
        }}>
          <Share2 size={15} color={T.bg} />{c.cta}
        </button>
      </div>
    </div>
  )
}

// ── the screen ──────────────────────────────────────────────────────────────

/**
 * THE BODY MUST NEVER BE ZERO PIXELS TALL.
 *
 * It could be, and that is what a rider saw as "black under the nudge": the
 * dock is portalled into the room and renders on its own, while everything
 * below it is this component — and with every chapter still null and
 * `empty` suppressed because the reads were in flight, this returned an empty
 * fragment. No skeleton, no message, no height. A perfectly black page under
 * a working panel, on a screen that had simply not finished loading (or whose
 * power-curve read had failed, which nothing here was watching for).
 *
 * Four bars is not a guess at the layout — it is a deliberate placeholder
 * that occupies roughly a chapter each, so the page does not jump when the
 * real ones arrive.
 */
function LoadingChapters() {
  return (
    <div style={{ ...band(30), gap: 22 }} aria-busy="true" aria-label="Erfolge werden geladen">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 10 }}>
          <div style={{ width: 108, height: 9, borderRadius: 100, background: T.d1 }} />
          <div style={{ width: '72%', height: 17, borderRadius: 6, background: T.d1 }} />
          <div style={{ width: '100%', height: 128, borderRadius: 24, background: T.surface }} />
        </div>
      ))}
    </div>
  )
}

export function W3WinsContent({ vm }: { vm: W3WinsVm }) {
  if (vm.loading) return <LoadingChapters />
  if (vm.empty) {
    return (
      <div style={{ ...band(40), paddingTop: 24, gap: 12 }}>
        <Eyebrow text="ERFOLGE" />
        <Statement>{vm.empty}</Statement>
      </div>
    )
  }
  return (
    <>
      {/* ── TIER 1 · the rhythm opens the page ────────────────────────────
          It used to be chapter 03, behind the threshold. But "do you actually
          ride" is the question every other chapter on this screen depends on:
          a threshold, a power curve and a cabinet of badges are all downstream
          of showing up. It is the page's first argument, so it goes first. */}
      {vm.rhythm && (
        <Chapter>
          <Eyebrow text={vm.rhythm.eyebrow} tier={1} />
          <Statement tier={1}>{vm.rhythm.statement}</Statement>
          <W3WinsRhythm vm={vm.rhythm.rhythm} />
        </Chapter>
      )}

      {/* ── TIER 2 · what the riding produced ─────────────────────────────── */}
      {vm.ftp && (
        <Chapter>
          <Eyebrow text={vm.ftp.eyebrow} />
          <Statement>{vm.ftp.statement}</Statement>
          <FtpCard c={vm.ftp} />
        </Chapter>
      )}

      {vm.beams && (
        <Chapter>
          <Eyebrow text={vm.beams.eyebrow} />
          <Statement>{vm.beams.statement}</Statement>
          <div style={{ ...lux(24), padding: '18px 18px 16px', gap: 14 }}>
            <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
              <Cap>{vm.beams.colLeft}</Cap>
              <Cap>{vm.beams.colRight}</Cap>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 9 }}>
              {vm.beams.beams.map((b) => <Beam key={b.key} b={b} />)}
            </div>
          </div>
        </Chapter>
      )}

      {/* ── TIER 3 · showing up, a year at a time ────────────────────────── */}
      {vm.consistency && (
        <Chapter>
          <Eyebrow text={vm.consistency.eyebrow} counter={vm.consistency.streak} tier={3} />
          <Statement tier={3}>{vm.consistency.statement}</Statement>
          <div style={{ ...lux(24), padding: '18px 18px 16px', gap: 14 }}>
            <W3ConsistencyGrid weeks={vm.consistency.weeks} />
          </div>
        </Chapter>
      )}

      {/* ── TIER 3 · the lists ─────────────────────────────────────────────
          Both of these are inventories rather than arguments — a rider scans
          them, they do not read them. They keep their instruments and give
          back the accent and the type size. */}
      {vm.milestones && (
        <Chapter>
          <Eyebrow text={vm.milestones.eyebrow} tier={3} />
          <Statement tier={3}>{vm.milestones.statement}</Statement>
          <div style={{ ...lux(24), padding: '6px 18px 8px' }}>
            {vm.milestones.rows.map((m, i) => (
              <div key={m.key} style={{ width: '100%' }}>
                {i > 0 && <div style={hairline(0)} />}
                <MilestoneRow m={m} />
              </div>
            ))}
          </div>
        </Chapter>
      )}

      {vm.medals && (
        <div id="w3-wins-medals" style={{ width: '100%' }}>
          <Chapter>
            <Eyebrow text={vm.medals.eyebrow} counter={vm.medals.counter} tier={3} />
            <Statement tier={3}>{vm.medals.statement}</Statement>
            <MedalShelf medals={vm.medals.medals} />
          </Chapter>
        </div>
      )}

      {/* ── the door to the challenges board ─────────────────────────────
          A link card, not a chapter of its own instruments: the board lives at
          /e/w3-challenges and this is its one honest entry from the tab that
          claims it. */}
      {vm.challenges && (
        <Chapter>
          <button type="button" onClick={vm.challenges.onOpen}
            style={{
              ...lux(24), width: '100%', border: 0, cursor: 'pointer', textAlign: 'left',
              padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12, fontFamily: FONT,
            }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: -0.3, color: T.ink }}>{vm.challenges.line}</span>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: T.quiet }}>{vm.challenges.sub}</span>
            </div>
            <ChevronRight size={18} color={T.quiet} />
          </button>
        </Chapter>
      )}

      {/* ── TIER 1 · the single best thing the rider has done ─────────────── */}
      {vm.biggestDay && (
        <Chapter pad={40}>
          <Eyebrow text={vm.biggestDay.eyebrow} tier={1} />
          <Statement tier={1}>{vm.biggestDay.statement}</Statement>
          <BiggestDayCard c={vm.biggestDay} />
        </Chapter>
      )}
    </>
  )
}

/* The three-stat dock that used to live here is gone. Erfolge opens on ONE
 * number and the meter that IS that number now (`W3WinsDockPanel`), which is
 * the idiom Today, Fahrten and Plan already shared and this screen did not.
 * Deleted rather than left exported: a second dock nothing mounts is how this
 * repository grows the finished-machinery-with-no-door bug. */
