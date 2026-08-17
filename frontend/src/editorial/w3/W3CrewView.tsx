import { motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, Sparkles, UserPlus, Pencil, ChevronRight } from 'lucide-react'
import { T, FONT, EASE, grow, band, card, DASH } from './w3tokens'
import W3PeriodTabs from './W3PeriodTabs'
import { AVATAR_TINTS, TINT_BASE, type W3Period } from './w3crew'
import W3StatusBar from './W3StatusBar'
import W3TabBar from './W3TabBar'
import './w3.css'

/**
 * W3 · 10 CREW — the crew board, rebuilt around the question "how is my crew
 * actually doing". Pure function of `vm`; `W3CrewPage` wires it to `useMyCrew`
 * + `useCrewStandings(period)`.
 *
 * WEEK / MONTH / SEASON drives the standings `period` param (season = `year`),
 * and EVERY number on the screen is the total for that selected window — the
 * server's `weekly_*` field names are back-compat, not a claim about weeks.
 *
 * REAL: crew name, the summed crew TSS and kilometres over the window, each
 * rider's TSS / distance / score-vs-leader, the bucket strip from `daily_pct`,
 * your share, and the derived highlights. Kilometres are nullable per rider, so
 * the total always states what it covers instead of quietly summing a subset.
 *
 * FIXTURE (reward/flavor layer, no backend field): the props economy (Gib
 * Props), the 500 km "Around the world" ring fallback, and the 8-seat cap.
 */

const DOW = ['M', 'D', 'M', 'D', 'F', 'S', 'S']

export interface W3CrewMember {
  id: number
  name: string          // handle (no @) or "Du"
  rank: number          // 1-based, by window score
  tssLabel: string      // real window TSS, formatted
  kmLabel: string | null // real window distance, or null when the rider has none
  pct: number           // window score vs the crew leader, 0-100+ (real)
  isYou: boolean
}

export interface W3ShowedUpRow {
  id: number
  name: string
  isYou: boolean
  days: boolean[]       // one per real daily_pct bucket (≤14), filled = points scored
}

export interface W3Highlight {
  id: string
  name: string
  isYou: boolean
  text: string
  badge: string
}

export interface W3CrewVm {
  inCrew: boolean
  crewName: string
  blurb: string
  period: W3Period
  windowChip: string    // "10.–16. AUG" — the real window the server returned
  rankOrdinal: string   // "2."
  rankSub: string       // "von sechs diesen Monat"
  propsHint: string     // fixture: props economy copy
  // ── 1 · Crew output (all real, summed from the rows) ──
  crewTss: string           // summed weekly_tss over the window
  crewTssSub: string        // "sechs Fahrer · diesen Monat"
  crewKm: string            // summed distance_km, or "—" when nobody has any
  crewKmCoverage: string | null  // honest note when only some riders have distance
  avgTss: string            // crew TSS / riders
  yourShare: string         // your TSS as a share of the crew's, or "—"
  outputNote: string        // how the board is scored
  // ── 2 · The crew ──
  members: W3CrewMember[]
  // ── 3 · Who showed up ──
  showedUp: W3ShowedUpRow[]
  showedUpFilled: number
  showedUpTotal: number
  showedUpNote: string
  gridDow: boolean                              // 7 day-buckets → M T W T F S S header
  gridEdges: { left: string; right: string } | null  // otherwise, the window's real edges
  // ── 4 · Around the world (week only — the crew goal is a weekly challenge) ──
  showDistanceGoal: boolean
  distanceKm: number
  distanceGoalKm: number    // real when a crew distance challenge is set; editable
  distancePct: number
  distanceToGo: number
  yourDistanceNote: string
  yourSharePct: number
  propsGiven?: boolean
  // ── 5 · Highlights ──
  highlights: W3Highlight[]
  highlightsTitle: string
  seatsOpen: number         // fixture cap − real member count
  seatsCopy: string
}

function MemberCard({ m, i, reduce, onOpen }: {
  m: W3CrewMember; i: number; reduce: boolean | null; onOpen?: (id: number) => void
}) {
  const tint = AVATAR_TINTS[i % AVATAR_TINTS.length]
  const namePillBg = m.isYou ? T.acid : T.evening
  const namePillFg = m.isYou ? T.bg : T.ink
  const pctColor = m.pct >= 100 ? T.acid : T.mid
  const initial = m.name.replace(/^@/, '').charAt(0).toUpperCase()
  return (
    <motion.button
      onClick={onOpen ? () => onOpen(m.id) : undefined}
      aria-label={`${m.name} öffnen`}
      initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE, delay: i * 0.05 }}
      style={{ position: 'relative', flex: 1, minWidth: 0, aspectRatio: '0.9', borderRadius: 22, overflow: 'hidden', padding: 0, border: 0, fontFamily: FONT, textAlign: 'left', cursor: onOpen ? 'pointer' : 'default', background: `linear-gradient(160deg, ${tint}, ${TINT_BASE})`, outline: m.isYou ? `2px solid ${T.acid}` : 'none', outlineOffset: -2 }}
    >
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 52, fontWeight: 800, color: T.d3 }}>{initial}</div>
      {/* name + rank pill */}
      <div style={{ position: 'absolute', left: 8, right: 8, top: 8, display: 'flex', justifyContent: 'center' }}>
        <span style={{ padding: '5px 12px', borderRadius: 100, background: namePillBg, fontSize: 11, fontWeight: 800, color: namePillFg, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.rank} · {m.name}</span>
      </div>
      {/* window TSS + distance + share of the leader */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '22px 11px 10px', background: `linear-gradient(0deg, ${T.bg}, transparent)`, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 15, fontWeight: 800, letterSpacing: -0.4, color: T.ink }}>{m.tssLabel}<span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.6, color: T.mid }}> TSS</span></span>
          <span style={{ flex: 'none', fontSize: 13, fontWeight: 800, color: pctColor }}>{m.pct}%</span>
        </div>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10, fontWeight: 600, color: m.kmLabel ? T.mid : T.quiet }}>{m.kmLabel ?? `${DASH} km`}</span>
      </div>
    </motion.button>
  )
}

/* Declared at module scope, not inside the view: a component re-created on
 * every render remounts its subtree, which would replay the entrance
 * animations each time the period tab changes. */
const NumBadge = ({ n }: { n: number }) => (
  <span style={{ width: 24, height: 24, borderRadius: 100, background: T.evening, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, color: T.ink, flex: 'none' }}>{n}</span>
)
const Chip = ({ children }: { children: React.ReactNode }) => (
  <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.8, color: T.acid, padding: '6px 11px', borderRadius: 100, background: T.acidDim, flex: 'none', whiteSpace: 'nowrap' }}>{children}</span>
)
const SectionHead = ({ n, title, chip }: { n: number; title: string; chip?: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
    <NumBadge n={n} />
    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 21, fontWeight: 700, letterSpacing: -0.5, color: T.ink }}>{title}</span>
    {chip ? <Chip>{chip}</Chip> : null}
  </div>
)
const Tile = ({ label, value, quiet }: { label: string; value: string; quiet?: boolean }) => (
  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.8, color: T.quiet, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.5, color: quiet ? T.quiet : T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
  </div>
)

export default function W3CrewView({ vm, onBack, onProps, onInvite, onEditGoal, onPeriod, onOpenMember }: {
  vm: W3CrewVm
  onBack?: () => void
  onProps?: () => void
  onInvite?: () => void
  onEditGoal?: () => void
  onPeriod?: (p: W3Period) => void
  onOpenMember?: (id: number) => void
}) {
  const reduce = useReducedMotion()
  const memberRows: W3CrewMember[][] = []
  for (let i = 0; i < vm.members.length; i += 2) memberRows.push(vm.members.slice(i, i + 2))
  const cols = vm.showedUp[0]?.days.length ?? 0
  const gridGap = cols > 8 ? 4 : 6

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg }}>
        <W3StatusBar />

        {/* Nav + title + blurb */}
        <div style={{ ...band(18), gap: 16, paddingTop: 6 }}>
          <button onClick={onBack} aria-label="Zurück" style={{ width: 44, height: 44, borderRadius: 100, background: T.ink, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><ArrowLeft size={19} color={T.bg} /></button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 38, fontWeight: 700, letterSpacing: -1.4, lineHeight: 1.02, color: T.ink }}>{vm.crewName}</span>
            <span style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.45, color: T.mid }}>{vm.blurb}</span>
          </div>
        </div>

        {vm.inCrew ? (
          <>
            {/* Period — one control, every number below follows it */}
            <div style={{ ...band(20) }}>
              <W3PeriodTabs value={vm.period} onChange={(p) => onPeriod?.(p)} />
            </div>

            {/* Big rank */}
            <div style={{ ...band(22), alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                <span style={{ fontSize: 52, fontWeight: 800, letterSpacing: -2, color: T.ink }}>{vm.rankOrdinal}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: T.mid }}>{vm.rankSub}</span>
              </div>
            </div>

            {/* 1 · Crew output — the aggregate answer, summed from the real rows */}
            <div style={{ ...band(28), gap: 14 }}>
              <SectionHead n={1} title="Crew-Leistung" chip={vm.windowChip || undefined} />
              <div style={{ ...card(), gap: 16 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: T.quiet }}>CREW TSS</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
                    <motion.span
                      initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
                      style={{ fontSize: 56, fontWeight: 800, letterSpacing: -2.4, lineHeight: 1, color: T.acid, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{vm.crewTss}</motion.span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 500, color: T.mid }}>{vm.crewTssSub}</span>
                </div>
                <div style={{ height: 1, background: T.rule }} />
                <div style={{ display: 'flex', gap: 12 }}>
                  <Tile label="KILOMETER" value={vm.crewKm} quiet={vm.crewKm === DASH} />
                  <Tile label="Ø / FAHRER" value={vm.avgTss} />
                  <Tile label="DEIN ANTEIL" value={vm.yourShare} quiet={vm.yourShare === DASH} />
                </div>
                {vm.crewKmCoverage && (
                  <span style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.4, color: T.quiet }}>{vm.crewKmCoverage}</span>
                )}
                <span style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.4, color: T.quiet }}>{vm.outputNote}</span>
              </div>
            </div>

            {/* Give props — a real crew_week cheer */}
            <div style={{ ...band(10) }}>
              <button onClick={onProps} style={{ width: '100%', height: 60, borderRadius: 100, background: vm.propsGiven ? T.acid : T.evening, border: 0, display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', cursor: 'pointer', fontFamily: FONT }}>
                <Sparkles size={19} color={vm.propsGiven ? T.bg : T.ink} /><span style={{ fontSize: 16, fontWeight: 700, color: vm.propsGiven ? T.bg : T.ink }}>{vm.propsGiven ? 'Props vergeben 👏' : 'Props geben'}</span>
              </button>
            </div>
            <div style={{ ...band(26) }}>
              <span style={{ fontSize: 11, fontWeight: 500, color: T.quiet, textAlign: 'center', width: '100%' }}>{vm.propsHint}</span>
            </div>

            {/* 2 · The crew */}
            <div style={{ ...band(28), gap: 14 }}>
              <SectionHead n={2} title="Die Crew" chip={`${vm.members.length} FAHRER`} />
              {memberRows.map((pair, ri) => (
                <div key={ri} style={{ display: 'flex', gap: 12 }}>
                  {pair.map((m, ci) => <MemberCard key={m.id} m={m} i={ri * 2 + ci} reduce={reduce} onOpen={onOpenMember} />)}
                  {pair.length === 1 && <div style={{ flex: 1 }} />}
                </div>
              ))}
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500, color: T.quiet }}>
                Tippe auf einen Fahrer für {vm.period === 'year' ? 'seine Saison' : vm.period === 'month' ? 'seinen Monat' : 'seine Woche'}<ChevronRight size={12} />
              </span>
            </div>

            {/* 3 · Who showed up */}
            {cols > 0 && (
              <div style={{ ...band(28), gap: 14 }}>
                <SectionHead n={3} title="Wer da war" chip={`${vm.showedUpFilled} / ${vm.showedUpTotal}`} />
                <div style={{ ...card(), gap: 12, padding: 18 }}>
                  {vm.gridDow && (
                    <div style={{ display: 'flex', gap: gridGap }}>
                      {DOW.map((d, i) => (
                        <span key={i} style={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: T.quiet }}>{d}</span>
                      ))}
                    </div>
                  )}
                  {vm.showedUp.map((row, ri) => (
                    <div key={row.id} style={{ display: 'flex', gap: gridGap, alignItems: 'center' }}>
                      {row.days.map((filled, di) => (
                        <motion.div key={di}
                          initial={reduce ? false : { scaleY: 0 }} animate={{ scaleY: 1 }} transition={grow(ri * 0.03 + di * 0.01)}
                          style={{ flex: 1, minWidth: 0, height: 20, borderRadius: 6, background: filled ? (row.isYou ? T.acid : T.d3) : T.rule, transformOrigin: 'center' }} />
                      ))}
                    </div>
                  ))}
                  {vm.gridEdges && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: T.quiet }}>{vm.gridEdges.left}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: T.quiet }}>{vm.gridEdges.right}</span>
                    </div>
                  )}
                  <span style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.4, color: T.quiet }}>{vm.showedUpNote}</span>
                </div>
              </div>
            )}

            {/* 4 · Around the world — the crew's weekly distance challenge */}
            {vm.showDistanceGoal && (
              <div style={{ ...band(28), gap: 14 }}>
                <SectionHead n={4} title="Einmal um die Welt" chip={`${vm.distancePct}%`} />
                <div style={{ ...card(), gap: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                      <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1.6, color: T.ink }}>{vm.distanceKm}</span>
                      <button onClick={onEditGoal} disabled={!onEditGoal} style={{ background: 'transparent', border: 0, padding: 0, cursor: onEditGoal ? 'pointer' : 'default', fontSize: 13, fontWeight: 600, color: onEditGoal ? T.evening : T.mid, display: 'flex', gap: 4, alignItems: 'center', fontFamily: FONT, whiteSpace: 'nowrap' }}>
                        von {vm.distanceGoalKm} km{onEditGoal && <Pencil size={11} />}
                      </button>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.6, color: T.quiet, flex: 'none' }}>NOCH {vm.distanceToGo} KM</span>
                  </div>
                  <div style={{ position: 'relative', height: 12, borderRadius: 100, background: T.rule, overflow: 'hidden' }}>
                    <motion.div
                      initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={grow(0.1)}
                      style={{ position: 'absolute', inset: 0, transformOrigin: 'left', width: `${Math.min(100, vm.distancePct)}%`, borderRadius: 100, background: T.d3 }} />
                    <motion.div
                      initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={grow(0.2)}
                      style={{ position: 'absolute', top: 0, bottom: 0, left: 0, transformOrigin: 'left', width: `${Math.min(100, vm.yourSharePct * vm.distancePct / 100)}%`, borderRadius: 100, background: T.acid }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <span style={{ minWidth: 0, fontSize: 11, fontWeight: 500, color: T.mid }}>{vm.yourDistanceNote}</span>
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.6, color: T.acid, flex: 'none' }}>{vm.yourSharePct}% DER CREW</span>
                  </div>
                </div>
              </div>
            )}

            {/* 5 · Highlights */}
            {vm.highlights.length > 0 && (
              <div style={{ ...band(28), gap: 14 }}>
                <SectionHead n={vm.showDistanceGoal ? 5 : 4} title={vm.highlightsTitle} />
                <div style={{ ...card(), gap: 0, padding: '4px 18px' }}>
                  {vm.highlights.map((h, i) => {
                    const tint = AVATAR_TINTS[i % AVATAR_TINTS.length]
                    return (
                      <div key={h.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '15px 0', borderTop: i === 0 ? 'none' : `1px solid ${T.rule}` }}>
                        <div style={{ width: 34, height: 34, borderRadius: 100, background: `linear-gradient(160deg, ${tint}, ${TINT_BASE})`, display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 800, color: T.d4, flex: 'none' }}>{h.name.replace(/^@/, '').charAt(0).toUpperCase()}</div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: h.isYou ? T.acid : T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</span>
                          <span style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.35, color: T.mid }}>{h.text}</span>
                        </div>
                        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, color: T.mid, padding: '6px 10px', borderRadius: 100, background: T.rule, flex: 'none', textAlign: 'center', maxWidth: 96, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.badge}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Footer — seats + invite */}
            <div style={{ ...band(30) }}>
              <div style={{ ...card(), gap: 12, border: `1px solid ${T.stroke}`, background: 'transparent' }}>
                <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.8, color: T.ink }}>{vm.seatsOpen > 0 ? `${vm.seatsOpen} ${vm.seatsOpen === 1 ? 'Platz' : 'Plätze'} frei` : 'Crew ist voll'}</span>
                <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.45, color: T.mid }}>{vm.seatsCopy}</span>
                <button onClick={onInvite} style={{ marginTop: 4, width: '100%', height: 56, borderRadius: 100, background: T.evening, border: 0, display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', cursor: 'pointer', fontFamily: FONT }}>
                  <UserPlus size={18} color={T.ink} /><span style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>Fahrer einladen</span>
                </button>
              </div>
            </div>
          </>
        ) : (
          /* Not in a crew yet — honest empty state */
          <div style={{ ...band(30), gap: 16 }}>
            <div style={{ ...card(), gap: 12, alignItems: 'center', textAlign: 'center', padding: 28 }}>
              <div style={{ width: 56, height: 56, borderRadius: 100, background: T.acidDim, display: 'grid', placeItems: 'center' }}><Sparkles size={24} color={T.acid} /></div>
              <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5, color: T.ink }}>Noch keine Crew</span>
              <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.45, color: T.mid }}>{vm.blurb}</span>
              <button onClick={onInvite} style={{ marginTop: 4, width: '100%', height: 56, borderRadius: 100, background: T.evening, border: 0, display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', cursor: 'pointer', fontFamily: FONT }}>
                <UserPlus size={18} color={T.ink} /><span style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>Fahrer einladen</span>
              </button>
            </div>
          </div>
        )}

        <W3TabBar />
      </div>
    </div>
  )
}
