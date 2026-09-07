import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Flame, Pause } from 'lucide-react'
import { T, FONT, DASH } from './w3tokens'
import { useStreak } from '../../hooks/useStreak'
import { setAthleteStatus, type AthleteState } from '../../api/athletes'

/**
 * W3 · THE STREAK CHIP — and the pause switch behind it.
 *
 * The forgiving streak was built end-to-end (services/streak.py: sick /
 * injured / break days PAUSE, planned rest days COUNT, only a skipped session
 * breaks) — and the one control that sets the status lived on the retired
 * legacy dashboard. So on the live app the most-loved mechanic of the
 * category's emotional benchmark was unreachable: a rider who got ill could
 * only watch the flame die.
 *
 * The chip is the door. Tap the flame → a sheet that states the streak's
 * rules in one sentence and offers the four honest states. `healthy` clears.
 * While paused the flame becomes a pause mark, because a fire that is
 * officially not burning must not pretend to.
 */

const STATES: { key: AthleteState; label: string; sub: string }[] = [
  { key: 'healthy', label: 'Gesund', sub: 'Die Serie läuft normal weiter' },
  { key: 'sick', label: 'Krank', sub: 'Pausiert — zählt nicht, reißt nicht' },
  { key: 'injured', label: 'Verletzt', sub: 'Pausiert, bis du zurück bist' },
  { key: 'break', label: 'Bewusste Pause', sub: 'Urlaub, Leben — die Serie wartet' },
]

export default function W3StreakChip() {
  const qc = useQueryClient()
  const { data: streak } = useStreak()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<AthleteState | null>(null)
  const paused = streak?.paused ?? false
  const current: AthleteState = streak?.status?.state ?? 'healthy'

  const pick = async (state: AthleteState) => {
    if (busy) return
    setBusy(state)
    try {
      await setAthleteStatus(state)
      await qc.invalidateQueries({ queryKey: ['athlete', 'streak'] })
      setOpen(false)
    } finally { setBusy(null) }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Serie und Status"
        style={{
          display: 'flex', alignItems: 'center', gap: 7, height: 40, padding: '0 14px',
          borderRadius: 100, border: 0, cursor: 'pointer', background: T.heroChip, fontFamily: FONT,
        }}>
        {paused
          ? <Pause size={18} color={T.quiet} />
          : <Flame size={20} color={T.acid} />}
        <span style={{ fontSize: 15, fontWeight: 700, color: T.ink, fontVariantNumeric: 'tabular-nums' }}>
          {streak?.streak != null ? String(streak.streak) : DASH}
        </span>
      </button>

      {open && createPortal(
        <div role="dialog" aria-label="Serien-Status" onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 90, background: `${T.bg}CC`, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', background: T.surface, borderRadius: '24px 24px 0 0',
              padding: '22px 20px calc(20px + env(safe-area-inset-bottom))',
              display: 'flex', flexDirection: 'column', gap: 14, fontFamily: FONT,
            }}>
            <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5, color: T.ink }}>
              {streak?.streak != null && streak.streak > 0
                ? `${streak.streak} Tage in Folge`
                : 'Deine Serie'}
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: T.quiet, lineHeight: 1.45 }}>
              Trainierte Tage und geplante Ruhetage zählen. Krank, verletzt oder bewusst Pause?
              Sag es dem Coach — die Serie pausiert, statt zu reißen.
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {STATES.map((s) => {
                const on = current === s.key
                return (
                  <button key={s.key} type="button" disabled={busy != null}
                    onClick={() => void pick(s.key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px',
                      borderRadius: 16, border: 0, cursor: 'pointer', textAlign: 'left', fontFamily: FONT,
                      background: on ? T.acidDim : T.surface2, opacity: busy && busy !== s.key ? 0.6 : 1,
                    }}>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: on ? T.acid : T.ink }}>
                        {busy === s.key ? 'Speichere…' : s.label}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: T.quiet }}>{s.sub}</span>
                    </div>
                    <div style={{
                      flex: 'none', width: 18, height: 18, borderRadius: 100,
                      border: `2px solid ${on ? T.acid : T.d3}`,
                      background: on ? T.acid : 'transparent',
                    }} />
                  </button>
                )
              })}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
