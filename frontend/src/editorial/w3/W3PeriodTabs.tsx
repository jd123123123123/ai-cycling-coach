import { T, FONT } from './w3tokens'
import { W3_PERIODS, type W3Period } from './w3crew'

/**
 * The Week / Month / Season control shared by the crew board and the crew
 * member detail. It drives `GET /crews/me/standings?period=…` (season → `year`)
 * — one control, and every number on the screen follows it.
 *
 * Neutral by design: the acid on these screens is spent on the one headline
 * number, so the selected tab reads as a raised surface, not a second shout.
 */
export default function W3PeriodTabs({ value, onChange }: { value: W3Period; onChange: (p: W3Period) => void }) {
  return (
    <div role="tablist" aria-label="Period" style={{ display: 'flex', gap: 6, padding: 4, borderRadius: 100, background: T.surface, width: '100%' }}>
      {W3_PERIODS.map(({ key, label }) => {
        const on = key === value
        return (
          <button key={key} role="tab" aria-selected={on} onClick={() => onChange(key)}
            style={{
              flex: 1, minWidth: 0, height: 36, borderRadius: 100, border: 0, cursor: 'pointer', fontFamily: FONT,
              fontSize: 10, fontWeight: 700, letterSpacing: 1, whiteSpace: 'nowrap',
              background: on ? T.surface2 : 'transparent', color: on ? T.ink : T.quiet,
              boxShadow: on ? `inset 0 0 0 1px ${T.stroke}` : 'none',
            }}>
            {label}
          </button>
        )
      })}
    </div>
  )
}
