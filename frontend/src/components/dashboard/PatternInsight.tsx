import { useMemo } from 'react'
import { subDays, format, parseISO } from 'date-fns'
import { Eye } from 'lucide-react'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { useDailyMetrics } from '../../hooks/useDailyMetrics'
import { usePMC } from '../../hooks/usePMC'
import { useT } from '../../contexts/LocaleContext'
import type { ActivityRead, DailyMetric, PMCEntry } from '../../api/dashboard'

/**
 * PatternInsight — one coaching observation per day. A human coach
 * spotting things the athlete would miss in the noise: an HRV slide that
 * crosses the line from "ordinary fluctuation" into "trend", a sleep
 * average that's quietly dragging recovery, a CTL ramp that's hugging the
 * upper bound of safe progression.
 *
 * Each detector returns null when the signal isn't strong enough; the
 * card picks the highest-priority non-null result. Renders nothing on a
 * quiet pattern day — the dashboard shouldn't manufacture insight.
 */

interface Pattern {
  priority: number             // higher = more salient
  tone: 'good' | 'caution' | 'bad' | 'neutral'
  headline: string             // the observation, ≤ ~80 chars
  followup: string | null      // optional one-line "what to do"
}

const TONE_COLOR: Record<Pattern['tone'], string> = {
  good: 'var(--color-good)',
  caution: 'var(--color-caution)',
  bad: 'var(--color-bad)',
  neutral: 'var(--color-ink-2)',
}

// ── Detector helpers ────────────────────────────────────────────────

function meanOrNull(xs: Array<number | null | undefined>): number | null {
  const clean = xs.filter((v): v is number => v != null && Number.isFinite(v))
  if (clean.length === 0) return null
  return clean.reduce((s, v) => s + v, 0) / clean.length
}

function lastN<T>(xs: T[], n: number): T[] {
  return xs.slice(Math.max(0, xs.length - n))
}

// ── HRV consecutive-down detector ───────────────────────────────────
function hrvStreak(metrics: DailyMetric[]): Pattern | null {
  const last14 = lastN(metrics, 14).filter((m) => m.hrv_status != null)
  if (last14.length < 7) return null
  const recent = lastN(last14, 4)
  const baseline = meanOrNull(last14.slice(0, -4).map((m) => m.hrv_status))
  if (!baseline) return null
  const belowBaseline = recent.every((m) => (m.hrv_status ?? Infinity) < baseline)
  if (!belowBaseline) return null
  const recentMean = meanOrNull(recent.map((m) => m.hrv_status)) ?? 0
  const dropPct = ((recentMean - baseline) / baseline) * 100
  if (dropPct > -3) return null  // too small to flag
  return {
    priority: dropPct < -8 ? 90 : 75,
    tone: dropPct < -8 ? 'bad' : 'caution',
    headline: `HRV has been below baseline ${recent.length} nights in a row — averaging ${dropPct.toFixed(1)}% under.`,
    followup:
      dropPct < -8
        ? 'A real rest day or a deep-sleep night usually resets it. Skip the next quality session if it persists tomorrow.'
        : 'Worth a closer look at evening stress, late caffeine, or alcohol over the last few days.',
  }
}

// ── Sleep 7-day average vs target ───────────────────────────────────
function sleepShortfall(metrics: DailyMetric[]): Pattern | null {
  const last7 = lastN(metrics, 7).filter((m) => m.sleep_score != null)
  if (last7.length < 5) return null
  // The brief tracks debt directly; here we use the score as the proxy.
  // Score < 60 across 7 nights is genuinely short.
  const mean = meanOrNull(last7.map((m) => m.sleep_score)) ?? 0
  const shortNights = last7.filter((m) => (m.sleep_score ?? 100) < 60).length
  if (shortNights < 3 && mean >= 65) return null
  return {
    priority: shortNights >= 5 ? 80 : 60,
    tone: shortNights >= 5 ? 'bad' : 'caution',
    headline: `Sleep score averaged ${Math.round(mean)} over ${last7.length} nights — ${shortNights} of them under 60.`,
    followup:
      'A 30-minute earlier bedtime tonight is the highest-leverage move on the dashboard right now.',
  }
}

// ── CTL ramp inside / outside the safe band ─────────────────────────
function ctlRamp(pmc: PMCEntry[]): Pattern | null {
  if (pmc.length < 8) return null
  const latest = pmc[pmc.length - 1]
  const weekAgo = pmc[pmc.length - 8]
  const delta = latest.ctl - weekAgo.ctl
  if (delta > 8) {
    return {
      priority: 70,
      tone: 'caution',
      headline: `Fitness has climbed +${delta.toFixed(1)} in 7 days — above the 5–7/week safe ramp.`,
      followup:
        "Two more days at this rate and the next quality session is a coin-flip. An easy week within the next 10 days keeps you out of overreach.",
    }
  }
  if (delta >= 5) {
    return {
      priority: 50,
      tone: 'good',
      headline: `Fitness up +${delta.toFixed(1)} in 7 days — hugging the upper end of safe progression.`,
      followup: 'Hold the load steady this week and the adaptations will land.',
    }
  }
  if (delta <= -2 && latest.ctl > 5) {
    return {
      priority: 55,
      tone: 'caution',
      headline: `Fitness has slipped ${delta.toFixed(1)} in 7 days — detraining if it continues.`,
      followup: 'A 60–90-min Z2 ride twice this week stops the bleed.',
    }
  }
  return null
}

// ── TSB volatility — wide swings in a short window ──────────────────
function tsbVolatility(pmc: PMCEntry[]): Pattern | null {
  if (pmc.length < 8) return null
  const last7 = lastN(pmc, 7)
  const values = last7.map((e) => e.tsb)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min
  if (range < 18) return null
  return {
    priority: 45,
    tone: 'neutral',
    headline: `TSB has swung ${range.toFixed(0)} points in 7 days — load is bouncy.`,
    followup: 'Smoother daily TSS (fewer extreme spikes) lets the form curve catch up.',
  }
}

// ── RHR adaptation — sustained drop below 14-day baseline ──────────
function rhrAdaptation(metrics: DailyMetric[]): Pattern | null {
  const last14 = lastN(metrics, 14).filter((m) => m.resting_hr != null)
  if (last14.length < 9) return null
  const recent = lastN(last14, 5)
  const baseline = meanOrNull(last14.slice(0, -5).map((m) => m.resting_hr))
  if (!baseline) return null
  const belowBase = recent.filter((m) => (m.resting_hr ?? Infinity) < baseline).length
  if (belowBase < 4) return null  // 4 of 5 = sustained
  const recentMean = meanOrNull(recent.map((m) => m.resting_hr)) ?? baseline
  const dropPct = ((baseline - recentMean) / baseline) * 100
  if (dropPct < 1.5) return null
  return {
    priority: 60,
    tone: 'good',
    headline: `RHR has been below baseline ${belowBase} of the last 5 nights — averaging ${dropPct.toFixed(1)}% lower.`,
    followup:
      'Classic adaptation signature. The body is banking the work — keep the load steady this week.',
  }
}

// ── Sleep consistency win — 5+ straight strong nights ──────────────
function sleepConsistency(metrics: DailyMetric[]): Pattern | null {
  const recent = lastN(metrics, 7).filter((m) => m.sleep_score != null)
  if (recent.length < 5) return null
  const tail = lastN(recent, 5)
  const allStrong = tail.every((m) => (m.sleep_score ?? 0) >= 70)
  if (!allStrong) return null
  const mean = meanOrNull(tail.map((m) => m.sleep_score)) ?? 0
  return {
    priority: 50,
    tone: 'good',
    headline: `Sleep has scored 70+ for ${tail.length} straight nights — averaging ${Math.round(mean)}.`,
    followup:
      'This is the recovery-stack adaptations actually use. Treat today as a green-light day if everything else agrees.',
  }
}

// ── Day-of-week miss pattern (last 4 weeks) ────────────────────────
// Looks at the last 28 days and finds the weekday with the *most* expected-
// but-empty slots. Only flags when the same weekday has gone empty 3+ of
// the last 4 occurrences AND the athlete's overall weekly cadence is ≥4
// sessions (so this isn't false-flagged on a 2-rides-a-week athlete).
function dayOfWeekMiss(acts: ActivityRead[]): Pattern | null {
  if (acts.length < 8) return null
  const dayLabels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  // Bucket activity dates by ISO date.
  const dateSet = new Set<string>()
  for (const a of acts) {
    try {
      const k = format(parseISO(a.started_at), 'yyyy-MM-dd')
      dateSet.add(k)
    } catch {
      /* ignore */
    }
  }

  // Last 28 days, weekday counts: total occurrences + matched.
  const now = new Date()
  const counts = Array.from({ length: 7 }, () => ({ total: 0, matched: 0 }))
  for (let i = 1; i <= 28; i++) {
    const d = subDays(now, i)
    const k = format(d, 'yyyy-MM-dd')
    const dow = d.getDay()
    counts[dow].total += 1
    if (dateSet.has(k)) counts[dow].matched += 1
  }

  // Bail if cadence is low; "skipped Wednesdays" doesn't apply to a
  // weekend-only rider.
  const totalSessions = counts.reduce((s, c) => s + c.matched, 0)
  if (totalSessions < 16) return null  // < 4/wk avg

  let worstDow = -1
  let worstMissRatio = 0
  for (let i = 0; i < 7; i++) {
    const total = counts[i].total
    if (total < 4) continue
    const missed = total - counts[i].matched
    if (missed < 3) continue
    const ratio = missed / total
    if (ratio > worstMissRatio) {
      worstMissRatio = ratio
      worstDow = i
    }
  }
  if (worstDow < 0) return null

  const c = counts[worstDow]
  const missed = c.total - c.matched
  return {
    priority: 40,
    tone: 'neutral',
    headline: `You've skipped ${missed} of the last ${c.total} ${dayLabels[worstDow]}s.`,
    followup:
      "Move the day to a different slot or commit to a short Z2 spin — even 30 min keeps the chain unbroken.",
  }
}

export default function PatternInsight() {
  const t = useT()
  const today = useMemo(() => new Date(), [])
  const { data: metricsResp } = useDailyMetrics(useMemo(() => subDays(today, 28), [today]), today)
  const { data: pmc } = usePMC(28)
  const { data: actsResp } = useActivitiesRange(useMemo(() => subDays(today, 28), [today]), today)

  const pattern = useMemo<Pattern | null>(() => {
    const metrics = metricsResp?.metrics ?? []
    const entries = pmc?.entries ?? []
    const acts = actsResp?.activities ?? []
    const candidates: Pattern[] = []
    const a = hrvStreak(metrics); if (a) candidates.push(a)
    const b = sleepShortfall(metrics); if (b) candidates.push(b)
    const c = ctlRamp(entries); if (c) candidates.push(c)
    const d = tsbVolatility(entries); if (d) candidates.push(d)
    const e = rhrAdaptation(metrics); if (e) candidates.push(e)
    const f = sleepConsistency(metrics); if (f) candidates.push(f)
    const g = dayOfWeekMiss(acts); if (g) candidates.push(g)
    if (candidates.length === 0) return null
    candidates.sort((x, y) => y.priority - x.priority)
    return candidates[0]
  }, [metricsResp, pmc, actsResp])

  if (!pattern) return null

  const color = TONE_COLOR[pattern.tone]
  return (
    <div
      className="rounded-[12px] px-4 py-3 flex items-start gap-3"
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 5%, var(--color-paper-2))`,
        border: `1px solid color-mix(in srgb, ${color} 28%, var(--color-rule))`,
      }}
    >
      <Eye
        size={14}
        strokeWidth={2}
        style={{ color, marginTop: 2, flexShrink: 0 }}
      />
      <div className="flex flex-col gap-1 min-w-0">
        <span
          className="eyebrow num-mono"
          style={{
            color,
            fontSize: 9,
            letterSpacing: '0.22em',
            fontWeight: 600,
          }}
        >
          {t('pattern_spotted')}
        </span>
        <p
          className="text-[13px] leading-relaxed"
          style={{ color: 'var(--color-ink)', maxWidth: '64ch' }}
        >
          {pattern.headline}
        </p>
        {pattern.followup && (
          <p
            className="text-[12px] leading-relaxed mt-0.5"
            style={{ color: 'var(--color-ink-2)', maxWidth: '64ch' }}
          >
            ▸ {pattern.followup}
          </p>
        )}
      </div>
    </div>
  )
}
