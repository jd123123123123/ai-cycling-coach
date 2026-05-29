/**
 * ExternalWorkouts — curated Zwift / TrainerRoad shortlist for today's
 * prescription. Renders below the PrescribedWorkoutCard. Each row links to
 * a per-platform search query for the workout title (we don't deep-link to
 * specific workout pages — those URLs rot constantly).
 */
import { useExternalWorkouts } from '../../hooks/useExternalWorkouts'
import type { ExternalPlatform, ExternalWorkoutMatch } from '../../api/coach'

const PLATFORM_LABEL: Record<ExternalPlatform, string> = {
  zwift: 'Zwift',
  trainerroad: 'TrainerRoad',
  rouvy: 'ROUVY',
}

const PLATFORM_TINT: Record<ExternalPlatform, string> = {
  zwift: '#fa7341',
  trainerroad: '#e62339',
  rouvy: '#0c8de4',
}

// Build a per-platform search URL. We don't fabricate deep links to specific
// workout pages because external sites reorganise constantly — search lands
// the athlete on a results page that always works.
function searchUrl(platform: ExternalPlatform, title: string): string {
  const q = encodeURIComponent(title)
  if (platform === 'zwift') return `https://whatsonzwift.com/?s=${q}`
  if (platform === 'trainerroad') {
    return `https://www.trainerroad.com/cycling/workouts?Search=${q}`
  }
  return `https://riders.rouvy.com/workouts?q=${q}`
}

function PlatformBadge({ platform }: { platform: ExternalPlatform }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        fontWeight: 500,
        padding: '2px 8px',
        borderRadius: 999,
        backgroundColor: PLATFORM_TINT[platform] + '20',
        color: PLATFORM_TINT[platform],
        border: `1px solid ${PLATFORM_TINT[platform]}40`,
      }}
    >
      {PLATFORM_LABEL[platform]}
    </span>
  )
}

function WorkoutRow({ w }: { w: ExternalWorkoutMatch }) {
  return (
    <a
      href={searchUrl(w.platform, w.title)}
      target="_blank"
      rel="noopener noreferrer"
      className="group"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
        padding: '10px 12px',
        borderRadius: 10,
        border: '1px solid var(--color-rule)',
        backgroundColor: 'var(--color-paper-2, transparent)',
        textDecoration: 'none',
        color: 'inherit',
        transition: 'border-color 120ms',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--color-ink-2)')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--color-rule)')}
    >
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <PlatformBadge platform={w.platform} />
          <span style={{ fontWeight: 500, color: 'var(--color-ink)' }}>{w.title}</span>
        </div>
        <span style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>{w.structure}</span>
      </div>
      <div
        className="num-mono"
        style={{
          flexShrink: 0,
          fontSize: 12,
          textAlign: 'right',
          color: 'var(--color-ink-2)',
          lineHeight: 1.5,
        }}
      >
        <div>{w.duration_min}min</div>
        <div>
          IF {w.intensity_factor.toFixed(2)} · {w.predicted_tss} TSS
        </div>
      </div>
    </a>
  )
}

export default function ExternalWorkouts() {
  const { data, isLoading, isError } = useExternalWorkouts({ limit: 5 })

  if (isLoading || isError || !data) return null
  if (data.matches.length === 0) return null

  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        marginTop: 12,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <span
          className="eyebrow"
          style={{
            fontSize: 11,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--color-ink-3)',
          }}
        >
          Do this on your trainer
        </span>
        <span style={{ fontSize: 11, color: 'var(--color-ink-3)' }}>
          {data.session_type.replace('_', ' ')} · ~{data.target_minutes}min
        </span>
      </header>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.matches.map((w) => (
          <WorkoutRow key={w.id} w={w} />
        ))}
      </div>
    </section>
  )
}
