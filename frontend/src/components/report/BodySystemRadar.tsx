import { useEffect, useMemo, useRef } from 'react'
import * as echarts from 'echarts'
import type { RadarAxis } from '../../api/report'

/** Five-axis body-system radar. Insufficient axes render at 0 with a muted note
 * below the chart so a hollow spoke never reads as "you scored zero". */
export default function BodySystemRadar({ axes }: { axes: RadarAxis[] }) {
  const ref = useRef<HTMLDivElement>(null)

  const { indicators, values } = useMemo(() => ({
    indicators: axes.map((a) => ({ name: a.label, max: 100 })),
    values: axes.map((a) => (a.score == null ? 0 : a.score)),
  }), [axes])

  useEffect(() => {
    if (!ref.current) return
    const chart = echarts.init(ref.current)
    chart.setOption({
      tooltip: {},
      radar: {
        indicator: indicators,
        radius: '68%',
        splitNumber: 4,
        axisName: { color: 'var(--color-ink-2)', fontSize: 11 },
        splitLine: { lineStyle: { color: 'var(--color-rule)' } },
        splitArea: { areaStyle: { color: ['transparent', 'transparent'] } },
        axisLine: { lineStyle: { color: 'var(--color-rule)' } },
      },
      series: [{
        type: 'radar',
        data: [{
          value: values,
          areaStyle: { color: 'color-mix(in srgb, var(--color-good) 22%, transparent)' },
          lineStyle: { color: 'var(--color-good)' },
          itemStyle: { color: 'var(--color-good)' },
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
        BODY SYSTEMS
      </span>
      <div ref={ref} style={{ width: '100%', height: 300 }} />
      {missing.length > 0 && (
        <p className="num-mono" style={{ color: 'var(--color-muted)', fontSize: 11 }}>
          Not enough data: {missing.join(', ')}
        </p>
      )}
    </div>
  )
}
