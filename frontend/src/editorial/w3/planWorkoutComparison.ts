import type { RideChart } from '../../api/rideChart'
import type { PlanDaySession } from './W3PlanView'

export type DayPowerChart = Pick<RideChart, 'activity_id' | 'elapsed_seconds' | 'samples' | 'ftp_at_ride' | 'zone_seconds'>
export type PowerBeam = { start: number; end: number; ratio: number | null }
export const ZONE_NAMES = ['Erholung', 'Ausdauer', 'Tempo', 'Schwelle', 'VO₂-Bereich', 'Anaerob', 'Sprint']
export const ZONE_LIMITS = [.55, .75, .9, 1.05, 1.2, 1.5, Infinity]
export const zoneOf = (ratio: number) => ZONE_LIMITS.findIndex(edge => ratio <= edge)
const valid = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

/** Preserve the saved interval timing, including unknown targets and recovery.
 * An intensity factor is not a flat power prescription or a zone distribution. */
export function plannedPower(day: PlanDaySession) {
  const beams: PowerBeam[] = []
  const zones = Array<number>(7).fill(0)
  let end = 0, complete = true
  for (const b of day.bars) {
    if (!valid(b.seconds) || b.seconds <= 0) { complete = false; continue }
    const ratio = !b.estimated && valid(b.ftpRatio) ? b.ftpRatio : null
    if (ratio == null) complete = false
    else zones[zoneOf(ratio)] += b.seconds
    const last = beams.at(-1)
    if (last && last.ratio === ratio) last.end += b.seconds
    else beams.push({ start: end, end: end + b.seconds, ratio })
    end += b.seconds
  }
  const duration = valid(day.plannedDuration) ? day.plannedDuration : null
  const matches = duration != null && Math.abs(end - duration) <= 30
  // Unknown durations cannot be compressed out of a chronological comparison.
  const timed = day.bars.every(b => valid(b.seconds) && b.seconds > 0)
  return { beams: timed ? beams : [], duration: Math.max(end, duration ?? 0), zones: !day.title ? zones : complete && end > 0 && matches ? zones : null }
}

/** The server supplies full-resolution zone counts; never re-count chart averages.
 * Each chart uses its ride-time FTP and elapsed timestamps, never moving duration. */
export function recordedPower(charts: DayPowerChart[], complete = true) {
  const beams: PowerBeam[] = [], boundaries: number[] = []
  const zones = Array<number>(7).fill(0)
  let offset = 0, allZones = complete && charts.length > 0, hasMissing = !complete, unknownElapsed = false
  for (const chart of charts) {
    const ftp = chart.ftp_at_ride
    const source = chart.samples.filter(s => valid(s.seconds)).slice().sort((a,b) => a.seconds - b.seconds)
    if (offset > 0) boundaries.push(offset)
    if (!source.length) {
      allZones = false; hasMissing = true
      if (valid(chart.elapsed_seconds) && chart.elapsed_seconds > 0) {
        beams.push({start:offset,end:offset+chart.elapsed_seconds,ratio:null})
        offset += chart.elapsed_seconds
      } else unknownElapsed = true
      continue
    }
    const step = source.length > 1 ? source[1].seconds - source[0].seconds : source[0].seconds * 2 + 1
    const duration = valid(chart.elapsed_seconds) ? chart.elapsed_seconds : Math.round(source.at(-1)!.seconds + Math.max(1, step) / 2 + .5)
    if (!valid(ftp) || ftp <= 0) { hasMissing = true; allZones = false }
    // At most 72 visual beams per ride. Their means are only for the drawing.
    const count = Math.min(72, source.length)
    for (let i = 0; i < count; i++) {
      const first = Math.floor(i * source.length / count), next = Math.floor((i + 1) * source.length / count)
      const chunk = source.slice(first, next)
      const start = first === 0 ? 0 : (source[first - 1].seconds + source[first].seconds) / 2 + .5
      const end = next === source.length ? duration : (source[next - 1].seconds + source[next].seconds) / 2 + .5
      const known = chunk.every(s => valid(s.power))
      const watts = known ? chunk.reduce((sum,s) => sum + s.power!, 0) / chunk.length : null
      const ratio = watts != null && ftp != null && ftp > 0 ? watts / ftp : null
      if (ratio == null) hasMissing = true
      beams.push({ start: offset + start, end: offset + end, ratio })
    }
    const knownZones = chart.zone_seconds.length === 7 && chart.zone_seconds.every(valid)
    if (!knownZones) allZones = false
    else chart.zone_seconds.forEach((s,i) => { zones[i] += s! })
    offset += duration
  }
  return { beams: unknownElapsed ? [] : beams, boundaries: unknownElapsed ? [] : boundaries, duration: offset, zones: allZones ? zones : null, partial: hasMissing }
}

export function zoneTime(seconds: number | null | undefined) {
  if (!valid(seconds)) return '—'
  if (seconds === 0) return '0′'
  if (seconds < 60) return `${Math.round(seconds)}″`
  return `${Math.round(seconds / 60)}′`
}

export function beamAt(beams: PowerBeam[], seconds: number) {
  return beams.find(b => seconds >= b.start && seconds < b.end)?.ratio ?? null
}
