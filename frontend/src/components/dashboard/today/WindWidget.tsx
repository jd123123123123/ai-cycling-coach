import { useMemo } from 'react'
import { useLocale } from '../../../contexts/LocaleContext'
import { useTodayWeather } from '../../../hooks/useTodayWeather'
import { computeWeatherWindow } from '../WeatherNudge'
import { compassLabel } from '../WeatherWindowCard'
import { eyebrow } from '../surfaces'

/**
 * Wind — the one weather number a cyclist plans around.
 *
 * Temperature decides what you wear; wind decides which way you ride. The
 * weather card computed `windMean` and `windDirDeg` and spent them on a text
 * fragment ("12 km/h SW") at the end of a note line, which is the least useful
 * form the data can take: a bearing in words has to be translated back into a
 * picture before it means anything.
 *
 * Two exports, because wind is wanted at two different depths:
 *
 *   WindPill  — masthead, beside the temperature. Direction and strength at a
 *               glance, in the place the athlete already looks for "what is it
 *               doing out there". It replaced the FTP chip, which showed a
 *               number that changes a few times a year in the slot next to one
 *               that changes hourly.
 *   WindPanel — inside the weather card. The full dial, embedded rather than
 *               floating in its own card next to the one it belongs to.
 *
 * The needle points the way the wind is GOING (the arrow a rider thinks in),
 * while the label states where it comes FROM (the convention every forecast
 * uses) — stating both is what stops the classic 180° error.
 *
 * The strength wording is Beaufort-anchored rather than invented: under 12
 * km/h you genuinely do not plan around it, and past 30 km/h an exposed
 * headwind leg is the defining feature of the ride. Those two thresholds are
 * the only judgements this makes.
 */

/** Beaufort-anchored, in the terms a rider would use. */
function strength(kmh: number, de: boolean): { word: string; tone: string } {
  if (kmh < 12) return { word: de ? 'kaum spürbar' : 'barely there', tone: 'var(--color-good)' }
  if (kmh < 20) return { word: de ? 'merklich' : 'noticeable', tone: 'var(--color-good)' }
  if (kmh < 30) return { word: de ? 'spürbar' : 'a factor', tone: 'var(--color-caution)' }
  return { word: de ? 'ernsthaft' : 'serious', tone: 'var(--color-bad)' }
}

/** Shared read of the forecast, so pill and panel can never disagree. */
function useWind() {
  const { data } = useTodayWeather()
  return useMemo(() => {
    if (!data?.available || !data.hours.length) return null
    const win = computeWeatherWindow(data.hours, new Date())
    if (!win || win.windMean == null) return null
    return {
      kmh: win.windMean,
      fromDeg: win.windDirDeg,
      // Where the wind is GOING — forecast bearings are "from", and a rider
      // pictures the arrow blowing them along.
      goingDeg: win.windDirDeg != null ? (win.windDirDeg + 180) % 360 : null,
    }
  }, [data])
}

/**
 * Masthead chip: an arrow pointing where the wind blows, plus the speed.
 *
 * Deliberately no card, no label — it sits in a row of pills where the
 * temperature already establishes that this row is "conditions".
 */
export function WindPill() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const wind = useWind()

  // Honest absence, matching every other weather surface: no forecast, no pill.
  if (!wind) return null
  const { tone } = strength(wind.kmh, de)
  const from = compassLabel(wind.fromDeg)

  return (
    <span
      className="inline-flex items-center justify-center gap-1 rounded-full px-2.5"
      style={{ height: 34, background: '#FFFFFF12', border: '1px solid #FFFFFF1F' }}
      aria-label={
        de
          ? `Wind ${Math.round(wind.kmh)} Kilometer pro Stunde${from ? ` aus ${from}` : ''}`
          : `Wind ${Math.round(wind.kmh)} kilometres per hour${from ? ` from ${from}` : ''}`
      }
    >
      <svg viewBox="0 0 16 16" width={13} height={13} aria-hidden>
        <g transform={`rotate(${wind.goingDeg ?? 0} 8 8)`}>
          <path d="M8 2 L11.5 12 L8 9.6 L4.5 12 Z" fill={tone} />
        </g>
      </svg>
      <span
        className="num-display"
        style={{ fontSize: 12.5, fontWeight: 700, color: '#FFFFFFE6', whiteSpace: 'nowrap' }}
      >
        {Math.round(wind.kmh)}
      </span>
      <span style={{ fontSize: 10.5, fontWeight: 600, color: '#FFFFFF99' }}>km/h</span>
    </span>
  )
}

/**
 * The dial, for embedding inside the weather card. No card chrome of its own —
 * wind is part of the weather, not a second opinion sitting beside it.
 */
export function WindPanel() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const wind = useWind()

  if (!wind) return null
  const { kmh, goingDeg } = wind
  const { word, tone } = strength(kmh, de)
  const from = compassLabel(wind.fromDeg)

  return (
    <div
      className="flex items-center gap-3.5 rounded-2xl"
      style={{
        padding: '10px 12px',
        background: 'color-mix(in srgb, var(--color-paper) 55%, transparent)',
        border: '1px solid var(--color-rule)',
      }}
    >
      <div style={{ position: 'relative', width: 58, height: 58, flex: '0 0 auto' }}>
        <svg viewBox="0 0 68 68" width={58} height={58} aria-hidden>
          <circle cx={34} cy={34} r={30} fill="none" stroke="var(--color-rule)" strokeWidth={1.5} />
          {/* Cardinal ticks — the dial has to read as a compass, not as a
              circle with an arrow in it. */}
          {[0, 90, 180, 270].map((deg) => {
            const rad = ((deg - 90) * Math.PI) / 180
            return (
              <line
                key={deg}
                x1={34 + Math.cos(rad) * 26}
                y1={34 + Math.sin(rad) * 26}
                x2={34 + Math.cos(rad) * 30}
                y2={34 + Math.sin(rad) * 30}
                stroke="var(--color-rule)"
                strokeWidth={1.5}
              />
            )
          })}
          {goingDeg != null && (
            <g transform={`rotate(${goingDeg} 34 34)`}>
              <path d="M34 12 L40 34 L34 29 L28 34 Z" fill={tone} stroke="none" />
              <line
                x1={34}
                y1={29}
                x2={34}
                y2={54}
                stroke={tone}
                strokeWidth={2.5}
                strokeLinecap="round"
                opacity={0.55}
              />
            </g>
          )}
        </svg>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={eyebrow('var(--color-ink-2)')}>WIND</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
          <span
            className="num-display"
            style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' }}
          >
            {Math.round(kmh)}
          </span>
          <span style={{ fontSize: 12, fontWeight: 620, color: 'var(--color-ink-2)' }}>km/h</span>
          <span style={{ fontSize: 11.5, color: tone, fontWeight: 620 }}>· {word}</span>
        </div>
        <span style={{ fontSize: 11.5, color: 'var(--color-muted)', lineHeight: 1.35 }}>
          {from
            ? de
              ? `aus ${from} — Rückenwind auf dem Rückweg, wenn du gegen den Wind rausfährst.`
              : `from ${from} — tailwind home if you ride out into it.`
            : de
              ? 'Richtung unbekannt.'
              : 'Direction unknown.'}
        </span>
      </div>
    </div>
  )
}
