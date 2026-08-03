import { useMemo } from 'react'
import { useLocale } from '../../../contexts/LocaleContext'
import { useTodayWeather } from '../../../hooks/useTodayWeather'
import { computeWeatherWindow } from '../WeatherNudge'
import { compassLabel } from '../WeatherWindowCard'
import { glassCardStyle, GLASS_CARD_MARKER } from '../glassCard'
import { eyebrow } from '../surfaces'

/**
 * WindWidget — the one weather number a cyclist plans around.
 *
 * Temperature decides what you wear; wind decides which way you ride. The
 * weather card already computed `windMean` and `windDirDeg` and then spent
 * them on a text fragment ("12 km/h SW") at the bottom of a note line, which
 * is the least useful form the data can take: a bearing in words has to be
 * translated back into a picture before it means anything.
 *
 * So this draws it. The needle points the way the wind is GOING (the arrow a
 * rider thinks in), while the label states where it comes FROM (the convention
 * every forecast uses) — stating both is what stops the classic 180° error.
 *
 * The strength wording is Beaufort-anchored rather than invented: under 12
 * km/h you genuinely do not plan around it, and past 30 km/h an exposed
 * headwind leg is the defining feature of the ride. Those two thresholds are
 * the only judgements this widget makes.
 */

/** Beaufort-anchored, in the terms a rider would use. */
function strength(kmh: number, de: boolean): { word: string; tone: string } {
  if (kmh < 12) return { word: de ? 'kaum spürbar' : 'barely there', tone: 'var(--color-good)' }
  if (kmh < 20) return { word: de ? 'merklich' : 'noticeable', tone: 'var(--color-good)' }
  if (kmh < 30) return { word: de ? 'spürbar' : 'a factor', tone: 'var(--color-caution)' }
  return { word: de ? 'ernsthaft' : 'serious', tone: 'var(--color-bad)' }
}

export default function WindWidget() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const { data } = useTodayWeather()

  const win = useMemo(() => {
    if (!data?.available || !data.hours.length) return null
    return computeWeatherWindow(data.hours, new Date())
  }, [data])

  // Honest absence, matching the weather card: no forecast, no widget. A wind
  // dial with no wind behind it is the most confident-looking lie available.
  if (!win || win.windMean == null) return null

  const kmh = win.windMean
  const fromDeg = win.windDirDeg
  const { word, tone } = strength(kmh, de)
  const from = compassLabel(fromDeg)

  // Needle points where the wind is GOING: forecast bearings are "from", and a
  // rider pictures the arrow blowing them along.
  const goingDeg = fromDeg != null ? (fromDeg + 180) % 360 : null

  return (
    <section
      {...GLASS_CARD_MARKER}
      style={{
        ...glassCardStyle,
        borderRadius: 20,
        padding: 14,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
    >
      {/* The dial. */}
      <div style={{ position: 'relative', width: 68, height: 68, flex: '0 0 auto' }}>
        <svg viewBox="0 0 68 68" width={68} height={68} aria-hidden>
          <circle
            cx={34}
            cy={34}
            r={30}
            fill="none"
            stroke="var(--color-rule)"
            strokeWidth={1.5}
          />
          {/* Cardinal ticks — the dial has to be readable as a compass, not
              just as a circle with an arrow in it. */}
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
              <path
                d="M34 12 L40 34 L34 29 L28 34 Z"
                fill={tone}
                stroke="none"
              />
              <line x1={34} y1={29} x2={34} y2={54} stroke={tone} strokeWidth={2.5} strokeLinecap="round" opacity={0.55} />
            </g>
          )}
        </svg>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <span style={eyebrow('var(--color-ink-2)')}>{de ? 'WIND' : 'WIND'}</span>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span
            className="num-display"
            style={{ fontSize: 26, fontWeight: 800, color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' }}
          >
            {Math.round(kmh)}
          </span>
          <span style={{ fontSize: 13, fontWeight: 620, color: 'var(--color-ink-2)' }}>km/h</span>
          <span style={{ fontSize: 12.5, color: tone, fontWeight: 620 }}>· {word}</span>
        </div>

        <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
          {from
            ? de
              ? `aus ${from} — Rückenwind auf dem Rückweg, wenn du gegen den Wind rausfährst.`
              : `from ${from} — tailwind home if you ride out into it.`
            : de
              ? 'Richtung unbekannt.'
              : 'Direction unknown.'}
        </span>
      </div>
    </section>
  )
}
