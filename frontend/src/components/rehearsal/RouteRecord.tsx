import { Trophy } from 'lucide-react'
import type { RehearsalHistory, RehearsalPr } from '../../api/rehearsal'
import { formatHm } from './rehearsalMath'
import { glassCardStyle, GLASS_CARD_MARKER } from '../dashboard/glassCard'

/**
 * RouteRecord — you, against this route, before.
 *
 * The only card on this page made of measurements rather than claims. That is
 * exactly why it is worth its space: a forecast of 3:24 means something
 * different sitting next to "you rode 3:36 here in March" than it does alone.
 *
 * The PR line is derived from the SAME uncertainty band the verdict shows. If
 * the page said "3:12 – 3:36" and separately claimed an 83% chance of beating
 * 3:20 from some other model, those two claims could contradict each other in
 * front of the rider. Computing the second from the first makes that
 * impossible by construction.
 *
 * With one past ride the attempts are listed but no direction of travel is
 * claimed. Two points are not a trend, and drawing one would be the kind of
 * confident-looking overreach this page exists to avoid.
 */
export default function RouteRecord({
  history,
  pr,
  forecastS,
  de,
}: {
  history?: RehearsalHistory | null
  pr?: RehearsalPr | null
  forecastS?: number | null
  de: boolean
}) {
  if (!history || history.attempts.length === 0) return null

  const faster = history.forecast_vs_best_s != null && history.forecast_vs_best_s < 0
  const deltaMin =
    history.forecast_vs_best_s != null
      ? Math.round(Math.abs(history.forecast_vs_best_s) / 60)
      : null

  // Newest first from the API; oldest first reads better as a timeline.
  const timeline = [...history.attempts].reverse()

  return (
    <section
      {...GLASS_CARD_MARKER}
      style={{ ...glassCardStyle, borderRadius: 20, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span
          className="eyebrow"
          style={{ fontSize: 11, letterSpacing: '0.16em', fontWeight: 800, color: 'var(--color-ink-2)' }}
        >
          {de ? 'DU GEGEN DIESE STRECKE' : 'YOU vs THIS ROUTE'}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--color-muted)' }}>
          {de
            ? `${history.count} ${history.count === 1 ? 'Fahrt' : 'Fahrten'}`
            : `${history.count} ${history.count === 1 ? 'ride' : 'rides'}`}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        {timeline.map((a) => (
          <Cell
            key={a.activity_id}
            label={monthLabel(a.date, de)}
            value={formatHm(a.duration_s)}
            sub={a.duration_s === history.best_s ? (de ? 'Bestzeit' : 'best') : undefined}
          />
        ))}
        {forecastS != null && (
          <Cell
            label={de ? 'HEUTE' : 'TODAY'}
            value={formatHm(forecastS)}
            sub={de ? 'Prognose' : 'forecast'}
            highlight
          />
        )}
      </div>

      <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--color-ink-2)', margin: 0 }}>
        {!history.trend_is_meaningful
          ? de
            ? 'Eine Fahrt auf dieser Strecke bisher — zu wenig, um daraus eine Richtung zu lesen.'
            : 'One ride here so far — too few to read a direction of travel from.'
          : deltaMin == null
            ? de
              ? 'Deine bisherigen Zeiten auf dieser Runde.'
              : 'Your times on this loop so far.'
            : faster
              ? de
                ? `Rund ${deltaMin} Minuten schneller als deine Bestzeit hier.`
                : `About ${deltaMin} minutes quicker than your best here.`
              : de
                ? `Rund ${deltaMin} Minuten langsamer als deine Bestzeit — heute ist nicht der Tag dafür.`
                : `About ${deltaMin} minutes slower than your best — today is not the day for it.`}
      </p>

      {pr && (
        <>
          <div style={{ height: 1, background: 'var(--color-rule)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 999,
                flex: '0 0 auto',
                display: 'grid',
                placeItems: 'center',
                background: 'color-mix(in srgb, var(--color-gold) 18%, transparent)',
              }}
            >
              <Trophy size={17} strokeWidth={2.2} style={{ color: 'var(--color-gold)' }} />
            </span>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 13.5, fontWeight: 620, color: 'var(--color-ink)' }}>
                {prHeadline(pr.probability, de)}
              </span>
              <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                {de
                  ? `${Math.round(pr.probability * 100)} % Chance auf ${formatHm(pr.pr_s)} — aus der Spanne oben gerechnet.`
                  : `${Math.round(pr.probability * 100)}% chance of ${formatHm(pr.pr_s)} — read from the range above.`}
              </span>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function prHeadline(p: number, de: boolean): string {
  if (p >= 0.7) return de ? 'Bestzeit in Reichweite' : 'PR within reach'
  if (p >= 0.35) return de ? 'Bestzeit ist möglich' : 'A PR is on the table'
  return de ? 'Heute eher keine Bestzeit' : 'Not a PR day, most likely'
}

function monthLabel(iso: string, de: boolean): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(de ? 'de-DE' : 'en-US', { month: 'short' }).toUpperCase()
}

function Cell({
  label,
  value,
  sub,
  highlight,
}: {
  label: string
  value: string
  sub?: string
  highlight?: boolean
}) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        alignItems: 'center',
        padding: '9px 4px',
        borderRadius: 12,
        background: highlight ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)' : 'var(--color-surface-2)',
        border: highlight ? '1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)' : '1px solid transparent',
      }}
    >
      <span style={{ fontSize: 9.5, letterSpacing: '0.1em', fontWeight: 800, color: 'var(--color-muted)' }}>
        {label}
      </span>
      <span
        className="num-display"
        style={{
          fontSize: 20,
          fontWeight: 800,
          color: highlight ? 'var(--color-accent)' : 'var(--color-ink)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
      {sub && <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{sub}</span>}
    </div>
  )
}
