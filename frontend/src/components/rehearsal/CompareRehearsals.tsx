import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listRehearsals, type Rehearsal, type RehearsalListItem } from '../../api/rehearsal'
import { formatHm } from './rehearsalMath'
import { glassCardStyle, GLASS_CARD_MARKER } from '../dashboard/glassCard'

/**
 * CompareRehearsals — this route against another one you have rehearsed.
 *
 * The design doc asked for rehearsals to be "revisitable and comparable" and
 * only the first half was built: rehearsals persisted, but nothing ever put
 * two of them next to each other.
 *
 * What makes the comparison worth showing is that a bare time difference is
 * meaningless across different routes — five hours over 140 km with 4,000 m
 * of climbing is not slower than four hours over 90 km flat. So the headline
 * is the time, but the two figures under it are what actually explain it:
 * how much longer, and how much more climbing.
 *
 * Only rehearsals with a predicted time are offered. One without a prediction
 * has nothing to compare, and listing it would invite a tap that answers
 * nothing.
 */
export default function CompareRehearsals({
  current,
  de,
}: {
  current: Rehearsal
  de: boolean
}) {
  const [otherId, setOtherId] = useState<number | null>(null)

  const { data: all } = useQuery({
    queryKey: ['rehearsals'],
    queryFn: listRehearsals,
    staleTime: 5 * 60 * 1000,
  })

  const options = useMemo(
    () =>
      (all ?? []).filter(
        (r) => r.id !== current.id && r.can_predict && r.total_time_s != null,
      ),
    [all, current.id],
  )

  const other = useMemo(
    () => options.find((o) => o.id === otherId) ?? null,
    [options, otherId],
  )

  // Nothing to compare against yet — say nothing rather than showing an empty
  // control that implies the athlete has done something wrong.
  if (options.length === 0 || current.total_time_s == null) return null

  return (
    <section
      {...GLASS_CARD_MARKER}
      style={{ ...glassCardStyle, borderRadius: 20, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <span
        className="eyebrow"
        style={{ fontSize: 11, letterSpacing: '0.18em', fontWeight: 700, color: 'var(--color-ink-2)' }}
      >
        {de ? 'IM VERGLEICH' : 'SIDE BY SIDE'}
      </span>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {options.slice(0, 6).map((o) => {
          const active = o.id === otherId
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => setOtherId(active ? null : o.id)}
              aria-pressed={active}
              style={{
                padding: '6px 11px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 650,
                maxWidth: 190,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                border: '1px solid var(--color-rule)',
                background: active ? 'var(--color-ink)' : 'var(--color-surface-2)',
                color: active ? 'var(--color-surface)' : 'var(--color-ink-2)',
              }}
            >
              {o.name || (de ? 'Unbenannt' : 'Unnamed')}
            </button>
          )
        })}
      </div>

      {other ? (
        <Comparison current={current} other={other} de={de} />
      ) : (
        <span style={{ fontSize: 12.5, color: 'var(--color-muted)' }}>
          {de
            ? 'Wähl eine andere Probefahrt — wir stellen die Zeiten und das Gelände nebeneinander.'
            : 'Pick another rehearsal — we put the times and the terrain side by side.'}
        </span>
      )}
    </section>
  )
}

function Comparison({
  current,
  other,
  de,
}: {
  current: Rehearsal
  other: RehearsalListItem
  de: boolean
}) {
  const mine = current.total_time_s as number
  const theirs = other.total_time_s as number
  const deltaMin = Math.round((mine - theirs) / 60)
  const distKm = (current.distance_m - other.distance_m) / 1000
  const climbM = current.ascent_m - other.ascent_m

  const signed = (v: number, unit: string, digits = 0) =>
    `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)} ${unit}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 22 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 10.5, letterSpacing: '0.1em', fontWeight: 700, color: 'var(--color-muted)' }}>
            {de ? 'DIESE' : 'THIS ONE'}
          </span>
          <span className="num-display" style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-ink)' }}>
            {formatHm(mine)}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 10.5, letterSpacing: '0.1em', fontWeight: 700, color: 'var(--color-muted)' }}>
            {(other.name || (de ? 'ANDERE' : 'OTHER')).toUpperCase()}
          </span>
          <span className="num-display" style={{ fontSize: 22, fontWeight: 650, color: 'var(--color-ink-2)' }}>
            {formatHm(theirs)}
          </span>
        </div>
      </div>

      {/* The two figures that make the time difference mean something. A
          slower time over more road and more climbing is not a slower ride. */}
      <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--color-ink-2)', margin: 0 }}>
        {deltaMin === 0
          ? de
            ? 'Praktisch dieselbe Zeit — bei '
            : 'Practically the same time — for '
          : de
            ? `${Math.abs(deltaMin)} Minuten ${deltaMin > 0 ? 'länger' : 'kürzer'} — bei `
            : `${Math.abs(deltaMin)} minutes ${deltaMin > 0 ? 'longer' : 'shorter'} — for `}
        <strong style={{ color: 'var(--color-ink)' }}>{signed(distKm, 'km', 1)}</strong>
        {de ? ' Strecke und ' : ' of road and '}
        <strong style={{ color: 'var(--color-ink)' }}>{signed(climbM, de ? 'Hm' : 'm')}</strong>
        {de ? ' Anstieg.' : ' of climbing.'}
      </p>
    </div>
  )
}
