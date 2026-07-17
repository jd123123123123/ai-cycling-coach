import type { LucideIcon } from 'lucide-react'
import { TrendingUp, TrendingDown } from 'lucide-react'

// MetricCard — 1:1 from pencil-new.pen component/MetricCard. Icon + label,
// big Sora value + unit, and a colored trend line. Sport/metric channel color
// is passed via `iconColor` / `trend.color`.

export default function MetricCard({
  icon: Icon,
  iconColor,
  label,
  value,
  unit,
  trend,
}: {
  icon: LucideIcon
  iconColor: string
  label: string
  value: string
  unit?: string
  trend?: { text: string; color: string; dir?: 'up' | 'down' }
}) {
  const TrendIcon = trend?.dir === 'down' ? TrendingDown : TrendingUp
  return (
    <div
      className="flex flex-col gap-3 rounded-[24px] p-4 min-w-0"
      style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
    >
      <div className="flex items-center gap-2">
        <Icon size={18} strokeWidth={2.2} style={{ color: iconColor }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink-2)' }}>{label}</span>
      </div>
      <div className="flex items-end gap-1">
        <span className="num-display" style={{ fontSize: 26, lineHeight: 1, color: 'var(--color-ink)' }}>{value}</span>
        {unit && <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-muted)', paddingBottom: 2 }}>{unit}</span>}
      </div>
      {trend && (
        <div className="flex items-center gap-1">
          <TrendIcon size={15} strokeWidth={2.4} style={{ color: trend.color }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: trend.color }}>{trend.text}</span>
        </div>
      )}
    </div>
  )
}
