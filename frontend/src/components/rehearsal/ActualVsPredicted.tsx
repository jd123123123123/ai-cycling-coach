import type { RehearsalActual } from '../../api/rehearsal'
import { formatHm } from './rehearsalMath'
import { glassCardStyle, GLASS_CARD_MARKER } from '../dashboard/glassCard'

/** Inside this the prediction is "on the money" rather than fast or slow.
 *  Claiming a 40-second edge over a five-hour ride is precision the model
 *  does not have. */
const CLOSE_ENOUGH_PCT = 2

/**
 * ActualVsPredicted — the only card on this page that can be checked.
 *
 * Every other number here is a claim about a ride that has not happened. This
 * one sits next to a ride that did, and the design doc was explicit about why
 * it is shown rather than quietly logged: it earns trust when the prediction
 * lands close, and it surfaces model error in front of the athlete when it
 * does not. Hiding the misses would make the hits meaningless.
 *
 * So the copy never spins. A miss is reported as a miss, in the model's voice
 * and not the rider's ("we had you N minutes slower"), because the thing that
 * was wrong is the model — the athlete rode exactly as fast as they rode.
 *
 * The band verdict is deliberately separate from the error. A prediction can
 * be several minutes off and still be honest if the range said so; a
 * prediction can be close and still expose a band that was too narrow. Those
 * are different facts about the model and they are stated separately.
 */
export default function ActualVsPredicted({
  actual,
  de,
}: {
  actual: RehearsalActual
  de: boolean
}) {
  const errMin = Math.round(Math.abs(actual.error_s) / 60)
  const close = Math.abs(actual.error_pct) <= CLOSE_ENOUGH_PCT
  const predictedSlow = actual.error_s > 0

  const tone = close ? 'var(--color-recovery)' : 'var(--color-amber)'

  return (
    <section
      {...GLASS_CARD_MARKER}
      style={{
        ...glassCardStyle,
        borderRadius: 20,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        borderLeft: `3px solid ${tone}`,
      }}
    >
      <span
        className="eyebrow"
        style={{ fontSize: 11, letterSpacing: '0.18em', fontWeight: 700, color: 'var(--color-ink-2)' }}
      >
        {de ? 'VORHERSAGE GEGEN WIRKLICHKEIT' : 'PREDICTION VS REALITY'}
      </span>

      <div style={{ display: 'flex', gap: 22 }}>
        <Figure
          label={de ? 'Gefahren' : 'You rode'}
          value={formatHm(actual.actual_time_s)}
          strong
        />
        <Figure
          label={de ? 'Wir sagten' : 'We said'}
          value={formatHm(actual.predicted_time_s)}
        />
      </div>

      <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--color-ink-2)', margin: 0 }}>
        {close
          ? de
            ? 'Das Modell lag auf dieser Strecke richtig.'
            : 'The model got this route right.'
          : predictedSlow
            ? de
              ? `Wir hatten dich ${errMin} Minuten langsamer eingeschätzt — das Modell hat sich geirrt, nicht du.`
              : `We had you ${errMin} minutes slower — that is the model being wrong, not you.`
            : de
              ? `Wir hatten dich ${errMin} Minuten schneller eingeschätzt. An diesem Tag war das Modell zu optimistisch.`
              : `We had you ${errMin} minutes faster. On this day the model was too optimistic.`}
      </p>

      {actual.inside_band != null && (
        <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
          {actual.inside_band
            ? de
              ? 'Deine Zeit lag in der angegebenen Spanne.'
              : 'Your time landed inside the range we gave.'
            : de
              ? 'Deine Zeit lag außerhalb der Spanne — die war zu eng.'
              : 'Your time landed outside the range — it was too narrow.'}
        </span>
      )}
    </section>
  )
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10.5, letterSpacing: '0.1em', fontWeight: 700, color: 'var(--color-muted)' }}>
        {label.toUpperCase()}
      </span>
      <span
        className="num-display"
        style={{
          fontSize: strong ? 24 : 20,
          fontWeight: strong ? 800 : 650,
          color: strong ? 'var(--color-ink)' : 'var(--color-ink-2)',
        }}
      >
        {value}
      </span>
    </div>
  )
}
