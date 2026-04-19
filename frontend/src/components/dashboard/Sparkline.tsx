interface SparklineProps {
  values: Array<number | null>
  width?: number
  height?: number
  stroke?: string
  fill?: string
  showDot?: boolean
}

/**
 * Minimal SVG sparkline. Handles null values by breaking the path.
 * Scales automatically to visible non-null values.
 */
export default function Sparkline({
  values,
  width = 80,
  height = 28,
  stroke = 'currentColor',
  fill,
  showDot = true,
}: SparklineProps) {
  const defined = values.filter((v): v is number => v != null)
  if (defined.length < 2) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden
        className="opacity-40"
      >
        <line
          x1={2} y1={height / 2} x2={width - 2} y2={height / 2}
          stroke={stroke} strokeWidth={1.2} strokeDasharray="2 3"
        />
      </svg>
    )
  }

  const min = Math.min(...defined)
  const max = Math.max(...defined)
  const range = Math.max(max - min, 1)
  const stepX = values.length > 1 ? (width - 4) / (values.length - 1) : 0
  const pad = 2

  const toY = (v: number) => {
    const norm = (v - min) / range
    return height - pad - norm * (height - pad * 2)
  }

  // Build path with M / L commands, breaking on null
  let path = ''
  let lastDefined = false
  let lastIndex = -1
  values.forEach((v, i) => {
    const x = pad + i * stepX
    if (v == null) {
      lastDefined = false
      return
    }
    if (!lastDefined) {
      path += `M${x.toFixed(1)} ${toY(v).toFixed(1)}`
    } else {
      path += `L${x.toFixed(1)} ${toY(v).toFixed(1)}`
    }
    lastDefined = true
    lastIndex = i
  })

  // Build filled area (close to bottom)
  let areaPath = ''
  if (fill && path) {
    areaPath = path
    const lastX = pad + lastIndex * stepX
    const firstDefIdx = values.findIndex((v) => v != null)
    const firstX = pad + firstDefIdx * stepX
    areaPath += ` L${lastX.toFixed(1)} ${(height - pad).toFixed(1)} L${firstX.toFixed(1)} ${(height - pad).toFixed(1)} Z`
  }

  const lastVal = values[lastIndex]
  const lastX = pad + lastIndex * stepX
  const lastY = lastVal != null ? toY(lastVal) : 0

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
      preserveAspectRatio="none"
    >
      {fill && <path d={areaPath} fill={fill} opacity={0.8} />}
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {showDot && lastVal != null && (
        <circle cx={lastX} cy={lastY} r={2.2} fill={stroke} />
      )}
    </svg>
  )
}
