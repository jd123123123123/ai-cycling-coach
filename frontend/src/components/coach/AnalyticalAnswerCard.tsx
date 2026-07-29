/**
 * AnalyticalAnswerCard — structured rendering for read-only tool_use_results
 * (Phase 6 Wave 3).
 *
 * Rendered inline in the chat stream above the assistant narration when
 * the tool result came from `fetch_pmc_window` or `fetch_recovery_trend`.
 * The card surfaces the key numbers as a small sparkline + 3 stats so the
 * coach's answer ("your fitness has been climbing the last 4 weeks") is
 * backed by a glanceable visual.
 *
 * Not a full chart — full PMC + recovery live in the dashboard. This is
 * an at-a-glance summary inside chat context.
 */
import Sparkline from '../ui/Sparkline'
import { TrendingUp, TrendingDown, Activity } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  toolName: 'fetch_pmc_window' | 'fetch_recovery_trend' | string
  /** Tool result from run_tool_use_loop (coach_tools.pmc_window_summary / recovery_trend_summary) */
  result: Record<string, unknown>
}

// ─── PMC card ─────────────────────────────────────────────────────────────────

interface PmcDay {
  date?: string
  ctl?: number | null
  atl?: number | null
  tsb?: number | null
  daily_tss?: number | null
}

interface PmcAggregate {
  avg_ctl?: number
  avg_atl?: number
  avg_tsb?: number
  total_tss?: number
  total_hours?: number
  ramp_rate?: number
}

interface PmcTrend {
  ctl_delta?: number
  atl_delta?: number
  tsb_delta?: number
  direction?: string
}

function PmcCard({
  days,
  aggregate,
  trend,
  language,
}: {
  days: PmcDay[]
  aggregate: PmcAggregate
  trend: PmcTrend
  language: 'simple' | 'technical'
}) {
  const simpleMode = language === 'simple'
  const direction = trend.direction ?? 'steady'
  const ctlDelta = trend.ctl_delta ?? 0

  const directionLabel = directionDisplay(direction, language)
  const DirectionIcon =
    ctlDelta > 0.5 ? TrendingUp : ctlDelta < -0.5 ? TrendingDown : Activity

  return (
    <div className="grid grid-cols-[auto_1fr] gap-3 items-center">
      <div className="flex-shrink-0" style={{ width: 96, height: 44 }} aria-hidden>
        <Sparkline
          values={days.map((d) => d.ctl).filter((v): v is number => v != null)}
          color={
            ctlDelta > 0.5 ? 'var(--color-recovery)'
              : ctlDelta < -0.5 ? 'var(--color-amber)'
              : 'var(--color-muted)'
          }
          width={96}
          height={44}
        />
      </div>
      {/* Stats */}
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <DirectionIcon
            size={13}
            strokeWidth={1.8}
            style={{ color: 'var(--color-amber)', flexShrink: 0 }}
            aria-hidden
          />
          <span
            className="text-[13px] font-medium"
            style={{ color: 'var(--color-ink)' }}
          >
            {directionLabel}
          </span>
        </div>
        <div
          className="num-mono text-[11px] flex items-center gap-2 flex-wrap"
          style={{ color: 'var(--color-ink-2)' }}
        >
          {aggregate.avg_ctl != null && (
            <span>
              <span className="eyebrow" style={{ color: 'var(--color-muted)' }}>
                {simpleMode ? 'Avg fitness' : 'Avg CTL'}
              </span>{' '}
              {aggregate.avg_ctl.toFixed(1)}
            </span>
          )}
          {ctlDelta !== 0 && (
            <span>
              <span className="eyebrow" style={{ color: 'var(--color-muted)' }}>
                {simpleMode ? 'Change' : 'Δ CTL'}
              </span>{' '}
              {ctlDelta > 0 ? '+' : ''}
              {ctlDelta.toFixed(1)}
            </span>
          )}
          {!simpleMode && aggregate.ramp_rate != null && (
            <span>
              <span className="eyebrow" style={{ color: 'var(--color-muted)' }}>
                Ramp
              </span>{' '}
              {aggregate.ramp_rate.toFixed(1)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function directionDisplay(direction: string, language: 'simple' | 'technical'): string {
  const map: Record<string, { simple: string; technical: string }> = {
    building: { simple: 'Fitness climbing', technical: 'Building' },
    maintaining: { simple: 'Holding steady', technical: 'Maintaining' },
    freshening: { simple: 'Getting fresher', technical: 'Freshening' },
    overreaching: { simple: 'Digging deep', technical: 'Overreaching' },
    insufficient_data: {
      simple: 'Not enough data yet',
      technical: 'Insufficient data',
    },
  }
  const pair = map[direction]
  if (!pair) return direction
  return language === 'simple' ? pair.simple : pair.technical
}

// ─── Recovery card ────────────────────────────────────────────────────────────

interface RecoveryDay {
  date?: string
  hrv?: number | null
  sleep?: number | null
  rhr?: number | null
}

interface RecoveryAggregate {
  avg_hrv?: number
  avg_sleep?: number
  avg_rhr?: number
  hrv_trend_pct?: number
  rhr_trend_pct?: number
  sleep_debt_hours?: number
}

function RecoveryCard({
  days,
  aggregate,
  flags,
  language,
}: {
  days: RecoveryDay[]
  aggregate: RecoveryAggregate
  flags: string[]
  language: 'simple' | 'technical'
}) {
  const simpleMode = language === 'simple'
  const hrvPct = aggregate.hrv_trend_pct ?? 0

  const DirectionIcon =
    hrvPct > 2 ? TrendingUp : hrvPct < -2 ? TrendingDown : Activity
  const headline =
    hrvPct < -5
      ? simpleMode ? 'Recovery looks stressed' : 'HRV suppressed'
      : hrvPct > 5
        ? simpleMode ? 'Recovery is strong' : 'HRV rising'
        : simpleMode ? 'Recovery is steady' : 'HRV stable'

  return (
    <div className="grid grid-cols-[auto_1fr] gap-3 items-center">
      <div className="flex-shrink-0" style={{ width: 96, height: 44 }} aria-hidden>
        <Sparkline
          values={days.map((d) => d.hrv).filter((v): v is number => v != null)}
          color={
            hrvPct > 2 ? 'var(--color-recovery)'
              : hrvPct < -2 ? 'var(--color-amber)'
              : 'var(--color-muted)'
          }
          width={96}
          height={44}
        />
      </div>
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <DirectionIcon
            size={13}
            strokeWidth={1.8}
            style={{ color: 'var(--color-forest-2)', flexShrink: 0 }}
            aria-hidden
          />
          <span
            className="text-[13px] font-medium"
            style={{ color: 'var(--color-ink)' }}
          >
            {headline}
          </span>
        </div>
        <div
          className="num-mono text-[11px] flex items-center gap-2 flex-wrap"
          style={{ color: 'var(--color-ink-2)' }}
        >
          {aggregate.avg_hrv != null && aggregate.avg_hrv > 0 && (
            <span>
              <span className="eyebrow" style={{ color: 'var(--color-muted)' }}>
                {simpleMode ? 'Avg recovery' : 'Avg HRV'}
              </span>{' '}
              {aggregate.avg_hrv.toFixed(0)}
              {!simpleMode && 'ms'}
            </span>
          )}
          {hrvPct !== 0 && (
            <span
              style={{
                color:
                  hrvPct < -5
                    ? 'var(--color-alert)'
                    : hrvPct > 5
                      ? 'var(--color-forest-2)'
                      : 'var(--color-ink-2)',
              }}
            >
              {hrvPct > 0 ? '+' : ''}
              {hrvPct.toFixed(1)}%
            </span>
          )}
          {aggregate.sleep_debt_hours != null &&
            aggregate.sleep_debt_hours > 0 && (
              <span>
                <span
                  className="eyebrow"
                  style={{ color: 'var(--color-muted)' }}
                >
                  {simpleMode ? 'Sleep short' : 'Sleep debt'}
                </span>{' '}
                {aggregate.sleep_debt_hours.toFixed(1)}h
              </span>
            )}
        </div>
        {flags.length > 0 && !simpleMode && (
          <div
            className="num-mono text-[10px] opacity-70"
            style={{ color: 'var(--color-amber)' }}
          >
            {flags.join(' · ')}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export default function AnalyticalAnswerCard({ toolName, result }: Props) {
  const { language } = useLanguage()

  if (toolName === 'fetch_pmc_window') {
    const days = (result.days as PmcDay[] | undefined) ?? []
    const aggregate = (result.aggregate as PmcAggregate | undefined) ?? {}
    const trend = (result.trend as PmcTrend | undefined) ?? {}
    return (
      <section
        className="rounded-[12px] px-3 py-2.5"
        style={{
          border: '1px solid var(--color-rule)',
          backgroundColor: 'var(--color-paper)',
        }}
        aria-label={language === 'simple' ? 'Training summary' : 'PMC window'}
      >
        <PmcCard
          days={days}
          aggregate={aggregate}
          trend={trend}
          language={language}
        />
      </section>
    )
  }

  if (toolName === 'fetch_recovery_trend') {
    const days = (result.days as RecoveryDay[] | undefined) ?? []
    const aggregate =
      (result.aggregate as RecoveryAggregate | undefined) ?? {}
    const flags = (result.flags as string[] | undefined) ?? []
    return (
      <section
        className="rounded-[12px] px-3 py-2.5"
        style={{
          border: '1px solid var(--color-rule)',
          backgroundColor: 'var(--color-paper)',
        }}
        aria-label={language === 'simple' ? 'Recovery summary' : 'Recovery trend'}
      >
        <RecoveryCard
          days={days}
          aggregate={aggregate}
          flags={flags}
          language={language}
        />
      </section>
    )
  }

  // Unknown analytical tool — render nothing (assistant narration carries it).
  return null
}
