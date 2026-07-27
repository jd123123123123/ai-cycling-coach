/**
 * ReadinessFreshnessNote — the one line that explains a withheld readiness
 * score, and (when there's something to do about it) the button that fixes it.
 *
 * Design intent. Before this, both reasons a score could be missing shared one
 * sentence — "your readiness updates after you sleep" — rendered as a dead grey
 * moon circle occupying the top 40 % of the Today screen. That copy is calm and
 * correct at 05:00 with last night's sync still in flight. It is wrong, and
 * quietly infuriating, when the real story is that the watch hasn't uploaded a
 * night in a week: it implies waiting will help, when only a sync will.
 *
 * So this component says which of the two it is, in the athlete's words, and
 * only offers the Sync action in the case the action can actually help. It is
 * deliberately a slim inline note, not a card: the hero above it now keeps its
 * ring, verdict and pills, because the day still has an answer even when the
 * score doesn't.
 */
import { useState } from 'react'
import { RefreshCw, Moon, WifiOff, Check } from 'lucide-react'
import { useForceSync } from '../../../hooks/useForceSync'
import { useLocale } from '../../../contexts/LocaleContext'
import type { ReadinessGate } from '../../../utils/readinessGate'

export interface ReadinessFreshnessNoteProps {
  gate: ReadinessGate
  /** Whole days since the freshest overnight record (1 = yesterday). */
  ageDays: number | null
  /** Pre-formatted, already-localized date of that record, e.g. "20. Juli". */
  lastLabel: string | null
}

/** Localized copy per gate. Kept as one function so the two locales can never
 *  drift apart mid-card the way earlier mixed EN/DE strings did. Not exported:
 *  this file must export only its component to satisfy react-refresh, and the
 *  branch it selects is decided by `gate`, which `readinessGate` already tests. */
function freshnessCopy(
  gate: ReadinessGate,
  ageDays: number | null,
  lastLabel: string | null,
  de: boolean,
): { title: string; body: string; action: boolean } | null {
  if (gate === 'pending') {
    return {
      title: de ? 'Nacht-Werte kommen noch' : 'Overnight data still landing',
      body: de
        ? 'Dein Bereitschafts-Wert erscheint, sobald die Uhr die letzte Nacht hochgeladen hat. Der Plan unten steht schon.'
        : "Your readiness score appears once your watch uploads last night. The plan below already stands.",
      action: false,
    }
  }
  if (gate === 'stale') {
    const days = ageDays ?? 0
    return {
      title: de
        ? `Seit ${days} Tagen keine Nacht-Werte`
        : `No overnight data for ${days} day${days === 1 ? '' : 's'}`,
      body: de
        ? `Letzte Messung ${lastLabel ?? '—'}. Ohne frische Nacht-Werte gibt es heute keinen Bereitschafts-Wert — der Trainingsplan gilt trotzdem.`
        : `Last reading ${lastLabel ?? '—'}. Without a fresh night there's no readiness score today — your plan still stands.`,
      action: true,
    }
  }
  return null
}

export default function ReadinessFreshnessNote({ gate, ageDays, lastLabel }: ReadinessFreshnessNoteProps) {
  const { locale } = useLocale()
  const de = locale === 'de'
  const sync = useForceSync()
  const [done, setDone] = useState(false)
  const copy = freshnessCopy(gate, ageDays, lastLabel, de)
  if (!copy) return null

  // Amber for the actionable stale case (caution-with-action, the app's
  // established sync tone), calm slate for the self-resolving morning wait —
  // the colour itself tells the athlete whether this is theirs to fix.
  const accent = gate === 'stale' ? '#FFB020' : '#8FA0B4'
  const Icon = gate === 'stale' ? WifiOff : Moon

  return (
    <div
      className="flex items-start gap-3 rounded-[14px] px-3.5 py-3"
      style={{
        background: `color-mix(in srgb, ${accent} 9%, #14181DCC)`,
        border: `1px solid color-mix(in srgb, ${accent} 30%, transparent)`,
        backdropFilter: 'blur(10px)',
      }}
    >
      <Icon size={16} strokeWidth={1.9} style={{ color: accent, flexShrink: 0, marginTop: 1 }} />
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <span style={{ fontSize: 12.5, fontWeight: 800, color: accent, letterSpacing: '0.01em' }}>{copy.title}</span>
        <p style={{ fontSize: 12.5, fontWeight: 500, color: '#FFFFFFB3', lineHeight: 1.45 }}>{copy.body}</p>
        {copy.action && (
          <button
            type="button"
            onClick={() => {
              sync.mutate(undefined, { onSuccess: () => setDone(true) })
            }}
            disabled={sync.isPending || done}
            className="inline-flex items-center gap-1.5 rounded-full self-start mt-1"
            style={{
              padding: '6px 12px',
              background: done ? '#16E08A1F' : `color-mix(in srgb, ${accent} 16%, transparent)`,
              border: `1px solid color-mix(in srgb, ${done ? '#16E08A' : accent} 45%, transparent)`,
              color: done ? '#16E08A' : accent,
              opacity: sync.isPending ? 0.6 : 1,
            }}
          >
            {done ? <Check size={13} /> : <RefreshCw size={13} className={sync.isPending ? 'animate-spin' : undefined} />}
            <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.02em' }}>
              {done
                ? (de ? 'Synchronisiert' : 'Synced')
                : sync.isPending
                  ? (de ? 'Synchronisiere…' : 'Syncing…')
                  : (de ? 'Jetzt synchronisieren' : 'Sync now')}
            </span>
          </button>
        )}
        {sync.isError && (
          <span style={{ fontSize: 11.5, fontWeight: 600, color: '#FFC080' }}>
            {de ? 'Synchronisierung fehlgeschlagen — später erneut versuchen.' : 'Sync failed — try again shortly.'}
          </span>
        )}
      </div>
    </div>
  )
}
