import { useState } from 'react'
import { Dumbbell, Pencil, Play, Plus, Trash2, TrendingUp } from 'lucide-react'
import { RoutineFormSheet } from './RoutineFormSheet'
import { LogSessionSheet } from './LogSessionSheet'
import { useDeleteRoutine, useRoutines, useSessions } from '../../hooks/useStrength'
import type { Routine } from '../../api/strength'

interface RoutinesManagerProps {
  de: boolean
}

const C_ACCENT = 'var(--color-accent)'
const C_GOOD = 'var(--color-recovery)'
const SOFT_ACCENT = 'var(--color-accent-soft)'

/**
 * "Meine Trainings / My Routines" — the strength-builder home inside the Lift
 * page. Lists every routine as a card (so a 3er/2er split is just N routines),
 * invites creating the first, and launches the create / edit / log sheets.
 * A recent-sessions strip below makes logged progress visible.
 */
export function RoutinesManager({ de }: RoutinesManagerProps) {
  const { data: routines = [], isLoading } = useRoutines()
  const { data: sessions = [] } = useSessions(undefined, 6)
  const del = useDeleteRoutine()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Routine | null>(null)
  const [logRoutineId, setLogRoutineId] = useState<number | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)

  const active = routines.filter((r) => !r.archived)

  const L = de
    ? { title: 'Meine Trainings', sub: 'Erstelle & protokolliere deine Splits', new: 'Neu',
        emptyT: 'Noch kein Training', emptyS: 'Erstelle dein erstes Training — z.B. Push, Pull, Legs für einen 3er-Split.',
        create: 'Erstes Training erstellen', start: 'Starten', exercises: 'Übungen',
        del: 'Löschen?', delYes: 'Löschen', delNo: 'Abbrechen',
        recent: 'Letzte Einheiten', volume: 'Volumen', noSessions: 'Noch keine Einheiten protokolliert',
        splitHint: 'Tipp: Lege mehrere Trainings an (Push · Pull · Legs) für einen Split.' }
    : { title: 'My Routines', sub: 'Build & log your training splits', new: 'New',
        emptyT: 'No routine yet', emptyS: 'Create your first routine — e.g. Push, Pull, Legs for a 3-day split.',
        create: 'Create first routine', start: 'Start', exercises: 'exercises',
        del: 'Delete?', delYes: 'Delete', delNo: 'Cancel',
        recent: 'Recent sessions', volume: 'Volume', noSessions: 'No sessions logged yet',
        splitHint: 'Tip: create several routines (Push · Pull · Legs) to build a split.' }

  const openCreate = () => { setEditing(null); setFormOpen(true) }
  const openEdit = (r: Routine) => { setEditing(r); setFormOpen(true) }

  const summary = (r: Routine) => {
    const n = r.exercises.length
    const first = r.exercises.slice(0, 2).map((e) => e.name).join(' · ')
    return `${n} ${L.exercises}${first ? ` · ${first}` : ''}`
  }

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(de ? 'de-DE' : 'en-US', { day: 'numeric', month: 'short' })

  return (
    <div className="flex flex-col" style={{ gap: 14 }}>
      {/* Section header + New */}
      <div className="flex items-center justify-between" style={{ padding: '4px 0 0 0' }}>
        <div className="flex items-center" style={{ gap: 11 }}>
          <div style={{ width: 4, height: 30, borderRadius: 2, background: C_ACCENT }} />
          <div className="flex flex-col" style={{ gap: 1 }}>
            <span className="num-display" style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-ink)' }}>{L.title}</span>
            <span style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>{L.sub}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center num-display"
          style={{ gap: 5, padding: '8px 13px', borderRadius: 999, background: C_ACCENT, color: 'var(--color-ink)', fontSize: 13, fontWeight: 700, border: 'none' }}
        >
          <Plus size={15} /> {L.new}
        </button>
      </div>

      {/* Empty state */}
      {!isLoading && active.length === 0 && (
        <div
          className="flex flex-col items-center"
          style={{ gap: 12, padding: 26, borderRadius: 24, background: 'var(--color-paper-2)', border: '1px dashed var(--color-rule)', textAlign: 'center' }}
        >
          <div className="flex items-center justify-center" style={{ width: 52, height: 52, borderRadius: 16, background: SOFT_ACCENT }}>
            <Dumbbell size={26} color={C_ACCENT} />
          </div>
          <div className="flex flex-col" style={{ gap: 4 }}>
            <span className="num-display" style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-ink)' }}>{L.emptyT}</span>
            <span style={{ fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.4, maxWidth: 280 }}>{L.emptyS}</span>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center num-display"
            style={{ gap: 6, padding: '11px 18px', borderRadius: 999, background: C_ACCENT, color: 'var(--color-ink)', fontSize: 14, fontWeight: 700, border: 'none' }}
          >
            <Plus size={16} /> {L.create}
          </button>
        </div>
      )}

      {/* Routine cards */}
      {active.map((r) => (
        <div
          key={r.id}
          className="flex flex-col"
          style={{ gap: 12, padding: 16, borderRadius: 22, background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
        >
          <div className="flex items-start" style={{ gap: 12 }}>
            <div className="flex items-center justify-center" style={{ width: 42, height: 42, borderRadius: 13, background: SOFT_ACCENT, flexShrink: 0 }}>
              <Dumbbell size={21} color={C_ACCENT} />
            </div>
            <div className="flex flex-col flex-1" style={{ gap: 2, minWidth: 0 }}>
              <span className="num-display" style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-ink)' }}>{r.name}</span>
              <span style={{ fontSize: 12, color: 'var(--color-ink-2)', lineHeight: 1.35 }}>{summary(r)}</span>
              {r.notes && <span style={{ fontSize: 11, color: 'var(--color-muted)', lineHeight: 1.35 }}>{r.notes}</span>}
            </div>
          </div>

          {confirmId === r.id ? (
            <div className="flex items-center" style={{ gap: 8 }}>
              <span className="flex-1" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)' }}>{L.del}</span>
              <button
                type="button"
                onClick={() => setConfirmId(null)}
                className="num-display"
                style={{ padding: '9px 14px', borderRadius: 12, fontSize: 13, fontWeight: 700, color: 'var(--color-ink-2)', background: 'var(--color-surface-2)', border: 'none' }}
              >
                {L.delNo}
              </button>
              <button
                type="button"
                onClick={() => { del.mutate(r.id); setConfirmId(null) }}
                className="flex items-center num-display"
                style={{ gap: 5, padding: '9px 14px', borderRadius: 12, fontSize: 13, fontWeight: 700, color: 'var(--color-ink)', background: 'var(--color-move)', border: 'none' }}
              >
                <Trash2 size={14} /> {L.delYes}
              </button>
            </div>
          ) : (
            <div className="flex items-center" style={{ gap: 8 }}>
              <button
                type="button"
                onClick={() => setLogRoutineId(r.id)}
                className="flex flex-1 items-center justify-center num-display"
                style={{ gap: 6, height: 44, borderRadius: 13, background: C_ACCENT, color: 'var(--color-ink)', fontSize: 14, fontWeight: 700, border: 'none' }}
              >
                <Play size={16} /> {L.start}
              </button>
              <button
                type="button"
                aria-label="edit"
                onClick={() => openEdit(r)}
                className="flex items-center justify-center"
                style={{ width: 44, height: 44, borderRadius: 13, background: 'var(--color-surface-2)', color: 'var(--color-ink-2)', border: '1px solid var(--color-rule)' }}
              >
                <Pencil size={16} />
              </button>
              <button
                type="button"
                aria-label="delete"
                onClick={() => setConfirmId(r.id)}
                className="flex items-center justify-center"
                style={{ width: 44, height: 44, borderRadius: 13, background: 'var(--color-surface-2)', color: 'var(--color-move)', border: '1px solid var(--color-rule)' }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          )}
        </div>
      ))}

      {/* Split hint (only once at least one routine exists) */}
      {active.length > 0 && (
        <div className="flex items-center" style={{ gap: 9, padding: '11px 13px', borderRadius: 14, background: SOFT_ACCENT }}>
          <TrendingUp size={15} color={C_ACCENT} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink)', lineHeight: 1.35 }}>{L.splitHint}</span>
        </div>
      )}

      {/* Recent sessions */}
      {active.length > 0 && (
        <div
          className="flex flex-col"
          style={{ gap: 12, padding: 16, borderRadius: 22, background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
        >
          <span className="num-display" style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>{L.recent}</span>
          {sessions.length === 0 ? (
            <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>{L.noSessions}</span>
          ) : (
            sessions.map((s) => (
              <div key={s.id} className="flex items-center" style={{ gap: 12 }}>
                <div className="flex flex-col items-center" style={{ width: 44, flexShrink: 0 }}>
                  <span className="num-display" style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink)' }}>{fmtDate(s.performed_at)}</span>
                </div>
                <div className="flex flex-col flex-1" style={{ gap: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.routine_name ?? (de ? 'Freie Einheit' : 'Free session')}
                  </span>
                  {s.top_set && (
                    <span style={{ fontSize: 11, color: 'var(--color-ink-2)' }}>
                      {s.top_set.exercise_name} · {s.top_set.weight_kg}×{s.top_set.reps}
                    </span>
                  )}
                </div>
                <div className="flex flex-col items-end" style={{ gap: 1 }}>
                  <span className="num-display" style={{ fontSize: 15, fontWeight: 700, color: C_GOOD }}>
                    {Math.round(s.total_volume_kg).toLocaleString()}
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 500, color: 'var(--color-muted)' }}>{L.volume} kg</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Sheets */}
      <RoutineFormSheet open={formOpen} onClose={() => setFormOpen(false)} de={de} editing={editing} />
      <LogSessionSheet routineId={logRoutineId} onClose={() => setLogRoutineId(null)} de={de} />
    </div>
  )
}
