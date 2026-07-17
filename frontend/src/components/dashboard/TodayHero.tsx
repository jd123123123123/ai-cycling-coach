import { useEffect, useMemo, useState } from 'react'
import { format, subDays } from 'date-fns'
import { useT, useLocale } from '../../contexts/LocaleContext'
import { useCoachBrief } from '../../hooks/useCoachBrief'
import { useDailyMetrics } from '../../hooks/useDailyMetrics'
import { useTodaySnapshot } from '../../hooks/useTodaySnapshot'
import { useCountUp } from '../../hooks/useCountUp'
import {
  computeReadiness,
  latestWithData,
  readinessTier,
  TIER_META,
} from '../../utils/metrics'

function useViewportIsMobile(breakpoint = 640): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false,
  )
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResize = () => setIsMobile(window.innerWidth < breakpoint)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [breakpoint])
  return isMobile
}

/**
 * TodayHero — the ONE compact readiness line under today's session.
 *
 * The session (PrescribedWorkoutCard, rendered above by CoachBrief) is the
 * page hero; this card is deliberately demoted to a single supporting strip:
 *
 *   eyebrow row : date · build phase · days-to-goal · last sync
 *   readiness   : small ring + a uniform 3-metric row (Erholung · HRV Δ · Form)
 *
 * No big italic verdict, no trajectory trend, no scattered "why" pills — the
 * recovery *reasoning* lives once, in CoachBrief's collapsed "Warum" expander,
 * and the fitness trend is MECE-owned by Analyze. This is the readiness glance,
 * not a second hero.
 */

function StateRing({ score, color, size, recoveryLabel, scaleHint }: { score: number; color: string; size: number; recoveryLabel: string; scaleHint: string }) {
  const animated = useCountUp(score, { durationMs: 1200, digits: 0 })
  const stroke = Math.max(9, Math.round(size * 0.085))
  const radius = (size - stroke) / 2
  const circ = 2 * Math.PI * radius
  const pct = Math.max(0, Math.min(100, animated))
  const dashOffset = circ * (1 - pct / 100)
  return (
    <div
      className="relative shrink-0 flex items-center justify-center"
      style={{ width: size, height: size, cursor: 'help' }}
      aria-label={`${recoveryLabel} ${score} / 100`}
      title={scaleHint}
    >
      {/* Ambient color glow — the state tint, soft */}
      <div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          background: `radial-gradient(50% 50% at 50% 50%, color-mix(in srgb, ${color} 28%, transparent) 0%, transparent 100%)`,
          filter: 'blur(24px)',
          transform: 'scale(0.65)',
        }}
        aria-hidden
      />
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', overflow: 'visible' }} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-rule)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={dashOffset}
          style={{
            transition: 'stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1)',
            filter: `drop-shadow(0 0 6px color-mix(in srgb, ${color} 60%, transparent))`,
          }}
        />
      </svg>
      {/* Number-only gauge. The "Recovery" label lives once, on the adjacent
         metric cell — rendering it inside this 68px ring overflowed the circle
         (0.24em tracking ≈ 110px) and collided with that cell. */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="num-mono inline-flex items-baseline" style={{ color: 'var(--color-ink)', lineHeight: 1 }}>
          <span style={{ fontSize: Math.round(size * 0.32), fontWeight: 500 }}>{animated}</span>
          <span style={{ fontSize: Math.round(size * 0.13), fontWeight: 500, color: 'var(--color-muted)' }}>/100</span>
        </span>
      </div>
    </div>
  )
}

function EyebrowChip({ children, color = 'var(--color-muted)' }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className="eyebrow num-mono whitespace-nowrap"
      style={{
        color,
        fontSize: 10,
        letterSpacing: '0.22em',
      }}
    >
      {children}
    </span>
  )
}

// One cell of the uniform readiness row — same type scale everywhere:
// value 16px, label 10.5px. A single accent per cell (tone), never a stack
// of saturated blocks.
function ReadinessCell({ label, value, sub, tone, title }: { label: string; value: string; sub?: string; tone: string; title?: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0" style={{ cursor: title ? 'help' : undefined }} title={title}>
      <span className="eyebrow truncate" style={{ color: 'var(--color-muted)', fontSize: 10.5, letterSpacing: '0.16em' }}>
        {label}
      </span>
      <span className="num-mono inline-flex items-baseline gap-1" style={{ color: tone, fontSize: 16, fontWeight: 600, lineHeight: 1.1 }}>
        {value}
        {sub && <span style={{ color: 'var(--color-muted)', fontSize: 11, fontWeight: 500 }}>{sub}</span>}
      </span>
    </div>
  )
}

export default function TodayHero() {
  const today = useMemo(() => new Date(), [])
  const { data: brief } = useCoachBrief()
  const { data: metricsResp } = useDailyMetrics(useMemo(() => subDays(today, 30), [today]), today)
  const { data: snapshot } = useTodaySnapshot()
  const isMobile = useViewportIsMobile(640)
  // Ring is now a small supporting element — the session card above is the
  // dominant thing on the page, so readiness reads as a glance, not spectacle.
  const ringSize = isMobile ? 60 : 68
  const t = useT()
  const { locale } = useLocale()
  const de = locale === 'de'

  const metrics = metricsResp?.metrics ?? []
  const latest = latestWithData(metrics, 'hrv_status') ?? latestWithData(metrics, 'body_battery') ?? latestWithData(metrics, 'sleep_score')

  // Recovery score: prefer the brief's readiness composite (uses the
  // re-anchored bands from this session); fall back to the local
  // computeReadiness if no brief is ready yet.
  const briefReadiness = (brief?.evidence as Record<string, unknown> | undefined)?.readiness as Record<string, unknown> | undefined
  const score =
    (briefReadiness?.score as number | null | undefined) ??
    computeReadiness(
      latest?.hrv_status ?? null,
      latest?.body_battery ?? null,
      latest?.sleep_score ?? null,
    ) ??
    null

  const tier = readinessTier(score)
  const meta = tier ? TIER_META[tier] : null
  const color = meta?.color ?? 'var(--color-muted)'

  // Verdict — prefer the AI brief's headline; fall back to the tier verb.
  const verdict = brief?.verdict || (meta ? `${locale === 'de' ? meta.verbDe : meta.verb}.` : (locale === 'de' ? 'Lade heute…' : 'Loading today…'))

  // Periodization eyebrow bits
  const athlete = (brief?.evidence as Record<string, unknown> | undefined)?.athlete as Record<string, unknown> | undefined
  const rawPhase = athlete?.goal_phase as string | undefined
  const daysToGoal = athlete?.days_to_goal as number | undefined
  const goalName = athlete?.goal_target as string | undefined
  // Pretty-print the phase: "build1" → "Build 1", "peak" → "Peak".
  // In German, map the canonical phase names so nothing leaks English.
  const PHASE_LABEL_DE: Record<string, string> = {
    base1: 'Grundlage 1', base2: 'Grundlage 2',
    build1: 'Aufbau 1', build2: 'Aufbau 2',
    peak: 'Peak', taper: 'Taper', race: 'Rennwoche',
    maintenance: 'Erhaltung', transition: 'Übergang', recovery: 'Erholung',
  }
  const phaseKey = rawPhase && rawPhase !== 'unknown' ? rawPhase.toLowerCase().replace(/\s+/g, '') : null
  const phaseLabel = phaseKey
    ? (de && PHASE_LABEL_DE[phaseKey]) ||
      rawPhase!
        .replace(/([a-z])(\d)/i, '$1 $2')
        .replace(/^\w/, (c) => c.toUpperCase())
    : null

  // Freshness pill — body_battery.now_at, formatted
  const nowAt = snapshot?.body_battery?.now_at
  const asOf = nowAt ? format(new Date(nowAt), 'HH:mm') : null

  // Readiness-row inputs — the two evidence markers that sit beside Erholung.
  const evidence = (brief?.evidence as Record<string, unknown> | undefined) ?? {}
  const pmc = evidence.pmc as Record<string, unknown> | undefined
  const bio = evidence.biometrics as Record<string, unknown> | undefined
  const hrv = bio?.hrv as Record<string, unknown> | undefined
  const hrvDelta = hrv?.delta_pct as number | null | undefined
  const tsb = pmc?.tsb as number | null | undefined
  const sleepScore = latest?.sleep_score ?? null

  const hrvTone =
    typeof hrvDelta === 'number'
      ? hrvDelta < -8 ? 'var(--color-bad)' : hrvDelta < -3 ? 'var(--color-caution)' : 'var(--color-good)'
      : 'var(--color-ink-2)'
  const tsbTone =
    typeof tsb === 'number'
      ? tsb < -25 ? 'var(--color-bad)' : tsb < -10 ? 'var(--color-ink-2)' : 'var(--color-good)'
      : 'var(--color-ink-2)'

  return (
    <div
      className="rounded-[18px] p-4 sm:p-5"
      style={{
        // Neutral surface — the single day-accent lives on the directive card
        // below, not stacked here. Only the ring carries the tier colour.
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
      }}
    >
      {/* Eyebrow — date · build phase · days-to-goal · freshness */}
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <EyebrowChip>{format(today, 'EEE d MMM').toUpperCase()}</EyebrowChip>
        {phaseLabel && (
          <>
            <span style={{ color: 'var(--color-muted)', fontSize: 10 }}>·</span>
            <EyebrowChip color="var(--color-ink-2)">{phaseLabel.toUpperCase()}</EyebrowChip>
          </>
        )}
        {typeof daysToGoal === 'number' && daysToGoal > 0 && (
          <>
            <span style={{ color: 'var(--color-muted)', fontSize: 10 }}>·</span>
            <EyebrowChip color="var(--color-amber-2)">
              {daysToGoal}{t('days_to')} {(goalName ?? (locale === 'de' ? 'ZIEL' : 'GOAL')).toUpperCase()}
            </EyebrowChip>
          </>
        )}
        <span className="ml-auto" />
        {asOf && (
          <EyebrowChip color="var(--color-muted)">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle"
              style={{ backgroundColor: 'var(--color-good)' }}
            />
            {t('as_of')} {asOf}
          </EyebrowChip>
        )}
      </div>

      {/* ONE compact readiness line: small ring + a uniform metric row. This is
         supporting context for the session above — never a second hero. */}
      <div className="flex items-center gap-4 sm:gap-5">
        <StateRing
          score={score ?? 0}
          color={color}
          size={ringSize}
          recoveryLabel={t('recovery_label')}
          scaleHint={de ? 'Erholung 0–100 · niedrig · mittel · hoch' : 'Recovery 0–100 · low · mid · high'}
        />
        <div className="flex-1 min-w-0 grid grid-cols-3 gap-3 sm:gap-5">
          <ReadinessCell
            label={t('recovery_label')}
            value={score != null ? String(Math.round(score)) : '—'}
            tone={color}
            title={de ? 'Erholung 0–100' : 'Recovery 0–100'}
          />
          <ReadinessCell
            label="HRV Δ"
            value={typeof hrvDelta === 'number' ? `${hrvDelta >= 0 ? '+' : ''}${hrvDelta.toFixed(1)}` : '—'}
            sub={typeof hrvDelta === 'number' ? '%' : undefined}
            tone={hrvTone}
            title={de ? 'HRV ggü. deiner Basislinie — höher = besser erholt' : 'HRV vs your baseline — higher = better recovered'}
          />
          <ReadinessCell
            label={de ? 'Form' : 'Form'}
            value={typeof tsb === 'number' ? `${tsb >= 0 ? '+' : ''}${Math.round(tsb)}` : '—'}
            tone={tsbTone}
            title={de ? 'Frische (TSB): plus = ausgeruht, minus = müde' : 'Freshness (TSB): plus = rested, minus = tired'}
          />
        </div>
      </div>

      {/* Verdict + sleep — a single muted supporting line, not a hero headline. */}
      <div
        className="flex items-center gap-3 flex-wrap mt-3 pt-3"
        style={{ borderTop: '1px solid var(--color-rule)' }}
      >
        <span style={{ color: 'var(--color-ink-2)', fontSize: 13 }}>{verdict}</span>
        {sleepScore != null && (
          <span className="ml-auto inline-flex items-baseline gap-1.5">
            <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 10.5 }}>{t('sleep_label')}</span>
            <span className="num-mono" style={{ color: 'var(--color-ink)', fontSize: 14, fontWeight: 500 }}>{Math.round(sleepScore)}</span>
          </span>
        )}
      </div>
    </div>
  )
}
