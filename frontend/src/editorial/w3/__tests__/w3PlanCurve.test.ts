import { describe, expect, it } from 'vitest'
import { weekCurve } from '../w3PlanCurve'

const x = (i: number) => i * 10
const y = (value: number) => 100 - value

describe('weekly load curve', () => {
  it('fills the week domain while keeping each selectable sample centred', () => {
    const centres=(i:number)=>(i+.5)/4*320
    const path=weekCurve([180,140,140,90],centres,y,{left:0,right:320})
    expect(path).toMatch(/^M0 -80 H40/)
    expect(path).toMatch(/280 10 H320$/)
    expect(path.match(/C/g)).toHaveLength(3)
  })
  it('does not extend a recorded curve into missing boundary weeks', () => {
    const path=weekCurve([null,20,null],i=>i*10+5,y,{left:0,right:30})
    expect(path).toBe('M15 80')
    expect(weekCurve([null,null],x,y,{left:0,right:30})).toBe('')
  })
  it('leaves missing or invalid measurements disconnected', () => {
    const path = weekCurve([10, null, 30, NaN, 50], x, y)
    expect(path.match(/M/g)).toHaveLength(3)
    expect(path).not.toContain('C')
    expect(path).not.toMatch(/NaN|undefined|null/)
    expect(weekCurve([null, null], x, y)).toBe('')
  })

  it('keeps measured zero distinct from missing data', () => {
    const path = weekCurve([10, 0, null, 30], x, y)
    expect(path).toContain('10 100')
    expect(path.match(/C/g)).toHaveLength(1)
    expect(path.match(/M/g)).toHaveLength(2)
  })

  it('smooths a peak without inventing a higher or lower load', () => {
    const values = [20, 80, 30]
    const path = weekCurve(values, x, y)
    const segments = [...path.matchAll(/C([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)/g)]
    expect(segments).toHaveLength(2)
    segments.forEach((segment, i) => {
      const [cx1, cy1, cx2, cy2, endX, endY] = segment.slice(1).map(Number)
      const startY = y(values[i]), expectedEndY = y(values[i + 1])
      expect(endX).toBe(x(i + 1))
      expect(endY).toBe(expectedEndY)
      for (let step = 0; step <= 100; step++) {
        const t = step / 100, u = 1 - t
        const sampleY = u ** 3 * startY + 3 * u ** 2 * t * cy1 + 3 * u * t ** 2 * cy2 + t ** 3 * endY
        const sampleX = u ** 3 * x(i) + 3 * u ** 2 * t * cx1 + 3 * u * t ** 2 * cx2 + t ** 3 * endX
        expect(sampleY).toBeGreaterThanOrEqual(Math.min(startY, endY) - 1e-9)
        expect(sampleY).toBeLessThanOrEqual(Math.max(startY, endY) + 1e-9)
        expect(sampleX).toBeGreaterThanOrEqual(x(i) - 1e-9)
        expect(sampleX).toBeLessThanOrEqual(endX + 1e-9)
      }
    })
  })
})
