import { useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { TooltipContentProps } from 'recharts'
import { format, parseISO } from 'date-fns'
import { usePMC } from '../../hooks/usePMC'
import type { PMCEntry } from '../../api/dashboard'

type Sport = 'total' | 'cycling' | 'running' | 'gym'

const SPORTS: { key: Sport; label: string }[] = [
  { key: 'total', label: 'Total' },
  { key: 'cycling', label: 'Cycling' },
  { key: 'running', label: 'Running' },
  { key: 'gym', label: 'Gym' },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PmcTooltip({ active, payload, label }: TooltipContentProps<any, any>) {
  if (!active || !payload || payload.length === 0) return null
  const dateLabel = label != null ? format(parseISO(String(label)), 'EEE, MMM d') : ''
  const fmt = (v: unknown) => (typeof v === 'number' ? v.toFixed(1) : '-')
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-xs">
      <div className="font-semibold text-gray-900 mb-1">{dateLabel}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-gray-600 mr-2">{p.name}</span>
          <span className="text-gray-900 font-medium tabular-nums">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export default function PMCChart() {
  const [sport, setSport] = useState<Sport>('total')
  const { data, isLoading, isError, refetch } = usePMC(90)

  const series: PMCEntry[] =
    data == null
      ? []
      : sport === 'total'
      ? data.entries
      : (data.per_sport[sport] ?? [])

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 sm:p-6 min-w-0">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Training Load</h2>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {SPORTS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSport(key)}
              className={
                'py-2 px-3 text-sm font-medium leading-none transition-colors ' +
                (sport === key
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:text-gray-900 bg-white')
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart area */}
      {isLoading ? (
        <div className="w-full h-64 sm:h-80 min-w-0 animate-pulse bg-gray-100 rounded-xl" />
      ) : isError ? (
        <div className="w-full h-64 sm:h-80 min-w-0 flex flex-col items-center justify-center gap-3 text-sm text-gray-500">
          <span>Couldn&apos;t load training load</span>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Retry
          </button>
        </div>
      ) : series.length === 0 ? (
        <div className="w-full h-64 sm:h-80 min-w-0 flex items-center justify-center text-sm text-gray-400 text-center px-4">
          Not enough training history yet — log a few activities or sync Garmin
        </div>
      ) : (
        <div className="w-full h-64 sm:h-80 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                interval="preserveStartEnd"
                minTickGap={32}
                tickFormatter={(d: string) => format(parseISO(d), 'MMM d')}
              />
              <YAxis tick={{ fontSize: 11 }} width={36} />
              <Tooltip content={PmcTooltip} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="ctl"
                name="CTL (fitness)"
                stroke="#2563eb"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="atl"
                name="ATL (fatigue)"
                stroke="#dc2626"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="tsb"
                name="TSB (form)"
                stroke="#16a34a"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
