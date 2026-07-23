import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import {
  CREW_EMOJIS,
  type ReactionState,
  type ReactionTargetType,
} from '../../api/crewReactions'
import { useReactions, useToggleReaction } from '../../hooks/useCrewReactions'

// Tap-to-toggle emoji reaction chips, optimistic. Surfaces that embed their
// reaction roll-up (chat, rides) pass `seed`; surfaces that don't (crew week,
// events) omit it and this fetches the state itself. Reacted emojis render as
// filled coral chips; a "+" opens the full six-emoji picker.
export default function ReactionBar({
  targetType,
  targetId,
  seed,
  de,
  align = 'start',
}: {
  targetType: ReactionTargetType
  targetId?: number
  seed?: ReactionState
  de: boolean
  align?: 'start' | 'center'
}) {
  const needsFetch = seed === undefined
  const { data: fetched } = useReactions(targetType, targetId, needsFetch)
  const toggle = useToggleReaction()

  const [state, setState] = useState<ReactionState>(seed ?? { counts: {}, mine: [] })
  const [pickerOpen, setPickerOpen] = useState(false)

  // Reconcile local state whenever the authoritative source changes (a fresh
  // seed from a re-poll, or the fetched roll-up landing).
  useEffect(() => {
    if (seed) setState(seed)
    else if (fetched) setState(fetched)
  }, [seed, fetched])

  const onToggle = (emoji: string) => {
    setPickerOpen(false)
    // Optimistic flip.
    setState((prev) => {
      const mine = prev.mine.includes(emoji)
      const counts = { ...prev.counts }
      const next = Math.max(0, (counts[emoji] ?? 0) + (mine ? -1 : 1))
      if (next === 0) delete counts[emoji]
      else counts[emoji] = next
      return { counts, mine: mine ? prev.mine.filter((e) => e !== emoji) : [...prev.mine, emoji] }
    })
    toggle.mutate(
      { targetType, targetId, emoji },
      { onSuccess: (res) => setState({ counts: res.counts, mine: res.mine }) },
    )
  }

  // Emojis with at least one reaction, in the canonical palette order.
  const active = CREW_EMOJIS.filter((e) => (state.counts[e] ?? 0) > 0)

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${align === 'center' ? 'justify-center' : ''}`}>
      {active.map((emoji) => {
        const mine = state.mine.includes(emoji)
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => onToggle(emoji)}
            aria-pressed={mine}
            className="inline-flex items-center gap-1 rounded-full"
            style={{
              background: mine ? 'color-mix(in srgb, var(--color-accent) 22%, transparent)' : 'var(--color-surface-2)',
              border: `1px solid ${mine ? 'var(--color-accent)' : 'transparent'}`,
              padding: '5px 9px',
              transition: 'background 120ms, border-color 120ms',
            }}
          >
            <span style={{ fontSize: 13, lineHeight: 1 }}>{emoji}</span>
            <span className="num-mono" style={{ fontSize: 12, fontWeight: 700, color: mine ? 'var(--color-accent)' : 'var(--color-ink-2)' }}>
              {state.counts[emoji]}
            </span>
          </button>
        )
      })}

      {pickerOpen ? (
        <div className="inline-flex items-center gap-0.5 rounded-full" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)', padding: '3px 5px' }}>
          {CREW_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onToggle(emoji)}
              aria-label={de ? `Mit ${emoji} reagieren` : `React with ${emoji}`}
              className="grid place-items-center rounded-full"
              style={{ width: 28, height: 28, background: state.mine.includes(emoji) ? 'color-mix(in srgb, var(--color-accent) 22%, transparent)' : 'transparent' }}
            >
              <span style={{ fontSize: 15, lineHeight: 1 }}>{emoji}</span>
            </button>
          ))}
          <button type="button" onClick={() => setPickerOpen(false)} aria-label={de ? 'Schließen' : 'Close'} className="grid place-items-center rounded-full" style={{ width: 24, height: 24 }}>
            <X size={13} style={{ color: 'var(--color-muted)' }} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          aria-label={de ? 'Reagieren' : 'React'}
          className="inline-flex items-center gap-1 rounded-full"
          style={{ background: 'var(--color-surface-2)', padding: '5px 9px' }}
        >
          <Plus size={13} style={{ color: 'var(--color-muted)' }} />
          {active.length === 0 && (
            <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-muted)' }}>{de ? 'Reagieren' : 'React'}</span>
          )}
        </button>
      )}
    </div>
  )
}
