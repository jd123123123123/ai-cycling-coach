import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { X, Trash2, Check } from 'lucide-react'
import { useCreateChallenge, useEditChallenge, useDeleteChallenge } from '../../hooks/useRewardChallenges'
import { CHALLENGE_METRICS, type ChallengeMetric, type RewardChallenge } from '../../api/rewardChallenges'
import { T, FONT } from './w3tokens'

/**
 * W3 · Challenge editor — create or edit a rider-defined monthly challenge.
 * POSTs/PATCHes /challenges/custom; the tier + RideCoin reward are derived
 * server-side from how ambitious the target is (a trivial goal can't mint gold).
 * Only custom challenges are editable/deletable; a completed one is locked.
 */
export default function W3ChallengeEditor({ existing, onClose }: {
  existing?: RewardChallenge | null; onClose: () => void
}) {
  const reduce = useReducedMotion()
  const editing = !!existing
  const create = useCreateChallenge()
  const edit = useEditChallenge()
  const del = useDeleteChallenge()

  const [title, setTitle] = useState(existing?.title ?? '')
  const [metric, setMetric] = useState<ChallengeMetric>(existing?.metric ?? 'distance_km')
  const [target, setTarget] = useState<string>(existing ? String(Math.round(existing.target)) : '')
  const busy = create.isPending || edit.isPending || del.isPending

  const unit = CHALLENGE_METRICS.find((m) => m.metric === metric)?.unit ?? ''
  const targetNum = Number(target)
  const valid = title.trim().length > 0 && targetNum > 0

  const submit = async () => {
    if (!valid || busy) return
    try {
      if (editing && existing) await edit.mutateAsync({ key: existing.key, title: title.trim(), target: targetNum })
      else await create.mutateAsync({ title: title.trim(), metric, target: targetNum })
      onClose()
    } catch { /* mutation surfaces error; keep the sheet open */ }
  }

  const remove = async () => {
    if (!existing || busy) return
    try { await del.mutateAsync(existing.key); onClose() } catch { /* keep open */ }
  }

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#000000B0', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }}
      onClick={onClose}>
      <motion.div
        initial={reduce ? false : { y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 34 }}
        onClick={(e) => e.stopPropagation()}
        style={{ width: 390, maxWidth: '100%', background: T.bg, borderRadius: '28px 28px 0 0', border: `1px solid ${T.rule}`, borderBottom: 0, fontFamily: FONT, display: 'flex', flexDirection: 'column', padding: '18px 20px calc(24px + env(safe-area-inset-bottom))', gap: 18 }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: T.ink }}>{editing ? 'Challenge bearbeiten' : 'Neue Challenge'}</span>
          <button onClick={onClose} aria-label="Schließen" style={{ width: 38, height: 38, borderRadius: 100, background: T.surface, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={18} color={T.mid} /></button>
        </div>

        {/* Title */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>NAME</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="z. B. Großer Monat"
            style={{ height: 50, padding: '0 16px', borderRadius: 14, background: T.surface, border: `1px solid ${T.rule}`, color: T.ink, fontFamily: FONT, fontSize: 15, outline: 'none' }} />
        </label>

        {/* Metric — locked on edit (changing the metric would be a different challenge) */}
        {!editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>MESSGRÖSSE</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {CHALLENGE_METRICS.map((m) => {
                const on = m.metric === metric
                return (
                  <button key={m.metric} onClick={() => setMetric(m.metric)}
                    style={{ padding: '10px 14px', borderRadius: 100, border: `1px solid ${on ? T.acid : T.rule}`, background: on ? T.acidDim : 'transparent', color: on ? T.acid : T.mid, fontFamily: FONT, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>{m.label}</button>
                )
              })}
            </div>
          </div>
        )}

        {/* Target */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>ZIEL · {unit.toUpperCase()}</span>
          <input value={target} onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="numeric" placeholder="0"
            style={{ height: 50, padding: '0 16px', borderRadius: 14, background: T.surface, border: `1px solid ${T.rule}`, color: T.ink, fontFamily: FONT, fontSize: 15, outline: 'none' }} />
        </label>

        {(create.isError || edit.isError || del.isError) && (
          <span style={{ fontSize: 12, fontWeight: 600, color: T.bad }}>Etwas ist schiefgelaufen. Nochmal versuchen.</span>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          {editing && (
            <button onClick={remove} disabled={busy} aria-label="Challenge löschen"
              style={{ width: 56, height: 56, borderRadius: 100, border: `1px solid ${T.bad}55`, background: 'transparent', display: 'grid', placeItems: 'center', cursor: 'pointer', flex: 'none' }}><Trash2 size={19} color={T.bad} /></button>
          )}
          <button onClick={submit} disabled={!valid || busy}
            style={{ flex: 1, height: 56, borderRadius: 100, border: 0, background: valid && !busy ? T.acid : T.surface2, color: valid && !busy ? T.bg : T.quiet, fontFamily: FONT, fontSize: 16, fontWeight: 700, cursor: valid && !busy ? 'pointer' : 'default', display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
            <Check size={19} />{editing ? 'Speichern' : 'Challenge erstellen'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
