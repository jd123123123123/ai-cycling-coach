export type CurvePoint = { x: number; y: number }

/** Rounded interpolation through observations; missing values split the curve.
 * Harmonic tangents keep every segment inside its measured endpoints. */
export function smoothCurve(points: readonly (CurvePoint | null)[]): string {
  const runs: CurvePoint[][] = []
  let run: CurvePoint[] = []
  for (const p of points) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      if (run.length) runs.push(run)
      run = []
      continue
    }
    if (run.at(-1)?.x === p.x) { runs.push(run); run = [] }
    run.push(p)
  }
  if (run.length) runs.push(run)
  return runs.map(ps => {
    const slopes = ps.slice(1).map((p, i) => (p.y - ps[i].y) / (p.x - ps[i].x))
    const tangents = ps.map((_, i) => {
      if (i === 0 || i === ps.length - 1) return 0
      const a = slopes[i - 1], b = slopes[i]
      return a * b > 0 ? 2 * a * b / (a + b) : 0
    })
    return `M${ps[0].x},${ps[0].y}` + ps.slice(1).map((p, i) => {
      const prev = ps[i], dx = (p.x - prev.x) / 3
      return ` C${prev.x + dx},${prev.y + dx * tangents[i]} ${p.x - dx},${p.y - dx * tangents[i + 1]} ${p.x},${p.y}`
    }).join('')
  }).join(' ')
}
