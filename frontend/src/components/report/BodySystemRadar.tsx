import { useEffect, useMemo, useRef } from 'react'
import * as echarts from 'echarts'
import { useLocale } from '../../contexts/LocaleContext'
import type { RadarAxis } from '../../api/report'

/** Resolve a `var(--token)` string to its concrete computed value. ECharts
 * draws to a canvas, which cannot read CSS custom properties, so colors must
 * be resolved before they reach the chart option. Mirrors ChartCanvas. */
function resolveCssVar(value: string): string {
  if (typeof window === 'undefined' || !value.startsWith('var(')) return value
  const name = value.slice(4, -1).trim()
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || value
}

/** Five-axis body-system radar. Insufficient axes render at 0 with a muted note
 * below the chart so a hollow spoke never reads as "you scored zero". */
export default function BodySystemRadar({ axes }: { axes: RadarAxis[] }) {
  const { locale } = useLocale()
  const ref = useRef<HTMLDivElement>(null)

  const { indicators, values } = useMemo(() => ({
    indicators: axes.map((a) => ({ name: a.label, max: 100 })),
    values: axes.map((a) => (a.score == null ? 0 : a.score)),
  }), [axes])

  useEffect(() => {
    if (!ref.current) return
    const good = resolveCssVar('var(--color-good)')
    const ink2 = resolveCssVar('var(--color-ink-2)')
    const rule = resolveCssVar('var(--color-rule)')

    const chart = echarts.init(ref.current)
    chart.setOption({
      tooltip: {},
      radar: {
        indicator: indicators,
        radius: '66%',
        splitNumber: 4,
        axisName: { color: ink2, fontSize: 11 },
        splitLine: { lineStyle: { color: rule } },
        splitArea: { areaStyle: { color: ['transparent', 'transparent'] } },
        axisLine: { lineStyle: { color: rule } },
      },
      series: [{
        type: 'radar',
        data: [{
          value: values,
          areaStyle: { color: good, opacity: 0.22 },
          lineStyle: { color: good, width: 2 },
          itemStyle: { color: good },
        }],
      }],
    })
    const onResize = () => chart.resize()
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); chart.dispose() }
  }, [indicators, values])

  const missing = axes.filter((a) => a.insufficient_data).map((a) => a.label)

  return (
    <div
      className="rounded-[18px] p-5 sm:p-6"
      style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
    >
      <span className="eyebrow num-mono" style={{ color: 'var(--color-ink-2)', fontSize: 10, letterSpacing: '0.22em' }}>
        {locale === 'de' ? 'KÖRPERSYSTEME' : 'BODY SYSTEMS'}
      </span>
      <div ref={ref} style={{ width: '100%', height: 320 }} />
      {missing.length > 0 && (
        <p className="num-mono" style={{ color: 'var(--color-muted)', fontSize: 11 }}>
          {locale === 'de' ? 'Nicht genug Daten' : 'Not enough data'}: {missing.join(', ')}
        </p>
      )}
    </div>
  )
}
