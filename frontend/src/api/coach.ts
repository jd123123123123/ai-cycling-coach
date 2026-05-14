import { apiClient, getAccessToken } from './client'

// ─── Types ───────────────────────────────────────────────────────────────────

// Legacy — Phase 5 shape. Kept for backward-tolerant parsing of pre-5.1 briefs.
export type BriefIntensity = 'rest' | 'easy' | 'moderate' | 'push'
export interface BriefOption {
  intensity: BriefIntensity
  title: string
  why: string
  tss_target: number
  blocked?: boolean
  block_reason?: string | null
}

export interface OutlookEntry {
  day_offset: number
  suggested_tss: number
  note: string
}

// Phase 5.1 — prescription-mode shape
export interface ResolvedBlock {
  name: string
  duration_s: number
  target_watts_low: number
  target_watts_high: number
  target_pct_ftp: number
  zone: number // 1..7
  rpe: number  // 1..10
  cadence_low: number | null
  cadence_high: number | null
  target_hr_low: number | null    // bpm — null when LTHR unknown
  target_hr_high: number | null
}

export interface PrescribedWorkout {
  template_id: string
  title: string
  duration_minutes: number
  total_duration_s?: number | null
  predicted_tss: number
  predicted_ef_range?: [number, number] | null
  framework_cited: string
  purpose?: string | null
  category?: string | null
  blocks: ResolvedBlock[]
  why_this_workout?: string | null
}

export interface AlternateWorkout {
  label: 'less_time' | 'recover'
  one_liner: string
  template_id: string
}

// Phase 5.3 — post-ride review shape
export interface CompliancePair {
  target: number
  actual: number
  delta_pct: number
  band: 'match' | 'over' | 'under'
}

export type RideGrade = 'perfect' | 'strong' | 'okay' | 'overcooked' | 'undercooked'

// Step 3 — multi-activity wrap-up. Populated when the athlete completed
// >=2 activities on the local day (also emitted as a single-element array
// when count == 1 so the frontend has a uniform shape to read from).
export interface ActivityWrapup {
  title: string
  sport: string
  tss?: number | null
  duration_minutes?: number | null
  distance_km?: number | null
  intensity_factor?: number | null
  efficiency_factor?: number | null
  variability_index?: number | null
  // Per-ride compliance chip — present only when count >= 2; for n=1 the
  // top-level PostRideReview.grade carries this instead.
  compliance_grade?: RideGrade | null
}

export interface WrapupTotals {
  tss: number
  duration_minutes: number
  distance_km: number
  count: number
}

export interface PostRideReview {
  // grade is null when count >= 2 (per-ride chips render instead).
  grade: RideGrade | null
  headline: string
  duration: CompliancePair
  tss: CompliancePair
  intensity_factor?: CompliancePair | null
  variability_index?: number | null
  ef?: number | null
  decoupling_pct?: number | null
  physiological_read: string
  goal_trajectory: string
  next_session_nudge: string
  target_template_id: string
  target_template_title: string
  session_type: string
  // Step 3 — multi-activity additions. Default to [] / zero-totals on older
  // briefs so the frontend can read defensively.
  activities?: ActivityWrapup[]
  totals?: WrapupTotals
}

// Today-runthrough Step 7 — tomorrow plan + regeneration
export type IntensityChip =
  | 'recovery'
  | 'endurance'
  | 'tempo'
  | 'threshold'
  | 'vo2'
  | 'race'

export interface TomorrowPlan {
  description: string
  predicted_tss: number
  intensity_chip: IntensityChip
}

export interface Regeneration {
  bullets: string[]
}

export type CoachLanguage = 'simple' | 'technical'

export interface CoachBriefResponse {
  id: number
  generated_at: string
  verdict: string
  rationale: string
  evidence: Record<string, unknown>
  // Phase 5.1 primary fields
  prescribed_workout: PrescribedWorkout | null
  alternates: AlternateWorkout[]
  // Legacy — populated only when reading old rows
  options?: BriefOption[] | null
  outlook_7d: OutlookEntry[] | null
  frameworks_cited: string[]
  model_used: string
  from_cache: boolean
  // Phase 5.2 — which language mode the brief is in
  language: CoachLanguage
  // Phase 5.3 — when the athlete has already trained today, a complete
  // review is attached. Frontend renders PostRideReview card in place of
  // the PrescribedWorkoutCard. Absent / null → no review.
  post_ride_review?: PostRideReview | null
  // Step 7 (today-runthrough) — optional forward-looking blocks. Older
  // briefs without these fields stay backward-compatible.
  tomorrow_plan?: TomorrowPlan | null
  regeneration?: Regeneration | null
}

export interface CauseEntry {
  label: string
  severity: 'low' | 'med' | 'high'
  evidence: string
}

export interface WhyTiredResponse {
  causes: CauseEntry[]
  snapshot: Record<string, unknown>
}

export interface TransparencyResponse {
  snapshot: Record<string, unknown>
  system_prompt: string
  model: string
  last_brief_id: number | null
  last_generated_at: string | null
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// ─── Plain requests ──────────────────────────────────────────────────────────

export async function fetchCoachBrief(
  language: CoachLanguage = 'simple',
): Promise<CoachBriefResponse> {
  const res = await apiClient.get<CoachBriefResponse>('/coach/brief', {
    params: { language },
    timeout: 30_000, // LLM generation can take a few seconds
  })
  return res.data
}

export async function refreshCoachBrief(
  language: CoachLanguage = 'simple',
): Promise<CoachBriefResponse> {
  const res = await apiClient.post<CoachBriefResponse>('/coach/brief/refresh', undefined, {
    params: { language },
    timeout: 30_000,
  })
  return res.data
}

export async function fetchWhyTired(): Promise<WhyTiredResponse> {
  const res = await apiClient.get<WhyTiredResponse>('/coach/why')
  return res.data
}

export async function fetchTransparency(): Promise<TransparencyResponse> {
  const res = await apiClient.get<TransparencyResponse>('/coach/transparency')
  return res.data
}

// ─── Goal trajectory ────────────────────────────────────────────────────────
//
// Event-aware projection — the dashboard's primary source for "are you on
// track for your A-event?" Mirrors backend's GoalTrajectoryRead.

export type TaperWindow = 'too_flat' | 'ideal' | 'too_fresh' | 'overreached' | 'unknown'
export type OnTrack = 'ahead' | 'on_track' | 'behind' | 'no_goal'

export interface GoalTrajectoryResponse {
  days_to_goal: number | null
  ctl_now: number
  ctl_7d_delta: number
  ctl_projected_at_goal: number
  ctl_target: number | null
  tsb_projected_at_goal: number
  taper_window: TaperWindow
  on_track: OnTrack
  weekly_tss_required: number
  weekly_tss_actual: number
  narrative_hook: string
  event_name: string | null
  event_date: string | null
  event_type: string | null
  target_priority: string | null
}

export async function fetchGoalTrajectory(): Promise<GoalTrajectoryResponse> {
  const res = await apiClient.get<GoalTrajectoryResponse>('/coach/trajectory')
  return res.data
}

// ─── External workouts ───────────────────────────────────────────────────────

export type ExternalPlatform = 'zwift' | 'trainerroad' | 'rouvy'

export interface ExternalWorkoutMatch {
  id: string
  title: string
  platform: ExternalPlatform
  category: string
  duration_min: number
  intensity_factor: number
  structure: string
  min_ftp: number | null
  predicted_tss: number
}

export interface ExternalWorkoutsResponse {
  session_type: string
  target_minutes: number
  matches: ExternalWorkoutMatch[]
}

export async function fetchExternalWorkouts(opts?: {
  platforms?: ExternalPlatform[]
  limit?: number
}): Promise<ExternalWorkoutsResponse> {
  const params: Record<string, string | number> = {}
  if (opts?.platforms?.length) params.platforms = opts.platforms.join(',')
  if (opts?.limit) params.limit = opts.limit
  const res = await apiClient.get<ExternalWorkoutsResponse>('/coach/external-workouts', {
    params,
  })
  return res.data
}

// ─── Workout export (.zwo / .erg / .mrc) ─────────────────────────────────

export type WorkoutFormat = 'zwo' | 'erg' | 'mrc' | 'fit'

/**
 * Download today's prescribed workout as a structured file. We fetch the body
 * with our auth-aware apiClient (so the token is attached) instead of using a
 * naked <a download> link, then trigger a Blob download client-side. This
 * keeps the auth session intact and lets us read the Content-Disposition for
 * the filename.
 */
export async function downloadWorkoutExport(format: WorkoutFormat): Promise<void> {
  const res = await apiClient.get(`/coach/workout/export`, {
    params: { format },
    responseType: 'blob',
  })
  const blob = res.data as Blob
  const cd = (res.headers['content-disposition'] as string | undefined) ?? ''
  const match = /filename="?([^"]+)"?/i.exec(cd)
  const filename = match?.[1] ?? `workout.${format}`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// ─── Streaming chat ──────────────────────────────────────────────────────────

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8000'

export interface StreamChunk {
  type: 'delta' | 'replace' | 'done' | 'error'
  text?: string
  message?: string
}

/**
 * Streams a chat reply from /coach/chat (SSE, POST body).
 * Yields structured chunks — `delta` appends, `replace` wipes the buffer
 * and sets it to the safe redirect text.
 *
 * Throws a typed error with `status` when the endpoint returns a non-2xx
 * response — callers can check `err.status === 503` to render the disabled
 * state copy.
 */
export async function* streamCoachChat(
  messages: ChatMessage[],
  language: CoachLanguage = 'simple',
  signal?: AbortSignal,
): AsyncGenerator<StreamChunk, void, unknown> {
  const token = getAccessToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}/coach/chat`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify({ messages, language }),
    signal,
  })

  if (!res.ok || !res.body) {
    const err = new Error(`Coach chat failed with ${res.status}`) as Error & {
      status?: number
      detail?: string
    }
    err.status = res.status
    try {
      const payload = await res.json()
      err.detail = typeof payload?.detail === 'string' ? payload.detail : undefined
    } catch {
      // body wasn't JSON — fine, keep default message
    }
    throw err
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // SSE blocks are separated by a blank line
      let idx: number
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)

        // Each block has one-or-more `data: <json>` lines. Concatenate them.
        const dataLines = block
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trimStart())
        if (dataLines.length === 0) continue
        const dataStr = dataLines.join('\n')
        try {
          const parsed = JSON.parse(dataStr) as StreamChunk
          yield parsed
          if (parsed.type === 'done' || parsed.type === 'error') return
        } catch {
          // Not JSON — yield as a raw delta so we never lose a chunk
          yield { type: 'delta', text: dataStr }
        }
      }
    }
  } finally {
    try { reader.releaseLock() } catch { /* noop */ }
  }
}
