import { useEffect, useState } from 'react'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import { BottomSheet } from './BottomSheet'
import { useCreateRoutine, useUpdateRoutine } from '../../hooks/useStrength'
import type { Routine, RoutineExerciseWrite } from '../../api/strength'

interface RoutineFormSheetProps {
  open: boolean
  onClose: () => void
  de: boolean
  /** When set, the sheet edits this routine; otherwise it creates a new one. */
  editing?: Routine | null
}

interface Row extends RoutineExerciseWrite {
  key: string
}

const uid = () => Math.random().toString(36).slice(2)

const blankRow = (): Row => ({ key: uid(), name: '', target_sets: 3, target_reps: '8-12' })

/**
 * Create / edit a routine. A routine is one training template (e.g. "Push A").
 * The user builds a multi-day split simply by creating several routines — this
 * sheet is the single building block for all of them.
 */
export function RoutineFormSheet({ open, onClose, de, editing }: RoutineFormSheetProps) {
  const create = useCreateRoutine()
  const update = useUpdateRoutine()
  const isEdit = !!editing

  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [rows, setRows] = useState<Row[]>([blankRow()])

  // Reset the form whenever the sheet (re)opens, seeding from `editing`.
  useEffect(() => {
    if (!open) return
    if (editing) {
      setName(editing.name)
      setNotes(editing.notes ?? '')
      setRows(
        editing.exercises.length
          ? editing.exercises.map((e) => ({
              key: uid(),
              name: e.name,
              target_sets: e.target_sets,
              target_reps: e.target_reps,
            }))
          : [blankRow()],
      )
    } else {
      setName('')
      setNotes('')
      setRows([blankRow()])
    }
  }, [open, editing])

  const setRow = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const addRow = () => setRows((rs) => [...rs, blankRow()])
  const removeRow = (key: string) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs))

  const cleanRows = rows
    .map((r) => ({ name: r.name.trim(), target_sets: r.target_sets, target_reps: r.target_reps.trim() }))
    .filter((r) => r.name.length > 0)
  const canSave = name.trim().length > 0 && cleanRows.length > 0
  const pending = create.isPending || update.isPending

  const handleSave = () => {
    if (!canSave || pending) return
    const payload = { name: name.trim(), notes: notes.trim() || null, exercises: cleanRows }
    if (isEdit && editing) {
      update.mutate({ id: editing.id, payload }, { onSuccess: onClose })
    } else {
      create.mutate(payload, { onSuccess: onClose })
    }
  }

  const label = de
    ? { name: 'Name', namePh: 'z.B. Push A', notes: 'Notiz (optional)', notesPh: 'z.B. Fokus Brust & Trizeps',
        ex: 'Übungen', exName: 'Übung', exNamePh: 'z.B. Bankdrücken', sets: 'Sätze', reps: 'Whd.',
        add: 'Übung hinzufügen', save: isEdit ? 'Änderungen speichern' : 'Training erstellen',
        eyebrow: isEdit ? 'TRAINING BEARBEITEN' : 'NEUES TRAINING', title: isEdit ? 'Training bearbeiten' : 'Neues Training' }
    : { name: 'Name', namePh: 'e.g. Push A', notes: 'Notes (optional)', notesPh: 'e.g. Focus chest & triceps',
        ex: 'Exercises', exName: 'Exercise', exNamePh: 'e.g. Bench Press', sets: 'Sets', reps: 'Reps',
        add: 'Add exercise', save: isEdit ? 'Save changes' : 'Create routine',
        eyebrow: isEdit ? 'EDIT ROUTINE' : 'NEW ROUTINE', title: isEdit ? 'Edit routine' : 'New routine' }

  const fieldStyle: React.CSSProperties = {
    width: '100%', height: 44, borderRadius: 12, border: '1px solid var(--color-rule)',
    background: 'var(--color-paper-2)', color: 'var(--color-ink)', padding: '0 12px', fontSize: 14, outline: 'none',
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      eyebrow={label.eyebrow}
      title={label.title}
      footer={
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave || pending}
          className="flex w-full items-center justify-center num-display"
          style={{
            height: 52, borderRadius: 14, gap: 8, fontSize: 15, fontWeight: 700,
            background: canSave ? 'var(--color-accent)' : 'var(--color-surface-2)',
            color: canSave ? 'var(--color-ink)' : 'var(--color-muted)',
            opacity: pending ? 0.6 : 1, border: 'none',
          }}
        >
          {pending ? '…' : label.save}
        </button>
      }
    >
      <div className="flex flex-col" style={{ gap: 16 }}>
        {/* Name */}
        <div className="flex flex-col" style={{ gap: 6 }}>
          <span className="eyebrow" style={{ fontSize: 11, letterSpacing: 0.5, color: 'var(--color-muted)' }}>{label.name}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={label.namePh} style={fieldStyle} />
        </div>

        {/* Notes */}
        <div className="flex flex-col" style={{ gap: 6 }}>
          <span className="eyebrow" style={{ fontSize: 11, letterSpacing: 0.5, color: 'var(--color-muted)' }}>{label.notes}</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={label.notesPh} style={fieldStyle} />
        </div>

        {/* Exercises */}
        <div className="flex flex-col" style={{ gap: 10 }}>
          <span className="eyebrow" style={{ fontSize: 11, letterSpacing: 0.5, color: 'var(--color-muted)' }}>
            {label.ex} · {cleanRows.length}
          </span>
          {rows.map((r) => (
            <div
              key={r.key}
              className="flex flex-col"
              style={{ gap: 8, padding: 12, borderRadius: 14, border: '1px solid var(--color-rule)', background: 'var(--color-paper-2)' }}
            >
              <div className="flex items-center" style={{ gap: 8 }}>
                <GripVertical size={16} color="var(--color-surface-3)" style={{ flexShrink: 0 }} />
                <input
                  value={r.name}
                  onChange={(e) => setRow(r.key, { name: e.target.value })}
                  placeholder={label.exNamePh}
                  style={{ ...fieldStyle, height: 40, flex: 1 }}
                />
                <button
                  type="button"
                  aria-label="remove"
                  onClick={() => removeRow(r.key)}
                  className="flex items-center justify-center"
                  style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid var(--color-rule)', background: 'transparent', color: 'var(--color-move)', flexShrink: 0, opacity: rows.length > 1 ? 1 : 0.35 }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="flex" style={{ gap: 8, paddingLeft: 24 }}>
                <div className="flex flex-col flex-1" style={{ gap: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted)' }}>{label.sets}</span>
                  <input
                    inputMode="numeric"
                    value={String(r.target_sets)}
                    onChange={(e) => {
                      const n = parseInt(e.target.value.replace(/\D/g, ''), 10)
                      setRow(r.key, { target_sets: Number.isNaN(n) ? 0 : Math.min(n, 20) })
                    }}
                    style={{ ...fieldStyle, height: 40, textAlign: 'center' }}
                    className="num-display"
                  />
                </div>
                <div className="flex flex-col flex-1" style={{ gap: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted)' }}>{label.reps}</span>
                  <input
                    value={r.target_reps}
                    onChange={(e) => setRow(r.key, { target_reps: e.target.value })}
                    placeholder="8-12"
                    style={{ ...fieldStyle, height: 40, textAlign: 'center' }}
                    className="num-display"
                  />
                </div>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addRow}
            className="flex items-center justify-center num-display"
            style={{ height: 44, borderRadius: 12, gap: 6, border: '1px dashed var(--color-rule)', background: 'transparent', color: 'var(--color-accent)', fontSize: 13, fontWeight: 700 }}
          >
            <Plus size={16} /> {label.add}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
