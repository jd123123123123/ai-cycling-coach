import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Lock, Share2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { T, FONT, DASH, Reveal, band } from './w3tokens'
import { lux, hairline, TNUM } from './w3surfaces'
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
}

export interface W3MilestoneChapter {
  eyebrow: string
  statement: string
  rows: W3Milestone[]
}

export interface W3ConsistencyChapter {
  eyebrow: string
  statement: string
  riddenLabel: string
  ridden: string
  ofLabel: string
  streakLabel: string
  streak: string
  /** 0 = not ridden, then 1..3 by how much was ridden that week. */
  weeks: number[]
}

export interface W3Beam {
  key: string
  label: string
  value: string
  unit: string
  /** Width of the bar as a share of the rider's own peak. */
  frac: number
  date: string | null
  fresh: boolean
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
  ftp: W3FtpChapter | null
  milestones: W3MilestoneChapter | null
  consistency: W3ConsistencyChapter | null
  beams: W3BeamChapter | null
  medals: W3MedalChapter | null
  biggestDay: W3BiggestDayChapter | null
  /** Shown only when NOTHING resolved — a rider with no rides yet. */
  empty: string | null
}

// ── the parts ───────────────────────────────────────────────────────────────

/** The acid eyebrow every chapter opens on, with an optional counter opposite. */
function Eyebrow({ text, counter }: { text: string; counter?: string }) {
  return (
    <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.4, color: T.acid }}>{text}</span>
      {counter && (
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.2, color: T.quiet, ...TNUM }}>{counter}</span>
      )}
    </div>
  )
}

/** The chapter's one sentence. It says what the number is; it does not sell. */
function Statement({ children }: { children: ReactNode }) {
  return (
    <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.6, lineHeight: 1.2, color: T.ink, textWrap: 'balance' }}>
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

function MilestoneRow({ m }: { m: W3Milestone }) {
  const Ic = m.icon
  const reduce = useReducedMotion()
  return (
    <div style={{ display: 'flex', width: '100%', gap: 14, alignItems: 'center', padding: '14px 0' }}>
      <div style={{ width: 40, height: 40, borderRadius: 100, flex: 'none', background: T.tile, display: 'grid', placeItems: 'center' }}>
        <Ic size={19} strokeWidth={1.8} color={T.acid} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 9, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.title}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: T.quiet, flex: 'none', ...TNUM }}>{m.value}</span>
        </div>
        <div style={{ width: '100%', height: 3, borderRadius: 100, background: T.d1, overflow: 'hidden' }}>
          {m.pct != null && (
            <motion.div
              initial={reduce ? false : { width: 0 }}
              animate={{ width: `${Math.round(Math.max(0, Math.min(1, m.pct)) * 100)}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              style={{ height: 3, borderRadius: 100, background: T.acid }} />
          )}
        </div>
      </div>
    </div>
  )
}

// ── 03 · the consistency grid ───────────────────────────────────────────────

/** 13 tiles a row, four rows — a year that fits the width without scrolling. */
const GRID_COLS = 13

function WeekGrid({ weeks }: { weeks: number[] }) {
  const tone = (n: number) =>
    n <= 0 ? T.d1 : n === 1 ? `${T.acid}38` : n === 2 ? `${T.acid}70` : T.acid
  const rows: number[][] = []
  for (let i = 0; i < weeks.length; i += GRID_COLS) rows.push(weeks.slice(i, i + GRID_COLS))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 5 }}>
      {rows.map((row, r) => (
        <div key={r} style={{ display: 'flex', width: '100%', gap: 5 }}>
          {row.map((n, i) => (
            <div key={i} style={{ flex: 1, height: 20, borderRadius: 5, background: tone(n) }} />
          ))}
        </div>
      ))}
    </div>
  )
}

// ── 04 · the power curve ────────────────────────────────────────────────────

/**
 * One duration of the rider's curve, drawn as a filled rail.
 *
 * The readout FLIPS: on a wide bar it sits inside in dark ink, on a narrow one
 * it sits outside in light. A number half-on and half-off its own bar is the
 * failure mode, and at 254px the 5-second peak fills nearly everything while
 * the 20-minute one fills a third.
 */
const BEAM_INSIDE_FRAC = 0.55

function Beam({ b }: { b: W3Beam }) {
  const reduce = useReducedMotion()
  const inside = b.frac >= BEAM_INSIDE_FRAC
  const readout = (
    <>
      <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.5, color: inside ? T.bg : (b.fresh ? T.acid : T.ink), ...TNUM }}>{b.value}</span>
      <span style={{ fontSize: 10, fontWeight: 600, color: inside ? `${T.bg}99` : T.quiet }}>{b.unit}</span>
      {b.fresh && (
        <span style={{
          fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, borderRadius: 100, padding: '3px 7px',
          background: inside ? `${T.bg}1F` : T.acidDim, color: inside ? T.bg : T.acid,
        }}>NEU</span>
      )}
      {b.date && (
        <span style={{ fontSize: 9.5, fontWeight: 600, color: inside ? `${T.bg}99` : T.quiet, ...TNUM }}>{b.date}</span>
      )}
    </>
  )
  return (
    <div style={{ display: 'flex', width: '100%', gap: 10, alignItems: 'center' }}>
      <span style={{ width: 50, flex: 'none', fontSize: 12, fontWeight: 700, letterSpacing: -0.2, color: T.ink }}>{b.label}</span>
      <div style={{ position: 'relative', flex: 1, height: 34 }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: 9, background: T.d1 }} />
        <motion.div
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${Math.round(Math.max(0, Math.min(1, b.frac)) * 100)}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{ position: 'absolute', left: 0, top: 0, height: 34, borderRadius: 9, background: b.fresh ? T.acid : T.d2 }} />
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: 7,
          justifyContent: inside ? 'flex-end' : 'flex-start',
          paddingRight: inside ? 13 : 0,
          paddingLeft: inside ? 0 : `calc(${Math.round(Math.max(0, Math.min(1, b.frac)) * 100)}% + 12px)`,
        }}>{readout}</div>
      </div>
    </div>
  )
}

// ── 05 · the cabinet ────────────────────────────────────────────────────────

function Medal({ m }: { m: W3Medal }) {
  const Ic = m.earned ? m.icon : Lock
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9, width: 90 }}>
      <div style={{
        width: 62, height: 62, borderRadius: 100, display: 'grid', placeItems: 'center',
        background: m.earned ? T.acid : T.tile,
        boxShadow: m.earned ? `0 0 22px ${T.acid}3D` : 'none',
      }}>
        <Ic size={25} strokeWidth={m.earned ? 1.9 : 2.2} color={m.earned ? T.bg : T.quiet} />
      </div>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.8, color: m.earned ? T.ink : T.quiet, textAlign: 'center', lineHeight: 1.25 }}>{m.title}</span>
      <span style={{ fontSize: 9, fontWeight: 600, color: T.quiet, ...TNUM }}>{m.note}</span>
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

export function W3WinsContent({ vm }: { vm: W3WinsVm }) {
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
      {vm.ftp && (
        <Chapter>
          <Eyebrow text={vm.ftp.eyebrow} />
          <Statement>{vm.ftp.statement}</Statement>
          <FtpCard c={vm.ftp} />
        </Chapter>
      )}

      {vm.milestones && (
        <Chapter>
          <Eyebrow text={vm.milestones.eyebrow} />
          <Statement>{vm.milestones.statement}</Statement>
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

      {vm.consistency && (
        <Chapter>
          <Eyebrow text={vm.consistency.eyebrow} />
          <Statement>{vm.consistency.statement}</Statement>
          <div style={{ ...lux(24), padding: '18px 18px 16px', gap: 16 }}>
            <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <Cap>{vm.consistency.riddenLabel}</Cap>
                <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end' }}>
                  <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: -1, lineHeight: 1, color: T.acid, ...TNUM }}>{vm.consistency.ridden}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: T.mid, paddingBottom: 2 }}>{vm.consistency.ofLabel}</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end' }}>
                <Cap>{vm.consistency.streakLabel}</Cap>
                <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.3, color: T.ink, ...TNUM }}>{vm.consistency.streak}</span>
              </div>
            </div>
            <WeekGrid weeks={vm.consistency.weeks} />
          </div>
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

      {vm.medals && (
        <Chapter>
          <Eyebrow text={vm.medals.eyebrow} counter={vm.medals.counter} />
          <Statement>{vm.medals.statement}</Statement>
          <div style={{ ...lux(24), padding: '24px 18px 22px', gap: 26 }}>
            <div style={{ display: 'flex', width: '100%', flexWrap: 'wrap', rowGap: 26, justifyContent: 'space-between' }}>
              {vm.medals.medals.map((m) => <Medal key={m.key} m={m} />)}
            </div>
          </div>
        </Chapter>
      )}

      {vm.biggestDay && (
        <Chapter pad={40}>
          <Eyebrow text={vm.biggestDay.eyebrow} />
          <Statement>{vm.biggestDay.statement}</Statement>
          <BiggestDayCard c={vm.biggestDay} />
        </Chapter>
      )}
    </>
  )
}

/** The three numbers that summarise the page, for the panel over the floor. */
export function W3WinsDock({ items }: { items: W3WinsLedgerItem[] }) {
  return (
    <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 10, padding: '0 4px' }}>
      {items.map((it) => (
        <div key={it.key} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }}>
            <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: -1, lineHeight: 1, color: it.value === DASH ? T.quiet : T.ink, ...TNUM }}>{it.value}</span>
            {it.unit && <span style={{ fontSize: 10, fontWeight: 600, color: T.quiet, paddingBottom: 2 }}>{it.unit}</span>}
          </div>
          <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1.1, color: T.quiet, whiteSpace: 'nowrap' }}>{it.label}</span>
        </div>
      ))}
    </div>
  )
}
