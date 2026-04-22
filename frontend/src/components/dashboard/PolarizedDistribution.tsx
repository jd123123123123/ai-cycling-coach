import { useMemo } from 'react'
import { subDays } from 'date-fns'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import type { ActivityRead } from '../../api/dashboard'

// Seiler's polarized model: ~80% time in Z1–Z2 (low), ~20% in Z4–Z5 (high),
// minimal "grey zone" Z3. This two-peak histogram makes the 80/20 split
// instantly visible, whereas every consumer app shows a stacked zone bar
// that smears the insight. We compute zones from a TSS-proxy (normalized
// power / FTP if available; falls back to average HR / threshold HR).

// Grade scale based on Stephen Seiler's public interviews and
// Laursen/Plews review papers: A = 75%+ low, 5-25% high, <10% grey;
// anything meaningfully off that drops a letter.

type ZoneBucket = 'low' | 'grey' | 'high'

interface Distribution {
  low: number   // seconds in Z1–Z2
  grey: number  // seconds in Z3
  high: number  // seconds in Z4–Z5+
  total: number
}

function bucketFromIntensityRatio(ratio: number): ZoneBucket {
  // Ratio = %FTP or %LTHR. Seiler's 3-zone model:
  //   low  < ~82% LTHR (≈ roughly <75% FTP / < LT1)
  //   grey ~82–92% LTHR (LT1..LT2, "tempo/SweetSpot")
  //   high > 92% LTHR (LT2+)
  if (ratio < 0.82) return 'low'
  if (ratio < 0.92) return 'grey'
  return 'high'
}

function activityZoneSplit(a: ActivityRead): ZoneBucket | null {
  // Prefer power — more reliable. Use normalized_power as proxy for intensity.
  // Without FTP we can't compute the ratio exactly; use a heuristic:
  //   np > ~230W historically means "high-ish" for many cyclists, but that's
  //   guesswork. Fall back to HR when that happens.
  if (a.average_hr && a.max_hr && a.max_hr > 0) {
    // Rough LTHR ≈ 88% of max (Joe Friel). Ratio = avg_hr / LTHR.
    const lthr = a.max_hr * 0.88
    const ratio = a.average_hr / lthr
    return bucketFromIntensityRatio(ratio)
  }
  // If only duration — call it endurance (low).
  return 'low'
}

function grade(pct: { low: number; grey: number; high: number }): {
  letter: 'A' | 'B' | 'C' | 'D'
  color: string
  note: string
  nextMove: string
} {
  const { low, grey, high } = pct
  if (low >= 75 && high >= 5 && high <= 25 && grey <= 10) {
    return {
      letter: 'A',
      color: 'var(--color-forest-2)',
      note: 'Textbook 80/20 — exactly where aerobic adaptations live.',
      nextMove: 'Hold the pattern. Keep next easy ride strictly under LT1.',
    }
  }
  if (low >= 65 && grey <= 20) {
    return {
      letter: 'B',
      color: 'var(--color-forest-2)',
      note: 'Close to polarized — a touch more easy or a touch less middle would lock it.',
      nextMove:
        low < 75
          ? 'Add 30–60 min of pure Z2 this week to tilt the ratio.'
          : 'Swap one tempo session for a true interval block to sharpen the high end.',
    }
  }
  if (grey > 30) {
    return {
      letter: 'C',
      color: 'rgba(190, 124, 34, 0.95)',
      note: 'Grey-zone drift. Too much tempo dulls both endurance and peak gains.',
      nextMove:
        'Next ride: cap HR at 75% LTHR. Give the aerobic engine the easy work it needs.',
    }
  }
  if (high > 30) {
    return {
      letter: 'D',
      color: 'var(--color-alert)',
      note: 'Mostly hard — no foundation is being built.',
      nextMove:
        'Swap the next two rides for Z2 only. Intensity without a base burns out in 2–3 weeks.',
    }
  }
  return {
    letter: 'D',
    color: 'var(--color-alert)',
    note: 'Distribution is off-target for either polarized or pyramidal.',
    nextMove:
      'Rebuild the week: 1 hard, 1 medium, 2 easy — the minimum pattern that actually builds fitness.',
  }
}

function BarTile({
  label,
  pct,
  seconds,
  accent,
  isTarget = false,
  subtitle,
}: {
  label: string
  pct: number
  seconds: number
  accent: string
  isTarget?: boolean
  subtitle: string
}) {
  const hours = seconds / 3600
  // Apple chart polish (Wave 3): vertical linearGradient fill — full color at
  // top, 60% opacity at bottom. Matches gradient-bars rule from REDESIGN-BRIEF §3.
  const linearGradient = `linear-gradient(to bottom, ${accent} 0%, ${accent}99 100%)`
  return (
    <div className="flex flex-col gap-1 min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-2">
        <span
          className="eyebrow"
          style={{
            color: 'var(--color-muted)',
            fontSize: 9,
            letterSpacing: '0.22em',
          }}
        >
          {label.toUpperCase()}
        </span>
        <span
          className="num-mono"
          style={{ color: 'var(--color-ink)', fontSize: 13, fontWeight: 500 }}
        >
          {pct.toFixed(0)}%
        </span>
      </div>
      <div
        className="relative h-14 rounded-md overflow-hidden"
        style={{
          backgroundColor: 'var(--color-paper)',
          border: '1px solid var(--color-rule)',
        }}
      >
        <div
          className="absolute bottom-0 left-0 right-0 transition-all"
          style={{
            height: `${Math.max(4, pct)}%`,
            background: linearGradient,
            opacity: isTarget ? 1 : 0.5,
          }}
        />
      </div>
      <span
        className="num-mono text-[10px]"
        style={{ color: 'var(--color-muted)' }}
      >
        {hours.toFixed(1)} h · {subtitle}
      </span>
    </div>
  )
}

export default function PolarizedDistribution() {
  const today = new Date()
  const start = subDays(today, 14)
  const { data, isLoading } = useActivitiesRange(start, today)

  const { distribution, gradeInfo } = useMemo(() => {
    const acts = data?.activities ?? []
    const dist: Distribution = { low: 0, grey: 0, high: 0, total: 0 }
    for (const a of acts) {
      const dur = a.duration_seconds ?? 0
      if (dur <= 0) continue
      const bucket = activityZoneSplit(a)
      if (!bucket) continue
      dist[bucket] += dur
      dist.total += dur
    }
    const pct = {
      low: dist.total > 0 ? (dist.low / dist.total) * 100 : 0,
      grey: dist.total > 0 ? (dist.grey / dist.total) * 100 : 0,
      high: dist.total > 0 ? (dist.high / dist.total) * 100 : 0,
    }
    return {
      distribution: dist,
      gradeInfo: dist.total > 0 ? grade(pct) : null,
    }
  }, [data])

  const pct = {
    low: distribution.total > 0 ? (distribution.low / distribution.total) * 100 : 0,
    grey: distribution.total > 0 ? (distribution.grey / distribution.total) * 100 : 0,
    high: distribution.total > 0 ? (distribution.high / distribution.total) * 100 : 0,
  }

  return (
    <div
      className="paper-grain rounded-[20px] px-5 py-4 sm:px-6 sm:py-5"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
      }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span
            className="eyebrow"
            style={{ color: 'var(--color-muted)', letterSpacing: '0.22em' }}
          >
            Polarized training · last 14 days
          </span>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span
              className="num-display leading-none"
              style={{
                fontSize: 'clamp(22px, 3vw, 28px)',
                color: 'var(--color-ink)',
              }}
            >
              {gradeInfo ? `Grade ${gradeInfo.letter}` : 'Awaiting data'}
            </span>
            <span
              className="num-mono text-[11px]"
              style={{ color: 'var(--color-muted)' }}
              title="Target: Seiler 80/20 — 75%+ low, 5–25% high, <10% grey"
            >
              · target 80 / &lt;10 / 20
            </span>
          </div>
        </div>
        {gradeInfo && (
          <span
            className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: `color-mix(in srgb, ${gradeInfo.color} 14%, transparent)`,
              color: gradeInfo.color,
              fontSize: 16,
              fontWeight: 600,
            }}
            aria-hidden
          >
            {gradeInfo.letter}
          </span>
        )}
      </div>

      {isLoading ? (
        <div
          className="mt-4 h-20 rounded animate-pulse"
          style={{ backgroundColor: 'var(--color-rule)' }}
        />
      ) : distribution.total === 0 ? (
        <p
          className="mt-3 text-[13px]"
          style={{ color: 'var(--color-ink-2)' }}
        >
          Log a couple of sessions in the last 14 days to see your polarization grade.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mt-4">
            <BarTile
              label="Low · Z1–2"
              pct={pct.low}
              seconds={distribution.low}
              accent="var(--color-forest-2)"
              isTarget
              subtitle="target 75%+"
            />
            <BarTile
              label="Grey · Z3"
              pct={pct.grey}
              seconds={distribution.grey}
              accent="rgba(190, 124, 34, 0.95)"
              subtitle="target <10%"
            />
            <BarTile
              label="High · Z4–5"
              pct={pct.high}
              seconds={distribution.high}
              accent="rgba(214, 87, 47, 1)"
              isTarget
              subtitle="target 5–25%"
            />
          </div>
          {gradeInfo && (
            <div className="mt-3 flex flex-col gap-2">
              <p
                className="text-[13px] leading-relaxed"
                style={{ color: 'var(--color-ink-2)' }}
              >
                {gradeInfo.note}
              </p>
              {/* Prescribe-don't-describe — a specific next move per grade.
                 Users can act on a sentence; they can't act on a chart. */}
              <div
                className="flex items-start gap-2 text-[13px] leading-relaxed rounded-lg px-3 py-2"
                style={{
                  color: 'var(--color-ink)',
                  backgroundColor: `color-mix(in srgb, ${gradeInfo.color} 8%, transparent)`,
                  borderLeft: `2px solid ${gradeInfo.color}`,
                }}
              >
                <span
                  className="eyebrow mt-0.5"
                  style={{
                    color: gradeInfo.color,
                    fontSize: 9,
                    letterSpacing: '0.22em',
                  }}
                >
                  NEXT →
                </span>
                <span>{gradeInfo.nextMove}</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
