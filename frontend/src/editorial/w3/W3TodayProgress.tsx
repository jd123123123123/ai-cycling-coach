import { motion, useReducedMotion } from 'motion/react'
import { Zap, HeartPulse, Target, TrendingUp, TrendingDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useSeasonTrends } from '../../hooks/useSeasonTrends'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { useRewardChallenges } from '../../hooks/useRewardChallenges'
import type { ChallengeMetric } from '../../api/rewardChallenges'
import { T, FONT, grow } from './w3tokens'

/**
 * W3 · Today "Your progress" — the athlete's real fitness goals (FTP, VO₂max,
 * 20-min power) and their active challenge progress, replacing the cosmetic
 * garage-unlock economy. Every number is the rider's own: FTP from the athlete
 * profile, VO₂max + 20-min power from the season-trends aggregate, challenge
 * progress from the live challenge subsystem. Honest "—" where a signal is
 * absent.
 */

const band = (padBottom: number) => ({ display: 'flex', flexDirection: 'column' as const, width: '100%', background: T.bg, padding: `0 20px ${padBottom}px`, fontFamily: FONT })
const CH_UNIT: Record<ChallengeMetric, string> = { active_days: 'days', distance_km: 'km', tss: 'TSS', rides: 'rides', hours: 'h', kj: 'kJ' }
const nf = new Intl.NumberFormat('en-US')

function Metric({ icon: Icon, label, value, unit, delta }: { icon: typeof Zap; label: string; value: string; unit: string; delta: number | null }) {
  const up = delta != null && delta > 0
  const flat = delta == null || Math.abs(delta) < 0.05
  const dHue = flat ? T.quiet : up ? T.training : T.warn
  return (
    <div style={{ flex: 1, padding: '15px 15px 16px', borderRadius: 18, background: T.surface, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ width: 30, height: 30, borderRadius: 9, background: T.acidDim, display: 'grid', placeItems: 'center' }}><Icon size={15} color={T.acid} /></div>
      <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.7, color: value === '—' ? T.quiet : T.ink }}>{value}<span style={{ fontSize: 10, fontWeight: 600, color: T.quiet }}> {unit}</span></span>
      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
        <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>{label}</span>
        {delta != null && !flat && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 2, alignItems: 'center', fontSize: 10, fontWeight: 700, color: dHue }}>
            {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}{Math.abs(delta) % 1 === 0 ? Math.abs(delta) : Math.abs(delta).toFixed(1)}
          </span>
        )}
      </div>
    </div>
  )
}

export default function W3TodayProgress() {
  const reduce = useReducedMotion()
  const navigate = useNavigate()
  const { data: trends } = useSeasonTrends()
  const { data: profile } = useAthleteProfile()
  const { data: challenges } = useRewardChallenges()

  const ftp = (profile as { ftp_watts?: number } | undefined)?.ftp_watts ?? null
  const vo2 = trends?.vo2max
  const p20 = trends?.p20min_w
  const active = challenges?.active ?? []

  return (
    <div style={{ ...band(30), gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.4, color: T.ink }}>Your progress</span>
        <button onClick={() => navigate('/e/w3-wins')} style={{ background: 'transparent', border: 0, fontFamily: FONT, fontSize: 11.5, fontWeight: 700, color: T.acid, cursor: 'pointer' }}>Wins →</button>
      </div>

      {/* Fitness goals — real */}
      <div style={{ display: 'flex', gap: 8 }}>
        <Metric icon={Zap} label="FTP · W" value={ftp != null ? String(Math.round(ftp)) : '—'} unit="W" delta={null} />
        <Metric icon={HeartPulse} label="VO₂MAX" value={vo2?.latest != null ? String(Math.round(vo2.latest)) : '—'} unit="" delta={vo2?.delta ?? null} />
        <Metric icon={Target} label="20-MIN" value={p20?.latest != null ? String(Math.round(p20.latest)) : '—'} unit="W" delta={p20?.delta ?? null} />
      </div>

      {/* Active challenges — real progress toward each target */}
      {active.length > 0 && (
        <div style={{ padding: '6px 18px 10px', borderRadius: 22, background: T.surface, display: 'flex', flexDirection: 'column' }}>
          {active.slice(0, 3).map((c, i) => {
            const unit = CH_UNIT[c.metric] ?? ''
            return (
              <div key={c.key} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 0', borderTop: i === 0 ? 'none' : `1px solid ${T.rule}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>{c.title}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: c.completed ? T.acid : T.quiet }}>{c.completed ? 'DONE ✓' : `${c.pct}%`}</span>
                </div>
                <div style={{ height: 6, borderRadius: 100, background: '#FFFFFF0F', overflow: 'hidden' }}>
                  <motion.div initial={reduce ? false : { width: 0 }} animate={{ width: `${c.pct}%` }} transition={grow(i * 0.05)} style={{ height: '100%', borderRadius: 100, background: T.acid }} />
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet }}>{nf.format(Math.round(c.value))} of {nf.format(c.target)} {unit}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
