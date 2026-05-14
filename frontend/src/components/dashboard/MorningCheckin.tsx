import { useEffect, useState } from 'react'
import { useT } from '../../contexts/LocaleContext'

// Morning check-in — the single highest-retention interaction in fitness apps.
// Whoop built their daily habit around this exact mechanic: a 3-tap subjective
// wellness entry that takes 2 seconds and creates a ritual. The check-in
// disappears once completed (positive reinforcement) and reappears tomorrow.
//
// Stored in localStorage: {"date": "2024-01-15", "feeling": "great"}
// Future: POST to backend so the AI coach can incorporate it into the brief.

type Feeling = 'great' | 'ok' | 'tired'

const FEELINGS: Array<{ key: Feeling; emoji: string; label: string; color: string; bg: string }> = [
  { key: 'great', emoji: '💪', label: 'Great',  color: 'var(--color-forest-2)', bg: 'rgba(48, 209, 88, 0.10)' },
  { key: 'ok',    emoji: '😐', label: 'OK',     color: 'var(--color-amber)',    bg: 'rgba(255, 159, 10, 0.10)' },
  { key: 'tired', emoji: '😴', label: 'Tired',  color: 'var(--color-alert)',    bg: 'rgba(255, 69, 58, 0.10)' },
]

const STORAGE_KEY = 'morning_checkin'

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function loadTodayFeeling(): Feeling | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { date: string; feeling: Feeling }
    return parsed.date === todayKey() ? parsed.feeling : null
  } catch {
    return null
  }
}

function saveFeeling(feeling: Feeling) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: todayKey(), feeling }))
  } catch {
    // localStorage may be unavailable (private mode, storage quota)
  }
}

export default function MorningCheckin() {
  const t = useT()
  const [feeling, setFeeling] = useState<Feeling | null>(null)
  const [justSelected, setJustSelected] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const saved = loadTodayFeeling()
    if (saved) {
      setFeeling(saved)
      setDismissed(true)
    }
  }, [])

  // Once checked in, hide after a short celebration
  useEffect(() => {
    if (justSelected) {
      const id = setTimeout(() => setDismissed(true), 1800)
      return () => clearTimeout(id)
    }
  }, [justSelected])

  // Already checked in today — don't show
  if (dismissed) return null

  const meta = feeling ? FEELINGS.find((f) => f.key === feeling) : null

  function handleSelect(key: Feeling) {
    saveFeeling(key)
    setFeeling(key)
    setJustSelected(true)
  }

  return (
    <div
      className="paper-grain rounded-[20px] px-5 py-4 sm:px-6 sm:py-5 transition-all"
      style={{
        backgroundColor: justSelected && meta
          ? `color-mix(in srgb, ${meta.color} 6%, var(--color-paper-2))`
          : 'var(--color-paper-2)',
        border: justSelected && meta
          ? `1px solid ${meta.color}44`
          : '1px solid var(--color-rule)',
        transition: 'background-color 600ms ease, border-color 600ms ease',
      }}
    >
      {justSelected && meta ? (
        // Celebration state — shown briefly before dismissing
        <div
          className="flex items-center gap-3"
          style={{ animation: 'score-enter 400ms cubic-bezier(.22,1,.36,1) both' }}
        >
          <span style={{ fontSize: 28 }}>{meta.emoji}</span>
          <div>
            <span className="eyebrow" style={{ color: meta.color, letterSpacing: '0.22em' }}>
              Logged
            </span>
            <p className="text-[15px] font-medium mt-0.5" style={{ color: 'var(--color-ink)' }}>
              {meta.key === 'great'
                ? "Feeling strong. This is the fitness your last hard block earned — cash it in."
                : meta.key === 'ok'
                ? "Steady. The riders who stack steady days are the ones who peak on demand."
                : "Tired is data. One easy day here saves two forced rest days later."}
            </p>
          </div>
        </div>
      ) : (
        // Check-in prompt
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="eyebrow" style={{ color: 'var(--color-muted)', letterSpacing: '0.22em' }}>
              Your body · 2-second check-in
            </span>
            <p className="text-[15px] font-medium mt-1" style={{ color: 'var(--color-ink)' }}>
              {t('morning_checkin_prompt')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {FEELINGS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => handleSelect(f.key)}
                className="flex flex-col items-center gap-1 px-3 py-2.5 rounded-[12px] transition-all"
                style={{
                  backgroundColor: 'var(--color-paper)',
                  border: '1px solid var(--color-rule)',
                  minWidth: 72,
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget
                  el.style.backgroundColor = f.bg
                  el.style.borderColor = f.color + '55'
                  el.style.transform = 'translateY(-1px)'
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget
                  el.style.backgroundColor = 'var(--color-paper)'
                  el.style.borderColor = 'var(--color-rule)'
                  el.style.transform = 'translateY(0)'
                }}
              >
                <span style={{ fontSize: 22, lineHeight: 1 }}>{f.emoji}</span>
                <span
                  className="eyebrow"
                  style={{ color: 'var(--color-muted)', fontSize: 9, letterSpacing: '0.16em' }}
                >
                  {f.label.toUpperCase()}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
