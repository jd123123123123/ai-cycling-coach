import { useMemo } from 'react'
import { startOfDay, endOfDay, isWithinInterval, subDays } from 'date-fns'
import { Zap, Minus } from 'lucide-react'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { useDailyMetrics } from '../../hooks/useDailyMetrics'
import { useCountUp } from '../../hooks/useCountUp'
import { computeReadiness, readinessTier, TIER_META } from '../../utils/metrics'

// StrainTarget — Whoop's "Strain Coach" translated for cyclists.
// Recovery score × daily-baseline load = today's optimal TSS target.
// Visual: arc gauge with colored bands (undershoot / optimal / overshoot),
// plus a marker for today's actual. Below the gauge, a tight copy line
// tells the athlete where they are vs the target.
//
// Why it works (Whoop's insight): the number you open the app to see isn't
// "how am I doing?" — it's "what should I do TODAY?" Turning a recovery score
// into a prescription number is the retention multiplier.

const GAUGE_SIZE = 180
const GAUGE_STROKE = 14
const GAUGE_RADIUS = (GAUGE_SIZE - GAUGE_STROKE) / 2
// Semicircle arc: 180° from left to right
const ARC_LENGTH = Math.PI * GAUGE_RADIUS

/** Recovery multiplier per Whoop-style logic. */
function recoveryToMultiplier(score: number | null): number {
  if (score == null) return 1.0
  if (score >= 80) return 1.25   // GREEN → push
  if (score >= 65) return 1.00   // YELLOW-HIGH → planned
  if (score >= 50) return 0.65   // YELLOW-LOW → moderate
  return 0.20                     // RED → rest or Z1
}

export default function StrainTarget() {
  const today = new Date()
  const { data: actsData } = useActivitiesRange(today, today)
  const { data: profile } = useAthleteProfile()
  const { data: metricsData } = useDailyMetrics(subDays(today, 1), today)

  const { targetTSS, todayTSS, pct, message, messageColor, bandLow, bandHigh } = useMemo(() => {
    const acts = actsData?.activities ?? []
    const dayStart = startOfDay(today)
    const dayEnd = endOfDay(today)
    const tss = Math.round(
      acts
        .filter((a) => isWithinInterval(new Date(a.started_at), { start: dayStart, end: dayEnd }))
        .reduce((s, a) => s + (a.tss ?? 0), 0),
    )

    // Baseline target: daily TSS from weekly hour commitment
    const weeklyHours = profile?.weekly_hours_available ?? 6
    const baseline = Math.max(40, Math.round((weeklyHours * 70) / 7))

    // Recovery from the latest daily metric
    const latest = (metricsData?.metrics ?? [])
      .slice()
      .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())[0]
    const recovery = latest
      ? computeReadiness(latest.hrv_status, latest.body_battery, latest.sleep_score)
      : null
    const mult = recoveryToMultiplier(recovery)
    const target = Math.round(baseline * mult)
    const low = Math.round(target * 0.8)
    const high = Math.round(target * 1.2)

    const ratio = target > 0 ? tss / target : 0
    const tier = readinessTier(recovery)
    const tierMeta = tier ? TIER_META[tier] : null
    const tierColor = tierMeta?.color ?? 'var(--color-forest-2)'

    let msg = ''
    let msgColor = tierColor
    if (target === 0) {
      msg = "Rest day — your body is asking for zero. Honor it."
      msgColor = 'var(--color-muted)'
    } else if (tss === 0) {
      msg = `${target} TSS ahead of you. The ride that fits is out there.`
    } else if (tss < low) {
      msg = `You're ${target - tss} TSS below target. One more session fits the day.`
      msgColor = 'var(--color-amber)'
    } else if (tss > high) {
      msg = `${tss - target} TSS past target. Today's bank is closed — absorb.`
      msgColor = 'var(--color-alert)'
    } else {
      msg = `In the zone. ${tss}/${target} TSS — the dose fits the day.`
      msgColor = '#30D158'
    }

    return {
      targetTSS: target,
      todayTSS: tss,
      pct: Math.min(1.4, ratio),
      message: msg,
      messageColor: msgColor,
      bandLow: low,
      bandHigh: high,
    }
  }, [actsData, profile, metricsData, today])

  const countedTarget = useCountUp(targetTSS, { duration: 900, enabled: true })
  const countedToday = useCountUp(todayTSS, { duration: 700, enabled: true })

  // Arc path — semicircle, from left (-180°) to right (0°)
  const maxRatio = 1.4 // allow 40% overshoot visible on gauge
  const markerAngle = Math.PI + Math.PI * Math.min(pct / maxRatio, 1)
  const markerX = GAUGE_SIZE / 2 + GAUGE_RADIUS * Math.cos(markerAngle)
  const markerY = GAUGE_SIZE / 2 + GAUGE_RADIUS * Math.sin(markerAngle)

  // Optimal band: 0.8 × target to 1.2 × target, mapped onto the arc
  const optimalLowRatio = targetTSS > 0 ? (bandLow / targetTSS) * 1.0 : 0
  const optimalHighRatio = targetTSS > 0 ? (bandHigh / targetTSS) * 1.0 : 0
  // Fraction of arc between low and high
  const lowFrac = Math.min(1, optimalLowRatio / maxRatio)
  const highFrac = Math.min(1, optimalHighRatio / maxRatio)

  return (
    <div
      className="paper-grain rounded-[20px] px-6 py-5 sm:px-8 sm:py-6 relative overflow-hidden"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
        backgroundImage: 'radial-gradient(80% 60% at 100% 0%, color-mix(in srgb, var(--color-forest-2) 6%, transparent), transparent 60%)',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Zap size={13} strokeWidth={2} style={{ color: 'var(--color-forest-2)' }} />
        <span
          className="eyebrow"
          style={{
            color: 'var(--color-ink)',
            letterSpacing: '0.28em',
            fontSize: 10,
            fontWeight: 600,
          }}
        >
          Strain target · today
        </span>
      </div>

      <div className="flex items-center gap-6 sm:gap-8 flex-wrap">
        {/* Semicircle gauge */}
        <div className="relative shrink-0" style={{ width: GAUGE_SIZE, height: GAUGE_SIZE / 2 + 12 }}>
          <svg width={GAUGE_SIZE} height={GAUGE_SIZE / 2 + 12} viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE / 2 + 12}`}>
            {/* Track */}
            <path
              d={`M ${GAUGE_STROKE / 2},${GAUGE_SIZE / 2} A ${GAUGE_RADIUS} ${GAUGE_RADIUS} 0 0 1 ${GAUGE_SIZE - GAUGE_STROKE / 2},${GAUGE_SIZE / 2}`}
              stroke="var(--color-rule)"
              strokeWidth={GAUGE_STROKE}
              fill="none"
              strokeLinecap="round"
              opacity={0.6}
            />
            {/* Optimal band — green segment of the arc */}
            {targetTSS > 0 && (
              <path
                d={`M ${GAUGE_STROKE / 2},${GAUGE_SIZE / 2} A ${GAUGE_RADIUS} ${GAUGE_RADIUS} 0 0 1 ${GAUGE_SIZE - GAUGE_STROKE / 2},${GAUGE_SIZE / 2}`}
                stroke="#30D158"
                strokeWidth={GAUGE_STROKE}
                fill="none"
                strokeLinecap="butt"
                strokeDasharray={`${ARC_LENGTH * (highFrac - lowFrac)} ${ARC_LENGTH}`}
                strokeDashoffset={-ARC_LENGTH * lowFrac}
                opacity={0.55}
              />
            )}
            {/* Marker dot */}
            <circle
              cx={markerX}
              cy={markerY}
              r={8}
              fill="var(--color-ink)"
              stroke="var(--color-paper-2)"
              strokeWidth={3}
            />
            <circle
              cx={markerX}
              cy={markerY}
              r={3}
              fill={messageColor}
            />
          </svg>
          {/* Center labels */}
          <div
            className="absolute inset-x-0 flex flex-col items-center"
            style={{ bottom: 0 }}
          >
            <span
              className="num-display leading-none"
              style={{
                fontSize: 32,
                color: 'var(--color-ink)',
                fontVariationSettings: '"opsz" 144, "wght" 500',
              }}
            >
              {countedToday}
            </span>
            <span
              className="num-mono"
              style={{ fontSize: 10, color: 'var(--color-muted)', letterSpacing: '0.14em', marginTop: 2 }}
            >
              / {countedTarget} TSS
            </span>
          </div>
        </div>

        {/* Copy + band legend */}
        <div className="flex flex-col gap-2 min-w-0 flex-1">
          <p
            className="text-[14px] leading-relaxed"
            style={{ color: 'var(--color-ink)', maxWidth: '46ch' }}
          >
            {message}
          </p>
          {targetTSS > 0 && (
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm"
                  style={{ backgroundColor: '#30D158', opacity: 0.55 }}
                />
                <span
                  className="num-mono"
                  style={{ fontSize: 10, color: 'var(--color-muted)', letterSpacing: '0.1em' }}
                >
                  OPTIMAL {bandLow}–{bandHigh}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Minus size={10} strokeWidth={2} style={{ color: 'var(--color-muted)' }} />
                <span
                  className="num-mono"
                  style={{ fontSize: 10, color: 'var(--color-muted)', letterSpacing: '0.1em' }}
                >
                  RECOVERY-ADJUSTED
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
