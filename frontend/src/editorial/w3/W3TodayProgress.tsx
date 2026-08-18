import { motion, useReducedMotion } from 'motion/react'
import { HeartPulse, Target, TrendingUp, TrendingDown, Trophy, Zap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useSeasonTrends, type MetricSummary, type TrendPoint } from '../../hooks/useSeasonTrends'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { useAchievements } from '../../hooks/useAchievements'
import { useRewardChallenges, useJoinChallenge } from '../../hooks/useRewardChallenges'
import type { ChallengeMetric, RewardChallenge } from '../../api/rewardChallenges'
import { T, FONT, EASE, grow } from './w3tokens'
import { S, lux, TNUM } from './w3surfaces'

/**
 * W3 · Today "Dein Fortschritt" — the athlete's real fitness goals (FTP, VO₂max,
 * 20-min power), their live monthly challenges, and the next badge they are
 * actually working toward. Every number is the rider's own:
 *
 *   • FTP            — /athletes/me (`ftp_watts`), with W/kg from the stored
 *                      `weight_kg` and, when the rider has SET one, progress
 *                      against their own `goals.target_ftp`. No goal on file →
 *                      no bar (an invented target would be the worst kind of
 *                      motivation).
 *   • VO₂max, 20-min — /analytics/season-trends: the season's real MONTHLY
 *                      series is drawn as a sparkline, the delta is the
 *                      server's own first→latest, and the sub-line names the
 *                      real month the comparison starts in.
 *   • challenges     — /challenges/mine `active[]` (value/target/pct computed
 *                      server-side from the rider's own rides this month)
 *   • next badge     — /achievements/mine `in_progress[]` (real current/target)
 *
 * Honest "—" where a signal is absent, and a metric with fewer than two stored
 * months gets NO line rather than a two-point shape that implies a trend. The
 * joinable catalog (`/challenges/mine` → `available[]`) deliberately shows NO
 * progress bar: the server returns a placeholder `value: 0` for challenges the
 * rider has not joined, so a bar there would be a fabricated stat. Joining
 * backfills to the 1st of the month, so progress becomes real the instant you
 * tap MITMACHEN.
 */

const band = (padBottom: number) => ({ display: 'flex', flexDirection: 'column' as const, width: '100%', background: T.bg, padding: `0 20px ${padBottom}px`, fontFamily: FONT })
const CH_UNIT: Record<ChallengeMetric, string> = { active_days: 'Tage', distance_km: 'km', tss: 'TSS', rides: 'Fahrten', hours: 'h', kj: 'kJ' }
const nf = new Intl.NumberFormat('de-DE')
const ellipsis = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }
const cardBtn = { width: '100%', border: 0, background: T.surface, fontFamily: FONT, textAlign: 'left' as const, cursor: 'pointer' }
const dec = (n: number, d = 1) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })

/** Days left in the challenge period ("YYYY-MM"), computed from the calendar —
 *  the enrolment window IS the calendar month (services/challenges.period_bounds).
 *  null when the payload's period is not the month we are in. */
function daysLeftIn(period: string | undefined): number | null {
  if (!period) return null
  const [y, m] = period.split('-').map(Number)
  if (!y || !m) return null
  const now = new Date()
  if (now.getFullYear() !== y || now.getMonth() + 1 !== m) return null
  return Math.max(0, new Date(y, m, 0).getDate() - now.getDate())
}

/** The metric's REAL monthly series, drawn small: a line with an emphasised
 *  endpoint and no gridlines. Fewer than two stored months → an empty track,
 *  never an invented shape. */
function Spark({ values, hue, reduce }: { values: number[]; hue: string; reduce: boolean | null }) {
  const H = 20
  const W = 100
  if (values.length < 2) {
    return (
      <div style={{ height: H, display: 'flex', alignItems: 'center' }}>
        <div style={{ width: '100%', height: 2, borderRadius: 1, background: T.surface2 }} />
      </div>
    )
  }
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || 1
  const x = (i: number) => (i / (values.length - 1)) * W
  const y = (v: number) => H - 3 - ((v - lo) / span) * (H - 6)
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return (
    // NOTE: this animates OPACITY, not pathLength. `pathLength` is implemented
    // as a stroke-dash offset measured in user units, and this viewBox is 100
    // units wide stretched to ~130px by preserveAspectRatio="none" — so with
    // vectorEffect="non-scaling-stroke" the dash under-covers the path by the
    // stretch factor and the line visibly stops ~30% short of its own endpoint
    // dot. The big CTL chart gets away with pathLength because its viewBox is
    // within ~3% of its rendered width; a sparkline is not.
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
      <motion.path d={d} fill="none" stroke={T.d4} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"
        initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, ease: EASE }} />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={2.6} fill={hue} style={{ filter: `drop-shadow(0 0 5px ${hue})` }} />
    </svg>
  )
}

/** One season metric: its real latest value, its real monthly line, and the
 *  real month the season delta is measured from. */
function Metric({ icon: Icon, label, unit, sum, points, pick, reduce }: {
  icon: typeof Zap
  label: string
  unit: string
  sum: MetricSummary | undefined
  points: TrendPoint[]
  pick: (p: TrendPoint) => number | null
  reduce: boolean | null
}) {
  const series = points.map(pick).filter((v): v is number => v != null)
  const firstMonth = points.find((p) => pick(p) != null)?.month_de ?? null
  const latest = sum?.latest ?? null
  const delta = sum?.delta ?? null
  const flat = delta == null || Math.abs(delta) < 0.05
  const good = delta != null && (sum?.lower_is_better ? delta < 0 : delta > 0)
  // Ink, not acid. Two season deltas side by side, each with its own acid
  // sparkline endpoint, put four acid marks in one row and left nothing for
  // the challenge bar below — which is the section's actual call to action.
  const dHue = flat ? T.quiet : good ? T.ink : T.mid
  return (
    <div style={{ ...lux(18), flex: 1, minWidth: 0, padding: '15px 14px 16px', gap: S.sm }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ width: 24, height: 24, flex: 'none', borderRadius: 8, background: T.acidDim, border: `1px solid ${T.acid}24`, display: 'grid', placeItems: 'center' }}><Icon size={12} color={T.acid} /></span>
        <span style={{ ...ellipsis, fontSize: 8.5, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>{label}</span>
      </div>
      <span style={{ ...ellipsis, ...TNUM, fontSize: 25, fontWeight: 800, letterSpacing: -0.9, color: latest == null ? T.quiet : T.ink }}>
        {latest == null ? '—' : nf.format(Math.round(latest))}
        {unit && latest != null && <span style={{ fontSize: 10, fontWeight: 600, color: T.quiet }}> {unit}</span>}
      </span>
      <Spark values={series} hue={T.acid} reduce={reduce} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
        {delta != null && !flat ? (
          <>
            <span style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 2, fontSize: 10.5, fontWeight: 700, color: dHue }}>
              {delta > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
              {Math.abs(delta) % 1 === 0 ? Math.abs(delta) : dec(Math.abs(delta))}
            </span>
            <span style={{ ...ellipsis, fontSize: 9.5, fontWeight: 600, color: T.quiet }}>seit {firstMonth ?? 'Saisonstart'}</span>
          </>
        ) : (
          <span style={{ ...ellipsis, fontSize: 9.5, fontWeight: 600, color: T.quiet }}>
            {series.length > 1 ? `stabil seit ${firstMonth ?? 'Saisonstart'}` : 'noch keine Saisonreihe'}
          </span>
        )}
      </div>
    </div>
  )
}

/** One live challenge: real value against its real target. The nearest win
 *  (index 0) is the one loud element; the rest stay quiet. */
function ChallengeRow({ c, lead, i, daysLeft, reduce, onOpen }: { c: RewardChallenge; lead: boolean; i: number; daysLeft: number | null; reduce: boolean | null; onOpen: () => void }) {
  const unit = CH_UNIT[c.metric] ?? ''
  const bar = c.completed || lead ? T.acid : T.d3
  return (
    <button onClick={onOpen} style={{ ...cardBtn, background: 'transparent', display: 'flex', flexDirection: 'column', gap: 9, padding: '14px 0', borderTop: i === 0 ? 'none' : `1px solid ${T.rule}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
        <span style={{ ...ellipsis, flex: 1, fontSize: 13.5, fontWeight: 700, letterSpacing: -0.2, color: T.ink }}>{c.title}</span>
        <span style={{ flex: 'none', fontSize: 15, fontWeight: 700, letterSpacing: -0.4, fontVariantNumeric: 'tabular-nums', color: c.completed || lead ? T.acid : T.mid }}>
          {c.completed ? 'FERTIG' : `${c.pct}%`}
        </span>
      </div>
      <div style={{ height: lead ? 7 : 5, width: '100%', borderRadius: 100, background: '#FFFFFF0F', overflow: 'hidden' }}>
        <motion.div initial={reduce ? false : { width: 0 }} animate={{ width: `${c.pct}%` }} transition={grow(i * 0.06)} style={{ height: '100%', borderRadius: 100, background: bar }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
        <span style={{ ...ellipsis, flex: 1, fontSize: 10.5, fontWeight: 600, color: T.quiet }}>
          {nf.format(Math.round(c.value))} von {nf.format(c.target)} {unit}
          {!c.completed && c.target > c.value ? ` · noch ${nf.format(Math.ceil(c.target - c.value))} ${unit}` : ''}
        </span>
        <span style={{ flex: 'none', fontSize: 9, fontWeight: 700, letterSpacing: 0.8, color: c.completed ? T.acid : T.quiet }}>
          {c.completed
            ? `+${nf.format(c.awarded_rc ?? c.reward_rc)} RC ERHALTEN`
            : daysLeft != null ? `NOCH ${daysLeft} T · +${nf.format(c.reward_rc)} RC` : `+${nf.format(c.reward_rc)} RC`}
        </span>
      </div>
    </button>
  )
}

export default function W3TodayProgress() {
  const reduce = useReducedMotion()
  const navigate = useNavigate()
  const { data: trends } = useSeasonTrends()
  const { data: profile } = useAthleteProfile()
  const { data: challenges } = useRewardChallenges()
  const { data: ach } = useAchievements()
  const join = useJoinChallenge()

  const ftp = profile?.ftp_watts ?? null
  const weight = profile?.weight_kg ?? null
  // The rider's OWN declared FTP goal. Absent → no goal bar at all.
  const ftpGoal = profile?.goals?.target_ftp ?? null
  const wkg = ftp != null && weight != null && weight > 0 ? ftp / weight : null
  const points = trends?.points ?? []
  const active = challenges?.active ?? []
  const available = challenges?.available ?? []
  const daysLeft = daysLeftIn(challenges?.period)
  const openChallenges = () => navigate('/e/w3-challenges')

  const goalPct = ftp != null && ftpGoal != null && ftpGoal > 0 ? Math.min(100, Math.round((ftp / ftpGoal) * 100)) : null
  const goalToGo = ftp != null && ftpGoal != null ? Math.round(ftpGoal - ftp) : null

  // Next badge: the in-progress milestone the rider is closest to, with a real
  // current/target behind it. Milestones without a number are skipped.
  const nextBadge = ach?.in_progress
    .filter((p) => p.pct != null && p.progress != null)
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))[0] ?? null

  const tag = challenges
    ? active.length > 0 ? `${active.length} AKTIV` : available.length > 0 ? `${available.length} OFFEN` : null
    : null

  return (
    <div style={{ ...band(26), gap: 14 }}>
      {/* Section head — Today's rhythm: title + subtitle + acid pill */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        {/* Subtitle dropped — see the note in W3TodayRank's Head: the motto ran
            under all three lower titles and now appears once, on the first. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.6, color: T.ink }}>Dein Fortschritt</span>
        </div>
        {tag && (
          <div style={{ flex: 'none', padding: '7px 13px', borderRadius: 100, background: T.acidDim }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8, color: T.acid }}>{tag}</span>
          </div>
        )}
      </div>

      {/* ── FTP — the number a cyclist actually trains for. Real watts, real
           W/kg, and progress only against a goal the rider set themselves. ── */}
      <div style={{ ...lux(22), padding: S.xl, gap: S.md, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: S.md, minWidth: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 24, height: 24, flex: 'none', borderRadius: 8, background: T.acidDim, border: `1px solid ${T.acid}24`, display: 'grid', placeItems: 'center' }}><Zap size={12} color={T.acid} /></span>
              <span style={{ ...ellipsis, fontSize: 8.5, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>FTP · SCHWELLENLEISTUNG</span>
            </div>
            <span style={{ ...ellipsis, ...TNUM, fontSize: 38, fontWeight: 800, letterSpacing: -1.6, lineHeight: 1, color: ftp == null ? T.quiet : T.ink }}>
              {ftp == null ? '—' : nf.format(Math.round(ftp))}
              {ftp != null && <span style={{ fontSize: 13, fontWeight: 600, color: T.quiet }}> W</span>}
            </span>
          </div>
          <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
            <span style={{ ...TNUM, fontSize: 20, fontWeight: 700, letterSpacing: -0.6, color: wkg == null ? T.quiet : T.ink }}>{wkg == null ? '—' : dec(wkg, 2)}</span>
            <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.9, color: T.quiet }}>W/KG</span>
          </div>
        </div>

        {goalPct != null && goalToGo != null && ftpGoal != null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
            <div style={{ height: 6, borderRadius: 100, background: '#FFFFFF0F', overflow: 'hidden' }}>
              <motion.div initial={reduce ? false : { width: 0 }} animate={{ width: `${goalPct}%` }} transition={grow(0.1)}
                style={{ height: '100%', borderRadius: 100, background: goalToGo <= 0 ? T.acid : T.d3 }} />
            </div>
            <span style={{ ...ellipsis, fontSize: 10.5, fontWeight: 600, color: goalToGo <= 0 ? T.acid : T.quiet }}>
              {goalToGo <= 0
                ? `Ziel-FTP ${nf.format(ftpGoal)} W erreicht — Zeit für ein neues Ziel.`
                : `Noch ${nf.format(goalToGo)} W bis zu deinem Ziel-FTP ${nf.format(ftpGoal)} W · ${goalPct} %`}
            </span>
          </div>
        )}
      </div>

      {/* Season metrics — the rider's own monthly series, not a single number */}
      <div style={{ display: 'flex', gap: 8 }}>
        <Metric icon={HeartPulse} label="VO₂MAX" unit="" sum={trends?.vo2max} points={points} pick={(p) => p.vo2max} reduce={reduce} />
        <Metric icon={Target} label="20-MIN" unit="W" sum={trends?.p20min_w} points={points} pick={(p) => p.p20min_w} reduce={reduce} />
      </div>

      {/* Live challenges — real progress toward each real target */}
      {active.length > 0 && (
        <div style={{ ...lux(22), padding: '8px 20px 12px' }}>
          {active.slice(0, 3).map((c, i) => (
            <ChallengeRow key={c.key} c={c} i={i} lead={i === 0 && !c.completed} daysLeft={daysLeft} reduce={reduce} onOpen={openChallenges} />
          ))}
          {active.length > 3 && (
            <button onClick={openChallenges} style={{ ...cardBtn, background: 'transparent', padding: '12px 0 8px', borderTop: `1px solid ${T.rule}`, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, color: T.mid }}>
              ALLE {active.length} CHALLENGES →
            </button>
          )}
        </div>
      )}

      {/* No challenge running — the honest, actionable empty state. Targets and
          rewards are real catalog values; NO progress is shown, because the
          rider is not enrolled and the server has not scored them. */}
      {challenges && active.length === 0 && available.length > 0 && (
        <div style={{ ...lux(22), padding: '18px 20px 12px' }}>
          <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.45, color: T.mid, paddingBottom: 4 }}>
            Keine Challenge aktiv. Mach mit — sie zählt die Fahrten, die du diesen Monat schon gemacht hast.
          </span>
          {available.slice(0, 3).map((c, i) => (
            <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 0', borderTop: `1px solid ${T.rule}`, marginTop: i === 0 ? 12 : 0 }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ ...ellipsis, fontSize: 13.5, fontWeight: 700, letterSpacing: -0.2, color: T.ink }}>{c.title}</span>
                <span style={{ ...ellipsis, fontSize: 10.5, fontWeight: 600, color: T.quiet }}>
                  {nf.format(c.target)} {CH_UNIT[c.metric] ?? ''} · +{nf.format(c.reward_rc)} RC
                </span>
              </div>
              <button
                onClick={() => join.mutate(c.key)}
                disabled={join.isPending}
                style={{ flex: 'none', border: 0, borderRadius: 100, padding: '8px 15px', background: i === 0 ? T.acid : T.surface2, color: i === 0 ? T.bg : T.ink, fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: 0.8, cursor: join.isPending ? 'default' : 'pointer', opacity: join.isPending ? 0.5 : 1 }}>
                MITMACHEN
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Next badge — real milestone progress from /achievements/mine */}
      {nextBadge?.progress && (
        <button onClick={() => navigate('/e/w3-wins')} style={{ ...cardBtn, padding: '15px 18px 16px', borderRadius: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
            <div style={{ width: 26, height: 26, flex: 'none', borderRadius: 8, background: T.surface2, display: 'grid', placeItems: 'center' }}><Trophy size={13} color={T.mid} /></div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>NÄCHSTES ABZEICHEN</span>
              <span style={{ ...ellipsis, fontSize: 13, fontWeight: 700, letterSpacing: -0.2, color: T.ink }}>{nextBadge.title}</span>
            </div>
            {ach && <span style={{ flex: 'none', fontSize: 10.5, fontWeight: 700, color: T.mid, fontVariantNumeric: 'tabular-nums' }}>{ach.counts.unlocked}/{ach.counts.total}</span>}
          </div>
          <div style={{ height: 5, width: '100%', borderRadius: 100, background: '#FFFFFF0F', overflow: 'hidden' }}>
            <motion.div initial={reduce ? false : { width: 0 }} animate={{ width: `${Math.max(0, Math.min(100, nextBadge.pct ?? 0))}%` }} transition={grow(0.12)} style={{ height: '100%', borderRadius: 100, background: T.d3 }} />
          </div>
          <span style={{ ...ellipsis, width: '100%', fontSize: 10.5, fontWeight: 600, color: T.quiet }}>{nextBadge.progress.label}</span>
        </button>
      )}
    </div>
  )
}
