import { useEffect, useMemo, useState } from 'react'
import { format, subDays } from 'date-fns'
import { useT, useLocale } from '../../contexts/LocaleContext'
import { useCoachBrief } from '../../hooks/useCoachBrief'
import { useDailyMetrics } from '../../hooks/useDailyMetrics'
import { useTodaySnapshot } from '../../hooks/useTodaySnapshot'
import { useGoalTrajectory } from '../../hooks/useGoalTrajectory'
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
 * TodayHero — the first card on Today.
 *
 * Consolidates what was three separate cards (ReadinessHero + TrajectorySentence
 * + the verdict portion of CoachBrief) into one decisive "today is X" panel:
 *
 *   eyebrow row : date · build phase · days-to-goal · last sync
 *   main row    : state-colored recovery ring + verdict + workout headline + CTA
 *   footer      : sleep · weekly strain · streak
 *
 * Everything analytical (the activity rings, percentile, full contributor sheet,
 * intraday wake/now pairs) still lives in the deeper ReadinessHero / Deep dive —
 * this card is the verdict, not the data dump.
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
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="num-mono inline-flex items-baseline" style={{ color: 'var(--color-ink)', lineHeight: 1 }}>
          <span style={{ fontSize: Math.round(size * 0.27), fontWeight: 500 }}>{animated}</span>
          <span style={{ fontSize: Math.round(size * 0.11), fontWeight: 500, color: 'var(--color-muted)' }}>/100</span>
        </span>
        <span className="eyebrow mt-1" style={{ color, fontSize: 10, letterSpacing: '0.24em', fontWeight: 600 }}>
          {recoveryLabel}
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

function whyChips(evidence: Record<string, unknown>, locale: 'en' | 'de'): Array<{ key: string; text: string; tone: 'good' | 'caution' | 'bad' | 'neutral'; title?: string }> {
  const out: Array<{ key: string; text: string; tone: 'good' | 'caution' | 'bad' | 'neutral'; title?: string }> = []
  const pmc = evidence.pmc as Record<string, unknown> | undefined
  const bio = evidence.biometrics as Record<string, unknown> | undefined
  const hrv = bio?.hrv as Record<string, unknown> | undefined
  const sleep = bio?.sleep as Record<string, unknown> | undefined

  const hrvDelta = hrv?.delta_pct as number | null | undefined
  if (typeof hrvDelta === 'number') {
    const tone = hrvDelta < -8 ? 'bad' : hrvDelta < -3 ? 'caution' : 'good'
    out.push({
      key: 'hrv',
      text: `HRV ${hrvDelta >= 0 ? '+' : ''}${hrvDelta.toFixed(1)}%`,
      tone,
      title: locale === 'de'
        ? 'Herzfrequenzvariabilität ggü. deiner Basislinie — höher = besser erholt'
        : 'Heart-rate variability vs your baseline — higher = better recovered',
    })
  }
  const tsb = pmc?.tsb as number | null | undefined
  if (typeof tsb === 'number') {
    const tone = tsb < -25 ? 'bad' : tsb < -10 ? 'neutral' : 'good'
    // Labelled "Form heute" (today's live TSB) to distinguish it from the
    // Form & Fortschritt panel, which reports form *after the last ride*.
    out.push({
      key: 'tsb',
      text: `${locale === 'de' ? 'Form heute' : 'Form today'} ${tsb >= 0 ? '+' : ''}${Math.round(tsb)}${tsb < -10 && tsb > -25 ? (locale === 'de' ? ' (produktiv)' : ' (productive)') : ''}`,
      tone,
      title: locale === 'de'
        ? 'Frische (TSB): plus = ausgeruht, minus = müde'
        : 'Freshness (TSB): plus = rested, minus = tired',
    })
  }
  const sleepDebt = sleep?.avg_nightly_debt_h as number | null | undefined
  if (typeof sleepDebt === 'number' && sleepDebt > 0.2) {
    const tone = sleepDebt > 1.5 ? 'bad' : sleepDebt > 0.6 ? 'caution' : 'neutral'
    out.push({
      key: 'sleep',
      text: `${locale === 'de' ? 'Schlafdefizit' : 'Sleep debt'} ${sleepDebt.toFixed(1)} h`,
      tone,
      title: locale === 'de'
        ? 'Fehlender Schlaf ggü. deinem Bedarf, Ø der letzten Nächte'
        : 'Missing sleep vs your need, averaged over recent nights',
    })
  }
  return out.slice(0, 4)
}

const TONE_COLOR: Record<'good' | 'caution' | 'bad' | 'neutral', string> = {
  good: 'var(--color-good)',
  caution: 'var(--color-caution)',
  bad: 'var(--color-bad)',
  neutral: 'var(--color-ink-2)',
}

export default function TodayHero() {
  const today = useMemo(() => new Date(), [])
  const { data: brief } = useCoachBrief()
  const { data: metricsResp } = useDailyMetrics(useMemo(() => subDays(today, 30), [today]), today)
  const { data: snapshot } = useTodaySnapshot()
  const { data: trajectory } = useGoalTrajectory()
  const isMobile = useViewportIsMobile(640)
  // Ring shrunk ~20% (was 108 / 140) — the today's-workout tiles below are now
  // the dominant actionable element, so the readiness ring reads as verdict,
  // not spectacle.
  const ringSize = isMobile ? 86 : 112
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

  // "Why" chips
  const why = whyChips((brief?.evidence as Record<string, unknown> | undefined) ?? {}, locale)

  // Footer micro-stat: sleep score. Weekly strain deliberately lives once —
  // in the WeeklyChallenge ring below — so the hero doesn't duplicate it.
  const sleepScore = latest?.sleep_score ?? null

  // Trajectory micro-line. Prefer the AI-generated `narrative_hook` from the
  // trajectory endpoint — it carries phase/event context and an actionable
  // delta ("add ~23 TSS/week to close the gap") that a templated state-label
  // string can't. Fall back to a composed line only if the hook is empty.
  function trajectoryLine(): { tone: 'good' | 'caution' | 'neutral'; text: string } | null {
    if (!trajectory || trajectory.on_track === 'no_goal' || trajectory.event_name == null) return null
    const tone: 'good' | 'caution' | 'neutral' =
      trajectory.on_track === 'ahead' || trajectory.on_track === 'on_track'
        ? 'good'
        : trajectory.on_track === 'behind'
          ? 'caution'
          : 'neutral'
    const hook = (trajectory.narrative_hook || '').trim()
    if (hook) return { tone, text: hook }
    // Fallback composition (rare — backend almost always provides a hook)
    const ctlProj = Math.round(trajectory.ctl_projected_at_goal)
    const ctlTarget = trajectory.ctl_target ? Math.round(trajectory.ctl_target) : null
    const stateLabel: Record<'ahead' | 'on_track' | 'behind', string> =
      locale === 'de'
        ? {
            ahead: 'Vor dem Plan',
            on_track: 'Im Plan',
            behind: 'Hinter dem Plan',
          }
        : {
            ahead: 'Ahead of plan',
            on_track: 'On track',
            behind: 'Behind plan',
          }
    const targetPart = ctlTarget
      ? locale === 'de'
        ? ` von ${ctlTarget} Ziel`
        : ` of ${ctlTarget} target`
      : ''
    return {
      tone,
      text:
        locale === 'de'
          ? `${stateLabel[trajectory.on_track]} · CTL projiziert ${ctlProj}${targetPart} am Renntag`
          : `${stateLabel[trajectory.on_track]} · CTL projected ${ctlProj}${targetPart} at race day`,
    }
  }
  const trajLine = trajectoryLine()

  return (
    <div
      className="rounded-[18px] p-5 sm:p-6"
      style={{
        backgroundColor: meta?.bg ?? 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
        backgroundImage: meta ? `linear-gradient(180deg, color-mix(in srgb, ${color} 6%, transparent) 0%, transparent 70%)` : undefined,
      }}
    >
      {/* Eyebrow — date · build phase · days-to-goal · freshness */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
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

      {/* Main row: ring + verdict + why chips. The workout + Start-ride CTA live
         once, in the CoachBrief's prescribed-workout card below — this hero is
         the verdict, not the prescription. */}
      <div className="flex gap-5 sm:gap-7 items-center flex-wrap">
        <StateRing
          score={score ?? 0}
          color={color}
          size={ringSize}
          recoveryLabel={t('recovery_label')}
          scaleHint={de ? 'Erholung 0–100 · niedrig · mittel · hoch' : 'Recovery 0–100 · low · mid · high'}
        />

        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <h1
            className="leading-[1.05]"
            style={{
              fontFamily: 'var(--font-serif, serif)',
              fontStyle: 'italic',
              fontSize: 'clamp(24px, 3.4vw, 36px)',
              color: 'var(--color-ink)',
              fontVariationSettings: '"opsz" 144, "SOFT" 30',
            }}
          >
            {verdict}
          </h1>

          {why.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 10.5 }}>{t('why_label')}</span>
              {why.map((c) => (
                <span
                  key={c.key}
                  title={c.title}
                  className="num-mono text-[11px] px-1.5 py-0.5 rounded-sm whitespace-nowrap"
                  style={{
                    color: TONE_COLOR[c.tone],
                    border: `1px solid color-mix(in srgb, ${TONE_COLOR[c.tone]} 35%, var(--color-rule))`,
                    cursor: c.title ? 'help' : undefined,
                  }}
                >
                  {c.text}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer — momentum micro-stats. Single line, no extra cards. */}
      <div
        className="flex items-center gap-4 flex-wrap mt-5 pt-3"
        style={{ borderTop: '1px solid var(--color-rule)' }}
      >
        {sleepScore != null && (
          <div className="flex items-baseline gap-1.5">
            <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 10.5 }}>{t('sleep_label')}</span>
            <span className="num-mono" style={{ color: 'var(--color-ink)', fontSize: 14, fontWeight: 500 }}>{Math.round(sleepScore)}</span>
          </div>
        )}
        {/* Weekly strain intentionally lives once, in the WeeklyChallenge ring
           below — kept out of the hero footer to avoid a duplicate "X% von Y". */}
        {meta && (
          <span
            className="eyebrow num-mono"
            style={{ color, fontSize: 11, letterSpacing: '0.18em', fontWeight: 600 }}
          >
            {(de ? meta.labelDe : meta.label).toUpperCase()}
          </span>
        )}
      </div>

      {/* Trajectory micro-line — forward-looking carrot. Only renders when a
         goal event is configured and the trajectory endpoint returns a
         projection (no_goal → no line, no clutter). */}
      {trajLine && (
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <span
            className="num-mono"
            style={{
              color:
                trajLine.tone === 'good'
                  ? 'var(--color-good)'
                  : trajLine.tone === 'caution'
                    ? 'var(--color-caution)'
                    : 'var(--color-ink-2)',
              fontSize: 12,
            }}
          >
            ▸ {trajLine.text}
          </span>
        </div>
      )}
    </div>
  )
}
