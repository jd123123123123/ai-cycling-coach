import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { HeatmapChart } from 'echarts/charts'
import { CalendarComponent, TooltipComponent, VisualMapComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { usePMC } from '../../hooks/usePMC'
import { calendarCells } from '../../utils/advanced-metrics'

echarts.use([HeatmapChart, CalendarComponent, TooltipComponent, VisualMapComponent, CanvasRenderer])

export default function CalendarHeatmap() {
  const { data, isLoading, isError } = usePMC(90)
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  const cells = data?.entries ? calendarCells(data.entries, 84) : []

  useEffect(() => {
    if (!containerRef.current || cells.length === 0) return

    // Destroy and re-create on data change
    if (chartRef.current) {
      chartRef.current.dispose()
      chartRef.current = null
    }

    const chart = echarts.init(containerRef.current, undefined, { renderer: 'canvas' })
    chartRef.current = chart

    const maxTss = Math.max(...cells.map((c) => c.tss), 100)

    const option: echarts.EChartsCoreOption = {
      tooltip: {
        trigger: 'item',
        backgroundColor: 'var(--color-paper-2)',
        borderColor: 'var(--color-rule)',
        textStyle: {
          color: 'var(--color-ink)',
          fontFamily: 'Geist, sans-serif',
          fontSize: 12,
        },
        formatter: (params: { data?: [string, number] }) => {
          if (!params.data) return ''
          return `${params.data[0]}<br/>TSS ${params.data[1].toFixed(0)}`
        },
      },
      visualMap: {
        show: false,
        min: 0,
        max: maxTss,
        inRange: {
          color: ['#f3ecdc', '#c8d9b4', '#7da87f', '#3e6d4d', '#1c4433'],
        },
      },
      calendar: {
        top: 16,
        left: 28,
        right: 8,
        bottom: 4,
        range: [cells[0].date, cells[cells.length - 1].date],
        cellSize: ['auto', 16],
        itemStyle: {
          borderColor: '#e2d8c0',
          borderWidth: 1,
          borderRadius: 2,
        },
        splitLine: { show: false },
        yearLabel: { show: false },
        monthLabel: {
          color: '#757465',
          fontFamily: 'Geist, sans-serif',
          fontSize: 11,
          nameMap: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        },
        dayLabel: {
          color: '#757465',
          fontFamily: 'Geist, sans-serif',
          fontSize: 10,
          firstDay: 1,
          nameMap: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        },
      },
      series: [
        {
          type: 'heatmap',
          coordinateSystem: 'calendar',
          data: cells.map((c) => [c.date, c.tss]),
        },
      ],
    }

    chart.setOption(option)

    const ro = new ResizeObserver(() => {
      chart.resize()
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  return (
    <div
      className="paper-grain rounded-[20px] p-5 sm:p-6 min-w-0 overflow-hidden"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
      }}
    >
      <div className="mb-3">
        <span className="eyebrow" style={{ color: 'var(--color-amber)' }}>
          Chapter III · Pattern
        </span>
        <h2
          className="num-display mt-1 leading-none"
          style={{ fontSize: 'clamp(22px, 3vw, 28px)', color: 'var(--color-ink)' }}
        >
          Last 12 weeks
        </h2>
      </div>

      {isLoading ? (
        <div
          className="w-full h-[160px] rounded-[10px] animate-pulse"
          style={{ backgroundColor: 'var(--color-rule)' }}
        />
      ) : isError ? (
        <div className="w-full h-[160px] flex items-center justify-center">
          <span className="eyebrow" style={{ color: 'var(--color-alert)' }}>
            Couldn&apos;t load training pattern
          </span>
        </div>
      ) : cells.length === 0 ? (
        <div className="w-full h-[160px] flex flex-col items-center justify-center text-center gap-2">
          <span className="eyebrow" style={{ color: 'var(--color-forest)' }}>
            No data yet
          </span>
          <p className="text-[14px]" style={{ color: 'var(--color-ink-2)' }}>
            Log a few sessions to see your training pattern.
          </p>
        </div>
      ) : (
        <div ref={containerRef} className="w-full h-[160px] sm:h-[180px]" />
      )}

      {/* Legend */}
      {!isLoading && !isError && cells.length > 0 && (
        <div className="flex items-center gap-2 mt-3">
          <span className="num-mono text-[10px]" style={{ color: 'var(--color-muted)' }}>
            TSS
          </span>
          {['#f3ecdc', '#c8d9b4', '#7da87f', '#3e6d4d', '#1c4433'].map((color, i) => (
            <span
              key={i}
              className="inline-block w-3 h-3 rounded-sm"
              style={{ backgroundColor: color, border: '1px solid var(--color-rule)' }}
            />
          ))}
          <span className="num-mono text-[10px]" style={{ color: 'var(--color-muted)' }}>
            high
          </span>
        </div>
      )}
    </div>
  )
}
