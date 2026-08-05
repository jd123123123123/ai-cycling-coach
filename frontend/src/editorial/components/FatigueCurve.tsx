import { isPresent } from '../data/value'
import type { TodayModel } from '../data/useTodayModel'

/**
 * The Cost's "Curve" (fpPGi): the pen draws a precise bezier fatigue-decay
 * path with a "NOW · 58" marker and a "NEUTRAL 42" marker. There is no
 * source for that exact curve shape, but its two endpoints ARE real:
 * "now" is `pmc.fatigue` (today's ATL) and "neutral" is `pmc.fitness`
 * (form returns to zero — TSB back to neutral — when ATL decays down to
 * CTL). This renders those two real numbers as a simple two-mark bar
 * rather than inventing the bezier's exact decay shape. The caption uses
 * `recovery.clearAtLabel` (the same already-computed ETA the hero itself
 * uses) when present, and that Value's own reason otherwise.
 */
export default function FatigueCurve({ pmc, recovery }: { pmc: TodayModel['pmc']; recovery: TodayModel['recovery'] }) {
  if (!isPresent(pmc)) {
    return (
      <p style={{ fontFamily: 'var(--e-body)', fontSize: 12, fontWeight: 600, color: 'var(--e-quiet)', margin: '8px 0 0 0' }}>
        {pmc.missing}
      </p>
    )
  }
  const now = pmc.value.fatigue
  const neutral = pmc.value.fitness
  const max = Math.max(now, neutral, 1) * 1.15
  const nowPct = Math.min(100, Math.round((now / max) * 100))
  const neutralPct = Math.min(100, Math.round((neutral / max) * 100))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ position: 'relative', width: '100%', height: 70 }}>
        <div style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: 1, background: 'var(--e-rule)' }} />
        <div style={{ position: 'absolute', left: 0, bottom: 1, width: `${nowPct}%`, height: 6, borderRadius: 3, background: 'var(--st-active)' }} />
        <div style={{ position: 'absolute', left: `${neutralPct}%`, bottom: 1, width: 1, height: 26, background: 'var(--d-2)' }} />
        <span style={{ position: 'absolute', left: 0, top: 0, fontFamily: 'var(--e-body)', fontSize: 8.5, fontWeight: 800, letterSpacing: 0.9, color: 'var(--e-ink)' }}>
          NOW · {Math.round(now)}
        </span>
        <span
          style={{
            position: 'absolute', left: `${neutralPct}%`, top: 32, transform: 'translateX(-100%)', whiteSpace: 'nowrap',
            fontFamily: 'var(--e-body)', fontSize: 8.5, fontWeight: 800, letterSpacing: 0.9, color: 'var(--e-lo)',
          }}
        >
          NEUTRAL {Math.round(neutral)}
        </span>
      </div>
      <span style={{ fontFamily: 'var(--e-body)', fontSize: 10, fontWeight: 700, color: 'var(--e-mid)' }}>
        {isPresent(recovery) ? `Peaks now, then decays — back to neutral around ${recovery.value.clearAtLabel}.` : recovery.missing}
      </span>
    </div>
  )
}
