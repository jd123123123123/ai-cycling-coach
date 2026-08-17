import { motion, useReducedMotion } from 'motion/react'
import { Zap, HeartPulse, Target, TrendingUp, TrendingDown, Trophy } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useSeasonTrends } from '../../hooks/useSeasonTrends'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { useAchievements } from '../../hooks/useAchievements'
import { useRewardChallenges, useJoinChallenge } from '../../hooks/useRewardChallenges'
import type { ChallengeMetric, RewardChallenge } from '../../api/rewardChallenges'
import { T, FONT, grow } from './w3tokens'

/**
 * W3 · Today "Your progress" — the athlete's real fitness goals (FTP, VO₂max,
 * 20-min power), their live monthly challenges, and the next badge they are
 * actually working toward. Every number is the rider's own:
 *
 *   • FTP            — /athletes/me (`ftp_watts`)
 *   • VO₂max, 20-min — /analytics/season-trends (latest + season delta)
 *   • challenges     — /challenges/mine `active[]` (value/target/pct computed
 *                      server-side from the rider's own rides this month)
 *   • next badge     — /achievements/mine `in_progress[]` (real current/target)
 *
 * Honest "—" where a signal is absent. The joinable catalog
 * (`/challenges/mine` → `available[]`) deliberately shows NO progress bar: the
 * server returns a placeholder `value: 0` for challenges the rider has not
 * joined, so a bar there would be a fabricated stat. Joining backfills to the
 * 1st of the month, so progress becomes real the instant you tap JOIN.
 */

const band = (padBottom: number) => ({ display: 'flex', flexDirection: 'column' as const, width: '100%', background: T.bg, padding: `0 20px ${padBottom}px`, fontFamily: FONT })
const CH_UNIT: Record<ChallengeMetric, string> = { active_days: 'Tage', distance_km: 'km', tss: 'TSS', rides: 'Fahrten', hours: 'h', kj: 'kJ' }
const nf = new Intl.NumberFormat('de-DE')
const ellipsis = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }
const cardBtn = { width: '100%', border: 0, background: T.surface, fontFamily: FONT, textAlign: 'left' as const, cursor: 'pointer' }

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

function Metric({ icon: Icon, label, value, unit, delta }: { icon: typeof Zap; label: string; value: string; unit: string; delta: number | null }) {
  const up = delta != null && delta > 0
  const flat = delta == null || Math.abs(delta) < 0.05
  const dHue = flat ? T.quiet : up ? T.training : T.warn
  return (
    <div style={{ flex: 1, minWidth: 0, padding: '15px 13px 16px', borderRadius: 18, background: T.surface, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ width: 30, height: 30, borderRadius: 9, background: T.acidDim, display: 'grid', placeItems: 'center' }}><Icon size={15} color={T.acid} /></div>
      <span style={{ ...ellipsis, fontSize: 22, fontWeight: 800, letterSpacing: -0.7, color: value === '—' ? T.quiet : T.ink }}>{value}<span style={{ fontSize: 10, fontWeight: 600, color: T.quiet }}> {unit}</span></span>
      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
        <span style={{ ...ellipsis, fontSize: 8.5, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>{label}</span>
        {delta != null && !flat && (
          <span style={{ flex: 'none', marginLeft: 'auto', display: 'flex', gap: 2, alignItems: 'center', fontSize: 10, fontWeight: 700, color: dHue }}>
            {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}{Math.abs(delta) % 1 === 0 ? Math.abs(delta) : Math.abs(delta).toFixed(1)}
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

  const ftp = (profile as { ftp_watts?: number } | undefined)?.ftp_watts ?? null
  const vo2 = trends?.vo2max
  const p20 = trends?.p20min_w
  const active = challenges?.active ?? []
  const available = challenges?.available ?? []
  const daysLeft = daysLeftIn(challenges?.period)
  const openChallenges = () => navigate('/e/w3-challenges')

  // Next badge: the in-progress milestone the rider is closest to, with a real
  // current/target behind it. Milestones without a number are skipped.
  const nextBadge = ach?.in_progress
    .filter((p) => p.pct != null && p.progress != null)
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))[0] ?? null

  const tag = challenges
    ? active.length > 0 ? `${active.length} AKTIV` : available.length > 0 ? `${available.length} OFFEN` : null
    : null

  return (
    <div style={{ ...band(30), gap: 14 }}>
      {/* Section head — Today's rhythm: title + subtitle + acid pill */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.6, color: T.ink }}>Dein Fortschritt</span>
          <span style={{ ...ellipsis, fontSize: 10.5, fontWeight: 600, color: T.quiet }}>Erarbeitet, nicht gekauft</span>
        </div>
        {tag && (
          <div style={{ flex: 'none', padding: '7px 13px', borderRadius: 100, background: T.acidDim }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8, color: T.acid }}>{tag}</span>
          </div>
        )}
      </div>

      {/* Fitness goals — real */}
      <div style={{ display: 'flex', gap: 8 }}>
        <Metric icon={Zap} label="FTP · W" value={ftp != null ? String(Math.round(ftp)) : '—'} unit="W" delta={null} />
        <Metric icon={HeartPulse} label="VO₂MAX" value={vo2?.latest != null ? String(Math.round(vo2.latest)) : '—'} unit="" delta={vo2?.delta ?? null} />
        <Metric icon={Target} label="20-MIN" value={p20?.latest != null ? String(Math.round(p20.latest)) : '—'} unit="W" delta={p20?.delta ?? null} />
      </div>

      {/* Live challenges — real progress toward each real target */}
      {active.length > 0 && (
        <div style={{ padding: '6px 18px 10px', borderRadius: 22, background: T.surface, display: 'flex', flexDirection: 'column' }}>
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
        <div style={{ padding: '16px 18px 10px', borderRadius: 22, background: T.surface, display: 'flex', flexDirection: 'column' }}>
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
