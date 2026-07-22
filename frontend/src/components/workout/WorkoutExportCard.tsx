/**
 * WorkoutExportCard — the "get it on your head unit" export affordance for the
 * planned/prescribed workout (backlog 02·I1). Wraps the existing
 * coach.downloadWorkoutExport helper, which streams the auth-scoped file from
 * GET /coach/workout/export and triggers a client-side Blob download.
 *
 * Export is only offered for structured power workouts (see WorkoutDetailView
 * gating). The backend serves TODAY's prescribed workout, so a future planned
 * day is honestly disabled ('future'); a today workout with no FTP anchor is
 * disabled ('no_ftp'); a session with no power structure is disabled
 * ('no_structure'). No fake affordance over an endpoint that would 4xx.
 */
import { useState } from 'react'
import { Download, ChevronDown, Loader2, SlidersHorizontal, Check } from 'lucide-react'
import { useT } from '../../contexts/LocaleContext'
import { downloadWorkoutExport, type WorkoutFormat } from '../../api/coach'
import type { StringKey } from '../../i18n/strings'

export type ExportBlockReason = 'future' | 'no_ftp' | 'no_structure' | null

// Format → (extension label, app sublabel key). Order = discovery order:
// Garmin (.fit) and Zwift (.zwo) first as the two most-asked head units.
const FORMATS: Array<{ fmt: WorkoutFormat; ext: string; appKey: StringKey }> = [
  { fmt: 'fit', ext: '.FIT', appKey: 'export_fmt_fit_app' },
  { fmt: 'zwo', ext: '.ZWO', appKey: 'export_fmt_zwo_app' },
  { fmt: 'erg', ext: '.ERG', appKey: 'export_fmt_erg_app' },
  { fmt: 'mrc', ext: '.MRC', appKey: 'export_fmt_mrc_app' },
]

const GUIDE: StringKey[] = ['export_guide_garmin', 'export_guide_wahoo', 'export_guide_zwift']

export default function WorkoutExportCard({
  available,
  reason,
  onEditWorkout,
}: {
  available: boolean
  reason: ExportBlockReason
  onEditWorkout: () => void
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<WorkoutFormat | null>(null)
  const [done, setDone] = useState<WorkoutFormat | null>(null)
  const [error, setError] = useState(false)

  const handleExport = async (fmt: WorkoutFormat) => {
    if (busy) return
    setError(false)
    setDone(null)
    setBusy(fmt)
    try {
      await downloadWorkoutExport(fmt)
      setDone(fmt)
    } catch {
      setError(true)
    } finally {
      setBusy(null)
    }
  }

  const editButton = (
    <button
      type="button"
      onClick={onEditWorkout}
      className="flex items-center justify-center gap-[6px]"
      style={{ padding: '8px 0' }}
    >
      <SlidersHorizontal size={16} style={{ color: 'var(--color-ink-2)' }} />
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink-2)' }}>{t('export_edit_workout')}</span>
    </button>
  )

  // ── Honest disabled state ──────────────────────────────────────────────────
  if (!available) {
    const reasonKey: StringKey =
      reason === 'no_ftp' ? 'export_needs_ftp' : reason === 'no_structure' ? 'export_no_structure' : 'export_unavailable_future'
    return (
      <div className="flex flex-col gap-[10px]">
        <div
          className="flex items-center gap-3"
          style={{
            borderRadius: 100,
            padding: '16px 20px',
            background: 'var(--color-paper-2)',
            border: '1px solid var(--color-rule)',
            opacity: 0.85,
          }}
        >
          <Download size={20} style={{ color: 'var(--color-muted)' }} />
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-muted)' }}>{t('export_workout_eyebrow')}</span>
        </div>
        <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-muted)', lineHeight: 1.4, paddingLeft: 4 }}>
          {t(reasonKey)}
        </p>
        {editButton}
      </div>
    )
  }

  // ── Active export menu ──────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-[10px]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center justify-center gap-2"
        style={{
          borderRadius: 100,
          padding: '16px 20px',
          background: 'var(--color-accent)',
          boxShadow: '0 6px 20px -4px #FF5A3C55',
        }}
      >
        <Download size={20} style={{ color: '#FFFFFF' }} />
        <span style={{ fontSize: 16, fontWeight: 700, color: '#FFFFFF' }}>{t('export_workout_eyebrow')}</span>
        <ChevronDown
          size={18}
          style={{ color: '#FFFFFF', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 160ms ease' }}
        />
      </button>

      {open && (
        <div
          className="flex flex-col gap-3"
          style={{ borderRadius: 20, padding: 16, background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.5px', color: 'var(--color-ink-2)' }}>
            {t('export_pick_format').toUpperCase()}
          </span>
          <div className="grid grid-cols-2 gap-2">
            {FORMATS.map((f) => {
              const isBusy = busy === f.fmt
              const isDone = done === f.fmt && !busy
              return (
                <button
                  key={f.fmt}
                  type="button"
                  onClick={() => handleExport(f.fmt)}
                  disabled={busy != null}
                  className="flex items-center gap-[10px]"
                  style={{
                    borderRadius: 16,
                    padding: '12px 14px',
                    background: 'var(--color-surface-2)',
                    border: `1px solid ${isDone ? 'var(--color-accent)' : 'var(--color-rule)'}`,
                    opacity: busy != null && !isBusy ? 0.5 : 1,
                    textAlign: 'left',
                  }}
                >
                  <span
                    className="shrink-0 grid place-items-center"
                    style={{ width: 30, height: 30, borderRadius: 100, background: 'var(--color-surface-3)' }}
                  >
                    {isBusy ? (
                      <Loader2 size={15} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
                    ) : isDone ? (
                      <Check size={15} style={{ color: 'var(--color-accent)' }} />
                    ) : (
                      <Download size={15} style={{ color: 'var(--color-ink-2)' }} />
                    )}
                  </span>
                  <span className="flex flex-col min-w-0">
                    <span
                      style={{ fontFamily: '"Sora", sans-serif', fontSize: 14, fontWeight: 700, color: 'var(--color-ink)' }}
                    >
                      {f.ext}
                    </span>
                    <span
                      className="truncate"
                      style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)' }}
                    >
                      {isBusy ? t('export_downloading') : t(f.appKey)}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          {error && (
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-bad)' }}>{t('export_failed')}</span>
          )}

          <div style={{ height: 1, background: 'var(--color-rule)' }} />

          <div className="flex flex-col gap-[7px]">
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1px', color: 'var(--color-muted)' }}>
              {t('export_guide_title').toUpperCase()}
            </span>
            {GUIDE.map((key) => (
              <span key={key} className="flex items-start gap-[7px]">
                <span
                  className="shrink-0"
                  style={{ width: 4, height: 4, borderRadius: 100, background: 'var(--color-accent)', marginTop: 6 }}
                />
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>{t(key)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {editButton}
    </div>
  )
}
