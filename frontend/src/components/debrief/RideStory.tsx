import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { useLocale } from '../../contexts/LocaleContext'
import type { DebriefStory } from '../../api/debrief'
import RouteMap from './RouteMap'

function formatMMSS(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(s / 60)
  const ss = s % 60
  return `${m}:${String(ss).padStart(2, '0')}`
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

function toneColor(tone: string, colors: { good: string; bad: string; muted: string }): string {
  if (tone === 'good') return colors.good
  if (tone === 'bad') return colors.bad
  return colors.muted
}

// ─── uPlot chart with moment overlay ───────────────────────────────────────────

function RideStoryChart({ story }: { story: DebriefStory }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || story.power.length === 0) return
    const el = containerRef.current
    const width = el.clientWidth || 600
    const height = 280

    const ink = cssVar('--color-ink', '#F5F5F7')
    const bad = cssVar('--color-bad', '#FF453A')
    const good = cssVar('--color-good', '#30D158')
    const muted = cssVar('--color-muted', 'rgba(235, 235, 245, 0.40)')
    const axisColor = cssVar('--color-chart-axis', '#757465')

    const hasHr = story.hr.some((v) => v != null)
    const hasAltitude = story.altitude.some((v) => v != null)

    const series: uPlot.Series[] = [
      {},
      { label: 'Power', stroke: ink, width: 1.75, scale: 'power' },
    ]
    const data: (number | null)[][] = [story.t, story.power]

    if (hasHr) {
      series.push({ label: 'HR', stroke: bad, width: 1.5, scale: 'hr' })
      data.push(story.hr)
    }
    if (hasAltitude) {
      // Filled context trace, no stroke — compressed into the bottom band via
      // the 'alt' scale range below so it reads as terrain, not a dominant line.
      series.push({ label: 'Altitude', stroke: 'transparent', fill: muted, width: 0, scale: 'alt' })
      data.push(story.altitude)
    }

    const axes: uPlot.Axis[] = [
      {
        stroke: axisColor,
        grid: { show: false },
        ticks: { show: false },
        font: '11px Geist, sans-serif',
        values: (_u, splits) => splits.map((s) => formatMMSS(s)),
      },
      {
        scale: 'power',
        stroke: axisColor,
        grid: { show: false },
        ticks: { show: false },
        font: '11px Geist, sans-serif',
      },
    ]
    if (hasHr) {
      axes.push({
        scale: 'hr',
        side: 1,
        stroke: bad,
        grid: { show: false },
        ticks: { show: false },
        font: '11px Geist, sans-serif',
      })
    }

    // Marker overlay divs are appended to uPlot's `over` element (already
    // positioned exactly over the plotting area), then repositioned on
    // every draw using valToPos in CSS-pixel space.
    const markerEls: { el: HTMLDivElement; x: number }[] = []

    const opts: uPlot.Options = {
      width,
      height,
      series,
      axes,
      scales: {
        ...(hasAltitude
          ? {
              // Compress the altitude trace into the bottom quarter of the
              // chart so it reads as background context, not a dominant series.
              alt: {
                range: (_u, min, max) => [min, min + (max - min) * 4],
              },
            }
          : {}),
      },
      cursor: {
        drag: { x: false },
      },
      legend: { show: false },
      hooks: {
        ready: [
          (u) => {
            story.moments.forEach((moment) => {
              const wrap = document.createElement('div')
              wrap.style.position = 'absolute'
              wrap.style.top = '0'
              wrap.style.bottom = '0'
              wrap.style.pointerEvents = 'none'
              wrap.style.transform = 'translateX(-50%)'

              const color = toneColor(moment.tone, { good, bad, muted })

              const line = document.createElement('div')
              line.style.position = 'absolute'
              line.style.top = '0'
              line.style.bottom = '0'
              line.style.left = '50%'
              line.style.width = '1px'
              line.style.backgroundColor = color
              line.style.opacity = '0.5'
              wrap.appendChild(line)

              const label = document.createElement('div')
              label.textContent = moment.label
              label.style.position = 'absolute'
              label.style.top = '-2px'
              label.style.left = '50%'
              label.style.transform = 'translate(-50%, -100%)'
              label.style.whiteSpace = 'nowrap'
              label.style.fontSize = '10px'
              label.style.fontFamily = 'Geist, sans-serif'
              label.style.letterSpacing = '0.02em'
              label.style.color = color
              label.style.background = 'var(--color-paper-2, #1c1c1e)'
              label.style.padding = '1px 5px'
              label.style.borderRadius = '999px'
              label.style.border = `1px solid ${color}`
              wrap.appendChild(label)

              u.over.appendChild(wrap)
              const tValue = story.t[moment.at_s] ?? moment.at_s
              markerEls.push({ el: wrap, x: tValue })
            })
          },
        ],
        draw: [
          (u) => {
            markerEls.forEach(({ el, x }) => {
              const px = u.valToPos(x, 'x', false)
              el.style.left = `${px}px`
              el.style.display = px < 0 || px > u.bbox.width / devicePixelRatio ? 'none' : 'block'
            })
          },
        ],
      },
    }

    const plot = new uPlot(opts, data as unknown as uPlot.AlignedData, el)

    const ro = new ResizeObserver(() => {
      if (el) plot.setSize({ width: el.clientWidth, height })
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      plot.destroy()
    }
  }, [story])

  return <div ref={containerRef} className="w-full min-w-0" />
}

// ─── Main component ─────────────────────────────────────────────────────────────

export default function RideStory({ story }: { story: DebriefStory | null }) {
  const { locale } = useLocale()
  if (!story || story.power.length === 0) return null

  const hasRoute = story.route.length >= 2

  return (
    <div
      className="paper-grain relative rounded-[20px] overflow-hidden p-5 sm:p-6"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
      }}
    >
      <div className="mb-4">
        <span className="eyebrow" style={{ color: 'var(--color-ink-2)' }}>
          {locale === 'de' ? 'VERLAUF' : 'TIMELINE'}
        </span>
        <h2
          className="num-display mt-1 leading-none"
          style={{ fontSize: 'clamp(20px, 3vw, 26px)', color: 'var(--color-ink)' }}
        >
          {locale === 'de' ? 'Die Geschichte' : 'The story'}
        </h2>
      </div>

      <div className={hasRoute ? 'grid md:grid-cols-2 gap-4' : 'grid gap-4'}>
        <div className="min-w-0">
          <RideStoryChart story={story} />
        </div>
        {hasRoute && (
          <div className="flex items-center justify-center min-w-0">
            <RouteMap route={story.route} />
          </div>
        )}
      </div>
    </div>
  )
}
