import { Droplet } from 'lucide-react'
import type { RehearsalFuel } from '../../api/rehearsal'
import { formatDecimal } from './rehearsalMath'
import { glassCardStyle, GLASS_CARD_MARKER } from '../dashboard/glassCard'
import { eyebrow, surface } from '../dashboard/surfaces'

/**
 * FuelPlanCard — what to eat and drink to ride this well.
 *
 * The framing rule here is absolute, and it is a product decision as much as a
 * scientific one: this card talks about ADEQUACY and never about weight, a
 * deficit, or calories as a budget to be balanced. Around 80% of competitively
 * trained male endurance athletes carry some low-energy-availability risk with
 * cyclists worst affected, and a fuelling feature that opens with a deficit
 * makes that population measurably worse off. The ORDER of the framing is the
 * mechanism of harm, so the order is fixed: carbohydrate per hour first,
 * bottles second, the size of the ride last and only as context.
 *
 * The carbohydrate target is a BAND, not a number. Gut tolerance is the real
 * limiter and it is trainable and highly individual; a single figure would be
 * wrong for almost everyone and would read as a prescription rather than a
 * range to find yourself within.
 */
export default function FuelPlanCard({ fuel, de }: { fuel?: RehearsalFuel | null; de: boolean }) {
  if (!fuel) return null

  const hot = fuel.temperature_c != null && fuel.temperature_c >= 24

  return (
    <section
      {...GLASS_CARD_MARKER}
      style={{ ...glassCardStyle, borderRadius: 20, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span
          className="eyebrow"
          style={eyebrow('var(--color-zone-3)')}
        >
          {de ? 'DEN MOTOR FÜTTERN' : 'FUEL THE ENGINE'}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--color-muted)' }}>
          {de ? 'Schätzung' : 'estimate'}
        </span>
      </div>

      {/* Carbohydrate first, deliberately: it is the number that decides
          whether the last hour goes well. */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span
          className="num-display"
          style={{ fontSize: 30, fontWeight: 800, color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' }}
        >
          {Math.round(fuel.carbs_g_per_hour_low)}–{Math.round(fuel.carbs_g_per_hour_high)}
        </span>
        <span style={{ fontSize: 14, fontWeight: 650, color: 'var(--color-ink-2)' }}>
          {de ? 'g Kohlenhydrate/h' : 'g carbs/hour'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <Tile
          v={`${fuel.bottles}`}
          l={de ? 'FLASCHEN' : 'BOTTLES'}
          s={`≈ ${formatDecimal(fuel.fluid_l, de)} l`}
        />
        <Tile
          v={`${Math.round(fuel.carbs_g_total)} g`}
          l={de ? 'GESAMT KH' : 'TOTAL CARBS'}
          s={de ? 'über die Fahrt' : 'across the ride'}
        />
        <Tile
          v={`${Math.round(fuel.energy_kcal).toLocaleString(de ? 'de-DE' : 'en-US')}`}
          l={de ? 'GRÖSSE' : 'RIDE SIZE'}
          s="kcal"
        />
      </div>

      <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--color-muted)', margin: 0 }}>
        {de
          ? 'Fang in der ersten Stunde an, nicht wenn es weh tut. Die Spanne ist eine Spanne, weil dein Magen der Begrenzer ist — und der ist trainierbar.'
          : 'Start in hour one, not when it starts to hurt. The range is a range because your gut is the limiter — and the gut is trainable.'}
      </p>

      {hot && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 10px',
            borderRadius: 12,
            background: 'color-mix(in srgb, var(--color-amber) 12%, transparent)',
          }}
        >
          <Droplet size={14} strokeWidth={2.2} style={{ color: 'var(--color-amber)', flex: '0 0 auto' }} />
          <span style={{ fontSize: 12, color: 'var(--color-ink-2)', lineHeight: 1.45 }}>
            {de
              ? `${Math.round(fuel.temperature_c ?? 0)} °C erwartet — rechne mit rund ${formatDecimal(fuel.sweat_l_per_hour, de)} l Schweiß pro Stunde und plan eine Nachfüllstelle ein.`
              : `${Math.round(fuel.temperature_c ?? 0)} °C expected — plan for about ${formatDecimal(fuel.sweat_l_per_hour, de)} l of sweat an hour and a refill stop.`}
          </span>
        </div>
      )}
    </section>
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
      <span style={{ fontSize: 10.5, color: 'var(--color-ink-2)' }}>{s}</span>
    </div>
  )
}
