import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { T, FONT, DASH, EASE } from './w3tokens'
import { lux, hairline, TNUM } from './w3surfaces'

/**
 * W3 · ERFOLGE — DEIN RHYTHMUS. Three grains of one fact: when this rider
 * actually rides.
 *
 * ── WHY THREE GRAINS AND NOT THREE CHAPTERS ──────────────────────────────
 *
 * Season, month and week are the SAME QUESTION at three zoom levels, and the
 * page already proved what happens when related facts are given equal-weight
 * chapters of their own: six of them in a row, every one opening on an acid
 * eyebrow and a 19px statement, and the screen reads as a list with no
 * argument. One card the rider can zoom is a stronger instrument than three
 * they have to assemble mentally — and it costs one chapter of vertical space
 * instead of three.
 *
 * The switch is the hierarchy. Whichever grain is selected gets the big
 * readout; the other two are a 9px control. That is a real tier, produced by
 * interaction rather than by making something louder.
 *
 * ── EVERY GRAIN IS READ AGAINST ITSELF ───────────────────────────────────
 *
 * The month bars scale to the rider's own best month, the week tiles to their
 * own busiest week. Same idiom as the threshold chart ("the series is read
 * against itself"), and it is the only honest choice: a fixed axis in km would
 * draw a 4000 km rider's good year and a 900 km rider's good year as the same
 * picture of failure for one of them.
 *
 * The one exception is the season, which is read against LAST YEAR, because
 * that comparison is the entire point of the grain. It is year-to-date against
 * the same day last year — never last year's full twelve months, which would
 * tell a rider in March they had collapsed. The server returns null rather
 * than compare against a year with no rides in it, and then this grain is not
 * offered at all.
 *
 * ── WHAT LIGHTS A WEEK TILE ──────────────────────────────────────────────
 *
 * Lit means RODE AT ALL — that is the consistency claim and it is unchanged.
 * What changed is the ramp: brightness now follows minutes rather than ride
 * count, because three commutes and one five-hour Sunday are not the same week
 * and the old tile drew them identically.
 */

// ── the view model ──────────────────────────────────────────────────────────

export interface W3RhythmMonth {
  start: string
  rides: number
  km: number
  minutes: number
}

export interface W3RhythmSeason {
  year: number
  prevYear: number
  current: { rides: number; km: number; minutes: number }
  previous: { rides: number; km: number; minutes: number }
}

export interface W3RhythmWeek {
  start: string
  rides: number
  minutes: number
}

export interface W3RhythmVm {
  season: W3RhythmSeason | null
  months: W3RhythmMonth[]
  weeks: W3RhythmWeek[]
  /** Straight from the consistency chapter — the grid is its evidence. */
  ridden: number
  of: number
  longestStreak: number
}

type Grain = 'season' | 'month' | 'week'

// ── formatting ──────────────────────────────────────────────────────────────

const nf = new Intl.NumberFormat('de-DE')
const nf1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })

/** "2026-03-01" → "M". The initial only — twelve labels have to fit 350px. */
function monthInitial(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('de-DE', { month: 'narrow' })
}

/** "2026-03-01" → "MÄR". For the one month that gets named. */
function monthShort(iso: string): string | null {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('de-DE', { month: 'short' }).toUpperCase()
}

/** 1234 minutes → "20 h". Hours are the unit a rider thinks in above a week. */
function hours(minutes: number): string {
  return `${nf.format(Math.round(minutes / 60))} h`
}

// ── shared parts ────────────────────────────────────────────────────────────

function Cap({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1.2, color: T.quiet }}>{children}</span>
}

/**
 * The grain switch.
 *
 * A real segmented control, not three links: the selected grain carries the
 * card's whole readout, so the control has to look like it holds state. The
 * lit pill slides between the three with a layout animation, which is the one
 * piece of motion on this card that is not data.
 */
function GrainSwitch({ value, options, onChange }: {
  value: Grain
  options: { key: Grain; label: string }[]
  onChange: (g: Grain) => void
}) {
  const reduce = useReducedMotion()
  return (
    <div role="tablist" style={{
      display: 'flex', width: '100%', gap: 3, padding: 3,
      background: T.d1, borderRadius: 100,
    }}>
      {options.map((o) => {
        const on = o.key === value
        return (
          <button
            key={o.key}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.key)}
            style={{
              position: 'relative', flex: 1, height: 30, border: 0, background: 'transparent',
              cursor: 'pointer', fontFamily: FONT, padding: 0,
            }}
          >
            {on && (
              <motion.div
                layoutId="w3-rhythm-grain"
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
                style={{ position: 'absolute', inset: 0, borderRadius: 100, background: T.acid }}
              />
            )}
            <span style={{
              position: 'relative', fontSize: 9.5, fontWeight: 700, letterSpacing: 1.1,
              color: on ? T.bg : T.mid,
            }}>{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * The card's one big number, whichever grain is showing.
 *
 * This is the tier the rest of the page is measured against — the only place
 * on the screen a number is set this large outside the biggest day.
 */
function Readout({ value, unit, sub, delta }: {
  value: string
  unit: string
  sub: string
  delta?: { text: string; up: boolean } | null
  foot?: string | null
}) {
  return (
    <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end' }}>
          <span style={{ fontSize: 44, fontWeight: 700, letterSpacing: -2, lineHeight: 0.9, color: T.ink, ...TNUM }}>{value}</span>
          <span style={{ fontSize: 15, fontWeight: 600, color: T.quiet, paddingBottom: 3 }}>{unit}</span>
        </div>
        <span style={{ fontSize: 11.5, fontWeight: 500, color: T.mid }}>{sub}</span>
      </div>
      {delta && (
        <span style={{
          flex: 'none', borderRadius: 100, padding: '5px 10px', ...TNUM,
          background: delta.up ? T.acidDim : T.d1,
          color: delta.up ? T.acid : T.mid,
          fontSize: 11, fontWeight: 700, letterSpacing: -0.2,
        }}>{delta.text}</span>
      )}
    </div>
  )
}

// ── grain · season ──────────────────────────────────────────────────────────

/**
 * Two years, two rails, read against the larger of them.
 *
 * Both rails are labelled in full. A comparison drawn as bars whose numbers
 * are not printed is the shape that flatters, and this one is allowed to be
 * unflattering — a rider down on last year should see that.
 */
function SeasonGrain({ s }: { s: W3RhythmSeason }) {
  const reduce = useReducedMotion()
  const peak = Math.max(s.current.km, s.previous.km, 1)
  const rows = [
    { year: s.year, v: s.current, lit: true },
    { year: s.prevYear, v: s.previous, lit: false },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 14 }}>
      {rows.map((r, i) => (
        <div key={r.year} style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 7 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: -0.2, color: r.lit ? T.ink : T.mid, ...TNUM }}>{r.year}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: T.quiet, ...TNUM }}>
              {nf.format(Math.round(r.v.km))} km · {nf.format(r.v.rides)} Fahrten · {hours(r.v.minutes)}
            </span>
          </div>
          <div style={{ width: '100%', height: 10, borderRadius: 100, background: T.d1, overflow: 'hidden' }}>
            <motion.div
              initial={reduce ? false : { width: 0 }}
              animate={{ width: `${Math.round((r.v.km / peak) * 100)}%` }}
              transition={{ duration: 0.65, ease: EASE, delay: reduce ? 0 : i * 0.08 }}
              style={{ height: 10, borderRadius: 100, background: r.lit ? T.acid : T.d2 }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── grain · month ───────────────────────────────────────────────────────────

const MONTH_TRACK = 92

/**
 * Twelve months as columns, scaled to the rider's own best.
 *
 * TWO THINGS ARE ENCODED BEYOND HEIGHT, and both earn their ink:
 *
 * The AVERAGE is drawn as a line across the track, because twelve bars on
 * their own only say "these months differed" — against a mean they say which
 * months the rider actually showed up for, which is the question the card is
 * asking. It is the rider's own mean over the window, so it moves with them.
 *
 * The CURRENT MONTH IS MARKED AS UNFINISHED. Lighting it acid was not enough:
 * on the 3rd of September a 118 km stub sat at a tenth of the track and read
 * as a collapse rather than as a month three days old. It now carries a ghost
 * cap to the average and says so in words. The bar itself stays honest — the
 * solid part is only what has actually been ridden, and the ghost is
 * explicitly not a projection of where the month will end.
 */
function MonthGrain({ months }: { months: W3RhythmMonth[] }) {
  const reduce = useReducedMotion()
  const peak = Math.max(...months.map((m) => m.km), 1)
  const lastIdx = months.length - 1
  const ridden = months.filter((m) => m.km > 0)
  const avg = ridden.length ? ridden.reduce((n, m) => n + m.km, 0) / ridden.length : 0
  const avgY = Math.round((avg / peak) * MONTH_TRACK)
  const peakIdx = months.reduce((b, m, i) => (m.km > months[b].km ? i : b), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 9 }}>
      <div style={{ position: 'relative', display: 'flex', width: '100%', height: MONTH_TRACK, alignItems: 'flex-end', gap: 4 }}>
        {/* The mean, behind the bars. A dotted rule rather than a drawn line:
            it is a reference, not a series, and must not read as data. */}
        {avg > 0 && (
          <div aria-hidden style={{
            position: 'absolute', left: 0, right: 0, bottom: avgY, height: 0,
            borderTop: `1px dashed ${T.d3}`, pointerEvents: 'none',
          }}>
            {/* LEFT, not right. On the right it collided with the running
                month's hatch and clipped against the card's padding; the
                window opens on the rider's winter, whose bars sit under the
                mean, so the space above them is free. */}
            <span style={{
              position: 'absolute', left: 0, top: -12, fontSize: 8, fontWeight: 700,
              letterSpacing: 0.6, color: T.quiet, ...TNUM,
            }}>Ø {nf.format(Math.round(avg))} km</span>
          </div>
        )}
        {months.map((m, i) => {
          const now = i === lastIdx
          const h = Math.max(2, Math.round((m.km / peak) * MONTH_TRACK))
          return (
            <div key={m.start} style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
              {/* The unfinished cap — only ever on the month still being
                  written, and only up to the rider's own average. */}
              {now && avgY > h && (
                <div aria-hidden style={{
                  position: 'absolute', left: 0, right: 0, bottom: h, height: avgY - h,
                  borderRadius: 4, background: `repeating-linear-gradient(
                    135deg, ${T.acid}1F 0 3px, transparent 3px 6px)`,
                }} />
              )}
              <motion.div
                initial={reduce ? false : { height: 2 }}
                animate={{ height: h }}
                transition={{ duration: 0.5, ease: EASE, delay: reduce ? 0 : i * 0.035 }}
                style={{
                  width: '100%', borderRadius: 4,
                  // An empty month is a visible stub in the track's own tone,
                  // never nothing — the gap is the fact. Only the peak and the
                  // running month are lit; a twelve-bar acid chart is the
                  // accent inflation this page was rebuilt to get rid of.
                  background: m.km <= 0 ? T.d1 : (now || i === peakIdx) ? T.acid : T.d2,
                }} />
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', width: '100%', gap: 4 }}>
        {months.map((m, i) => (
          <span key={m.start} style={{
            flex: 1, textAlign: 'center', fontSize: 8.5, fontWeight: 700,
            color: i === lastIdx || i === peakIdx ? T.acid : T.quiet,
          }}>{monthInitial(m.start)}</span>
        ))}
      </div>
    </div>
  )
}

// ── grain · week ────────────────────────────────────────────────────────────

const GRID_COLS = 13

/** "2025-09-08" → "SEP 25", for the two ends of the grid's axis. */
function weekStamp(iso: string): string | null {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' }).toUpperCase()
}

/**
 * 52 weeks, four rows of thirteen.
 *
 * LIT MEANS RODE AT ALL — the consistency claim, unchanged. The ramp above
 * that follows MINUTES against the rider's own busiest week, so three commutes
 * and one five-hour Sunday stop drawing identically.
 *
 * THE RAMP IS DELIBERATELY MEAN AT THE TOP. Rendered first at 0.66 for full
 * acid, a normal year came out a solid wall of accent: most weeks sit close
 * enough to a rider's typical week that two thirds of the peak is an ordinary
 * week, not a big one. Full acid now needs 0.85 of the rider's best week,
 * which makes a lit-to-the-top tile mean something — and leaves the grid
 * reading as a year with texture rather than a block of colour.
 *
 * The axis under it is two stamps, not thirteen. The grid always spans a year;
 * what the rider needs is to know which end is which, and 52 labels at 390px
 * is not a legend, it is noise.
 */
function WeekGrain({ weeks }: { weeks: W3RhythmWeek[] }) {
  const reduce = useReducedMotion()
  const peak = Math.max(...weeks.map((w) => w.minutes), 1)
  const rows: W3RhythmWeek[][] = []
  for (let i = 0; i < weeks.length; i += GRID_COLS) rows.push(weeks.slice(i, i + GRID_COLS))
  const tone = (w: W3RhythmWeek) => {
    if (w.rides <= 0) return T.d1
    const f = w.minutes / peak
    return f >= 0.85 ? T.acid : f >= 0.55 ? `${T.acid}70` : `${T.acid}30`
  }
  const from = weeks.length ? weekStamp(weeks[0].start) : null
  const to = weeks.length ? weekStamp(weeks[weeks.length - 1].start) : null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 5 }}>
      {rows.map((row, r) => (
        <div key={r} style={{ display: 'flex', width: '100%', gap: 5 }}>
          {row.map((w, i) => (
            <motion.div
              key={w.start}
              initial={reduce ? false : { opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, ease: EASE, delay: reduce ? 0 : (r * GRID_COLS + i) * 0.006 }}
              style={{ flex: 1, height: 20, borderRadius: 5, background: tone(w) }}
            />
          ))}
        </div>
      ))}
      {from && to && (
        <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', paddingTop: 3 }}>
          <Cap>{from}</Cap>
          <Cap>{to}</Cap>
        </div>
      )}
    </div>
  )
}

// ── the card ────────────────────────────────────────────────────────────────

export default function W3WinsRhythm({ vm }: { vm: W3RhythmVm }) {
  // The season grain is only offered when the server had something real to
  // compare against, so the control never shows a tab that resolves to
  // nothing. Month is the default: it is the grain that reads at a glance.
  const options = useMemo(() => ([
    ...(vm.season ? [{ key: 'season' as const, label: 'SAISON' }] : []),
    { key: 'month' as const, label: 'MONAT' },
    { key: 'week' as const, label: 'WOCHE' },
  ]), [vm.season])
  const [grain, setGrain] = useState<Grain>('month')

  const readout = useMemo(() => {
    if (grain === 'season' && vm.season) {
      const { current, previous, year, prevYear } = vm.season
      const diff = previous.km > 0 ? (current.km - previous.km) / previous.km : null
      return {
        value: nf.format(Math.round(current.km)),
        unit: 'km',
        sub: `${year} bis heute. ${prevYear} zum selben Tag: ${nf.format(Math.round(previous.km))} km.`,
        delta: diff == null ? null : {
          text: `${diff >= 0 ? '+' : '−'}${nf.format(Math.round(Math.abs(diff) * 100))} %`,
          up: diff >= 0,
        },
        foot: null,
      }
    }
    if (grain === 'month') {
      const best = vm.months.reduce<W3RhythmMonth | null>((m, x) => (m && m.km >= x.km ? m : x), null)
      const total = vm.months.reduce((n, m) => n + m.km, 0)
      const named = best && best.km > 0 ? monthShort(best.start) : null
      const last = vm.months[vm.months.length - 1]
      const running = last ? monthShort(last.start) : null
      return {
        value: nf.format(Math.round(total)),
        unit: 'km',
        sub: named
          ? `In zwölf Monaten. Stärkster Monat: ${named} mit ${nf.format(Math.round(best!.km))} km.`
          : 'In den letzten zwölf Monaten.',
        // The last column is a month in progress, and a stub that is short
        // because the month is three days old must not read as a collapse.
        foot: running ? `${running} läuft noch.` : null,
        delta: null,
      }
    }
    return {
      value: String(vm.ridden),
      unit: `von ${vm.of}`,
      sub: `Wochen mit mindestens einer Fahrt. Längste Serie: ${vm.longestStreak === 1 ? '1 Woche' : `${vm.longestStreak} Wochen`}.`,
      delta: null,
      foot: null,
    }
  }, [grain, vm])

  return (
    <div style={{ ...lux(24), padding: '18px 18px 16px', gap: 16 }}>
      <GrainSwitch value={grain} options={options} onChange={setGrain} />
      <Readout {...readout} />
      <div style={hairline(0)} />
      {grain === 'season' && vm.season && <SeasonGrain s={vm.season} />}
      {grain === 'month' && <MonthGrain months={vm.months} />}
      {grain === 'week' && <WeekGrain weeks={vm.weeks} />}
      {readout.foot && (
        <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet }}>{readout.foot}</span>
      )}
    </div>
  )
}

export { Cap as W3RhythmCap, nf1 as w3RhythmNf1, DASH as W3_RHYTHM_DASH }
