import { useLocale } from '../../contexts/LocaleContext'
import type { RehearsalTrainingEffect } from '../../api/rehearsal'
import { penCard, penEyebrow } from './penCard'

/**
 * TrainingEffectCard — the forecast in the units the athlete's watch will use.
 *
 * Aerobic and anaerobic Training Effect and a recovery window are Garmin's
 * vocabulary, not this app's. Predicting them is the point: after the ride the
 * head unit is going to state its own numbers, and an athlete who has already
 * seen "3.0 aerobic, 23-39 h" from the forecast can tell whether the day went
 * as planned. Without it the two systems just disagree silently.
 *
 * It used to render inside the cost card. Same three tiles, but buried under
 * a heading about W' and battery, so the one block written in the athlete's
 * OTHER app's language read as a footnote to this one's.
 *
 * `is_estimate` is not decoration — these are modelled from the simulated
 * ride, not measured, and the card says so rather than borrowing the
 * authority of the watch it is predicting.
 */

/** Garmin's own bands, so the words match what the watch will say. */
function teWord(v: number, de: boolean): string {
  if (v < 1) return de ? 'ohne Wirkung' : 'no effect'
  if (v < 2) return de ? 'geringe Wirkung' : 'minor benefit'
  if (v < 3) return de ? 'erhaltend' : 'maintaining'
  if (v < 4) return de ? 'verbessernd' : 'improving'
  if (v < 5) return de ? 'stark verbessernd' : 'highly improving'
  return de ? 'überlastend' : 'overreaching'
}

function Tile({ v, l, s }: { v: string; l: string; s: string }) {
  return (
    <div
      className="flex flex-col items-center rounded-[14px]"
      style={{ flex: 1, padding: '10px 6px', background: 'var(--color-surface-2)', gap: 2 }}
    >
      <span className="num-display" style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-ink)' }}>
        {v}
      </span>
      <span
        className="eyebrow"
        style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--color-muted)' }}
      >
        {l}
      </span>
      <span style={{ fontSize: 10.5, color: 'var(--color-ink-2)', textAlign: 'center' }}>{s}</span>
    </div>
  )
}

export default function TrainingEffectCard({
  trainingEffect,
}: {
  trainingEffect?: RehearsalTrainingEffect | null
}) {
  const { locale } = useLocale()
  const de = locale === 'de'

  // No modelled effect, no card. A Training Effect placeholder would be a
  // prediction about the athlete's watch that nothing computed.
  if (!trainingEffect) return null

  return (
    <section
      className="rounded-[20px] flex flex-col"
      style={{ ...penCard, padding: 16, gap: 12 }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span
          style={penEyebrow('#59C3FF')}
        >
          {de ? 'WAS DEINE UHR SAGEN WIRD' : 'WHAT YOUR GARMIN WILL SAY'}
        </span>
        {trainingEffect.is_estimate && (
          <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
            {de ? 'Schätzung' : 'Estimate'}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <Tile
          v={trainingEffect.aerobic.toFixed(1)}
          l={de ? 'AEROB' : 'AEROBIC'}
          s={teWord(trainingEffect.aerobic, de)}
        />
        <Tile
          v={trainingEffect.anaerobic.toFixed(1)}
          l={de ? 'ANAEROB' : 'ANAEROBIC'}
          s={teWord(trainingEffect.anaerobic, de)}
        />
        <Tile
          v={`${Math.round(trainingEffect.recovery_hours_low)}–${Math.round(trainingEffect.recovery_hours_high)} h`}
          l={de ? 'ERHOLUNG' : 'RECOVERY'}
          s={de ? 'geschätzt' : 'estimated'}
        />
      </div>
    </section>
  )
}
