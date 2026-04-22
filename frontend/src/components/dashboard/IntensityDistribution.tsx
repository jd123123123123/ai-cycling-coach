import { subDays } from 'date-fns'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { currentWeekTID, classifyPolarizedZone } from '../../utils/advanced-metrics'
import type { PolarizedZone } from '../../utils/advanced-metrics'
import { prefersReducedMotion } from '../../utils/motion'

const ZONE_COLORS: Record<PolarizedZone, string> = {
  easy: '#2a6147',      // forest-2
  moderate: '#d96c1a',  // amber-2 — visually flags "grey zone" as concerning
  hard: '#143555',      // ink-blue
}

const ZONE_LABELS: Record<PolarizedZone, string> = {
  easy: 'Easy',
  moderate: 'Moderate',
  hard: 'Hard',
}

const ZONES: PolarizedZone[] = ['easy', 'moderate', 'hard']

export default function IntensityDistribution() {
  const today = new Date()
  // Fetch last 7 days to cover the current week
  const startDate = subDays(today, 7)
  const { data: activitiesData, isLoading: activitiesLoading } = useActivitiesRange(startDate, today)
  const { data: profile, isLoading: profileLoading } = useAthleteProfile()

  const isLoading = activitiesLoading || profileLoading
  const activities = activitiesData?.activities ?? []
  const lthr = profile?.lthr_cycling ?? null

  // Check if any activity has HR data — used for the "no LTHR" state
  const hasAnyHrData = activities.some((a) => a.average_hr != null)
  const hasSomeClassifiable = activities.some(
    (a) => classifyPolarizedZone(a.average_hr, lthr) != null,
  )

  const week = currentWeekTID(activities, lthr)
  const total = week.totalHours

  const donutData = ZONES.map((z) => ({
    name: ZONE_LABELS[z],
    zone: z,
    hours: week.totals[z],
    pct: total > 0 ? (week.totals[z] / total) * 100 : 0,
  }))

  // Seiler polarized interpretation
  const easyPct = donutData.find((d) => d.zone === 'easy')?.pct ?? 0
  const moderatePct = donutData.find((d) => d.zone === 'moderate')?.pct ?? 0
  const hardPct = donutData.find((d) => d.zone === 'hard')?.pct ?? 0

  const isPolarized = easyPct >= 75 && hardPct >= 10
  const isGreyZone = moderatePct > 35

  const interpretationColor = isPolarized
    ? 'var(--color-forest-2)'
    : isGreyZone
    ? 'var(--color-amber-2)'
    : 'var(--color-muted)'

  const interpretation = isPolarized
    ? 'Polarized. Textbook Seiler distribution.'
    : isGreyZone
    ? `${moderatePct.toFixed(0)}% in the grey zone — shifts training stress without delivering top-end adaptation.`
    : total > 0
    ? 'Aim for 80% easy / 20% hard to build without accumulating chronic fatigue.'
    : null

  return (
    <div
      className="paper-grain rounded-[20px] p-5 sm:p-6 min-w-0"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
      }}
    >
      <div className="mb-4">
        <span className="eyebrow" style={{ color: 'var(--color-amber)' }}>
          This week · Intensity
        </span>
        <h2
          className="num-display mt-1 leading-none"
          style={{ fontSize: 'clamp(20px, 2.5vw, 26px)', color: 'var(--color-ink)' }}
        >
          Training distribution
        </h2>
      </div>

      {isLoading ? (
        <div
          className="w-full h-[180px] rounded-[10px] animate-pulse"
          style={{ backgroundColor: 'var(--color-rule)' }}
        />
      ) : !hasSomeClassifiable && lthr == null && hasAnyHrData ? (
        // Has HR data but no LTHR set
        <div className="flex flex-col items-center justify-center text-center py-8 gap-2">
          <span className="eyebrow" style={{ color: 'var(--color-amber)' }}>
            Set your threshold HR
          </span>
          <p className="text-[13px] max-w-xs leading-relaxed" style={{ color: 'var(--color-ink-2)' }}>
            Add your lactate threshold HR in your profile to classify training zones.
          </p>
          <span
            className="num-mono text-[11px] mt-1"
            style={{ color: 'var(--color-muted)' }}
          >
            /profile-setup
          </span>
        </div>
      ) : total === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-8 gap-2">
          <span className="eyebrow" style={{ color: 'var(--color-forest)' }}>
            Rest week
          </span>
          <p className="text-[13px] max-w-xs leading-relaxed" style={{ color: 'var(--color-ink-2)' }}>
            No training logged this week yet.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Donut + legend row */}
          <div className="flex items-center gap-5">
            <div className="flex-shrink-0 w-[120px] h-[120px]">
              <ResponsiveContainer width="100%" height="100%">
                {/* Apple chart polish (Wave 3): radial gradient per slice,
                    draw-on animation on mount (750ms), reduced-motion aware. */}
                <PieChart>
                  <defs>
                    {ZONES.map((zone) => (
                      <radialGradient
                        key={`grad-${zone}`}
                        id={`zone-grad-${zone}`}
                        cx="50%"
                        cy="50%"
                        r="50%"
                        fx="50%"
                        fy="50%"
                      >
                        <stop offset="0%" stopColor={ZONE_COLORS[zone]} stopOpacity={0.7} />
                        <stop offset="100%" stopColor={ZONE_COLORS[zone]} stopOpacity={1} />
                      </radialGradient>
                    ))}
                  </defs>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={36}
                    outerRadius={56}
                    dataKey="hours"
                    strokeWidth={0}
                    isAnimationActive={!prefersReducedMotion()}
                    animationBegin={0}
                    animationDuration={750}
                    animationEasing="ease"
                  >
                    {donutData.map((entry) => (
                      <Cell
                        key={entry.zone}
                        fill={entry.hours > 0 ? `url(#zone-grad-${entry.zone})` : 'transparent'}
                        opacity={entry.hours > 0 ? 1 : 0}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Zone breakdown */}
            <div className="flex flex-col gap-2 flex-1 min-w-0">
              {donutData.map((d) => (
                <div key={d.zone} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: ZONE_COLORS[d.zone] }}
                    />
                    <span className="eyebrow truncate">{d.name}</span>
                  </div>
                  <div className="flex items-baseline gap-2 flex-shrink-0">
                    <span
                      className="num-mono text-[12px]"
                      style={{ color: 'var(--color-ink)' }}
                    >
                      {d.hours.toFixed(1)}h
                    </span>
                    <span
                      className="num-mono text-[10px]"
                      style={{ color: 'var(--color-muted)' }}
                    >
                      {d.pct.toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Interpretation */}
          {interpretation && (
            <div
              className="rounded-[10px] px-3 py-2.5"
              style={{
                backgroundColor: 'rgba(20, 24, 17, 0.03)',
                border: '1px solid var(--color-rule)',
              }}
            >
              <p
                className="text-[12px] leading-relaxed"
                style={{ color: interpretationColor }}
              >
                {interpretation}
              </p>
              <p
                className="num-mono text-[10px] mt-1"
                style={{ color: 'var(--color-muted)' }}
              >
                Target: 80% easy · 20% hard · Seiler polarized model
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
