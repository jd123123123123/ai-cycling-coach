/**
 * Custom-workout builder API + the shared block model.
 *
 * The builder composes typed blocks (warm-up / steady / interval / ramp /
 * free-ride / cool-down), all in %FTP — never watts. TSS/duration are computed
 * client-side for a live estimate (matching the backend formula) and reconciled
 * with the server value on save. Absolute watts are materialised server-side
 * from the athlete's FTP only at schedule / export time.
 */
import { apiClient } from './client'
import type { ResolvedBlock } from './coach'

export type BlockType = 'warmup' | 'steady' | 'interval' | 'ramp' | 'freeride' | 'cooldown'

/** One authored block. Which fields apply depends on `type` (see the backend
 *  CustomBlock validator — mirrored here). */
export interface CustomBlock {
  type: BlockType
  duration_s?: number | null
  // steady / freeride
  power_pct?: number | null
  // warmup / ramp / cooldown
  from_pct?: number | null
  to_pct?: number | null
  // interval
  reps?: number | null
  on_s?: number | null
  off_s?: number | null
  on_pct?: number | null
  off_pct?: number | null
  // optional
  cadence_low?: number | null
  cadence_high?: number | null
  name?: string | null
}

export interface CustomWorkoutRead {
  id: number
  name: string
  description: string | null
  sport: string
  blocks: CustomBlock[]
  estimated_tss: number
  estimated_duration_s: number
  created_at: string
  updated_at: string
}

export interface CustomWorkoutWrite {
  name: string
  description?: string | null
  sport?: string
  blocks: CustomBlock[]
}

// ── Client-side computation (mirrors app.services.custom_workout_blocks) ──────

const RAMP_TYPES: BlockType[] = ['warmup', 'ramp', 'cooldown']
const FREERIDE_IF = 0.65

/** Coggan zone from a %FTP fraction — mirrors backend zone_for_pct / BlockBars. */
export function zoneForPct(pct: number): number {
  if (pct <= 0.55) return 1
  if (pct <= 0.75) return 2
  if (pct <= 0.9) return 3
  if (pct <= 1.05) return 4
  if (pct <= 1.2) return 5
  if (pct <= 1.5) return 6
  return 7
}

/** Total seconds of one block (intervals expand to reps × (on+off)). */
export function blockDuration(b: CustomBlock): number {
  if (b.type === 'interval') return (b.reps ?? 0) * ((b.on_s ?? 0) + (b.off_s ?? 0))
  return b.duration_s ?? 0
}

function rampIf(a: number, b: number): number {
  return Math.sqrt((a * a + a * b + b * b) / 3)
}

/** Effective IF (intensity factor) of a block for TSS accounting. */
function blockIf(b: CustomBlock): number {
  if (b.type === 'interval') {
    const on = b.on_pct ?? 0
    const off = b.off_pct ?? 0
    const onS = b.on_s ?? 0
    const offS = b.off_s ?? 0
    if (onS + offS === 0) return 0
    return Math.sqrt((onS * on * on + offS * off * off) / (onS + offS))
  }
  if (RAMP_TYPES.includes(b.type)) return rampIf(b.from_pct ?? 0, b.to_pct ?? 0)
  if (b.type === 'freeride') return FREERIDE_IF
  return b.power_pct ?? 0
}

/** Live estimated TSS — Σ duration_h × IF² × 100 (matches compute_template_tss). */
export function estimateTss(blocks: CustomBlock[]): number {
  const raw = blocks.reduce((acc, b) => {
    const hours = blockDuration(b) / 3600
    const iff = blockIf(b)
    return acc + hours * iff * iff * 100
  }, 0)
  return Math.round(raw * 10) / 10
}

export function estimateDuration(blocks: CustomBlock[]): number {
  return blocks.reduce((acc, b) => acc + blockDuration(b), 0)
}

/** Map an authored block → ResolvedBlock(s) so the existing BlockBars renderer
 *  draws the live preview. Watts are 0 (preview is %FTP-shaped); BlockBars only
 *  reads target_pct_ftp / zone / reps / on_s / off_s / off_pct_ftp. Ramps are
 *  split into a short gradient of sub-segments so the bars visibly slope. */
export function blocksToPreview(blocks: CustomBlock[]): ResolvedBlock[] {
  const out: ResolvedBlock[] = []
  const base = (name: string, duration_s: number, pct: number): ResolvedBlock => ({
    name,
    duration_s,
    target_watts_low: 0,
    target_watts_high: 0,
    target_pct_ftp: pct,
    zone: zoneForPct(pct),
    rpe: 0,
    cadence_low: null,
    cadence_high: null,
    target_hr_low: null,
    target_hr_high: null,
  })
  for (const b of blocks) {
    if (b.type === 'interval') {
      out.push({
        ...base(b.name ?? 'Intervalle', blockDuration(b), b.on_pct ?? 0),
        reps: b.reps,
        on_s: b.on_s,
        off_s: b.off_s,
        off_pct_ftp: b.off_pct,
      })
    } else if (RAMP_TYPES.includes(b.type)) {
      const a = b.from_pct ?? 0
      const z = b.to_pct ?? 0
      const steps = 6
      const each = (b.duration_s ?? 0) / steps
      for (let i = 0; i < steps; i++) {
        const pct = a + ((z - a) * (i + 0.5)) / steps
        out.push(base(b.name ?? b.type, each, pct))
      }
    } else if (b.type === 'freeride') {
      out.push(base(b.name ?? 'Freie Fahrt', blockDuration(b), FREERIDE_IF))
    } else {
      out.push(base(b.name ?? 'Steady', blockDuration(b), b.power_pct ?? 0))
    }
  }
  return out
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

export async function listCustomWorkouts(): Promise<CustomWorkoutRead[]> {
  const res = await apiClient.get<CustomWorkoutRead[]>('/custom-workouts')
  return res.data
}

export async function getCustomWorkout(id: number): Promise<CustomWorkoutRead> {
  const res = await apiClient.get<CustomWorkoutRead>(`/custom-workouts/${id}`)
  return res.data
}

export async function createCustomWorkout(body: CustomWorkoutWrite): Promise<CustomWorkoutRead> {
  const res = await apiClient.post<CustomWorkoutRead>('/custom-workouts', body)
  return res.data
}

export async function updateCustomWorkout(id: number, body: CustomWorkoutWrite): Promise<CustomWorkoutRead> {
  const res = await apiClient.put<CustomWorkoutRead>(`/custom-workouts/${id}`, body)
  return res.data
}

export async function deleteCustomWorkout(id: number): Promise<void> {
  await apiClient.delete(`/custom-workouts/${id}`)
}

export interface ScheduleResponse {
  planned_workout_id: number
  date: string
  blocks_source: string
  estimated_tss: number
}

export async function scheduleCustomWorkout(id: number, isoDate: string): Promise<ScheduleResponse> {
  const res = await apiClient.post<ScheduleResponse>(`/custom-workouts/${id}/schedule`, { date: isoDate })
  return res.data
}

/** Download the workout as a real .zwo (Zwift Workout XML). Fetched via the
 *  auth-aware client (Bearer token attached), then Blob-downloaded — a naked
 *  <a href> would 401. Mirrors coach.downloadWorkoutExport. */
export async function downloadZwo(id: number, name: string): Promise<void> {
  const res = await apiClient.get(`/custom-workouts/${id}/export.zwo`, { responseType: 'blob' })
  const blob = res.data as Blob
  const cd = (res.headers['content-disposition'] as string | undefined) ?? ''
  const match = /filename="?([^"]+)"?/i.exec(cd)
  const filename = match?.[1] ?? `${name || 'workout'}.zwo`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}
