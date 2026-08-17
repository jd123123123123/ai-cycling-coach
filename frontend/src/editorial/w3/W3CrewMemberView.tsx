import { motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, Route as RouteIcon, CalendarCheck, Sparkles, Zap, HeartPulse, Gauge, Users, Bike } from 'lucide-react'
import { T, FONT, EASE, grow, band, card } from './w3tokens'
import W3PeriodTabs from './W3PeriodTabs'
import { type W3Period } from './w3crew'
import W3TabBar from './W3TabBar'
import './w3.css'

/**
 * W3 · 11 CREW MEMBER DETAIL — the REFERRAL USER DETAIL language (`w3.pen`
 * Z2ryuL: full-bleed tinted hero, the handle on a dark pill, a row of stat
 * tiles on surface-2, one loud number) re-pointed at a crew-mate's own
 * training, with WOCHE / MONAT / SAISON sub-tabs.
 *
 * The centrepiece is the DUEL: you against them, on the fair axis first
 * (points = each rider's share of their OWN target), so a stronger rider does
 * not win by being stronger. The duel owns the screen's one loud acid number;
 * everything below it (their totals, their rhythm, their rides) is ink.
 *
 * Pure function of `vm`; `W3CrewMemberPage` builds it from that rider's real
 * `StandingRow` in `GET /crews/me/standings?period=…` plus their rows in the
 * crew ride feed `GET /crews/me/rides`. There is no avatar in the crew payload,
 * so the hero is the rider's board tint rather than a fabricated portrait, and
 * every value is either real or an explicit "—".
 */

export type W3MemberStatIcon = 'route' | 'calendar' | 'sparkles' | 'zap' | 'heart' | 'gauge'

const ICONS = { route: RouteIcon, calendar: CalendarCheck, sparkles: Sparkles, zap: Zap, heart: HeartPulse, gauge: Gauge }

export interface W3CrewMemberStat {
  key: string
  icon: W3MemberStatIcon
  label: string
  value: string
  note?: string      // what the number is scoped to, when it isn't the window
  missing?: boolean  // renders quiet — the source isn't there
}

/** One head-to-head axis. Both sides are real numbers both riders actually have. */
export interface W3DuelRow {
  key: string
  label: string
  chip?: string            // "FAIRSTER VERGLEICH" on the points axis
  mine: string             // your value, formatted
  theirs: string           // their value, formatted
  minePct: number          // 0..1 share of the pair (bar split), 0/0 = no data
  theirsPct: number
  gap: string              // "120 zurück" · "37 km vor" · "gleichauf"
  youAhead: boolean | null // null = level
}

export interface W3Duel {
  theirName: string        // "@mara"
  headline: string         // "120" — the one loud number on this screen
  headlineKicker: string   // "PUNKTE RÜCKSTAND"
  status: string           // the honest, closeable framing
  daysLeft: string | null  // "Noch 3 Tage in diesem Fenster."
  rows: W3DuelRow[]
  note: string             // why points are the fair axis
}

export interface W3MemberRide {
  id: number
  date: string             // "Sa · 10. Aug"
  title: string
  distance: string         // "42,1 km" or "—"
  meta: string             // "1:32 h · 620 hm" — only the parts that exist
  distancePct: number      // 0..1 vs their longest ride in this list
}

export interface W3RidesBlock {
  countChip: string        // "6 FAHRTEN" · "LETZTE 6"
  rides: W3MemberRide[]
  note: string             // what the feed does and does not cover
  empty: string | null     // set instead of rides when there are none
}

export interface W3CrewMemberVm {
  found: boolean
  handle: string          // "@mara" or "Du"
  isYou: boolean
  tint: string            // their colour on the crew board
  period: W3Period
  windowChip: string      // "10.–16. AUG"
  rankLine: string        // "2. von sechs · diesen Monat"
  headlineKicker: string  // "TSS · DIESEN MONAT"
  headline: string        // "1.240"
  headlineSub: string     // "19 % der 6.410 TSS der Crew"
  stats: W3CrewMemberStat[]
  bars: number[]          // one per real daily_pct bucket, 0..1 of their own peak
  barsFilled: number
  barsTotal: number
  barsNote: string
  barsEdges: { left: string; right: string } | null
  duel: W3Duel | null
  rides: W3RidesBlock | null
  footnote: string
  missingCopy: string     // shown when the rider isn't on this crew's board
}

/* Module scope on purpose — a component re-created each render would remount
 * and replay its entrance animation every time the period tab changes. */
const Tile = ({ s, i, reduce }: { s: W3CrewMemberStat; i: number; reduce: boolean | null }) => {
  const Icon = ICONS[s.icon]
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE, delay: 0.05 * i }}
      style={{ flex: 1, minWidth: 0, padding: '14px 12px', borderRadius: 18, background: T.surface2, display: 'flex', flexDirection: 'column', gap: 7 }}>
      <Icon size={18} color={s.missing ? T.quiet : T.acid} />
      <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.8, color: T.quiet, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
      <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: -0.5, color: s.missing ? T.quiet : T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.value}</span>
    </motion.div>
  )
}

/** One duel axis: your value | split bar | their value, with the gap named. */
const DuelRow = ({ r, tint, i, reduce }: { r: W3DuelRow; tint: string; i: number; reduce: boolean | null }) => {
  const none = r.minePct <= 0 && r.theirsPct <= 0
  /* Your own number is never dimmed — being behind is a gap, not a verdict.
   * The acid stays on the headline, so the gap lines read ink / mid only. */
  const gapColor = r.chip ? T.ink : T.mid
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: T.quiet }}>{r.label}</span>
        {r.chip
          ? <span style={{ flex: 'none', fontSize: 8, fontWeight: 800, letterSpacing: 0.8, color: T.acid, padding: '4px 8px', borderRadius: 100, background: T.acidDim, whiteSpace: 'nowrap' }}>{r.chip}</span>
          : <span style={{ flex: 'none', fontSize: 10, fontWeight: 700, color: gapColor, whiteSpace: 'nowrap' }}>{r.gap}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ flex: 'none', maxWidth: 92, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 15, fontWeight: 800, letterSpacing: -0.3, color: T.ink }}>{r.mine}</span>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: 3, height: 10 }}>
          {none ? (
            <div style={{ flex: 1, borderRadius: 100, background: T.rule }} />
          ) : (
            <>
              {/* flex-grow, not width % — percentage widths plus a gap overflow the track */}
              <motion.div
                initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={grow(0.08 + i * 0.05)}
                style={{ flexGrow: Math.max(0.03, r.minePct), flexBasis: 0, minWidth: 0, transformOrigin: 'right', borderRadius: 100, background: T.acid }} />
              <motion.div
                initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={grow(0.08 + i * 0.05)}
                style={{ flexGrow: Math.max(0.03, r.theirsPct), flexBasis: 0, minWidth: 0, transformOrigin: 'left', borderRadius: 100, background: tint }} />
            </>
          )}
        </div>
        <span style={{ flex: 'none', maxWidth: 92, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right', fontSize: 15, fontWeight: 800, letterSpacing: -0.3, color: r.youAhead === true ? T.mid : T.ink }}>{r.theirs}</span>
      </div>
      {r.chip && (
        <span style={{ fontSize: 10, fontWeight: 700, color: gapColor, textAlign: 'center' }}>{r.gap}</span>
      )}
    </div>
  )
}

const RideRow = ({ r, tint, i, reduce, last }: { r: W3MemberRide; tint: string; i: number; reduce: boolean | null; last: boolean }) => (
  <motion.div
    initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE, delay: 0.04 * i }}
    style={{
      position: 'relative', display: 'flex', gap: 12, alignItems: 'center', padding: '13px 12px', borderRadius: 14,
      borderBottom: last ? 'none' : `1px solid ${T.rule}`,
      background: r.distancePct > 0 ? `linear-gradient(90deg, ${tint}1F ${Math.max(4, Math.round(r.distancePct * 100))}%, transparent ${Math.max(4, Math.round(r.distancePct * 100))}%)` : 'transparent',
    }}>
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.8, color: T.quiet, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.date}</span>
      <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: -0.2, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
      <span style={{ fontSize: 10.5, fontWeight: 500, color: T.quiet, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.meta}</span>
    </div>
    <span style={{ flex: 'none', maxWidth: 104, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 15, fontWeight: 800, letterSpacing: -0.4, color: T.ink }}>{r.distance}</span>
  </motion.div>
)

export default function W3CrewMemberView({ vm, onBack, onPeriod }: {
  vm: W3CrewMemberVm; onBack?: () => void; onPeriod?: (p: W3Period) => void
}) {
  const reduce = useReducedMotion()
  const accent = vm.isYou ? T.acid : T.evening
  const initial = vm.handle.replace(/^@/, '').charAt(0).toUpperCase()
  const barGap = vm.bars.length > 8 ? 4 : 6

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg }}>
        {/* Hero — the rider's board tint, not an invented portrait */}
        <div style={{ position: 'relative', height: 260, width: '100%', overflow: 'hidden', flex: 'none' }}>
          <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(120% 80% at 50% 18%, ${vm.tint}77, ${T.bg} 72%)` }} />
          <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(90% 60% at 50% 12%, ${accent}2E, transparent 70%)` }} />
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 128, fontWeight: 800, letterSpacing: -6, color: T.d2, paddingBottom: 40 }}>{initial}</div>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 120, background: `linear-gradient(0deg, ${T.bg}, transparent)` }} />
          <div style={{ position: 'relative', padding: '10px 20px 0' }}>
            <div style={{ height: 'max(12px, env(safe-area-inset-top))' }} />
            <button onClick={onBack} aria-label="Zurück" style={{ width: 44, height: 44, borderRadius: 100, background: T.ink, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><ArrowLeft size={19} color={T.bg} /></button>
          </div>
          {/* handle + standing, in the referral card's pill language */}
          <div style={{ position: 'absolute', left: 20, right: 20, bottom: 14, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
            <motion.span initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE }}
              style={{ maxWidth: '100%', padding: '10px 22px', borderRadius: 100, background: T.surface, fontSize: 20, fontWeight: 700, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vm.handle}</motion.span>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.mid, textAlign: 'center' }}>{vm.rankLine}</span>
          </div>
        </div>

        {!vm.found ? (
          <div style={{ ...band(30), gap: 16, paddingTop: 20 }}>
            <div style={{ ...card(), gap: 10, alignItems: 'center', textAlign: 'center', padding: 26 }}>
              <div style={{ width: 52, height: 52, borderRadius: 100, background: T.surface2, display: 'grid', placeItems: 'center' }}><Users size={22} color={T.mid} /></div>
              <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.4, color: T.ink }}>Kein Eintrag im Board</span>
              <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.45, color: T.mid }}>{vm.missingCopy}</span>
            </div>
          </div>
        ) : (
          <>
            {/* Period sub-tabs — the same control as the crew board */}
            <div style={{ ...band(20), paddingTop: 18 }}>
              <W3PeriodTabs value={vm.period} onChange={(p) => onPeriod?.(p)} />
            </div>

            {/* ── THE DUEL — the centrepiece, and this screen's one loud number ── */}
            {vm.duel && (
              <div style={{ ...band(24) }}>
                <div style={{ ...card(), gap: 18, padding: 20, position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(90% 70% at 100% 0%, ${vm.tint}1A, transparent 62%)`, pointerEvents: 'none' }} />
                  <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 18 }}>
                    {/* Who, and over which window */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: T.quiet }}>DU GEGEN {vm.duel.theirName.toUpperCase()}</span>
                      {vm.windowChip && <span style={{ flex: 'none', fontSize: 9, fontWeight: 800, letterSpacing: 0.8, color: T.mid, padding: '5px 10px', borderRadius: 100, background: T.surface2, whiteSpace: 'nowrap' }}>{vm.windowChip}</span>}
                    </div>

                    {/* The gap, named and closeable */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <motion.span
                        initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
                        style={{ fontSize: 64, fontWeight: 800, letterSpacing: -2.8, lineHeight: 0.95, color: T.acid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vm.duel.headline}</motion.span>
                      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.2, color: T.mid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vm.duel.headlineKicker}</span>
                      <span style={{ marginTop: 4, fontSize: 12.5, fontWeight: 500, lineHeight: 1.45, color: T.ink }}>{vm.duel.status}</span>
                      {vm.duel.daysLeft && (
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: T.mid }}>{vm.duel.daysLeft}</span>
                      )}
                    </div>

                    {/* Legend — one place where the two colours are named */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: T.acid, flex: 'none' }} />
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: T.mid }}>Du</span>
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: vm.tint, flex: 'none' }} />
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10.5, fontWeight: 700, color: T.mid }}>{vm.duel.theirName}</span>
                      </span>
                    </div>

                    {/* The axes */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {vm.duel.rows.map((r, i) => <DuelRow key={r.key} r={r} tint={vm.tint} i={i} reduce={reduce} />)}
                    </div>

                    <span style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.45, color: T.quiet }}>{vm.duel.note}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Their load for this window */}
            <div style={{ ...band(20) }}>
              <div style={{ ...card(), gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <span style={{ minWidth: 0, fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: T.quiet, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vm.headlineKicker}</span>
                  {vm.windowChip && <span style={{ flex: 'none', fontSize: 9, fontWeight: 800, letterSpacing: 0.8, color: T.mid, padding: '5px 10px', borderRadius: 100, background: T.surface2, whiteSpace: 'nowrap' }}>{vm.windowChip}</span>}
                </div>
                <motion.span
                  initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
                  style={{ fontSize: 60, fontWeight: 800, letterSpacing: -2.6, lineHeight: 1, color: vm.duel ? T.ink : T.acid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vm.headline}</motion.span>
                <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.4, color: T.mid }}>{vm.headlineSub}</span>
              </div>
            </div>

            {/* Stat tiles — the referral detail's row, three up */}
            <div style={{ ...band(20), gap: 8 }}>
              {[0, 3].map((offset) => {
                const slice = vm.stats.slice(offset, offset + 3)
                if (slice.length === 0) return null
                return (
                  <div key={offset} style={{ display: 'flex', gap: 8 }}>
                    {slice.map((s, i) => <Tile key={s.key} s={s} i={offset + i} reduce={reduce} />)}
                    {slice.length < 3 && Array.from({ length: 3 - slice.length }).map((_, k) => <div key={`sp${k}`} style={{ flex: 1 }} />)}
                  </div>
                )
              })}
              {vm.stats.some((s) => s.note) && (
                <span style={{ fontSize: 10.5, fontWeight: 500, lineHeight: 1.45, color: T.quiet }}>
                  {vm.stats.filter((s) => s.note).map((s) => `${s.label}: ${s.note}`).join(' · ')}
                </span>
              )}
            </div>

            {/* Their rhythm — one bar per real daily_pct bucket */}
            {vm.bars.length > 0 && (
              <div style={{ ...band(20), gap: 10 }}>
                <div style={{ ...card(), gap: 12, padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: T.quiet }}>RHYTHMUS</span>
                    <span style={{ flex: 'none', fontSize: 9, fontWeight: 800, letterSpacing: 0.8, color: T.mid, whiteSpace: 'nowrap' }}>{vm.barsFilled} / {vm.barsTotal}</span>
                  </div>
                  <div style={{ display: 'flex', gap: barGap, alignItems: 'flex-end', height: 72 }}>
                    {vm.bars.map((h, i) => (
                      <motion.div key={i}
                        initial={reduce ? false : { scaleY: 0 }} animate={{ scaleY: 1 }} transition={grow(0.04 + i * 0.02)}
                        style={{ flex: 1, minWidth: 0, height: `${Math.max(6, Math.round(h * 100))}%`, borderRadius: 6, transformOrigin: 'bottom', background: h > 0 ? T.d4 : T.rule }} />
                    ))}
                  </div>
                  {vm.barsEdges && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: T.quiet }}>{vm.barsEdges.left}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: T.quiet }}>{vm.barsEdges.right}</span>
                    </div>
                  )}
                  <span style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.4, color: T.quiet }}>{vm.barsNote}</span>
                </div>
              </div>
            )}

            {/* Their rides — the real feed rows for this rider in this window */}
            {vm.rides && (
              <div style={{ ...band(20), gap: 10 }}>
                <div style={{ ...card(), gap: 4, padding: '18px 8px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '0 12px 6px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <Bike size={15} color={T.mid} />
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: T.quiet, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>FAHRTEN</span>
                    </span>
                    <span style={{ flex: 'none', fontSize: 9, fontWeight: 800, letterSpacing: 0.8, color: T.mid, whiteSpace: 'nowrap' }}>{vm.rides.countChip}</span>
                  </div>
                  {vm.rides.empty ? (
                    <span style={{ padding: '8px 12px 0', fontSize: 12, fontWeight: 500, lineHeight: 1.45, color: T.mid }}>{vm.rides.empty}</span>
                  ) : (
                    vm.rides.rides.map((r, i) => (
                      <RideRow key={r.id} r={r} tint={vm.tint} i={i} reduce={reduce} last={i === vm.rides!.rides.length - 1} />
                    ))
                  )}
                  <span style={{ padding: '10px 12px 0', fontSize: 11, fontWeight: 500, lineHeight: 1.45, color: T.quiet }}>{vm.rides.note}</span>
                </div>
              </div>
            )}

            <div style={{ ...band(28) }}>
              <span style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.5, color: T.quiet }}>{vm.footnote}</span>
            </div>
          </>
        )}

        <W3TabBar />
      </div>
    </div>
  )
}
