/**
 * WorkoutExportRow — three buttons that download today's prescribed workout
 * as .zwo / .erg / .mrc.
 *
 *   .zwo — Zwift, MyWhoosh, indieVelo, BKool
 *   .erg — TrainerRoad, Wahoo SYSTM, GoldenCheetah (absolute watts)
 *   .mrc — same as .erg but %FTP-by-time (FTP-relative)
 *
 * Renders nothing while a download is in flight, only the active format
 * shows a small "…" affordance. We don't toast errors — failure is visible
 * (no file lands) and re-clicking is the right user action.
 */
import { useState } from 'react'
import { downloadWorkoutExport, type WorkoutFormat } from '../../api/coach'
import { useT } from '../../contexts/LocaleContext'

const FORMATS: { id: WorkoutFormat; label: string; helper: string }[] = [
  { id: 'zwo', label: '.zwo', helper: 'Zwift / MyWhoosh' },
  { id: 'erg', label: '.erg', helper: 'TrainerRoad (watts)' },
  { id: 'mrc', label: '.mrc', helper: '%FTP — any platform' },
  { id: 'fit', label: '.fit', helper: 'Garmin Connect / Edge / Fenix' },
]

export default function WorkoutExportRow() {
  const [busy, setBusy] = useState<WorkoutFormat | null>(null)
  const [error, setError] = useState<string | null>(null)
  const t = useT()

  async function handleDownload(format: WorkoutFormat) {
    setError(null)
    setBusy(format)
    try {
      await downloadWorkoutExport(format)
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (e as any)?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : t('export_failed'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        marginTop: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span
          style={{
            fontSize: 11,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--color-ink-3)',
          }}
        >
          {t('export_workout_eyebrow')}
        </span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => handleDownload(f.id)}
              disabled={busy !== null}
              title={f.helper}
              style={{
                fontSize: 12,
                fontWeight: 500,
                padding: '4px 10px',
                borderRadius: 999,
                border: '1px solid var(--color-rule)',
                backgroundColor: 'var(--color-paper-2, transparent)',
                color: 'var(--color-ink)',
                cursor: busy ? 'wait' : 'pointer',
                opacity: busy && busy !== f.id ? 0.5 : 1,
              }}
            >
              {f.label}
              {busy === f.id ? ' …' : ''}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <span style={{ fontSize: 12, color: 'var(--color-alert, #b1412c)' }}>
          {error}
        </span>
      )}
    </div>
  )
}
