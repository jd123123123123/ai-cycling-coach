import { useLocale } from '../../contexts/LocaleContext'
import type { Trajectory } from '../../api/report'

const TAPER_LABEL: Record<string, { en: string; de: string; color: string }> = {
  ideal: { en: 'Ideal taper', de: 'Idealer Taper', color: 'var(--color-good)' },
  too_fresh: { en: 'Too fresh', de: 'Zu frisch', color: 'var(--color-caution)' },
  too_flat: { en: 'Too flat', de: 'Zu flach', color: 'var(--color-caution)' },
  overreached: { en: 'Overreached', de: 'Überlastet', color: 'var(--color-bad)' },
  unknown: { en: 'No taper read', de: 'Kein Taper-Wert', color: 'var(--color-muted)' },
}

const ONTRACK: Record<string, { en: string; de: string; color: string }> = {
  on_track: { en: 'On track', de: 'Im Plan', color: 'var(--color-good)' },
  ahead: { en: 'Ahead of plan', de: 'Vor dem Plan', color: 'var(--color-good)' },
  behind: { en: 'Behind plan', de: 'Hinter dem Plan', color: 'var(--color-caution)' },
  no_goal: { en: 'No event set', de: 'Kein Ziel gesetzt', color: 'var(--color-muted)' },
}

/** Banister projection toward the goal event — frames "why these actions."
 * Renders nothing when the projection is unavailable. */
export default function TrajectoryCard({ traj }: { traj: Trajectory }) {
  const { locale } = useLocale()

  const taper = TAPER_LABEL[traj.taper_window] ?? TAPER_LABEL.unknown
  const ontrack = ONTRACK[traj.on_track] ?? ONTRACK.no_goal

  // Mini-bar: current CTL vs projected vs target. Scale to the max so the
  // bars are comparable even without a target.
  const scaleMax = Math.max(traj.ctl_now, traj.ctl_projected_at_goal, traj.ctl_target ?? 0, 1)
  const nowPct = (traj.ctl_now / scaleMax) * 100
  const projPct = (traj.ctl_projected_at_goal / scaleMax) * 100
  const targetPct = traj.ctl_target ? (traj.ctl_target / scaleMax) * 100 : null

  return (
    <div
      className="rounded-[18px] p-5 sm:p-6"
      style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="eyebrow num-mono" style={{ color: 'var(--color-ink-2)', fontSize: 10, letterSpacing: '0.22em' }}>
          {locale === 'de' ? 'ZIELVERLAUF' : 'TRAJECTORY'}
        </span>
        <span
          className="rounded-full px-2 py-0.5"
          style={{ color: ontrack.color, fontSize: 11, fontWeight: 600, border: `1px solid color-mix(in srgb, ${ontrack.color} 35%, var(--color-rule))` }}
        >
          {locale === 'de' ? ontrack.de : ontrack.en}
        </span>
      </div>

      {/* CTL now → projected (→ target) mini-bar */}
      <div className="mt-4 flex flex-col gap-2">
        <Bar label={locale === 'de' ? 'CTL jetzt' : 'CTL now'} pct={nowPct} value={Math.round(traj.ctl_now)} color="var(--color-ink-2)" />
        <Bar label={locale === 'de' ? 'Projiziert' : 'Projected'} pct={projPct} value={Math.round(traj.ctl_projected_at_goal)} color="var(--color-good)" />
        {targetPct !== null && (
          <Bar label={locale === 'de' ? 'Ziel' : 'Target'} pct={targetPct} value={Math.round(traj.ctl_target as number)} color="var(--color-caution)" dashed />
        )}
      </div>

      {/* Meta row */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5" style={{ fontSize: 12.5 }}>
        {traj.days_to_goal !== null && (
          <span style={{ color: 'var(--color-ink-2)' }}>
            <span className="num-mono" style={{ color: 'var(--color-ink)', fontWeight: 600 }}>{traj.days_to_goal}</span>
            {' '}{locale === 'de' ? 'Tage bis zum Ziel' : 'days to goal'}
          </span>
        )}
        <span className="rounded-full px-2 py-0.5" style={{ color: taper.color, fontSize: 11, fontWeight: 600, backgroundColor: `color-mix(in srgb, ${taper.color} 12%, transparent)` }}>
          {locale === 'de' ? taper.de : taper.en}
        </span>
      </div>

      {traj.narrative && (
        <p className="mt-3 leading-relaxed" style={{ color: 'var(--color-ink-2)', fontSize: 13.5, maxWidth: '64ch' }}>
          {traj.narrative}
        </p>
      )}
    </div>
  )
}

function Bar({ label, pct, value, color, dashed }: { label: string; pct: number; value: number; color: string; dashed?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span style={{ color: 'var(--color-muted)', fontSize: 11.5, width: 76 }}>{label}</span>
      <div className="flex-1 rounded-full overflow-hidden" style={{ height: 8, backgroundColor: 'var(--color-rule)' }}>
        <div
          style={{
            width: `${Math.max(2, Math.min(100, pct))}%`, height: '100%',
            backgroundColor: dashed ? 'transparent' : color,
            border: dashed ? `1.5px dashed ${color}` : 'none',
            transition: 'width 420ms var(--ease-apple-default, ease)',
          }}
        />
      </div>
      <span className="num-mono" style={{ color: 'var(--color-ink)', fontSize: 12.5, fontWeight: 600, width: 28, textAlign: 'right' }}>{value}</span>
    </div>
  )
}
