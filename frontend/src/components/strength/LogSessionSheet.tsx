import { useEffect, useMemo, useState } from 'react'
import { Check, History } from 'lucide-react'
import { BottomSheet } from './BottomSheet'
import { Stepper } from './Stepper'
import { useCreateSession, useRoutinePrefill } from '../../hooks/useStrength'
import type { SessionSetWrite } from '../../api/strength'

interface LogSessionSheetProps {
  routineId: number | null
  onClose: () => void
  de: boolean
  onLogged?: () => void
}

interface SetDraft {
  weight_kg: number
  reps: number
  /** true = seeded from last time (so we surface a subtle "last time" hint). */
  fromHistory: boolean
}

interface ExerciseDraft {
  name: string
  target_reps: string
  sets: SetDraft[]
  /** the raw last_sets for the "last time" reference line. */
  lastSets: { weight_kg: number; reps: number }[]
}

/**
 * The core screen: log a session with easy weight adaptation.
 *
 * On open it fetches GET /strength/routines/{id}/prefill and builds `target_sets`
 * rows for every exercise. Each row is PRE-FILLED from that exercise's
 * `last_sets` (index-matched: set 1 ← last time's set 1, etc.), so the user just
 * nudges the number instead of retyping. Exercises with no history start at the
 * target set count with blank (0) weight — never fabricated.
 */
export function LogSessionSheet({ routineId, onClose, de, onLogged }: LogSessionSheetProps) {
  const open = routineId !== null
  const { data: prefill, isLoading } = useRoutinePrefill(routineId)
  const createSession = useCreateSession()
  const [drafts, setDrafts] = useState<ExerciseDraft[]>([])
  const [done, setDone] = useState(false)

  // Build the editable draft from the prefill payload each time it arrives.
  useEffect(() => {
    if (!prefill) return
    setDone(false)
    setDrafts(
      prefill.exercises.map((ex) => {
        const count = Math.max(ex.target_sets, 1)
        const sets: SetDraft[] = Array.from({ length: count }, (_, i) => {
          const prev = ex.last_sets[i] // index-matched previous set
          return prev
            ? { weight_kg: prev.weight_kg, reps: prev.reps, fromHistory: true }
            : { weight_kg: 0, reps: 0, fromHistory: false }
        })
        return {
          name: ex.name,
          target_reps: ex.target_reps,
          sets,
          lastSets: ex.last_sets.map((s) => ({ weight_kg: s.weight_kg, reps: s.reps })),
        }
      }),
    )
  }, [prefill])

  const patchSet = (exI: number, setI: number, patch: Partial<SetDraft>) =>
    setDrafts((ds) =>
      ds.map((d, i) =>
        i === exI ? { ...d, sets: d.sets.map((s, j) => (j === setI ? { ...s, ...patch } : s)) } : d,
      ),
    )

  // Only sets with a real load + reps get sent up — never phantom 0-rows.
  const payloadSets: SessionSetWrite[] = useMemo(() => {
    const out: SessionSetWrite[] = []
    for (const ex of drafts) {
      ex.sets.forEach((s, idx) => {
        if (s.weight_kg > 0 && s.reps > 0) {
          out.push({ exercise_name: ex.name, set_index: idx + 1, weight_kg: s.weight_kg, reps: s.reps })
        }
      })
    }
    return out
  }, [drafts])

  const totalVolume = useMemo(
    () => payloadSets.reduce((sum, s) => sum + s.weight_kg * s.reps, 0),
    [payloadSets],
  )
  const canSave = payloadSets.length > 0 && !createSession.isPending

  const handleSave = () => {
    if (!canSave || routineId == null) return
    createSession.mutate(
      { routine_id: routineId, sets: payloadSets },
      {
        onSuccess: () => {
          setDone(true)
          onLogged?.()
          // Brief success confirmation, then close.
          setTimeout(onClose, 1100)
        },
      },
    )
  }

  const L = de
    ? { eyebrow: 'EINHEIT PROTOKOLLIEREN', target: 'Ziel', set: 'Satz', last: 'Letztes Mal', kg: 'kg', reps: 'Whd.',
        save: 'Einheit speichern', empty: 'Keine Übungen', loading: 'Lade letzte Gewichte …',
        volume: 'Volumen', saved: 'Gespeichert!', newHint: 'Neu — kein Verlauf' }
    : { eyebrow: 'LOG SESSION', target: 'Target', set: 'Set', last: 'Last time', kg: 'kg', reps: 'reps',
        save: 'Save session', empty: 'No exercises', loading: 'Loading last weights …',
        volume: 'Volume', saved: 'Saved!', newHint: 'New — no history' }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      eyebrow={L.eyebrow}
      title={prefill?.routine.name ?? '…'}
      footer={
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="flex w-full items-center justify-center num-display"
          style={{
            height: 52, borderRadius: 14, gap: 8, fontSize: 15, fontWeight: 700,
            background: done ? 'var(--color-recovery)' : canSave ? 'var(--color-accent)' : 'var(--color-surface-2)',
            color: canSave || done ? 'var(--color-ink)' : 'var(--color-muted)',
            border: 'none', opacity: createSession.isPending ? 0.7 : 1,
          }}
        >
          {done ? (
            <><Check size={18} /> {L.saved}</>
          ) : (
            <>{L.save}{totalVolume > 0 ? ` · ${Math.round(totalVolume).toLocaleString()} ${L.kg}` : ''}</>
          )}
        </button>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center" style={{ height: 120, color: 'var(--color-muted)', fontSize: 13 }}>
          {L.loading}
        </div>
      ) : drafts.length === 0 ? (
        <div className="flex items-center justify-center" style={{ height: 120, color: 'var(--color-muted)', fontSize: 13 }}>
          {L.empty}
        </div>
      ) : (
        <div className="flex flex-col" style={{ gap: 14 }}>
          {drafts.map((ex, exI) => (
            <div
              key={`${ex.name}-${exI}`}
              className="flex flex-col"
              style={{ gap: 10, padding: 14, borderRadius: 18, border: '1px solid var(--color-rule)', background: 'var(--color-paper-2)' }}
            >
              <div className="flex items-center justify-between">
                <span className="num-display" style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>{ex.name}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}>
                  {L.target} {ex.sets.length}×{ex.target_reps}
                </span>
              </div>

              {/* last-time reference line — REAL history only */}
              {ex.lastSets.length > 0 ? (
                <div className="flex items-center" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <History size={12} color="var(--color-accent)" />
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-accent)' }}>{L.last}:</span>
                  {ex.lastSets.map((s, i) => (
                    <span key={i} className="num-mono" style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-ink-2)' }}>
                      {s.weight_kg}×{s.reps}{i < ex.lastSets.length - 1 ? ' ·' : ''}
                    </span>
                  ))}
                </div>
              ) : (
                <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)' }}>{L.newHint}</span>
              )}

              {/* per-set rows: prefilled weight + reps steppers */}
              <div className="flex flex-col" style={{ gap: 8 }}>
                {ex.sets.map((s, setI) => (
                  <div key={setI} className="flex items-center" style={{ gap: 8 }}>
                    <span
                      className="num-display flex items-center justify-center"
                      style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, fontSize: 12, fontWeight: 700,
                        background: s.fromHistory ? 'var(--color-accent-soft)' : 'var(--color-surface-2)',
                        color: s.fromHistory ? 'var(--color-accent)' : 'var(--color-muted)' }}
                    >
                      {setI + 1}
                    </span>
                    <div className="flex-1" style={{ minWidth: 0 }}>
                      <Stepper
                        value={s.weight_kg}
                        onChange={(v) => patchSet(exI, setI, { weight_kg: v, fromHistory: false })}
                        step={2.5}
                        decimals={1}
                        suffix={L.kg}
                        color="var(--color-ink)"
                        ariaLabel={`${ex.name} ${L.set} ${setI + 1} ${L.kg}`}
                      />
                    </div>
                    <div style={{ width: 118, flexShrink: 0 }}>
                      <Stepper
                        value={s.reps}
                        onChange={(v) => patchSet(exI, setI, { reps: v, fromHistory: false })}
                        step={1}
                        decimals={0}
                        suffix={L.reps}
                        color="var(--color-strain)"
                        ariaLabel={`${ex.name} ${L.set} ${setI + 1} ${L.reps}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </BottomSheet>
  )
}
