import { Link } from 'react-router-dom'
import { subDays } from 'date-fns'
import { Bike, Footprints, Dumbbell, ArrowUpRight } from 'lucide-react'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import type { ActivityRead } from '../../api/dashboard'
import { formatDistanceKm, formatDuration, formatRelativeDay } from '../../utils/metrics'

const SPORT_META: Record<ActivityRead['sport'], { icon: React.ReactNode; label: string; accent: string }> = {
  cycling: { icon: <Bike size={14} strokeWidth={1.8} />, label: 'Ride', accent: 'var(--color-forest)' },
  running: { icon: <Footprints size={14} strokeWidth={1.8} />, label: 'Run', accent: 'var(--color-amber-2)' },
  gym: { icon: <Dumbbell size={14} strokeWidth={1.8} />, label: 'Strength', accent: 'var(--color-ink-blue)' },
}

function ActivityRow({ a }: { a: ActivityRead }) {
  const meta = SPORT_META[a.sport]
  const title = a.title?.trim() || `${meta.label} · ${formatRelativeDay(a.started_at)}`
  const parts: string[] = []
  if (a.duration_seconds) parts.push(formatDuration(a.duration_seconds))
  if (a.distance_meters) parts.push(formatDistanceKm(a.distance_meters))

  return (
    <li
      className="relative group"
      style={{ borderBottom: '1px solid var(--color-rule)' }}
    >
      <div className="flex items-stretch gap-4 py-4">
        {/* Sport dot column */}
        <div className="flex flex-col items-center pt-1 flex-shrink-0 w-10">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: meta.accent + '14',
              color: meta.accent,
              border: `1px solid ${meta.accent}33`,
            }}
          >
            {meta.icon}
          </div>
        </div>
        {/* Body */}
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <div className="flex items-start justify-between gap-3">
            <span
              className="serif-caps text-[15px] sm:text-[16px] dashboard-break-words"
              style={{ color: 'var(--color-ink)' }}
            >
              {title}
            </span>
            <span
              className="num-mono text-[11px] whitespace-nowrap flex-shrink-0 mt-1"
              style={{ color: 'var(--color-muted)' }}
            >
              {formatRelativeDay(a.started_at)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="eyebrow" style={{ color: meta.accent }}>
              {meta.label}
            </span>
            {parts.map((p) => (
              <span key={p} className="num-mono text-[12px]" style={{ color: 'var(--color-ink-2)' }}>
                {p}
              </span>
            ))}
            {a.tss != null && (
              <span
                className="num-mono text-[11px] px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: 'rgba(20, 24, 17, 0.05)',
                  color: 'var(--color-ink)',
                  border: '1px solid var(--color-rule)',
                }}
              >
                TSS {Math.round(a.tss)}
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}

interface RecentActivitiesProps {
  /** Max number of rows to render. Defaults to 10. Phase 5.1 uses limit=5 in fold 3. */
  limit?: number
}

export default function RecentActivities({ limit = 10 }: RecentActivitiesProps = {}) {
  const today = new Date()
  const fourteenDaysAgo = subDays(today, 14)
  const { data, isLoading, isError, refetch } = useActivitiesRange(fourteenDaysAgo, today)

  const activities = (data?.activities ?? [])
    .slice() // don't mutate
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
    .slice(0, limit)

  return (
    <div
      className="paper-grain rounded-[20px] overflow-hidden flex flex-col"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
      }}
    >
      {/* Header */}
      <div className="flex items-baseline justify-between px-5 pt-5 pb-3 sm:px-6 sm:pt-6 gap-2 flex-wrap">
        <div>
          <span className="eyebrow" style={{ color: 'var(--color-amber)' }}>
            Dossier
          </span>
          <h2
            className="num-display mt-1 leading-none"
            style={{
              fontSize: 'clamp(22px, 3vw, 28px)',
              color: 'var(--color-ink)',
            }}
          >
            Recent training
          </h2>
        </div>
        {!isLoading && !isError && activities.length > 0 && (
          <span className="num-mono text-[11px]" style={{ color: 'var(--color-muted)' }}>
            last {activities.length}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-5 sm:px-6 pb-5">
        {isLoading ? (
          <div className="space-y-3 py-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-16 rounded animate-pulse"
                style={{ backgroundColor: 'var(--color-rule)' }}
              />
            ))}
          </div>
        ) : isError ? (
          <div className="py-6 flex flex-col items-start gap-3">
            <span className="text-sm" style={{ color: 'var(--color-alert)' }}>
              Couldn&apos;t load activities
            </span>
            <button
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-medium"
              style={{
                backgroundColor: 'var(--color-ink)',
                color: 'var(--color-paper)',
              }}
            >
              Retry
            </button>
          </div>
        ) : activities.length === 0 ? (
          <div
            className="py-8 px-5 rounded-[14px] text-center flex flex-col items-center gap-3"
            style={{
              border: '1px dashed var(--color-rule)',
              backgroundColor: 'rgba(28, 68, 51, 0.03)',
            }}
          >
            <span className="eyebrow" style={{ color: 'var(--color-forest)' }}>
              A blank page
            </span>
            <p
              className="serif-caps text-[16px] max-w-xs"
              style={{ color: 'var(--color-ink)' }}
            >
              Every logbook starts empty. Connect Garmin or log a ride to begin.
            </p>
            <Link
              to="/garmin/connect"
              className="mt-1 inline-flex items-center gap-1.5 text-[13px] font-medium"
              style={{ color: 'var(--color-forest)' }}
            >
              Connect Garmin
              <ArrowUpRight size={14} strokeWidth={2} />
            </Link>
          </div>
        ) : (
          <ul className="list-none m-0 p-0 -mt-1">
            {activities.map((a) => (
              <ActivityRow key={a.id} a={a} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
