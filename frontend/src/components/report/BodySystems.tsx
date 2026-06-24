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

function Radar({ axes }: { axes: RadarAxis[] }) {
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
        radius: '72%',
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

  return <div ref={ref} className="w-full" style={{ height: 348 }} />
}

/** Diagnosis card — the body-system radar paired with an always-visible
 * per-axis breakdown (label, score, bar, detail). Merges the former
 * BodySystemRadar + WhyThisGrade into one self-explanatory unit. */
export default function BodySystems({ axes }: { axes: RadarAxis[] }) {
  const { locale } = useLocale()
  const missing = axes.filter((a) => a.insufficient_data).map((a) => a.label)

  return (
    <div
      className="rounded-[18px] p-5 sm:p-6"
      style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
    >
      <span className="eyebrow num-mono" style={{ color: 'var(--color-ink-2)', fontSize: 10, letterSpacing: '0.22em' }}>
        {locale === 'de' ? 'KÖRPERSYSTEME' : 'BODY SYSTEMS'}
      </span>

      <div className="grid gap-5 mt-3 md:grid-cols-2 md:items-center">
        {/* radar */}
        <div className="min-w-0">
          <Radar axes={axes} />
        </div>

        {/* per-axis breakdown — always visible */}
        <div className="flex flex-col gap-3.5">
          {axes.map((a) => (
            <div key={a.key} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <span style={{ color: 'var(--color-ink)', fontSize: 13 }}>{a.label}</span>
                <span className="num-mono" style={{ color: a.insufficient_data ? 'var(--color-muted)' : 'var(--color-ink-2)', fontSize: 12 }}>
                  {a.score == null ? '—' : Math.round(a.score)}
                </span>
              </div>
              <div className="rounded-full overflow-hidden" style={{ height: 5, backgroundColor: 'var(--color-rule)' }}>
                <div style={{
                  height: '100%', width: `${a.score ?? 0}%`,
                  backgroundColor: a.insufficient_data ? 'var(--color-muted)' : 'var(--color-good)',
                  transition: 'width 600ms var(--ease-apple-default, ease)',
                }} />
              </div>
              {a.detail && (
                <span style={{ color: 'var(--color-muted)', fontSize: 12 }}>{a.detail}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {missing.length > 0 && (
        <p className="num-mono mt-4" style={{ color: 'var(--color-muted)', fontSize: 11 }}>
          {locale === 'de' ? 'Nicht genug Daten' : 'Not enough data'}: {missing.join(', ')}
        </p>
      )}
    </div>
  )
}
