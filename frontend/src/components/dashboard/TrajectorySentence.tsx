/**
 * TrajectorySentence.tsx — Phase 7.05 "One-Screen Truth" honesty primitive.
 *
 * Single sentence: CTL trend over 14 days, gated through <UncertainValue>.
 * - confidence 'high' → language-aware copy ("Fitness climbing +8 over 14 days.")
 * - confidence 'low'  → muted skeleton + "Need N more days of training data."
 *                       or "Set your FTP to unlock the trend." when FTP absent.
 *
 * Optional `sport` prop: when set, derives CTL series from per_sport[sport] entries
 * instead of the total series. Copy adapts: "Cycling fitness climbing +8 over 14 days."
 * When omitted, renders the total-series trajectory (default, unchanged from Plan 02).
 *
 * No icons. No motion library. Static is correct for the honesty layer.
 * Zero new dependencies.
 */

import UncertainValue from './UncertainValue'
import { confidence, MIN_DAYS_CTL_TREND } from '../../utils/confidence'
import { toneFromPct, tokenForTone } from '../../utils/delta'
import { formatSigned } from '../../utils/format'
import { usePMC } from '../../hooks/usePMC'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { useGoalTrajectory } from '../../hooks/useGoalTrajectory'
import { useLanguage } from '../../contexts/LanguageContext'

// Mujika taper-window → display tone. Drives the chip color so an
// "overreached" projection reads as alert and "ideal" reads as good.
function taperTone(window: string): 'good' | 'warn' | 'alert' | 'neutral' {
  if (window === 'ideal') return 'good'
  if (window === 'too_flat' || window === 'too_fresh') return 'warn'
  if (window === 'overreached') return 'alert'
  return 'neutral'
}

function onTrackTone(state: string): 'good' | 'warn' | 'alert' | 'neutral' {
  if (state === 'on_track' || state === 'ahead') return 'good'
  if (state === 'behind') return 'alert'
  return 'neutral'
}

function tokenForLabelTone(tone: 'good' | 'warn' | 'alert' | 'neutral'): string {
  if (tone === 'good') return 'var(--color-good, #2f7a3a)'
  if (tone === 'warn') return 'var(--color-warn, #b07300)'
  if (tone === 'alert') return 'var(--color-alert, #b1412c)'
  return 'var(--color-ink-2)'
}

interface TrajectorySentenceProps {
  /** When set, shows sport-filtered CTL trajectory (per_sport series). Omit for total. */
  sport?: 'cycling' | 'running' | 'gym' | null
  className?: string
}

const SPORT_LABEL: Record<string, string> = {
  cycling: 'Cycling',
  running: 'Running',
  gym: 'Gym',
}

/**
 * Returns direction word for the simple-language copy.
 * |Δ%| < 3 → "holding steady"; positive → "climbing"; negative → "drifting down"
 */
function directionWord(deltaPct: number): string {
  if (Math.abs(deltaPct) < 3) return 'holding steady'
  return deltaPct > 0 ? 'climbing' : 'drifting down'
}

export default function TrajectorySentence({ sport, className }: TrajectorySentenceProps) {
  const { data: pmcData, isLoading } = usePMC(14)
  const { data: profile } = useAthleteProfile()
  const { data: trajectory } = useGoalTrajectory()
  const { language } = useLanguage()

  // Event-aware path: when the athlete has a target event, the trajectory
  // narrative replaces the generic CTL-trend copy. The total-series CTL trend
  // is what trajectory.project() uses internally, so this branch is only
  // skipped when the prop explicitly filters to a sport (per-sport trajectory
  // isn't computed by the backend yet — fall through to the original 14-day
  // CTL sentence in that case).
  if (!sport && trajectory && trajectory.event_name && trajectory.days_to_goal != null) {
    return (
      <EventAwareTrajectory
        trajectory={trajectory}
        className={className}
      />
    )
  }

  const hasFtp = !!profile?.ftp_watts

  // Extract a sorted, valid CTL series from the 14-day window.
  // When `sport` is set, use the per-sport sub-series; otherwise use the total series.
  const rawEntries = sport
    ? (pmcData?.per_sport?.[sport] ?? [])
    : (pmcData?.entries ?? [])
  const usableSeries = rawEntries
    .filter((e) => typeof e.ctl === 'number' && isFinite(e.ctl))
    .sort((a, b) => a.date.localeCompare(b.date))

  const ctlConfidence = confidence({
    n_days: usableSeries.length,
    min_days: MIN_DAYS_CTL_TREND,
    preconditions: { has_ftp: hasFtp },
  })

  // Compute delta only when we have enough data
  const todayCTL = usableSeries.at(-1)?.ctl ?? null
  const firstCTL = usableSeries.at(0)?.ctl ?? null
  const deltaCTL =
    todayCTL != null && firstCTL != null
      ? Math.round(todayCTL - firstCTL)
      : null

  const deltaPct =
    deltaCTL != null && firstCTL != null && firstCTL !== 0
      ? (deltaCTL / firstCTL) * 100
      : null

  const tone = toneFromPct(deltaPct, 'good')
  const toneColor = tokenForTone(tone)

  // Language-aware sentence copy for the numeric portion.
  // When sport is set, prefix with the sport label for clarity.
  const sportLabel = sport ? SPORT_LABEL[sport] : null
  const numericNode =
    deltaCTL != null && deltaPct != null ? (
      language === 'technical' ? (
        <span className="num-mono" style={{ color: toneColor }}>
          {/* U+2212 typographic minus on negative */}
          {sportLabel ? `${sportLabel} CTL` : 'CTL'} {formatSigned(deltaCTL, 0)} over 14d.
        </span>
      ) : (
        <span>
          {sportLabel ? `${sportLabel} fitness` : 'Fitness'}{' '}
          <span style={{ color: toneColor }}>
            {directionWord(deltaPct)} {deltaCTL !== 0 ? Math.abs(deltaCTL) : ''}
          </span>{' '}
          over 14 days.
        </span>
      )
    ) : null

  // Low-confidence copy branches
  const needDays = Math.max(1, MIN_DAYS_CTL_TREND - usableSeries.length)
  const lowCopy = !hasFtp
    ? 'Set your FTP to unlock the trend.'
    : `Need ${needDays} more day${needDays === 1 ? '' : 's'} of training data.`

  if (isLoading) {
    // Render the low-confidence state while data loads
    return (
      <p
        className={className}
        style={{
          fontSize: 14,
          lineHeight: '1.5',
          color: 'var(--color-ink-2)',
          maxWidth: '52ch',
          margin: 0,
        }}
      >
        <UncertainValue
          value={null}
          confidence="low"
          lowConfidenceCopy={lowCopy}
        />
      </p>
    )
  }

  return (
    <p
      className={className}
      style={{
        fontSize: 14,
        lineHeight: '1.5',
        color: 'var(--color-ink-2)',
        maxWidth: '52ch',
        margin: 0,
      }}
    >
      <UncertainValue
        value={numericNode}
        confidence={ctlConfidence}
        lowConfidenceCopy={lowCopy}
      />
    </p>
  )
}


// =====================================================================
// Event-aware trajectory — surfaced when the athlete has a target event.
// Renders the coach-grade narrative + a compact stat row.
// =====================================================================

interface EventAwareTrajectoryProps {
  // GoalTrajectoryResponse minus the loose typing — only the fields we read.
  trajectory: import('../../api/coach').GoalTrajectoryResponse
  className?: string
}

function EventAwareTrajectory({ trajectory, className }: EventAwareTrajectoryProps) {
  const {
    days_to_goal,
    ctl_now,
    ctl_projected_at_goal,
    ctl_target,
    tsb_projected_at_goal,
    taper_window,
    on_track,
    weekly_tss_required,
    weekly_tss_actual,
    narrative_hook,
    event_name,
  } = trajectory

  const trackTone = onTrackTone(on_track)
  const trackColor = tokenForLabelTone(trackTone)
  const taperColor = tokenForLabelTone(taperTone(taper_window))

  // Show the TSS-gap chip only when we're behind plan and there's an actual
  // delta to close — being told "add 0 TSS/wk" is just noise.
  const tssGap = Math.max(0, Math.round(weekly_tss_required - weekly_tss_actual))
  const showGapChip = on_track === 'behind' && tssGap > 0

  // Ramp-rate chip — actual +CTL/wk vs the rate needed to reach target by goal.
  // Cap the displayed needed rate at +8/wk: above that the athlete should
  // re-anchor goals, not double-down on overload (overreach risk per Friel).
  const rampGuard = (() => {
    if (ctl_target == null || days_to_goal == null || days_to_goal <= 0) return null
    const weeksLeft = Math.max(1, days_to_goal / 7)
    const needed = (ctl_target - ctl_now) / weeksLeft
    const capped = Math.min(needed, 8)
    const actual = trajectory.ctl_7d_delta
    let tone: 'good' | 'warn' | 'alert' = 'good'
    if (needed > 8) tone = 'alert'
    else if (actual + 0.5 < capped) tone = 'warn'
    return {
      actual: Math.round(actual * 10) / 10,
      needed: Math.round(capped * 10) / 10,
      capped: needed > 8,
      tone,
    }
  })()

  return (
    <div
      className={className}
      style={{
        fontSize: 14,
        lineHeight: '1.5',
        color: 'var(--color-ink-2)',
        maxWidth: '60ch',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <p style={{ margin: 0 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: 'var(--color-ink)',
            fontWeight: 500,
          }}
        >
          {days_to_goal}d to {event_name ?? 'goal'}
        </span>
        {' — '}
        <span style={{ color: trackColor }}>{narrative_hook}</span>
      </p>

      <div
        style={{
          display: 'flex',
          gap: 14,
          flexWrap: 'wrap',
          fontSize: 12,
          color: 'var(--color-ink-2)',
        }}
        className="num-mono"
      >
        <span title="Current chronic training load (Banister CTL)">
          <span style={{ color: 'var(--color-ink-3)' }}>CTL</span>{' '}
          {Math.round(ctl_now)}
        </span>

        <span title="Projected CTL at race day, linear extrapolation of 7d trend">
          <span style={{ color: 'var(--color-ink-3)' }}>→ race</span>{' '}
          <span style={{ color: trackColor }}>{Math.round(ctl_projected_at_goal)}</span>
          {ctl_target != null && (
            <span style={{ color: 'var(--color-ink-3)' }}>
              {' '}/ target {Math.round(ctl_target)}
            </span>
          )}
        </span>

        <span title="Projected race-day TSB (Mujika taper window)">
          <span style={{ color: 'var(--color-ink-3)' }}>TSB</span>{' '}
          <span style={{ color: taperColor }}>
            {formatSigned(Math.round(tsb_projected_at_goal), 0)}
          </span>
          {taper_window !== 'unknown' && (
            <span style={{ color: 'var(--color-ink-3)' }}> · {taper_window.replace('_', ' ')}</span>
          )}
        </span>

        {rampGuard && (
          <span
            title={
              rampGuard.capped
                ? 'Required CTL ramp exceeds the +8/wk overreach ceiling — re-anchor goals or accept a finish-the-event-only target.'
                : 'CTL ramp rate: actual +/wk vs what you need to reach the target safely.'
            }
          >
            <span style={{ color: 'var(--color-ink-3)' }}>ramp</span>{' '}
            <span style={{ color: tokenForLabelTone(rampGuard.tone) }}>
              {formatSigned(rampGuard.actual, 1)}
            </span>
            <span style={{ color: 'var(--color-ink-3)' }}> / need </span>
            <span style={{ color: tokenForLabelTone(rampGuard.tone) }}>
              {formatSigned(rampGuard.needed, 1)}
              {rampGuard.capped ? '+' : ''}
            </span>
            <span style={{ color: 'var(--color-ink-3)' }}> CTL/wk</span>
          </span>
        )}

        {showGapChip && (
          <span title="Extra weekly TSS needed to close the CTL gap">
            <span style={{ color: 'var(--color-alert, #b1412c)' }}>
              +{tssGap} TSS/wk to close gap
            </span>
          </span>
        )}
      </div>
    </div>
  )
}

