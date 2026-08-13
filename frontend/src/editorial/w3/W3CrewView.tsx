import { motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, Sparkles, UserPlus, Activity as ActivityIcon } from 'lucide-react'
import { T, FONT, EASE, grow, band, card } from './w3tokens'
import W3StatusBar from './W3StatusBar'
import W3TabBar from './W3TabBar'
import './w3.css'

/**
 * W3 · 10 CREW — 1:1 code rebuild of `w3.pen` frame `WAjw9` ("Nachtschicht CC").
 * Pure function of `vm`; `W3CrewPage` wires it to `useMyCrew` + `useCrewStandings`.
 *
 * Crew uses VIOLET as its accent (like Referrals) with acid reserved for YOU
 * and for over-plan efforts. REAL: crew name, members, per-member active days,
 * each rider's score vs the crew leader, the who-showed-up week grid, summed
 * crew distance + your share, and the derived highlights. The props economy
 * (Gib Props), the 500 km "Around the world" goal, the 8-seat cap and the
 * rank delta are the reward/flavor layer with no backend field yet — every one
 * is marked `fixture:` below.
 */

const VIOLET = '#7B5CFF'
const AVATAR_TINTS = ['#B9A7EE', '#A7D8EE', '#EEC7A7', '#A7EEC0', '#EEA7D2', '#EED7A7', '#A7C4EE', '#D2A7EE']
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export interface W3CrewMember {
  id: number
  name: string          // handle (no @) or "You"
  rank: number          // 1-based, by weekly score
  sessions: number      // active days this window (real)
  pct: number           // weekly_score vs crew leader, 0-100+ (real)
  isYou: boolean
}

export interface W3ShowedUpRow {
  id: number
  name: string
  isYou: boolean
  days: boolean[]       // ≤7 filled/empty, one per day (real, from daily_pct)
}

export interface W3Highlight {
  id: string
  name: string
  isYou: boolean
  text: string
  badge: string
  fixture?: boolean     // flavor line with no data source
}

export interface W3CrewVm {
  inCrew: boolean
  crewName: string
  blurb: string
  rankOrdinal: string   // "2nd"
  rankSub: string       // "of six this week" (+ fixture "· up one")
  propsHint: string     // "Three a week. Spend them on the effort, not the number."
  periodChip: string    // "MON–SUN"
  members: W3CrewMember[]
  showedUp: W3ShowedUpRow[]
  showedUpFilled: number
  showedUpTotal: number
  showedUpNote: string
  distanceKm: number
  distanceGoalKm: number    // fixture: crew distance goal
  distancePct: number       // real: total vs goal
  distanceToGo: number
  yourDistanceKm: number
  yourDistanceNote: string  // real: "more than four of the six"
  yourSharePct: number      // real: your km / crew km
  highlights: W3Highlight[]
  seatsOpen: number         // fixture cap − real member count
  seatsCopy: string
}

function MemberCard({ m, i, reduce }: { m: W3CrewMember; i: number; reduce: boolean | null }) {
  const tint = AVATAR_TINTS[i % AVATAR_TINTS.length]
  const namePillBg = m.isYou ? T.acid : VIOLET
  const namePillFg = m.isYou ? T.bg : '#fff'
  const pctColor = m.pct >= 100 ? T.acid : T.mid
  const initial = m.name.replace(/^@/, '').charAt(0).toUpperCase()
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE, delay: i * 0.05 }}
      style={{ position: 'relative', flex: 1, minWidth: 0, aspectRatio: '0.9', borderRadius: 22, overflow: 'hidden', background: `linear-gradient(160deg, ${tint}, #16131f)`, outline: m.isYou ? `2px solid ${T.acid}` : 'none', outlineOffset: -2 }}
    >
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 52, fontWeight: 800, color: '#FFFFFF4D' }}>{initial}</div>
      {/* name + rank pill */}
      <div style={{ position: 'absolute', left: 8, right: 8, top: 8, display: 'flex', justifyContent: 'center' }}>
        <span style={{ padding: '5px 12px', borderRadius: 100, background: namePillBg, fontSize: 11, fontWeight: 800, color: namePillFg, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.rank} · {m.name}</span>
      </div>
      {/* sessions + share */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '18px 11px 10px', background: 'linear-gradient(0deg, #000000D9, #00000000)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 11, fontWeight: 700, color: T.mid }}><ActivityIcon size={11} />{m.sessions} session{m.sessions === 1 ? '' : 's'}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: pctColor }}>{m.pct}%</span>
      </div>
    </motion.div>
  )
}

export default function W3CrewView({ vm, onBack, onProps, onInvite }: {
  vm: W3CrewVm; onBack?: () => void; onProps?: () => void; onInvite?: () => void
}) {
  const reduce = useReducedMotion()
  const memberRows: W3CrewMember[][] = []
  for (let i = 0; i < vm.members.length; i += 2) memberRows.push(vm.members.slice(i, i + 2))

  const NumBadge = ({ n }: { n: number }) => (
    <span style={{ width: 24, height: 24, borderRadius: 100, background: VIOLET, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, color: '#fff', flex: 'none' }}>{n}</span>
  )
  const Chip = ({ children }: { children: React.ReactNode }) => (
    <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.8, color: T.acid, padding: '6px 11px', borderRadius: 100, background: T.acidDim, flex: 'none' }}>{children}</span>
  )
  const SectionHead = ({ n, title, chip }: { n: number; title: string; chip?: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <NumBadge n={n} />
      <span style={{ flex: 1, fontSize: 21, fontWeight: 700, letterSpacing: -0.5, color: T.ink }}>{title}</span>
      {chip ? <Chip>{chip}</Chip> : null}
    </div>
  )

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg }}>
        <W3StatusBar />

        {/* Nav + title + blurb */}
        <div style={{ ...band(24), gap: 16, paddingTop: 6 }}>
          <button onClick={onBack} aria-label="Back" style={{ width: 44, height: 44, borderRadius: 100, background: '#fff', border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><ArrowLeft size={19} color="#000" /></button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 38, fontWeight: 700, letterSpacing: -1.4, lineHeight: 1.02, color: T.ink }}>{vm.crewName}</span>
            <span style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.45, color: T.mid }}>{vm.blurb}</span>
          </div>
        </div>

        {vm.inCrew ? (
          <>
            {/* Big rank */}
            <div style={{ ...band(22), alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                <span style={{ fontSize: 52, fontWeight: 800, letterSpacing: -2, color: T.ink }}>{vm.rankOrdinal}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: T.mid }}>{vm.rankSub}</span>
              </div>
            </div>

            {/* Gib Props (fixture: props economy) */}
            <div style={{ ...band(10) }}>
              <button onClick={onProps} style={{ width: '100%', height: 60, borderRadius: 100, background: VIOLET, border: 0, display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', cursor: 'pointer', fontFamily: FONT }}>
                <Sparkles size={19} color="#fff" /><span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Give props</span>
              </button>
            </div>
            <div style={{ ...band(26) }}>
              <span style={{ fontSize: 11, fontWeight: 500, color: T.quiet, textAlign: 'center', width: '100%' }}>{vm.propsHint}</span>
            </div>

            {/* 1 · The crew */}
            <div style={{ ...band(28), gap: 14 }}>
              <SectionHead n={1} title="The crew" chip={vm.periodChip} />
              {memberRows.map((pair, ri) => (
                <div key={ri} style={{ display: 'flex', gap: 12 }}>
                  {pair.map((m, ci) => <MemberCard key={m.id} m={m} i={ri * 2 + ci} reduce={reduce} />)}
                  {pair.length === 1 && <div style={{ flex: 1 }} />}
                </div>
              ))}
            </div>

            {/* 2 · Who showed up */}
            <div style={{ ...band(28), gap: 14 }}>
              <SectionHead n={2} title="Who showed up" chip={`${vm.showedUpFilled} / ${vm.showedUpTotal}`} />
              <div style={{ ...card(), gap: 12, padding: 18 }}>
                {/* day header */}
                <div style={{ display: 'flex', gap: 6, paddingLeft: 0 }}>
                  {DOW.map((d, i) => (
                    <span key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: T.quiet }}>{d}</span>
                  ))}
                </div>
                {vm.showedUp.map((row, ri) => (
                  <div key={row.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {Array.from({ length: 7 }).map((_, di) => {
                      const filled = row.days[di]
                      const bg = filled ? (row.isYou ? T.acid : T.d3) : T.rule
                      return (
                        <motion.div key={di}
                          initial={reduce ? false : { scaleY: 0 }} animate={{ scaleY: 1 }} transition={grow(ri * 0.03 + di * 0.01)}
                          style={{ flex: 1, height: 20, borderRadius: 6, background: bg, transformOrigin: 'center' }} />
                      )
                    })}
                  </div>
                ))}
                <span style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.4, color: T.quiet }}>{vm.showedUpNote}</span>
              </div>
            </div>

            {/* 3 · Around the world */}
            <div style={{ ...band(28), gap: 14 }}>
              <SectionHead n={3} title="Around the world" chip={`${vm.distancePct}%`} />
              <div style={{ ...card(), gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1.6, color: T.ink }}>{vm.distanceKm}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.mid }}>of {vm.distanceGoalKm} km</span>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.6, color: T.quiet }}>{vm.distanceToGo} KM TO GO</span>
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
                  <span style={{ fontSize: 11, fontWeight: 500, color: T.mid }}>{vm.yourDistanceNote}</span>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.6, color: T.acid, flex: 'none' }}>{vm.yourSharePct}% OF CREW</span>
                </div>
              </div>
            </div>

            {/* 4 · This week in the crew */}
            {vm.highlights.length > 0 && (
              <div style={{ ...band(28), gap: 14 }}>
                <SectionHead n={4} title="This week in the crew" />
                <div style={{ ...card(), gap: 0, padding: '4px 18px' }}>
                  {vm.highlights.map((h, i) => {
                    const tint = AVATAR_TINTS[i % AVATAR_TINTS.length]
                    return (
                      <div key={h.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '15px 0', borderTop: i === 0 ? 'none' : `1px solid ${T.rule}` }}>
                        <div style={{ width: 34, height: 34, borderRadius: 100, background: `linear-gradient(160deg, ${tint}, #16131f)`, display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 800, color: '#FFFFFF88', flex: 'none' }}>{h.name.replace(/^@/, '').charAt(0).toUpperCase()}</div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: h.isYou ? T.acid : T.ink }}>{h.name}</span>
                          <span style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.35, color: T.mid }}>{h.text}</span>
                        </div>
                        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, color: T.mid, padding: '6px 10px', borderRadius: 100, background: T.rule, flex: 'none', textAlign: 'center', maxWidth: 96 }}>{h.badge}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Footer — seats + invite */}
            <div style={{ ...band(30) }}>
              <div style={{ ...card(), gap: 12, border: `1px solid ${T.stroke}`, background: 'transparent' }}>
                <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.8, color: T.ink }}>{vm.seatsOpen > 0 ? `${vm.seatsOpen} seat${vm.seatsOpen === 1 ? '' : 's'} open` : 'Crew is full'}</span>
                <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.45, color: T.mid }}>{vm.seatsCopy}</span>
                <button onClick={onInvite} style={{ marginTop: 4, width: '100%', height: 56, borderRadius: 100, background: VIOLET, border: 0, display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', cursor: 'pointer', fontFamily: FONT }}>
                  <UserPlus size={18} color="#fff" /><span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Invite a rider</span>
                </button>
              </div>
            </div>
          </>
        ) : (
          /* Not in a crew yet — honest empty state */
          <div style={{ ...band(30), gap: 16 }}>
            <div style={{ ...card(), gap: 12, alignItems: 'center', textAlign: 'center', padding: 28 }}>
              <div style={{ width: 56, height: 56, borderRadius: 100, background: T.acidDim, display: 'grid', placeItems: 'center' }}><Sparkles size={24} color={T.acid} /></div>
              <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5, color: T.ink }}>No crew yet</span>
              <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.45, color: T.mid }}>{vm.blurb}</span>
              <button onClick={onInvite} style={{ marginTop: 4, width: '100%', height: 56, borderRadius: 100, background: VIOLET, border: 0, display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', cursor: 'pointer', fontFamily: FONT }}>
                <UserPlus size={18} color="#fff" /><span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Invite a rider</span>
              </button>
            </div>
          </div>
        )}

        <W3TabBar />
      </div>
    </div>
  )
}
