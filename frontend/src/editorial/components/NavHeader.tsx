import { Flame } from 'lucide-react'
import ProfileAvatar from './ProfileAvatar'
import { useCopy } from '../i18n/useCopy'

/**
 * Transcribed from pen component `kdOT0` (component/NavHeader), the same
 * instance Session Detail's own Nav frame (`zWpVV`, `J5FV6`) uses (Title
 * override "TODAY" in that instance, "RECOVERY" in the canonical component —
 * this task's own call site supplies "EINHEIT"/"SESSION" via `useCopy`).
 *
 * Tree (`kdOT0`, depth 8): root width 342, justifyContent space-between,
 * alignItems center.
 *   L — gap 10, alignItems center.
 *     Back — Material Symbols Rounded "arrow_back", 22×22, fill $e-ink.
 *     Title — Inter 12/800, letterSpacing 2, fill $e-ink.
 *   Right — Inter 10/800, letterSpacing 1.6, fill $e-lo ("WED 22 JUL").
 *
 * The pen's root has an explicit `width: 342` (390 frame − 24 padding on
 * each side); the real Nav frame (`tT4p8`) supplies that same 24px padding
 * around this component instead, so here it is `width: 100%` — identical
 * rendered width, derived from the parent instead of duplicated as a magic
 * number.
 *
 * HEADER SPINE (design pass, 2026-08-06): re-read live, `zWpVV` still has no
 * avatar slot at all — confirmed fresh, not stale. This is a deliberate
 * departure from the pen: the owner's own complaint about this build is
 * that "the header is differently formatted on every screen... Session
 * Detail opens with a completely unrelated NavHeader... and no avatar," and
 * the explicit ruling on this exact conflict is "where the pen and the
 * system's consistency disagree, say so and choose consistency." `identity`
 * renders the SAME date · streak · avatar strip Today's own Cover Meta row
 * shows (`pages/TodayView.tsx`) — same tokens, same sizes, same order —
 * just moved to the Nav's right side, alongside the back affordance a
 * detail view still needs that a tab root does not. `ProfileAvatar` is
 * reused, not re-implemented, the same way `RouteOptions.tsx` reuses
 * `components/ui/RouteSketch` rather than forking it. Optional, so a
 * fixture render with no `identity` (every existing test) shows the Nav
 * exactly as before — back, title, date, nothing else — matching how
 * `TodayView`'s own `profile` prop being absent shows no avatar there.
 */
export interface NavHeaderIdentity {
  /** `null` while the streak is still loading or the athlete has none — the
   *  strip is decorative chrome, not a `Value<T>` slot, so it falls back to
   *  a plain "—" rather than growing its own reason line. */
  streakDays: number | null
  avatarUrl: string | null
  avatarInitial: string
}

export default function NavHeader({
  title,
  date,
  onBack,
  identity,
}: {
  title: string
  date: string
  onBack: () => void
  identity?: NavHeaderIdentity
}) {
  const { t } = useCopy()
  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          type="button"
          onClick={onBack}
          aria-label="back"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 22,
            height: 22,
            padding: 0,
            border: 'none',
            background: 'transparent',
            color: 'var(--e-ink)',
            cursor: 'pointer',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <span
          style={{
            fontFamily: 'var(--e-body)',
            fontSize: 'var(--t-label)',
            fontWeight: 800,
            letterSpacing: 2,
            color: 'var(--e-ink)',
          }}
        >
          {title}
        </span>
      </div>
      {/* Header spine (design pass, 2026-08-06): date/streak sizes and
          letterSpacing match Today's own converted Cover Meta row exactly
          (`pages/TodayView.tsx` — date 10→var(--t-label)/1.8→1.4, streak
          10→var(--t-label)/1.4→1.2) — the whole point of sharing tokens is
          that the two headers stop drifting apart pixel by pixel. */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <span
          style={{
            fontFamily: 'var(--e-body)',
            fontSize: 'var(--t-label)',
            fontWeight: 800,
            letterSpacing: 1.4,
            color: 'var(--e-lo)',
          }}
        >
          {date}
        </span>
        {identity && (
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <Flame size={14} color="var(--e-mid)" aria-hidden="true" />
            <span
              style={{
                fontFamily: 'var(--e-body)',
                fontSize: 'var(--t-label)',
                fontWeight: 800,
                letterSpacing: 1.2,
                color: 'var(--e-mid)',
              }}
            >
              {identity.streakDays != null ? t('heroStreakDays', { n: identity.streakDays }) : '—'}
            </span>
          </div>
        )}
        {identity && <ProfileAvatar avatarUrl={identity.avatarUrl} initial={identity.avatarInitial} />}
      </div>
    </div>
  )
}
