import { useMemo } from 'react'
import { subDays } from 'date-fns'
import { Eye } from 'lucide-react'
import { useDailyMetrics } from '../../hooks/useDailyMetrics'
import { usePMC } from '../../hooks/usePMC'
import type { DailyMetric, PMCEntry } from '../../api/dashboard'

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

export default function PatternInsight() {
  const today = useMemo(() => new Date(), [])
  const { data: metricsResp } = useDailyMetrics(useMemo(() => subDays(today, 14), [today]), today)
  const { data: pmc } = usePMC(28)

  const pattern = useMemo<Pattern | null>(() => {
    const metrics = metricsResp?.metrics ?? []
    const entries = pmc?.entries ?? []
    const candidates: Pattern[] = []
    const a = hrvStreak(metrics); if (a) candidates.push(a)
    const b = sleepShortfall(metrics); if (b) candidates.push(b)
    const c = ctlRamp(entries); if (c) candidates.push(c)
    const d = tsbVolatility(entries); if (d) candidates.push(d)
    if (candidates.length === 0) return null
    candidates.sort((x, y) => y.priority - x.priority)
    return candidates[0]
  }, [metricsResp, pmc])

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
          PATTERN SPOTTED
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
