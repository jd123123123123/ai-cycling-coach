import { motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, Route as RouteIcon, CalendarCheck, Sparkles, Zap, HeartPulse, Gauge, Users } from 'lucide-react'
import { T, FONT, EASE, grow, band, card } from './w3tokens'
import W3PeriodTabs from './W3PeriodTabs'
import { type W3Period } from './w3crew'
import W3TabBar from './W3TabBar'
import './w3.css'

/**
 * W3 · 11 CREW MEMBER DETAIL — the REFERRAL USER DETAIL language (`w3.pen`
 * Z2ryuL: full-bleed tinted hero, the handle on a dark pill, a row of stat
 * tiles on surface-2, one loud number) re-pointed at a crew-mate's own
 * training, with WEEK / MONTH / SEASON sub-tabs.
 *
 * Pure function of `vm`; `W3CrewMemberPage` builds it from that rider's real
 * `StandingRow` in `GET /crews/me/standings?period=…`. There is no avatar in
 * the crew payload, so the hero is the rider's board tint rather than a
 * fabricated portrait, and every tile is either their real value or "—".
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

export interface W3CrewMemberVm {
  found: boolean
  handle: string          // "@mara" or "You"
  isYou: boolean
  tint: string            // their colour on the crew board
  period: W3Period
  windowChip: string      // "AUG 10–16"
  rankLine: string        // "2nd of six · this month"
  headlineKicker: string  // "TSS · THIS MONTH"
  headline: string        // "1,240"
  headlineSub: string     // "19% of the crew's 6,410 TSS"
  stats: W3CrewMemberStat[]
  bars: number[]          // one per real daily_pct bucket, 0..1 of their own peak
  barsFilled: number
  barsTotal: number
  barsNote: string
  barsEdges: { left: string; right: string } | null
  vsYou: { label: string; value: string; ahead: boolean }[] | null
  vsYouNote: string | null
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
            <button onClick={onBack} aria-label="Back" style={{ width: 44, height: 44, borderRadius: 100, background: T.ink, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><ArrowLeft size={19} color={T.bg} /></button>
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
              <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.4, color: T.ink }}>No board entry</span>
              <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.45, color: T.mid }}>{vm.missingCopy}</span>
            </div>
          </div>
        ) : (
          <>
            {/* Period sub-tabs — the same control as the crew board */}
            <div style={{ ...band(20), paddingTop: 18 }}>
              <W3PeriodTabs value={vm.period} onChange={(p) => onPeriod?.(p)} />
            </div>

            {/* The one loud number: their load for this window */}
            <div style={{ ...band(20) }}>
              <div style={{ ...card(), gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <span style={{ minWidth: 0, fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: T.quiet, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vm.headlineKicker}</span>
                  {vm.windowChip && <span style={{ flex: 'none', fontSize: 9, fontWeight: 800, letterSpacing: 0.8, color: T.mid, padding: '5px 10px', borderRadius: 100, background: T.surface2, whiteSpace: 'nowrap' }}>{vm.windowChip}</span>}
                </div>
                <motion.span
                  initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
                  style={{ fontSize: 60, fontWeight: 800, letterSpacing: -2.6, lineHeight: 1, color: T.acid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vm.headline}</motion.span>
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
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: T.quiet }}>RHYTHM</span>
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

            {/* Against you — only from numbers both riders actually have */}
            {vm.vsYou && vm.vsYou.length > 0 && (
              <div style={{ ...band(20) }}>
                <div style={{ ...card(), gap: 12, border: `1px solid ${T.stroke}`, background: 'transparent' }}>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: T.quiet }}>AGAINST YOU</span>
                  {vm.vsYou.map((r) => (
                    <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600, color: T.mid }}>{r.label}</span>
                      <span style={{ flex: 'none', fontSize: 17, fontWeight: 800, letterSpacing: -0.4, color: r.ahead ? T.ink : T.mid }}>{r.value}</span>
                    </div>
                  ))}
                  {vm.vsYouNote && <span style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.4, color: T.quiet }}>{vm.vsYouNote}</span>}
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
