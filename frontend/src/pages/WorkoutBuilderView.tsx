/**
 * WorkoutBuilderView — the athlete's own structured-workout editor.
 *
 * A block-composition editor (warm-up / steady / interval / ramp / free-ride /
 * cool-down) in the app's design language: %FTP targets, a LIVE BlockBars
 * preview that redraws as blocks are edited, and a live TSS + duration estimate
 * (client-side, reconciled with the server on save). Saved workouts list below
 * with edit / "Heute verwenden" (schedule today) / delete.
 *
 * German-first via useLocale. Mobile-first (390×844). Reuses BlockBars for
 * rendering and the %FTP→watts conventions of the template library; watts are
 * materialised server-side from FTP only at schedule / export time.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useLocation, Link } from 'react-router-dom'
import { ChevronUp, ChevronDown, Trash2, Plus, Clock, Zap, Download } from 'lucide-react'
import AppShell from '../components/shell/AppShell'
import { useLocale } from '../contexts/LocaleContext'
import BlockBars from '../components/workout/BlockBars'
import {
  type BlockType,
  type CustomBlock,
  type CustomWorkoutRead,
  blocksToPreview,
  estimateDuration,
  estimateTss,
  listCustomWorkouts,
  getCustomWorkout,
  createCustomWorkout,
  updateCustomWorkout,
  deleteCustomWorkout,
  scheduleCustomWorkout,
  downloadZwo,
} from '../api/customWorkouts'

const CARD = 'var(--color-surface-2)'
const CARD_HI = 'var(--color-surface-3)'
const RULE = '1px solid var(--color-rule)'
const INK = 'var(--color-ink)'
const INK2 = 'var(--color-ink-2)'
const ACCENT = 'var(--color-accent)'

// Sensible defaults per block type (%FTP conventions from the template lib).
function defaultBlock(type: BlockType): CustomBlock {
  switch (type) {
    case 'warmup':
      return { type, duration_s: 600, from_pct: 0.5, to_pct: 0.75 }
    case 'steady':
      return { type, duration_s: 1200, power_pct: 0.65 }
    case 'interval':
      return { type, reps: 4, on_s: 180, off_s: 180, on_pct: 1.1, off_pct: 0.5 }
    case 'ramp':
      return { type, duration_s: 300, from_pct: 0.6, to_pct: 1.0 }
    case 'freeride':
      return { type, duration_s: 600 }
    case 'cooldown':
      return { type, duration_s: 600, from_pct: 0.6, to_pct: 0.4 }
  }
}

function fmtDur(s: number): string {
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem ? `${h}h ${rem}min` : `${h}h`
}

const zoneColor = (z: number) => `var(--color-zone-${Math.min(7, Math.max(1, z))})`

function StepRow({ label, value, unit, onChange, step, min, max }: {
  label: string; value: number; unit: string; onChange: (v: number) => void
  step: number; min: number; max: number
}) {
  const set = (v: number) => onChange(Math.max(min, Math.min(max, v)))
  return (
    <div className="flex items-center justify-between" style={{ minHeight: 40 }}>
      <span style={{ fontSize: 13, color: INK2 }}>{label}</span>
      <div className="flex items-center" style={{ gap: 8 }}>
        <button type="button" onClick={() => set(value - step)} aria-label="minus"
          className="rounded-full flex items-center justify-center"
          style={{ width: 32, height: 32, background: CARD_HI, color: INK, border: RULE, fontSize: 18, fontWeight: 700 }}>−</button>
        <span style={{ fontSize: 14, fontWeight: 700, color: INK, minWidth: 74, textAlign: 'center' }}>
          {value}{unit}
        </span>
        <button type="button" onClick={() => set(value + step)} aria-label="plus"
          className="rounded-full flex items-center justify-center"
          style={{ width: 32, height: 32, background: CARD_HI, color: INK, border: RULE, fontSize: 18, fontWeight: 700 }}>+</button>
      </div>
    </div>
  )
}

export default function WorkoutBuilderView() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams<{ id: string }>()
  const editingId = id ? Number(id) : null

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [blocks, setBlocks] = useState<CustomBlock[]>([])
  const [saved, setSaved] = useState<CustomWorkoutRead[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  const refreshSaved = () => { listCustomWorkouts().then(setSaved).catch(() => {}) }

  useEffect(() => { refreshSaved() }, [])

  // A "seed" handed in via router state (e.g. Workout Detail → "Einheit
  // bearbeiten") prefills the editor with the current workout as a NEW draft
  // the athlete can tweak and save/schedule — without editing a saved id.
  const seed = (location.state as { seed?: { name?: string; blocks?: CustomBlock[] } } | null)?.seed ?? null

  useEffect(() => {
    if (editingId == null) {
      if (seed?.blocks?.length) {
        setName(seed.name ?? ''); setDescription(''); setBlocks(seed.blocks)
      } else {
        setName(''); setDescription(''); setBlocks([])
      }
      return
    }
    getCustomWorkout(editingId).then((w) => {
      setName(w.name); setDescription(w.description ?? ''); setBlocks(w.blocks)
    }).catch(() => setError(de ? 'Konnte Workout nicht laden.' : 'Could not load workout.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, de])

  const tss = useMemo(() => estimateTss(blocks), [blocks])
  const duration = useMemo(() => estimateDuration(blocks), [blocks])
  const preview = useMemo(() => blocksToPreview(blocks), [blocks])

  const addBlock = (type: BlockType) => setBlocks((b) => [...b, defaultBlock(type)])
  const patch = (i: number, p: Partial<CustomBlock>) =>
    setBlocks((b) => b.map((blk, j) => (j === i ? { ...blk, ...p } : blk)))
  const move = (i: number, dir: -1 | 1) => setBlocks((b) => {
    const j = i + dir
    if (j < 0 || j >= b.length) return b
    const copy = [...b]; ;[copy[i], copy[j]] = [copy[j], copy[i]]; return copy
  })
  const remove = (i: number) => setBlocks((b) => b.filter((_, j) => j !== i))

  const save = async () => {
    setError(null)
    if (!name.trim()) { setError(de ? 'Bitte gib einen Namen ein.' : 'Please enter a name.'); return }
    if (blocks.length === 0) { setError(de ? 'Füge mindestens einen Block hinzu.' : 'Add at least one block.'); return }
    setSaving(true)
    try {
      const body = { name: name.trim(), description: description.trim() || null, blocks }
      const w = editingId != null
        ? await updateCustomWorkout(editingId, body)
        : await createCustomWorkout(body)
      refreshSaved()
      if (editingId == null) navigate(`/workouts/builder/${w.id}`)
    } catch {
      setError(de ? 'Speichern fehlgeschlagen.' : 'Save failed.')
    } finally { setSaving(false) }
  }

  const onSchedule = async (w: CustomWorkoutRead) => {
    setBusyId(w.id); setError(null)
    try {
      const today = new Date().toISOString().slice(0, 10)
      await scheduleCustomWorkout(w.id, today)
      setError(de ? `„${w.name}" für heute eingeplant ✓` : `"${w.name}" scheduled for today ✓`)
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status
      setError(status === 409
        ? (de ? 'Kein FTP im Profil — bitte zuerst FTP setzen.' : 'No FTP set — set your FTP first.')
        : (de ? 'Einplanen fehlgeschlagen.' : 'Scheduling failed.'))
    } finally { setBusyId(null) }
  }

  const onDelete = async (w: CustomWorkoutRead) => {
    setBusyId(w.id)
    try { await deleteCustomWorkout(w.id); refreshSaved(); if (editingId === w.id) navigate('/workouts/builder') }
    finally { setBusyId(null) }
  }

  const BLOCK_META: Record<BlockType, { label: string }> = {
    warmup: { label: de ? 'Aufwärmen' : 'Warm-up' },
    steady: { label: de ? 'Steady' : 'Steady' },
    interval: { label: de ? 'Intervalle' : 'Intervals' },
    ramp: { label: de ? 'Rampe' : 'Ramp' },
    freeride: { label: de ? 'Freie Fahrt' : 'Free ride' },
    cooldown: { label: de ? 'Ausfahren' : 'Cool-down' },
  }

  return (
    <AppShell
      title={de ? 'Workout-Baukasten' : 'Workout builder'}
      onBack={() => navigate('/dashboard')}
      // The block list runs long and the athlete adds blocks from the bottom
      // while checking the preview at the top; the title and the way out stay
      // useful the whole way down. This restores the sticky header the page had
      // before it moved onto the shell -- as a shell option, so any other long
      // surface can have it without hand-rolling a second header.
      stickyHeader
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Live preview */}
        <div className="rounded-2xl" style={{ background: CARD, padding: 16, border: RULE }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: INK2, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              {de ? 'Vorschau' : 'Preview'}
            </span>
            <div className="flex items-center" style={{ gap: 14 }}>
              <span className="flex items-center" style={{ gap: 4, fontSize: 13, fontWeight: 700 }}>
                <Clock size={14} color={INK2} /> {fmtDur(duration)}
              </span>
              <span className="flex items-center" style={{ gap: 4, fontSize: 13, fontWeight: 700, color: ACCENT }}>
                <Zap size={14} /> {tss} TSS
              </span>
            </div>
          </div>
          {preview.length > 0
            ? <BlockBars blocks={preview} height={110} />
            : <div style={{ height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', color: INK2, fontSize: 13, border: '1px dashed var(--color-rule)', borderRadius: 12 }}>
                {de ? 'Füge unten Blöcke hinzu' : 'Add blocks below'}
              </div>}
        </div>

        {/* Name + description */}
        <div className="rounded-2xl" style={{ background: CARD, padding: 16, border: RULE, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder={de ? 'Name des Workouts' : 'Workout name'}
            style={{ background: CARD_HI, border: RULE, borderRadius: 10, padding: '11px 12px', color: INK, fontSize: 15, fontWeight: 700 }} />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder={de ? 'Beschreibung (optional)' : 'Description (optional)'} rows={2}
            style={{ background: CARD_HI, border: RULE, borderRadius: 10, padding: '11px 12px', color: INK, fontSize: 13, resize: 'vertical' }} />
        </div>

        {/* Block editors — only rendered when present so the empty state keeps
            an even vertical rhythm (no phantom gap from an empty container). */}
        {blocks.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {blocks.map((b, i) => (
              <BlockEditor key={i} block={b} index={i} total={blocks.length} de={de}
                label={BLOCK_META[b.type].label} color={zoneColor(zoneForType(b))}
                onPatch={(p) => patch(i, p)} onMove={(d) => move(i, d)} onRemove={() => remove(i)} />
            ))}
          </div>
        )}

        {/* Add-block palette */}
        <div className="rounded-2xl" style={{ background: CARD, padding: 14, border: RULE }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: INK2, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            {de ? 'Block hinzufügen' : 'Add block'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {(Object.keys(BLOCK_META) as BlockType[]).map((t) => (
              <button key={t} type="button" onClick={() => addBlock(t)}
                className="flex items-center gap-2 rounded-xl" style={{ background: CARD_HI, border: RULE, padding: '11px 12px', color: INK, fontSize: 13, fontWeight: 700, minHeight: 44 }}>
                <Plus size={15} color={ACCENT} /> {BLOCK_META[t].label}
              </button>
            ))}
          </div>
        </div>

        {error && <div style={{ fontSize: 13, color: INK, background: CARD, border: RULE, borderRadius: 10, padding: '10px 12px' }}>{error}</div>}

        {/* Save — disabled until the workout has a name and at least one block,
            so the primary action never leads to a guaranteed validation error. */}
        {(() => {
          const canSave = name.trim().length > 0 && blocks.length > 0
          return (
            <button type="button" onClick={save} disabled={saving || !canSave}
              className="rounded-xl" style={{ background: ACCENT, color: '#fff', fontWeight: 800, fontSize: 15, padding: '14px', minHeight: 50, opacity: saving || !canSave ? 0.5 : 1, cursor: canSave ? 'pointer' : 'not-allowed' }}>
              {editingId != null ? (de ? 'Änderungen speichern' : 'Save changes') : (de ? 'Workout speichern' : 'Save workout')}
            </button>
          )
        })()}

        {/* Saved workouts */}
        {saved.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: INK2, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              {de ? 'Meine Workouts' : 'My workouts'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {saved.map((w) => (
                <div key={w.id} className="rounded-2xl" style={{ background: CARD, padding: 14, border: RULE }}>
                  <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                    <Link to={`/workouts/builder/${w.id}`} style={{ fontSize: 15, fontWeight: 800, color: INK }}>{w.name}</Link>
                    <span style={{ fontSize: 12, color: INK2 }}>{fmtDur(w.estimated_duration_s)} · {w.estimated_tss} TSS</span>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <BlockBars blocks={blocksToPreview(w.blocks)} height={48} />
                  </div>
                  <div className="flex items-center" style={{ gap: 8 }}>
                    <button type="button" onClick={() => onSchedule(w)} disabled={busyId === w.id}
                      className="rounded-full" style={{ flex: 1, background: ACCENT, color: '#fff', fontWeight: 700, fontSize: 13, padding: '9px', minHeight: 40 }}>
                      {de ? 'Heute verwenden' : 'Use today'}
                    </button>
                    <button type="button" onClick={() => downloadZwo(w.id, w.name)}
                      className="rounded-full flex items-center justify-center" style={{ width: 40, height: 40, background: CARD_HI, border: RULE, color: INK }} aria-label="export">
                      <Download size={16} />
                    </button>
                    <button type="button" onClick={() => onDelete(w)} disabled={busyId === w.id}
                      className="rounded-full flex items-center justify-center" style={{ width: 40, height: 40, background: CARD_HI, border: RULE, color: 'var(--color-danger, #E5484D)' }} aria-label="delete">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}

// Representative zone for the block header accent.
function zoneForType(b: CustomBlock): number {
  if (b.type === 'interval') return b.on_pct ? pctZone(b.on_pct) : 5
  if (b.type === 'steady') return b.power_pct ? pctZone(b.power_pct) : 2
  if (b.type === 'freeride') return 2
  return b.to_pct ? pctZone(b.to_pct) : 2
}
function pctZone(p: number): number {
  if (p <= 0.55) return 1
  if (p <= 0.75) return 2
  if (p <= 0.9) return 3
  if (p <= 1.05) return 4
  if (p <= 1.2) return 5
  if (p <= 1.5) return 6
  return 7
}

function BlockEditor({ block, index, total, de, label, color, onPatch, onMove, onRemove }: {
  block: CustomBlock; index: number; total: number; de: boolean; label: string; color: string
  onPatch: (p: Partial<CustomBlock>) => void; onMove: (d: -1 | 1) => void; onRemove: () => void
}) {
  const pct = (v: number) => `${Math.round(v * 100)}%`
  const min = (s: number) => Math.round(s / 60)
  return (
    <div className="rounded-2xl" style={{ background: 'var(--color-surface-2)', border: RULE, overflow: 'hidden' }}>
      <div className="flex items-center justify-between" style={{ padding: '10px 12px', borderBottom: RULE }}>
        <div className="flex items-center" style={{ gap: 8 }}>
          <span style={{ width: 4, height: 18, borderRadius: 2, background: color, display: 'inline-block' }} />
          <span style={{ fontSize: 14, fontWeight: 800 }}>{label}</span>
        </div>
        <div className="flex items-center" style={{ gap: 4 }}>
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label="up"
            className="flex items-center justify-center rounded-lg" style={{ width: 32, height: 32, background: 'var(--color-surface-3)', opacity: index === 0 ? 0.35 : 1 }}><ChevronUp size={16} /></button>
          <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} aria-label="down"
            className="flex items-center justify-center rounded-lg" style={{ width: 32, height: 32, background: 'var(--color-surface-3)', opacity: index === total - 1 ? 0.35 : 1 }}><ChevronDown size={16} /></button>
          <button type="button" onClick={onRemove} aria-label="remove"
            className="flex items-center justify-center rounded-lg" style={{ width: 32, height: 32, background: 'var(--color-surface-3)', color: 'var(--color-danger, #E5484D)' }}><Trash2 size={15} /></button>
        </div>
      </div>
      <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column' }}>
        {block.type === 'interval' ? (
          <>
            <StepRow label={de ? 'Wiederholungen' : 'Reps'} value={block.reps ?? 1} unit="×" step={1} min={1} max={40}
              onChange={(v) => onPatch({ reps: v })} />
            <StepRow label={de ? 'Belastung' : 'On'} value={min(block.on_s ?? 0)} unit=" min" step={1} min={1} max={60}
              onChange={(v) => onPatch({ on_s: v * 60 })} />
            <StepRow label={de ? 'Belastung %FTP' : 'On %FTP'} value={Math.round((block.on_pct ?? 0) * 100)} unit="%" step={5} min={30} max={200}
              onChange={(v) => onPatch({ on_pct: v / 100 })} />
            <StepRow label={de ? 'Pause' : 'Off'} value={min(block.off_s ?? 0)} unit=" min" step={1} min={1} max={60}
              onChange={(v) => onPatch({ off_s: v * 60 })} />
            <StepRow label={de ? 'Pause %FTP' : 'Off %FTP'} value={Math.round((block.off_pct ?? 0) * 100)} unit="%" step={5} min={20} max={100}
              onChange={(v) => onPatch({ off_pct: v / 100 })} />
          </>
        ) : block.type === 'steady' || block.type === 'freeride' ? (
          <>
            <StepRow label={de ? 'Dauer' : 'Duration'} value={min(block.duration_s ?? 0)} unit=" min" step={1} min={1} max={360}
              onChange={(v) => onPatch({ duration_s: v * 60 })} />
            {block.type === 'steady' && (
              <StepRow label="%FTP" value={Math.round((block.power_pct ?? 0) * 100)} unit="%" step={5} min={30} max={150}
                onChange={(v) => onPatch({ power_pct: v / 100 })} />
            )}
          </>
        ) : (
          <>
            <StepRow label={de ? 'Dauer' : 'Duration'} value={min(block.duration_s ?? 0)} unit=" min" step={1} min={1} max={120}
              onChange={(v) => onPatch({ duration_s: v * 60 })} />
            <StepRow label={de ? 'Von %FTP' : 'From %FTP'} value={Math.round((block.from_pct ?? 0) * 100)} unit="%" step={5} min={20} max={150}
              onChange={(v) => onPatch({ from_pct: v / 100 })} />
            <StepRow label={de ? 'Bis %FTP' : 'To %FTP'} value={Math.round((block.to_pct ?? 0) * 100)} unit="%" step={5} min={20} max={150}
              onChange={(v) => onPatch({ to_pct: v / 100 })} />
          </>
        )}
        <div style={{ fontSize: 11, color: INK2, paddingTop: 4 }}>
          {de ? 'Ziel' : 'Target'}: {block.type === 'interval'
            ? `${block.reps}× ${min(block.on_s ?? 0)}min @ ${pct(block.on_pct ?? 0)} / ${min(block.off_s ?? 0)}min @ ${pct(block.off_pct ?? 0)}`
            : block.type === 'steady' ? `${min(block.duration_s ?? 0)}min @ ${pct(block.power_pct ?? 0)}`
            : block.type === 'freeride' ? `${min(block.duration_s ?? 0)}min ${de ? 'frei' : 'free'}`
            : `${min(block.duration_s ?? 0)}min ${pct(block.from_pct ?? 0)} → ${pct(block.to_pct ?? 0)}`}
        </div>
      </div>
    </div>
  )
}
