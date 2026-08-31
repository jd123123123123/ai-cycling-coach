import { motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, Sparkles, UserPlus, Pencil, ChevronRight } from 'lucide-react'
import { W3CrewFeedPage } from './W3CrewFeed'
import { T, FONT, EASE, grow, band, card, DASH } from './w3tokens'
import W3PeriodTabs from './W3PeriodTabs'
import { YOU_TINT, type W3Period } from './w3crew'
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


export interface W3CrewMember {
  id: number
  name: string          // handle (no @) or "Du"
  /** The rider's own collectible, 96 px, as a data URL. Null when they have
   *  not made one — and then the tile shows their initial instead, which is a
   *  placeholder rather than a picture of somebody else's bike. */
  avatar?: string | null
  rank: number          // 1-based, by window score
  tssLabel: string      // real window TSS, formatted
  kmLabel: string | null // real window distance, or null when the rider has none
  /** Real window saddle time. Null on a payload that predates it — and then the
   *  tile shows two numbers rather than a zero. */
  hoursLabel: string | null
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
  /** Their collectible thumbnail, when they have one. */
  avatar?: string | null
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
  /** THE CREW'S WEEK, IN THE ORDER A CREW SAYS IT: kilometres, hours, then the
   *  training load. Summed from the same real rows the board is ranked on, and
   *  a total nobody has data for is dropped rather than shown as a zero. */
  crewTotals: { key: string; value: string; unit?: string; label: string; quiet?: boolean }[]
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
  // ONE QUESTION THE COLOUR ANSWERS: is this me? The tile used to take a hue
  // from a cycling list of six, so a rider could not find themselves on their
  // own crew board — and the first of those hues was the acid itself.
  const mine = m.isYou
  const pctColor = m.pct >= 100 ? T.acid : T.mid
  const initial = m.name.replace(/^@/, '').charAt(0).toUpperCase()
  return (
    <motion.button
      onClick={onOpen ? () => onOpen(m.id) : undefined}
      aria-label={`${m.name} öffnen`}
      initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE, delay: i * 0.05 }}
      style={{
        position: 'relative', flex: 1, minWidth: 0, aspectRatio: '0.9', borderRadius: 22,
        overflow: 'hidden', padding: 0, border: 0, fontFamily: FONT, textAlign: 'left',
        cursor: onOpen ? 'pointer' : 'default', background: mine ? T.acidTop : T.surface,
        outline: mine ? `2px solid ${T.acid}` : 'none', outlineOffset: -2,
      }}
    >
      {/* THE RIDER'S OWN COLLECTIBLE. It has been in the payload all along —
          `StandingRow.avatar`, a 96 px thumbnail the server already builds — and
          this tile drew a letter over a gradient instead. A crew board whose
          faces are all letters is a spreadsheet. */}
      {m.avatar
        ? <img src={m.avatar} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        : <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 52, fontWeight: 600, color: T.d2 }}>{initial}</div>}

      {/* name + rank pill */}
      <div style={{ position: 'absolute', left: 8, right: 8, top: 8, display: 'flex', justifyContent: 'center' }}>
        <span style={{ padding: '5px 12px', borderRadius: 100, background: mine ? YOU_TINT : T.glass, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', fontSize: 11, fontWeight: 600, color: mine ? T.bg : T.ink, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.rank} · {m.name}</span>
      </div>
      {/* window TSS + distance + share of the leader */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '22px 11px 10px', background: `linear-gradient(0deg, ${T.bg}, transparent)`, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 15, fontWeight: 600, letterSpacing: -0.4, color: T.ink }}>{m.tssLabel}<span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.6, color: T.mid }}> TSS</span></span>
          <span style={{ flex: 'none', fontSize: 13, fontWeight: 600, color: pctColor }}>{m.pct}%</span>
        </div>
        {/* KM AND HOURS BESIDE THE TSS, because TSS is the one number on this
            board a rider cannot feel. "84 km · 3,2 h" is a week somebody
            recognises; "412 TSS" is a week they have to convert. A measurement
            the payload does not carry is dropped rather than shown as a zero. */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, overflow: 'hidden' }}>
          {[m.kmLabel, m.hoursLabel].filter(Boolean).map((v, i) => (
            <span key={i} style={{
              whiteSpace: 'nowrap', fontSize: 10.5, fontWeight: 600, color: T.mid,
              ...(i > 0 ? { opacity: 0.8 } : null),
            }}>{i > 0 ? '· ' : ''}{v}</span>
          ))}
          {!m.kmLabel && !m.hoursLabel && (
            <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet }}>{DASH}</span>
          )}
        </div>
      </div>
    </motion.button>
  )
}

/* Declared at module scope, not inside the view: a component re-created on
 * every render remounts its subtree, which would replay the entrance
 * animations each time the period tab changes. */
const NumBadge = ({ n }: { n: number }) => (
  <span style={{ width: 24, height: 24, borderRadius: 100, background: T.evening, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 600, color: T.ink, flex: 'none' }}>{n}</span>
)
const Chip = ({ children }: { children: React.ReactNode }) => (
  <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.8, color: T.acid, padding: '6px 11px', borderRadius: 100, background: T.acidDim, flex: 'none', whiteSpace: 'nowrap' }}>{children}</span>
)
const SectionHead = ({ n, title, chip }: { n: number; title: string; chip?: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
    <NumBadge n={n} />
    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 21, fontWeight: 600, letterSpacing: -0.5, color: T.ink }}>{title}</span>
    {chip ? <Chip>{chip}</Chip> : null}
  </div>
)

export default function W3CrewView({ vm, onBack, onProps, onInvite, onEditGoal, onPeriod, onOpenMember, feed }: {
  vm: W3CrewVm
  onBack?: () => void
  onProps?: () => void
  onInvite?: () => void
  onEditGoal?: () => void
  onPeriod?: (p: W3Period) => void
  onOpenMember?: (id: number) => void
  /** Chapter 03's contents. Omitted on the wired screen, where the section
   *  fetches the crew's real rides itself. */
  feed?: React.ReactNode
}) {
  const reduce = useReducedMotion()

  // WHO THE READER IS. The whole screen is a comparison, and every comparison
  // needs a subject — this one is derived once here rather than re-found in
  // three places, and the verdict band above the board is built from it.
  const you = vm.members.find((m) => m.isYou) ?? null
  // The rider one place ahead, named, because "2nd of six" is a fact and
  // "18 TSS behind @mara" is something a rider can act on this evening.
  const ahead = (() => {
    if (!you || you.rank <= 1) return null
    const above = vm.members.find((m) => m.rank === you.rank - 1)
    return above ? `${above.name} liegt vor dir` : null
  })()

  const memberRows: W3CrewMember[][] = []
  for (let i = 0; i < vm.members.length; i += 2) memberRows.push(vm.members.slice(i, i + 2))

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg }}>
        <W3StatusBar />

        {/* Nav + title + blurb */}
        <div style={{ ...band(18), gap: 16, paddingTop: 6 }}>
          <button onClick={onBack} aria-label="Zurück" style={{ width: 44, height: 44, borderRadius: 100, background: T.ink, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><ArrowLeft size={19} color={T.bg} /></button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 38, fontWeight: 600, letterSpacing: -1.4, lineHeight: 1.02, color: T.ink }}>{vm.crewName}</span>
            <span style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.45, color: T.mid }}>{vm.blurb}</span>
          </div>
        </div>

        {vm.inCrew ? (
          <>
            {/* Period — one control, every number below follows it */}
            <div style={{ ...band(20) }}>
              <W3PeriodTabs value={vm.period} onChange={(p) => onPeriod?.(p)} />
            </div>

            {/* ── THE ANSWER, BEFORE ANY OF THE EVIDENCE ────────────────────
                This was a bare ordinal floating in the middle of the page —
                "2nd", centred, with five equally-weighted numbered sections
                under it, so the question a rider opens this screen with ("how
                am I doing?") was answered by a number with nothing attached and
                then buried. It reads as a verdict now: the place, who it is out
                of, and whether you are clearing your OWN bar, which is the only
                comparison this board claims to make. ── */}
            <div style={{ ...band(24), gap: 12 }}>
              <div style={{ ...card(), padding: '20px 18px', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ fontSize: 56, fontWeight: 600, letterSpacing: -2.4, lineHeight: 0.9, color: T.acid }}>{vm.rankOrdinal}</span>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: T.mid }}>{vm.rankSub}</span>
                </div>
                {you && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* Your own bar, as a bar. The percentage was a number in a
                        tile; a rider reads "am I over the line" from a line. */}
                    <div style={{ height: 8, borderRadius: 100, background: T.d1, overflow: 'hidden', position: 'relative' }}>
                      <motion.div
                        initial={reduce ? false : { width: 0 }} animate={{ width: `${Math.min(100, you.pct)}%` }} transition={grow(0.1)}
                        style={{ height: '100%', borderRadius: 100, background: you.pct >= 100 ? T.acid : T.evening }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.4, color: T.mid }}>
                      <span style={{ color: you.pct >= 100 ? T.acid : T.ink, fontWeight: 600 }}>{you.pct}%</span> deiner eigenen Woche{ahead ? ` · ${ahead}` : ''}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* 2 · The crew */}
            <div style={{ ...band(28), gap: 14 }}>
              <SectionHead n={1} title="Die Crew" chip={`${vm.members.length} FAHRER`} />

              {/* ── WHAT THE CREW DID, TOGETHER ────────────────────────────
                  Above the faces, because this is the one line on the screen
                  that is about all of them and nobody's rank. It used to sit
                  BELOW the board in a section of its own, which made it read
                  as a second scoreboard rather than as the celebration it is —
                  and it repeated the per-rider numbers three inches under the
                  per-rider numbers.

                  Kilometres lead, hours next, TSS last. That is the order a
                  crew says these out loud, and it is the reverse of the order
                  the old card used. */}
              <div style={{
                display: 'flex', alignItems: 'stretch', gap: 0,
                padding: '16px 4px', borderRadius: 22, background: T.acidTop,
                border: `1px solid ${T.acid}22`,
              }}>
                {vm.crewTotals.map((t, i) => (
                  <div key={t.key} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'stretch' }}>
                    {i > 0 && <div style={{ width: 1, background: T.rule, opacity: 0.5, margin: '3px 0' }} />}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, minWidth: 0 }}>
                        <motion.span
                          initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.45, ease: EASE, delay: 0.04 * i }}
                          style={{
                            fontSize: 26, fontWeight: 600, letterSpacing: -1, lineHeight: 1,
                            color: t.quiet ? T.mid : T.acid,
                            minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>{t.value}</motion.span>
                        {t.unit && (
                          <span style={{ fontSize: 11, fontWeight: 600, color: t.quiet ? T.quiet : T.acid }}>{t.unit}</span>
                        )}
                      </div>
                      <span style={{ fontSize: 8.5, fontWeight: 600, letterSpacing: 0.9, color: T.quiet, textAlign: 'center' }}>{t.label}</span>
                    </div>
                  </div>
                ))}
              </div>
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

            {/* CREW-LEISTUNG IS GONE. Its four figures are the band above the
                board now — the same numbers, said once, where they read as the
                crew's week rather than as a second scoreboard under the first. */}

            {/* Give props — a real crew_week cheer */}
            <div style={{ ...band(10) }}>
              <button onClick={onProps} style={{ width: '100%', height: 60, borderRadius: 100, background: vm.propsGiven ? T.acid : T.evening, border: 0, display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', cursor: 'pointer', fontFamily: FONT }}>
                <Sparkles size={19} color={vm.propsGiven ? T.bg : T.ink} /><span style={{ fontSize: 16, fontWeight: 600, color: vm.propsGiven ? T.bg : T.ink }}>{vm.propsGiven ? 'Props vergeben 👏' : 'Props geben'}</span>
              </button>
            </div>
            <div style={{ ...band(26) }}>
              <span style={{ fontSize: 11, fontWeight: 500, color: T.quiet, textAlign: 'center', width: '100%' }}>{vm.propsHint}</span>
            </div>

            {/* WER DA WAR IS GONE. A 6×7 grid of blocks answering "did this
                rider ride on Tuesday" is a question nobody arrived with, and
                each tile's own bar already says how much of their week landed. */}

            {/* 4 · Around the world — the crew's weekly distance challenge */}
            {vm.showDistanceGoal && (
              <div style={{ ...band(28), gap: 14 }}>
                <SectionHead n={2} title="Einmal um die Welt" chip={`${vm.distancePct}%`} />
                <div style={{ ...card(), gap: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                      <span style={{ fontSize: 40, fontWeight: 600, letterSpacing: -1.6, color: T.ink }}>{vm.distanceKm}</span>
                      <button onClick={onEditGoal} disabled={!onEditGoal} style={{ background: 'transparent', border: 0, padding: 0, cursor: onEditGoal ? 'pointer' : 'default', fontSize: 13, fontWeight: 600, color: onEditGoal ? T.evening : T.mid, display: 'flex', gap: 4, alignItems: 'center', fontFamily: FONT, whiteSpace: 'nowrap' }}>
                        von {vm.distanceGoalKm} km{onEditGoal && <Pencil size={11} />}
                      </button>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.6, color: T.quiet, flex: 'none' }}>NOCH {vm.distanceToGo} KM</span>
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
                    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.6, color: T.acid, flex: 'none' }}>{vm.yourSharePct}% DER CREW</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── 03 THE FEED, WHERE IT WAS ALWAYS POINTING ──────────────
                Today's crew column caps at four rides and offers "+N weitere
                in der Crew", which navigated HERE — to a screen that rendered
                no feed at all. The rides it counted were reachable from
                nowhere. This is that promise, kept: every ride the crew has
                logged, each one opening in place with its reactions and its
                thread, the same component Today draws so there is one crew
                feed in the app and not two dialects of one.

                It sits after the board and the ring because those answer
                "where do I stand" and this answers "what did they actually
                do" — the standings are the summary, the feed is the evidence,
                and a summary reads better before its evidence. */}
            <div style={{ ...band(28), gap: 14 }}>
              <SectionHead n={3} title="Zuletzt gefahren" />
              {/* The wired screen lets the section fetch its own rides; the
                  preview hands it fixtures so the chapter is reviewable
                  without a crew, a session or a backend. */}
              {feed ?? <W3CrewFeedPage />}
            </div>

            {/* HIGHLIGHTS IS GONE — it restated the board in sentences.
                "@mara leads the crew board this week", "You · 412 TSS · 84 km",
                "@timo showed up 3 of 7 days": the first is the board's rank 1,
                the second is your own tile, the third was the attendance grid.
                Three ways of saying what the screen has already said, in a mix
                of German and English, at the bottom where a rider arrives
                having already read it. */}


            {/* Footer — seats + invite */}
            <div style={{ ...band(30) }}>
              <div style={{ ...card(), gap: 12, border: `1px solid ${T.stroke}`, background: 'transparent' }}>
                <span style={{ fontSize: 24, fontWeight: 600, letterSpacing: -0.8, color: T.ink }}>{vm.seatsOpen > 0 ? `${vm.seatsOpen} ${vm.seatsOpen === 1 ? 'Platz' : 'Plätze'} frei` : 'Crew ist voll'}</span>
                <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.45, color: T.mid }}>{vm.seatsCopy}</span>
                <button onClick={onInvite} style={{ marginTop: 4, width: '100%', height: 56, borderRadius: 100, background: T.evening, border: 0, display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', cursor: 'pointer', fontFamily: FONT }}>
                  <UserPlus size={18} color={T.ink} /><span style={{ fontSize: 15, fontWeight: 600, color: T.ink }}>Fahrer einladen</span>
                </button>
              </div>
            </div>
          </>
        ) : (
          /* Not in a crew yet — honest empty state */
          <div style={{ ...band(30), gap: 16 }}>
            <div style={{ ...card(), gap: 12, alignItems: 'center', textAlign: 'center', padding: 28 }}>
              <div style={{ width: 56, height: 56, borderRadius: 100, background: T.acidDim, display: 'grid', placeItems: 'center' }}><Sparkles size={24} color={T.acid} /></div>
              <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.5, color: T.ink }}>Noch keine Crew</span>
              <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.45, color: T.mid }}>{vm.blurb}</span>
              <button onClick={onInvite} style={{ marginTop: 4, width: '100%', height: 56, borderRadius: 100, background: T.evening, border: 0, display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', cursor: 'pointer', fontFamily: FONT }}>
                <UserPlus size={18} color={T.ink} /><span style={{ fontSize: 15, fontWeight: 600, color: T.ink }}>Fahrer einladen</span>
              </button>
            </div>
          </div>
        )}

        <W3TabBar />
      </div>
    </div>
  )
}
