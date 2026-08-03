import { Flame } from 'lucide-react'
import type { RehearsalBattery, RehearsalMatches, RehearsalTrainingEffect } from '../../api/rehearsal'
import { glassCardStyle, GLASS_CARD_MARKER } from '../dashboard/glassCard'
import { eyebrow, surface } from '../dashboard/surfaces'

const MATCH_SLOTS = 5

/**
 * CostCard — what this route takes out of you, and what you get for it.
 *
 * Two different currencies, deliberately in one card because a rider spends
 * them together:
 *
 *  • THE BATTERY — readiness now, and the readiness this ride would leave
 *    behind. Absent when today's readiness is unknown: forecasting a finish
 *    state from an unknown start is the exact failure the app's readiness gate
 *    exists to prevent, and a battery drawn from nothing would be the most
 *    confident-looking lie on the page.
 *  • THE MATCHES — discrete W′ drawdowns the route has room for. This is the
 *    only genuinely actionable pre-ride number here: not "ride at 245 W" but
 *    "you get two hard efforts, spend them on the right climb".
 *
 * Everything on this card is labelled an estimate, because everything on it is
 * a model on top of a model.
 */
export default function CostCard({
  battery,
  matches,
  trainingEffect,
  de,
}: {
  battery?: RehearsalBattery | null
  matches?: RehearsalMatches | null
  trainingEffect?: RehearsalTrainingEffect | null
  de: boolean
}) {
  if (!battery && !matches && !trainingEffect) return null

  return (
    <section
      {...GLASS_CARD_MARKER}
      style={{ ...glassCardStyle, borderRadius: 20, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span
          className="eyebrow"
          style={eyebrow('var(--color-amber)')}
        >
          {de ? 'WAS ES DICH KOSTET' : 'WHAT IT COSTS YOU'}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--color-muted)' }}>
          {de ? 'Schätzung' : 'estimate'}
        </span>
      </div>

      {battery ? (
        <>
          {/* Three quantities in one bar, because a single fill between the
              labels "82%" and "18%" is genuinely ambiguous — it could be read
              as what is left or as what is spent. Green is what survives the
              ride, amber is what the ride burns, and the empty remainder is
              what was already gone before the rider set off. */}
          <div
            style={{
              position: 'relative',
              display: 'flex',
              height: 14,
              borderRadius: 999,
              overflow: 'hidden',
              background: 'var(--color-surface-2)',
            }}
          >
            <div
              style={{
                width: `${Math.max(0, Math.min(100, battery.finish_pct))}%`,
                background: 'var(--color-recovery)',
                transition: 'width 700ms cubic-bezier(.22,1,.36,1)',
              }}
            />
            <div
              style={{
                width: `${Math.max(0, Math.min(100, battery.cost_pct))}%`,
                background: 'linear-gradient(90deg, var(--color-amber), var(--color-accent))',
                transition: 'width 700ms cubic-bezier(.22,1,.36,1)',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 10.5, color: 'var(--color-muted)' }}>
            <Key color="var(--color-recovery)" text={de ? 'bleibt' : 'left after'} />
            <Key color="var(--color-amber)" text={de ? `diese Fahrt kostet ${Math.round(battery.cost_pct)} %` : `this ride costs ${Math.round(battery.cost_pct)}%`} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <Figure
              label={de ? 'DU STARTEST MIT' : 'YOU START AT'}
              value={`${Math.round(battery.start_pct)}%`}
              tone="var(--color-recovery)"
            />
            <Figure
              label={de ? 'DU KOMMST AN MIT' : "YOU'LL FINISH AT"}
              value={`≈ ${Math.round(battery.finish_pct)}%`}
              tone="var(--color-amber)"
              right
            />
          </div>
        </>
      ) : (
        // Honest gap rather than a drawn-from-nothing battery.
        <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--color-ink-2)', margin: 0 }}>
          {de
            ? 'Für die Akku-Prognose fehlt deine heutige Bereitschaft — ohne sie wüssten wir nicht, womit du startest.'
            : "The battery forecast needs today's readiness — without it we do not know what you are starting from."}
        </p>
      )}

      {trainingEffect && (
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
      )}

      {matches && (
        <>
          <div style={{ height: 1, background: 'var(--color-rule)' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span
                className="eyebrow"
                style={eyebrow('var(--color-accent)')}
              >
                {de ? 'STREICHHÖLZER' : 'MATCHES TO BURN'}
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--color-ink-2)' }}>
                {matches.count === 0
                  ? de
                    ? 'Keins — diese Strecke hat keine harte Attacke übrig.'
                    : 'None — this route has no hard effort to spare.'
                  : de
                    ? `${matches.count} harte Antritte drin. Setz sie am Schlüsselanstieg ein.`
                    : `${matches.count} hard efforts in the tank. Spend them on the key climb.`}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 3, flex: '0 0 auto' }}>
              {Array.from({ length: MATCH_SLOTS }, (_, i) => (
                <Flame
                  key={i}
                  size={17}
                  strokeWidth={2}
                  style={{
                    color: i < matches.count ? 'var(--color-accent)' : 'var(--color-rule)',
                    fill: i < matches.count ? 'var(--color-accent)' : 'transparent',
                    opacity: i < matches.count ? 1 : 0.6,
                  }}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  )
}

/** Firstbeat's own wording for the TE scale, which riders already recognise. */
function teWord(v: number, de: boolean): string {
  if (v < 1) return de ? 'ohne Wirkung' : 'no effect'
  if (v < 2) return de ? 'geringe Wirkung' : 'minor'
  if (v < 3) return de ? 'erhaltend' : 'maintaining'
  if (v < 4) return de ? 'verbessernd' : 'improving'
  if (v < 5) return de ? 'stark verbessernd' : 'highly improving'
  return de ? 'überlastend' : 'overreaching'
}

function Key({ color, text }: { color: string; text: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
      {text}
    </span>
  )
}

function Figure({
  label,
  value,
  tone,
  right,
}: {
  label: string
  value: string
  tone: string
  right?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: right ? 'flex-end' : 'flex-start' }}>
      <span style={{ fontSize: 10, letterSpacing: '0.12em', fontWeight: 800, color: 'var(--color-muted)' }}>
        {label}
      </span>
      <span className="num-display" style={{ fontSize: 19, fontWeight: 800, color: tone }}>
        {value}
      </span>
    </div>
  )
}

function Tile({ v, l, s }: { v: string; l: string; s: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        alignItems: 'center',
        padding: '8px 4px',
        ...surface('recessed'),
      }}
    >
      <span className="num-display" style={{ fontSize: 19, fontWeight: 800, color: 'var(--color-ink)' }}>
        {v}
      </span>
      <span style={eyebrow('var(--color-muted)')}>
        {l}
      </span>
      <span style={{ fontSize: 10.5, color: 'var(--color-ink-2)', textAlign: 'center' }}>{s}</span>
    </div>
  )
}
