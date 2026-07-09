import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { useLocale } from '../../contexts/LocaleContext'
import type { DebriefStory, Climb } from '../../api/debrief'
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

/** Centered moving average — turns spiky 1 Hz power/HR into a readable effort
 * shape. Nulls are skipped so gaps don't drag the mean to zero. */
function movingAvg(arr: (number | null)[], win: number): (number | null)[] {
  if (win <= 1) return arr.slice()
  const half = Math.floor(win / 2)
  const out: (number | null)[] = new Array(arr.length)
  for (let i = 0; i < arr.length; i++) {
    let sum = 0, n = 0
    for (let j = Math.max(0, i - half); j <= Math.min(arr.length - 1, i + half); j++) {
      const v = arr[j]
      if (v != null && isFinite(v)) { sum += v; n++ }
    }
    out[i] = n > 0 ? sum / n : null
  }
  return out
}

// ─── uPlot chart with moment overlay ───────────────────────────────────────────

function RideStoryChart({ story, climbs }: { story: DebriefStory; climbs?: Climb[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { locale } = useLocale()

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

    // Raw 1 Hz power/HR is a spiky wall that reads as noise. Smooth with a
    // centered moving average (window scales with ride length) so the trace
    // tells the effort story. Raw values still feed the hover tooltip.
    const win = Math.max(1, Math.min(90, Math.round(story.t.length / 300)))
    const powerSmooth = movingAvg(story.power, win)
    const hrSmooth = hasHr ? movingAvg(story.hr, win) : story.hr

    const series: uPlot.Series[] = [
      {},
      { label: 'Power', stroke: ink, width: 2, fill: 'rgba(245,245,247,0.05)', scale: 'power', points: { show: false } },
    ]
    const data: (number | null)[][] = [story.t, powerSmooth]

    if (hasHr) {
      series.push({ label: 'HR', stroke: bad, width: 1.5, scale: 'hr', points: { show: false } })
      data.push(hrSmooth)
    }
    if (hasAltitude) {
      // Filled context trace, no stroke — compressed into the bottom band via
      // the 'alt' scale range below so it reads as terrain, not a dominant line.
      series.push({ label: 'Altitude', stroke: 'transparent', fill: 'rgba(235,235,245,0.06)', width: 0, scale: 'alt', points: { show: false } })
      data.push(story.altitude)
    }
    // Raw arrays kept for the tooltip readout (idx maps 1:1 to smoothed data).
    const rawPower = story.power
    const rawHr = story.hr
    const rawAlt = story.altitude

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
    // every draw using valToPos in CSS-pixel space. We track the label node
    // too so the draw hook can stack colliding labels into separate rows.
    const markerEls: { el: HTMLDivElement; label: HTMLDivElement; x: number }[] = []
    // Hover readout — a single tooltip div created once the plot is ready and
    // repositioned + refilled on every cursor move.
    let tooltip: HTMLDivElement | null = null

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
        drag: { x: false, y: false },
        x: true,
        y: false,
        points: { show: true, size: 7 },
      },
      legend: { show: false },
      hooks: {
        ready: [
          (u) => {
            tooltip = document.createElement('div')
            tooltip.style.cssText =
              'position:absolute;top:10px;pointer-events:none;display:none;z-index:20;' +
              'padding:8px 11px;border-radius:12px;font-family:"JetBrains Mono",ui-monospace,monospace;' +
              'font-size:11px;line-height:1.55;white-space:nowrap;' +
              'background:color-mix(in srgb, var(--color-paper-2, #1c1c1e) 92%, transparent);' +
              'border:1px solid var(--color-rule);backdrop-filter:blur(8px);' +
              'box-shadow:0 8px 24px -12px rgba(0,0,0,0.8);'
            u.over.appendChild(tooltip)

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

              // Tie the beat to WHERE it happened: if the moment falls on a
              // climb, append its gradient so "power dropped off" becomes
              // "power dropped off · on a 7% climb" — geographically actionable.
              const onClimb = climbs?.find((c) => c.avg_grade_pct >= 3 && moment.at_s >= c.start_s && moment.at_s < c.start_s + c.duration_s)
              const suffix = onClimb ? ` · ${Math.round(onClimb.avg_grade_pct)}%${locale === 'de' ? '-Anstieg' : ' climb'}` : ''
              const label = document.createElement('div')
              label.textContent = moment.label + suffix
              label.style.position = 'absolute'
              label.style.top = '4px'
              label.style.left = '50%'
              label.style.transform = 'translateX(-50%)'
              label.style.whiteSpace = 'nowrap'
              label.style.fontSize = '10px'
              label.style.fontFamily = 'Geist, sans-serif'
              label.style.letterSpacing = '0.02em'
              label.style.fontWeight = '500'
              label.style.color = color
              label.style.background = 'color-mix(in srgb, var(--color-paper-2, #1c1c1e) 92%, transparent)'
              label.style.backdropFilter = 'blur(3px)'
              label.style.padding = '2px 7px'
              label.style.borderRadius = '999px'
              label.style.border = `1px solid ${color}`
              wrap.appendChild(label)

              u.over.appendChild(wrap)
              markerEls.push({ el: wrap, label, x: moment.at_s })
            })
          },
        ],
        draw: [
          (u) => {
            const plotW = u.bbox.width / devicePixelRatio
            // First pass: position guide lines + hide off-plot markers.
            const placed = markerEls
              .map((m) => ({ ...m, px: u.valToPos(m.x, 'x', false) }))
              .sort((a, b) => a.px - b.px)
            // Greedy row assignment so overlapping pills stack vertically
            // instead of colliding. Each row remembers the right edge it last
            // occupied; a label goes in the lowest row that clears it.
            const rowRightEdges: number[] = []
            const ROW_H = 20, GAP = 6
            placed.forEach(({ el, label, px }) => {
              const off = px < 0 || px > plotW
              el.style.display = off ? 'none' : 'block'
              el.style.left = `${px}px`
              if (off) return
              const halfW = label.offsetWidth / 2 || 40
              const left = px - halfW, right = px + halfW
              let row = 0
              while (row < rowRightEdges.length && rowRightEdges[row] > left - GAP) row++
              rowRightEdges[row] = right
              label.style.top = `${4 + row * ROW_H}px`
            })
          },
        ],
        setCursor: [
          (u) => {
            if (!tooltip) return
            const idx = u.cursor.idx
            const left = u.cursor.left ?? -1
            if (idx == null || left < 0) { tooltip.style.display = 'none'; return }
            const de = locale === 'de'
            const fmt = (v: number | null | undefined, unit: string, digits = 0) =>
              v == null || !isFinite(v) ? '—' : `${v.toFixed(digits)}${unit}`
            const rows: string[] = [
              `<div style="color:var(--color-muted);font-size:10px;letter-spacing:0.08em;margin-bottom:3px">${formatMMSS(story.t[idx] ?? 0)}</div>`,
              `<div style="display:flex;justify-content:space-between;gap:16px"><span style="color:var(--color-ink)">${de ? 'Leistung' : 'Power'}</span><span style="color:var(--color-ink);font-weight:600">${fmt(rawPower[idx], ' W')}</span></div>`,
            ]
            if (hasHr) rows.push(`<div style="display:flex;justify-content:space-between;gap:16px"><span style="color:var(--color-bad)">${de ? 'Herzfrequenz' : 'Heart rate'}</span><span style="color:var(--color-bad);font-weight:600">${fmt(rawHr[idx], ' bpm')}</span></div>`)
            if (hasAltitude) rows.push(`<div style="display:flex;justify-content:space-between;gap:16px"><span style="color:var(--color-muted)">${de ? 'Höhe' : 'Elevation'}</span><span style="color:var(--color-ink-2);font-weight:600">${fmt(rawAlt[idx], ' m')}</span></div>`)
            tooltip.innerHTML = rows.join('')
            tooltip.style.display = 'block'
            const plotW = u.bbox.width / devicePixelRatio
            tooltip.style.left = `${left}px`
            tooltip.style.transform = left > plotW / 2 ? 'translateX(calc(-100% - 14px))' : 'translateX(14px)'
          },
        ],
      },
    }

    const plot = new uPlot(opts, data as uPlot.AlignedData, el)

    const ro = new ResizeObserver(() => {
      if (el) plot.setSize({ width: el.clientWidth, height })
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      plot.destroy()
    }
  }, [story, locale, climbs])

  return <div ref={containerRef} className="w-full min-w-0" />
}

// ─── Main component ─────────────────────────────────────────────────────────────

export default function RideStory({ story, climbs }: { story: DebriefStory | null; climbs?: Climb[] }) {
  const { locale } = useLocale()
  if (!story || story.power.length === 0) return null

  const hasRoute = story.route.length >= 2

  const hasHr = story.hr.some((v) => v != null)
  const de = locale === 'de'
  const legend: { label: string; color: string; dash?: boolean }[] = [
    { label: de ? 'Leistung' : 'Power', color: 'var(--color-ink)' },
    ...(hasHr ? [{ label: de ? 'Herzfrequenz' : 'Heart rate', color: 'var(--color-bad)' }] : []),
    ...(story.altitude.some((v) => v != null) ? [{ label: de ? 'Höhe' : 'Elevation', color: 'var(--color-muted)' }] : []),
  ]

  return (
    <div
      className="paper-grain relative rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0) 120px), var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset, 0 18px 40px -24px rgba(0,0,0,0.85)',
      }}
    >
      <div className="flex flex-wrap items-end justify-between gap-3 px-6 pt-6 pb-4 sm:px-7" style={{ borderBottom: '1px solid var(--color-rule)' }}>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="shrink-0" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-ink-2)' }} />
            <span className="num-mono" style={{ color: 'var(--color-ink-2)', fontSize: 10.5, letterSpacing: '0.24em', fontWeight: 600 }}>
              {de ? 'VERLAUF · MINUTE FÜR MINUTE' : 'TIMELINE · MINUTE BY MINUTE'}
            </span>
          </div>
          <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(21px, 2.4vw, 26px)', fontWeight: 500, lineHeight: 1.12, letterSpacing: '-0.015em', color: 'var(--color-ink)' }}>
            {de ? 'So verlief das Rennen' : 'How the race unfolded'}
          </h3>
          <p style={{ color: 'var(--color-ink-2)', fontSize: 13, fontStyle: 'italic' }}>
            {de
              ? 'Wo Leistung, Herzfrequenz und Höhe zusammenspielten — die entscheidenden Momente markiert.'
              : 'Where power, heart rate and elevation played out — key moments marked.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {legend.map((l) => (
            <div key={l.label} className="flex items-center gap-1.5">
              <span style={{ width: 12, height: 2.5, borderRadius: 2, background: l.color }} />
              <span className="num-mono" style={{ fontSize: 10, color: 'var(--color-muted)', letterSpacing: '0.06em' }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={`p-6 sm:p-7 ${hasRoute ? 'grid md:grid-cols-[1.5fr_1fr] gap-6 items-center' : ''}`}>
        <div className="min-w-0">
          <RideStoryChart story={story} climbs={climbs} />
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
