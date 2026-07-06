/**
 * RecentActivities — list of recent training sessions.
 *
 * Row click behavior (06.1-02 Wave 2):
 * Clicking an activity row opens a SideSheet with activity detail.
 * URL stays at /dashboard?tab=today (no new route, no deep link — per
 * success criterion 3 and plan invariant "no /activities/:id route").
 *
 * Existing row rendering is preserved. SideSheet is added on top.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { subDays, format } from 'date-fns'
import { Bike, Footprints, Dumbbell, ArrowUpRight } from 'lucide-react'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import type { ActivityRead } from '../../api/dashboard'
import {
  formatDistanceKm,
  formatDuration,
  formatRelativeDay,
} from '../../utils/metrics'
import { focusFor } from '../../utils/focusBadge'
import { useAthleteProfile, type AthleteProfile } from '../../hooks/useAthleteProfile'
import { SideSheet } from '../ui/SideSheet'
import { useLanguage } from '../../contexts/LanguageContext'
import { useLocale } from '../../contexts/LocaleContext'

/** Format a UTC/local ISO timestamp to HH:MM. Falls back to UTC if no TZ info. */
function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false })
  } catch {
    return ''
  }
}

const SPORT_META: Record<
  ActivityRead['sport'],
  { icon: React.ReactNode; label: string; accent: string }
> = {
  cycling: {
    icon: <Bike size={14} strokeWidth={1.8} />,
    label: 'Ride',
    accent: 'var(--color-sport-bike)',
  },
  running: {
    icon: <Footprints size={14} strokeWidth={1.8} />,
    label: 'Run',
    accent: 'var(--color-sport-run)',
  },
  gym: {
    icon: <Dumbbell size={14} strokeWidth={1.8} />,
    label: 'Strength',
    accent: 'var(--color-sport-strength)',
  },
}

// ─── Activity detail view ─────────────────────────────────────────────────────
// Rendered inside the SideSheet. Minimal summary view — no dedicated detail
// route was built for Phase 1-5.x, so this is purpose-built here.

function ActivityDetail({
  activity,
  language,
}: {
  activity: ActivityRead
  language: string
}) {
  const meta = SPORT_META[activity.sport]
  const title =
    activity.title?.trim() ||
    `${meta.label} · ${formatRelativeDay(activity.started_at)}`

  const isSimple = language === 'simple'

  const rows: Array<{ label: string; value: string | null }> = [
    {
      label: 'Date',
      value: format(new Date(activity.started_at), 'EEEE, MMM d yyyy · HH:mm'),
    },
    {
      label: 'Duration',
      value: activity.duration_seconds
        ? formatDuration(activity.duration_seconds)
        : null,
    },
    {
      label: 'Distance',
      value: activity.distance_meters
        ? formatDistanceKm(activity.distance_meters)
        : null,
    },
    {
      label: isSimple ? 'Effort' : 'TSS',
      value:
        activity.tss != null
          ? `${Math.round(activity.tss)}${isSimple ? ' pts' : ''}`
          : null,
    },
    {
      label: isSimple ? 'Heart rate' : 'Avg HR',
      value:
        activity.average_hr != null
          ? `${Math.round(activity.average_hr)} bpm`
          : null,
    },
    {
      label: isSimple ? 'Power' : 'Normalised power',
      value:
        activity.normalized_power != null
          ? `${Math.round(activity.normalized_power)} W`
          : null,
    },
    {
      label: 'Source',
      value: activity.source ?? null,
    },
  ]

  const visibleRows = rows.filter((r) => r.value != null)

  return (
    <div className="flex flex-col gap-5">
      {/* Sport badge */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{
            backgroundColor: meta.accent + '14',
            color: meta.accent,
            border: `1px solid ${meta.accent}33`,
          }}
        >
          {meta.icon}
        </div>
        <div>
          <span className="eyebrow" style={{ color: meta.accent }}>
            {meta.label}
          </span>
          <p
            className="num-display mt-0.5 leading-tight"
            style={{ fontSize: 18, color: 'var(--color-ink)' }}
          >
            {title}
          </p>
        </div>
      </div>

      {/* Key stats grid */}
      <div
        className="rounded-[14px] overflow-hidden"
        style={{
          border: '1px solid var(--color-rule)',
          backgroundColor: 'var(--color-paper)',
        }}
      >
        {visibleRows.map((row, i) => (
          <div
            key={row.label}
            className="flex items-center justify-between px-4 py-3"
            style={{
              borderTop: i > 0 ? '1px solid var(--color-rule)' : undefined,
            }}
          >
            <span
              className="eyebrow"
              style={{ color: 'var(--color-muted)', fontSize: 10, letterSpacing: '0.18em' }}
            >
              {row.label.toUpperCase()}
            </span>
            <span
              className="num-mono text-[13px] font-medium"
              style={{ color: 'var(--color-ink)' }}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Activity row ─────────────────────────────────────────────────────────────

function ActivityRow({
  a,
  onClick,
  profile,
}: {
  a: ActivityRead
  onClick: (id: number) => void
  profile: AthleteProfile | null | undefined
}) {
  const meta = SPORT_META[a.sport]
  const title = a.title?.trim() || `${meta.label} · ${formatRelativeDay(a.started_at)}`
  const parts: string[] = []
  if (a.duration_seconds) parts.push(formatDuration(a.duration_seconds))
  if (a.distance_meters) parts.push(formatDistanceKm(a.distance_meters))

  const timeStr = formatTime(a.started_at)
  const { locale } = useLocale()

  return (
    <li
      className="relative group"
      style={{ borderBottom: '1px solid var(--color-rule)' }}
    >
      <div
        role="button"
        tabIndex={0}
        className="w-full text-left cursor-pointer"
        onClick={() => onClick(a.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onClick(a.id)
          }
        }}
        aria-label={`View details for ${title}`}
      >
        <div className="flex items-stretch gap-4 py-4 hover:opacity-80 transition-opacity relative">
          {/* Sport-color left accent */}
          <div
            className="absolute left-0 top-3 bottom-3 w-[2px] rounded-full"
            style={{ backgroundColor: meta.accent, opacity: 0.7 }}
            aria-hidden
          />
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
                className="text-[15px] sm:text-[16px] font-medium leading-snug dashboard-break-words"
                style={{ color: 'var(--color-ink)' }}
              >
                {title}
              </span>
              {/* Date + time-of-day — single source, right-aligned */}
              <div className="flex flex-col items-end flex-shrink-0 mt-1 gap-0.5">
                <span
                  className="num-mono text-[11px] whitespace-nowrap"
                  style={{ color: 'var(--color-muted)' }}
                >
                  {formatRelativeDay(a.started_at)}
                </span>
                {timeStr && (
                  <div
                    className="num-mono text-[10px]"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    {timeStr}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="eyebrow" style={{ color: meta.accent }}>
                {meta.label}
              </span>
              {parts.map((p) => (
                <span
                  key={p}
                  className="num-mono text-[12px]"
                  style={{ color: 'var(--color-ink-2)' }}
                >
                  {p}
                </span>
              ))}
              {a.tss != null && (
                <span
                  className="num-mono text-[11px] px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.07)',
                    color: 'var(--color-ink-2)',
                    border: '1px solid rgba(255,255,255,0.10)',
                  }}
                >
                  TSS {Math.round(a.tss)}
                </span>
              )}
              {(() => {
                const focus = focusFor(a, profile)
                if (!focus) return null
                return (
                  <span
                    className="text-[11px] px-1.5 py-0.5 rounded"
                    style={{
                      color: focus.color,
                      backgroundColor: focus.bg,
                      border: `1px solid color-mix(in srgb, ${focus.color} 22%, transparent)`,
                      fontWeight: 500,
                    }}
                    title={focus.note}
                  >
                    {focus.label}
                  </span>
                )
              })()}
              {a.sport === 'cycling' && (
                <Link
                  to={`/activities/${a.id}/debrief`}
                  onClick={(e) => e.stopPropagation()}
                  className="ml-auto text-[11px] font-medium hover:underline"
                  style={{ color: 'var(--color-ink-2)' }}
                >
                  {locale === 'de' ? 'Analyse →' : 'Debrief →'}
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </li>
  )
}

interface RecentActivitiesProps {
  /** Max number of rows to render. Defaults to 10. Phase 5.1 uses limit=5 in fold 3. */
  limit?: number
  /** Filter to a single sport. When omitted, all sports are shown. */
  sport?: ActivityRead['sport']
  /** Lookback window in days. Defaults to 14. */
  windowDays?: number
  /** Optional override for the section heading. */
  heading?: string
}

export default function RecentActivities({
  limit = 10,
  sport,
  windowDays = 14,
  heading,
}: RecentActivitiesProps = {}) {
  const today = new Date()
  const since = subDays(today, windowDays)
  const { data, isLoading, isError, refetch } = useActivitiesRange(
    since,
    today,
  )
  const { language } = useLanguage()
  const { data: profile } = useAthleteProfile()

  // Selected activity for SideSheet detail view. URL stays at /dashboard?tab=today.
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const activities = (data?.activities ?? [])
    .slice()
    .filter((a) => (sport ? a.sport === sport : true))
    .sort(
      (a, b) =>
        new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
    )
    .slice(0, limit)

  const selectedActivity = selectedId
    ? (activities.find((a) => a.id === selectedId) ?? null)
    : null

  return (
    <>
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
            <span className="eyebrow" style={{ letterSpacing: '0.18em' }}>
              Recent · last 14 days
            </span>
            <h2
              className="num-display mt-1 leading-none"
              style={{
                fontSize: 'clamp(22px, 3vw, 28px)',
                color: 'var(--color-ink)',
              }}
            >
              {heading ?? 'Recent training'}
            </h2>
          </div>
          {!isLoading && !isError && activities.length > 0 && (
            <span
              className="num-mono text-[11px]"
              style={{ color: 'var(--color-muted)' }}
            >
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
                onClick={() => void refetch()}
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
                className="text-[16px] font-medium max-w-xs"
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
                <ActivityRow
                  key={a.id}
                  a={a}
                  onClick={(id) => setSelectedId(id)}
                  profile={profile}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Activity detail SideSheet — URL stays at /dashboard?tab=today */}
      {selectedActivity && (
        <SideSheet
          open={selectedId != null}
          onClose={() => setSelectedId(null)}
          eyebrow={language === 'simple' ? 'Activity details' : 'Activity'}
          title={
            selectedActivity.title?.trim() ||
            `${SPORT_META[selectedActivity.sport].label} · ${formatRelativeDay(selectedActivity.started_at)}`
          }
        >
          <ActivityDetail activity={selectedActivity} language={language} />
        </SideSheet>
      )}
    </>
  )
}
