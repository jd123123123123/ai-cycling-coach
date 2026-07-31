import { useState } from 'react'
import type { Assumptions, RiderOverrides, Surface } from '../../api/rehearsal'
import { SegmentedTabs } from '../ui/SegmentedTabs'
import { glassCardStyle, GLASS_CARD_MARKER } from '../dashboard/glassCard'

/**
 * RiderKnobs — the four questions that are NOT "how will you ride it?".
 *
 * `AssumptionsRow` answers how the ride is paced: shelter, ambition, weather.
 * These answer who is riding, on what, and on which morning — and they are
 * kept in their own card for the same reason the assumptions sit at the
 * bottom of the page. They are what an athlete reaches for on the SECOND
 * pass, once the verdict has raised a question ("what if I were lighter?",
 * "what if I start at six?"), and putting them first would turn the page into
 * a form to fill in before the app will say anything.
 *
 * Every control has an explicit "as I am" position rather than a default that
 * quietly asserts something. An untouched weight field means "use my profile
 * weight", not 0 kg and not 75 kg — the same rule the backend encodes with
 * nullable overrides.
 *
 * The numeric fields commit on blur, never per keystroke: each change re-runs
 * a full Monte Carlo simulation on the server, and firing one per digit typed
 * would queue five simulations to display the fifth.
 */

const HOURS = [null, 6, 8, 10, 13, 16] as const

export default function RiderKnobs({
  assumptions,
  onChange,
  disabled,
  canProject,
  de,
}: {
  assumptions: Assumptions
  onChange: (patch: RiderOverrides) => void
  disabled?: boolean
  /** False when the route has no date to project fitness TO. */
  canProject: boolean
  de: boolean
}) {
  const surfaceTabs: readonly { id: Surface; label: string }[] = [
    { id: 'asphalt', label: de ? 'Asphalt' : 'Asphalt' },
    { id: 'rough', label: de ? 'Rau' : 'Rough' },
    { id: 'gravel', label: de ? 'Schotter' : 'Gravel' },
  ]

  return (
    <section
      {...GLASS_CARD_MARKER}
      style={{ ...glassCardStyle, borderRadius: 20, padding: 14, display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <span
        className="eyebrow"
        style={{ fontSize: 11, letterSpacing: '0.18em', fontWeight: 700, color: 'var(--color-ink-2)' }}
      >
        {de ? 'DU, DAS RAD, DER TAG' : 'YOU, THE BIKE, THE DAY'}
      </span>

      <TargetTimeField
        value={assumptions.target_time_s ?? null}
        onCommit={(v) => onChange({ target_time_s: v })}
        disabled={disabled}
        de={de}
      />

      <div style={{ display: 'flex', gap: 12 }}>
        <NumberField
          label={de ? 'Dein Gewicht' : 'Your weight'}
          unit="kg"
          value={assumptions.weight_kg ?? null}
          placeholder={de ? 'Profil' : 'Profile'}
          min={30}
          max={200}
          step={0.5}
          onCommit={(v) => onChange({ weight_kg: v })}
          disabled={disabled}
        />
        <NumberField
          label={de ? 'Radgewicht' : 'Bike weight'}
          unit="kg"
          value={assumptions.bike_mass_kg ?? null}
          placeholder="8,5"
          min={4}
          max={30}
          step={0.1}
          onCommit={(v) => onChange({ bike_mass_kg: v })}
          disabled={disabled}
        />
      </div>

      <Field label={de ? 'Untergrund' : 'Surface'}>
        <SegmentedTabs<Surface>
          tabs={surfaceTabs}
          value={assumptions.surface ?? 'asphalt'}
          onChange={(id) => onChange({ surface: id })}
          ariaLabel={de ? 'Untergrund' : 'Surface'}
          indicatorId="rehearsal-surface"
          disabled={disabled}
        />
      </Field>

      <Field
        label={de ? 'Startzeit' : 'Start time'}
        hint={
          de
            ? 'Wind und Temperatur ändern sich über den Tag.'
            : 'Wind and temperature change through the day.'
        }
      >
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {HOURS.map((h) => {
            const active = (assumptions.start_hour ?? null) === h
            return (
              <button
                key={String(h)}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ start_hour: h })}
                aria-pressed={active}
                style={{
                  padding: '6px 11px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 650,
                  border: '1px solid var(--color-rule)',
                  background: active ? 'var(--color-ink)' : 'var(--color-surface-2)',
                  color: active ? 'var(--color-surface)' : 'var(--color-ink-2)',
                  opacity: disabled ? 0.5 : 1,
                }}
              >
                {h == null ? (de ? 'Tagsüber' : 'Daytime') : `${h}:00`}
              </button>
            )
          })}
        </div>
      </Field>

      {/* Only offered when there is a date to project TO. Rendering a dead
          toggle would imply the app could answer a question it cannot. */}
      {canProject && (
        <Toggle
          label={de ? 'Mit meiner Form am Renntag' : 'With my fitness on race day'}
          hint={
            de
              ? 'Rechnet mit der projizierten CP für das Datum statt mit der von heute.'
              : "Simulates the projected CP for that date instead of today's."
          }
          checked={!!assumptions.use_projected_cp}
          onChange={(v) => onChange({ use_projected_cp: v })}
          disabled={disabled}
        />
      )}
    </section>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 13.5, fontWeight: 560, color: 'var(--color-ink)' }}>{label}</span>
      {hint && <span style={{ fontSize: 11.5, color: 'var(--color-muted)' }}>{hint}</span>}
      {children}
    </div>
  )
}

/**
 * A number that may legitimately be absent. The placeholder carries the
 * fallback ("Profil", "8,5"), so an empty box reads as "use what you know
 * about me" rather than as a missing answer.
 */
function NumberField({
  label,
  unit,
  value,
  placeholder,
  min,
  max,
  step,
  onCommit,
  disabled,
}: {
  label: string
  unit: string
  value: number | null
  placeholder: string
  min: number
  max: number
  step: number
  onCommit: (v: number | null) => void
  disabled?: boolean
}) {
  const [text, setText] = useState(value == null ? '' : String(value))
  // Re-sync when the SERVER answers with a different value than was typed —
  // including when it clamps or rejects one. Adjusted during render (React's
  // documented pattern for derived state) rather than in an effect, which
  // would render the stale text once before correcting it.
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setText(value == null ? '' : String(value))
  }

  const commit = () => {
    const trimmed = text.trim().replace(',', '.')
    if (trimmed === '') {
      onCommit(null)
      return
    }
    const n = Number(trimmed)
    // Out of range is left for the server to refuse with a reason; NaN is
    // simply not a number and reverts rather than sending nonsense.
    if (!Number.isFinite(n)) {
      setText(value == null ? '' : String(value))
      return
    }
    onCommit(n)
  }

  return (
    <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 13.5, fontWeight: 560, color: 'var(--color-ink)' }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="number"
          inputMode="decimal"
          value={text}
          placeholder={placeholder}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          style={{
            width: '100%',
            padding: '8px 10px',
            borderRadius: 12,
            border: '1px solid var(--color-rule)',
            background: 'var(--color-surface-2)',
            color: 'var(--color-ink)',
            fontSize: 15,
            fontWeight: 600,
          }}
        />
        <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>{unit}</span>
      </span>
    </label>
  )
}

/** Target finish time, entered the way people say it: 4:45, not 17100. */
function TargetTimeField({
  value,
  onCommit,
  disabled,
  de,
}: {
  value: number | null
  onCommit: (v: number | null) => void
  disabled?: boolean
  de: boolean
}) {
  const asText = (s: number | null) => {
    if (s == null) return ''
    const h = Math.floor(s / 3600)
    const m = Math.round((s - h * 3600) / 60)
    return `${h}:${String(m).padStart(2, '0')}`
  }
  const [text, setText] = useState(asText(value))
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setText(asText(value))
  }

  const commit = () => {
    const trimmed = text.trim()
    if (trimmed === '') {
      onCommit(null)
      return
    }
    // "4:45" and "4.45" and "4h45" all mean the same thing to a rider.
    const m = trimmed.match(/^(\d{1,2})\s*[:.h]\s*(\d{1,2})$/)
    if (m) {
      const seconds = Number(m[1]) * 3600 + Number(m[2]) * 60
      onCommit(seconds)
      return
    }
    // A bare number is hours.
    const hours = Number(trimmed.replace(',', '.'))
    if (Number.isFinite(hours) && hours > 0) {
      onCommit(Math.round(hours * 3600))
      return
    }
    setText(asText(value))
  }

  return (
    <Field
      label={de ? 'Zielzeit' : 'Target time'}
      hint={
        de
          ? 'Sag eine Zeit, und wir rechnen rückwärts, was sie verlangt.'
          : "Name a time and we solve backwards for what it demands."
      }
    >
      <input
        type="text"
        inputMode="numeric"
        value={text}
        placeholder={de ? 'z. B. 4:45' : 'e.g. 4:45'}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        aria-label={de ? 'Zielzeit' : 'Target time'}
        style={{
          padding: '8px 10px',
          borderRadius: 12,
          border: '1px solid var(--color-rule)',
          background: 'var(--color-surface-2)',
          color: 'var(--color-ink)',
          fontSize: 15,
          fontWeight: 600,
        }}
      />
    </Field>
  )
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        textAlign: 'left',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 13.5, fontWeight: 560, color: 'var(--color-ink)' }}>{label}</span>
        {hint && <span style={{ fontSize: 11.5, color: 'var(--color-muted)' }}>{hint}</span>}
      </span>
      <span
        style={{
          width: 42,
          height: 25,
          borderRadius: 999,
          flex: '0 0 auto',
          background: checked ? 'var(--color-accent)' : 'var(--color-surface-2)',
          border: '1px solid var(--color-rule)',
          position: 'relative',
          transition: 'background 160ms ease',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 19 : 2,
            width: 19,
            height: 19,
            borderRadius: 999,
            background: '#fff',
            transition: 'left 160ms ease',
          }}
        />
      </span>
    </button>
  )
}
