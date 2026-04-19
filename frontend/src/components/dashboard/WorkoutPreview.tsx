import { POWER_ZONE_COLORS, POWER_ZONE_LABELS, zoneFromPctFtp } from '../../types/workoutInterval'
import type { Interval } from '../../types/workoutInterval'

interface WorkoutPreviewProps {
  intervals: Interval[]
  /** Optional class for the outer container. */
  className?: string
}

/** Format total seconds as "Xh Ym" or "Ym" */
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

/** Get zone midpoint %FTP for height calculation when power_target_pct_ftp is null */
const ZONE_MIDPOINTS: Record<1 | 2 | 3 | 4 | 5 | 6 | 7, number> = {
  1: 45,
  2: 65,
  3: 83,
  4: 98,
  5: 113,
  6: 135,
  7: 160,
}

const SVG_WIDTH = 1000
const SVG_HEIGHT = 160
// Scale: 150% FTP = full SVG_HEIGHT
const PCT_FTP_MAX = 150
// 20px baseline padding at bottom
const BASELINE = 20
const RECT_AREA = SVG_HEIGHT - BASELINE

export default function WorkoutPreview({ intervals, className }: WorkoutPreviewProps) {
  if (intervals.length === 0) {
    return (
      <div className={`text-sm text-gray-400 italic py-4 text-center ${className ?? ''}`}>
        No interval structure defined
      </div>
    )
  }

  const total = intervals.reduce((sum, i) => sum + i.duration_seconds, 0)

  // Collect unique zones present
  const zonesPresent = Array.from(
    new Set(
      intervals.map((i) => {
        const z = i.zone ?? zoneFromPctFtp(i.power_target_pct_ftp)
        return z as 1 | 2 | 3 | 4 | 5 | 6 | 7
      }),
    ),
  ).sort((a, b) => a - b) as (1 | 2 | 3 | 4 | 5 | 6 | 7)[]

  // Build SVG rects
  let xOffset = 0
  const rects = intervals.map((interval, idx) => {
    const zone = (interval.zone ?? zoneFromPctFtp(interval.power_target_pct_ftp)) as 1 | 2 | 3 | 4 | 5 | 6 | 7
    const color = POWER_ZONE_COLORS[zone]
    const pct = interval.power_target_pct_ftp ?? ZONE_MIDPOINTS[zone]
    const rectHeight = Math.max(4, Math.round((Math.min(pct, PCT_FTP_MAX) / PCT_FTP_MAX) * RECT_AREA))
    const rectWidth = (interval.duration_seconds / total) * SVG_WIDTH
    const rectY = SVG_HEIGHT - BASELINE - rectHeight

    const x = xOffset
    xOffset += rectWidth

    return (
      <rect
        key={idx}
        x={x}
        y={rectY}
        width={rectWidth}
        height={rectHeight}
        fill={color}
        stroke="rgba(0,0,0,0.08)"
        strokeWidth={1}
      />
    )
  })

  return (
    <div className={`min-w-0 ${className ?? ''}`}>
      {/* Metadata row */}
      <div className="flex items-center gap-3 text-xs text-gray-500 mb-1">
        <span className="font-medium text-gray-700">{formatDuration(total)}</span>
        <span>{intervals.length} interval{intervals.length !== 1 ? 's' : ''}</span>
      </div>

      {/* SVG preview */}
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        className="w-full h-[120px] sm:h-[140px]"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {/* Baseline */}
        <rect
          x={0}
          y={SVG_HEIGHT - BASELINE}
          width={SVG_WIDTH}
          height={BASELINE}
          fill="#f3f4f6"
        />
        {rects}
      </svg>

      {/* Legend — only zones present */}
      <ul className="flex flex-wrap gap-3 text-xs text-gray-600 mt-2">
        {zonesPresent.map((zone) => (
          <li key={zone} className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
              style={{ backgroundColor: POWER_ZONE_COLORS[zone] }}
            />
            {POWER_ZONE_LABELS[zone]}
          </li>
        ))}
      </ul>
    </div>
  )
}
