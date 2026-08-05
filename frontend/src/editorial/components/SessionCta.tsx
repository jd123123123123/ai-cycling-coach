import { useState } from 'react'
import { useCopy } from '../i18n/useCopy'

/**
 * Transcribed from pen `GAmck` ("CTA", `J5FV6`): Rule, then the primary
 * action row (`LYMWn`): a 30×30 accent-filled Dot with a lucide "arrow-right"
 * icon, a Label stack (Primary 11.5/800 letterSpacing 1.2 $e-ink, Sub 11/500
 * lineHeight 1.35 $e-quiet). Root gap 18, padding [38,24,44,24].
 *
 * THE ONE DELIBERATE DEPARTURE FROM THE PEN: the pen's own primary label
 * reads "SEND WORKOUT TO GARMIN" with sub-line "Intervals and route to your
 * Edge · block starts marked" — this backend has no Garmin push path at all,
 * only a client-side file export (`downloadWorkoutExport`, `api/coach.ts`).
 * The geometry, type, and rule structure are transcribed exactly; the label
 * states what the app actually does: `WORKOUT EXPORTIEREN` / "Intervalle und
 * Strecke als Datei für dein Edge" (`sessionCtaTitle`/`sessionCtaSubtitle`,
 * `i18n/copy.ts`). This is the same resolution already reached for the V4
 * route rehearsal page's own export CTA — pinned in
 * `__tests__/sessionDetail.test.tsx` so it is never "restored" to a push
 * path this app cannot perform.
 *
 * The pen's second row (`QsxCo`, "MOVE IT TO TOMORROW" — a reschedule
 * action) has no honest wiring anywhere in this task: the prescribed
 * workout this screen renders (`useTodaySession().workout`) is the brief's
 * own derived prescription, not a `PlannedWorkout` row with an id a
 * reschedule mutation could target. Rather than a decorative button that
 * does nothing, this component omits that row entirely — the same "no
 * plausible substitute" rule the rest of this build follows for a
 * permanently-missing value.
 */
export default function SessionCta({ onExport }: { onExport: () => void | Promise<void> }) {
  const { t } = useCopy()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const handleClick = async () => {
    if (busy) return
    setFailed(false)
    setBusy(true)
    try {
      await onExport()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 18, padding: '38px 24px 44px 24px' }}>
      <div style={{ width: '100%', height: 1, background: 'var(--e-rule)' }} />
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        style={{
          width: '100%',
          display: 'flex',
          gap: 14,
          alignItems: 'center',
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: busy ? 'default' : 'pointer',
          opacity: busy ? 0.6 : 1,
          textAlign: 'left',
        }}
      >
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            background: 'var(--st-active)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--e-bg)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
          <span style={{ fontFamily: 'var(--e-body)', fontSize: 11.5, fontWeight: 800, letterSpacing: 1.2, color: 'var(--e-ink)' }}>
            {t('sessionCtaTitle')}
          </span>
          <span style={{ fontFamily: 'var(--e-body)', fontSize: 11, fontWeight: 500, lineHeight: 1.35, color: 'var(--e-quiet)' }}>
            {t('sessionCtaSubtitle')}
          </span>
        </span>
      </button>
      {failed && (
        <span style={{ fontFamily: 'var(--e-body)', fontSize: 11, fontWeight: 600, color: 'var(--e-bad)' }}>
          {t('sessionCtaFailed')}
        </span>
      )}
    </div>
  )
}
