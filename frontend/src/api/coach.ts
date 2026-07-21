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
  /** German display title (template library i18n) — prefer under locale=de. */
  title_de?: string | null
  duration_minutes: number
  total_duration_s?: number | null
  predicted_tss: number
  predicted_ef_range?: [number, number] | null
  framework_cited: string
  purpose?: string | null
  /** Beginner-safe German purpose — prefer under locale=de. */
  purpose_de?: string | null
  category?: string | null
  blocks: ResolvedBlock[]
  why_this_workout?: string | null
}

/** Locale-honest display title/purpose: German fields under de, EN fallback. */
export function workoutDisplayTitle(w: Pick<PrescribedWorkout, 'title' | 'title_de'>, de: boolean): string {
  return de && w.title_de ? w.title_de : w.title
}
export function workoutDisplayPurpose(w: Pick<PrescribedWorkout, 'purpose' | 'purpose_de'>, de: boolean): string | null {
  return (de && w.purpose_de ? w.purpose_de : w.purpose) ?? null
}

/** Debug-register detector: internals like "Phase: base. TSB 0, CTL 42." must
 *  never render on an athlete-facing card (display rule, Jul 2026). */
export function looksLikeInternals(text: string): boolean {
  return /^Phase\s*:/i.test(text.trim())
    || /\bTSB\s*[+-]?\d/.test(text)
    || /\bCTL\s*[+-]?\d/.test(text)
    || /\bATL\s*[+-]?\d/.test(text)
}

/** The athlete-facing rationale for the session card: why_this_workout when
 *  it reads as prose, else the localized template purpose, else null (render
 *  nothing — never a metric dump). */
export function workoutDisplayRationale(
  w: Pick<PrescribedWorkout, 'why_this_workout' | 'purpose' | 'purpose_de'>,
  de: boolean,
): string | null {
  const why = w.why_this_workout?.trim()
  if (why && !looksLikeInternals(why)) return why
  const purpose = workoutDisplayPurpose(w, de)
  if (purpose && !looksLikeInternals(purpose)) return purpose
  return null
}

export type WorkoutSport = 'cycling' | 'running' | 'gym'

/**
 * Infer a prescribed workout's sport. PrescribedWorkout carries no explicit
 * sport field, so we read category / framework / title keywords and fall back
 * to the presence of real watt targets → cycling (bike default).
 */
export function detectWorkoutSport(w: PrescribedWorkout): WorkoutSport {
  const hay = `${w.category ?? ''} ${w.framework_cited ?? ''} ${w.title ?? ''}`.toLowerCase()
  if (/\b(gym|strength|kraft|lift|hypertroph|squat|deadlift|bench|press|mobility|core)\b/.test(hay)) return 'gym'
  if (/\b(run|running|lauf|jog|5k|10k|marathon|track|tempo run|interval run)\b/.test(hay)) return 'running'
  const hasWatts = (w.blocks ?? []).some((b) => b.target_watts_high > 0)
  return hasWatts ? 'cycling' : 'cycling'
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

// ─── ONE Daily Decision (usability audit P0-3) ──────────────────────────────
//
// Mirrors backend/app/schemas/coach.py DailyDecision exactly. Computed FRESH
// server-side per /coach/brief request (never from the cached brief row) and
// attached as BriefRead.daily_decision. Every surface renders subordinately —
// surfaces may add flavor but must never contradict `state`.

export type DailyDecisionState =
  | 'sick'
  | 'injured'
  | 'break'
  | 'trained_already'
  | 'planned_rest'
  | 'recover'
  | 'easy'
  | 'quality'
  | 'hard'

export interface DailyDecisionCTA {
  label: string
  target: string // frontend maps to a route, e.g. 'today#workout'
}

export interface DailyDecisionPlanned {
  title: string
  template_id?: string | null
  target_tss?: number | null
  duration_minutes?: number | null
}

export interface DailyDecisionReadiness {
  score?: number | null
  tier?: string | null // 'rest' | 'easy' | 'moderate' | 'push'
}

export interface DailyDecision {
  date: string // athlete-local ISO date
  state: DailyDecisionState
  verdict: string
  reason: string
  cta?: DailyDecisionCTA | null
  planned?: DailyDecisionPlanned | null
  readiness: DailyDecisionReadiness
  tss_target?: number | null
  // Garmin-style 0-21 strain scale, ALWAYS tss_target/8 (derived server-side
  // only). Null on rest / trained / sick days.
  strain_target?: number | null
}

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
  // "What changed & why" — transparent adaptation of today's plan.
  adaptations?: Adaptations | null
  // ONE Daily Decision (audit P0-3) — computed fresh at request time server-
  // side, never read from the cached row. Null only when computation failed.
  daily_decision?: DailyDecision | null
}

/**
 * Defensive rescue for sport-gated "logged" reviews (audit P0-2).
 *
 * When the sport gate refuses to grade (e.g. only a gym session on a
 * bike-plan day), the backend builds a review whose `duration`/`tss` pairs
 * are empty objects — that shape fails BriefRead's PostRideReview validation
 * server-side, so `brief.post_ride_review` arrives null even though the raw
 * dict still lives in `brief.evidence.post_ride_review`. This helper parses
 * ONLY that ungraded shape (grade == null) into a renderable PostRideReview
 * so the frontend can show the neutral "logged" card. Graded reviews always
 * survive validation and arrive typed — they are never rescued here.
 */
export function loggedReviewFromEvidence(
  evidence: Record<string, unknown> | undefined | null,
): PostRideReview | null {
  const raw = evidence?.['post_ride_review']
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  // Graded shape → the typed field is the only honest source; never rescue.
  if (r['grade'] != null) return null
  if (typeof r['headline'] !== 'string' || r['headline'].length === 0) return null

  const zeroPair: CompliancePair = { target: 0, actual: 0, delta_pct: 0, band: 'match' }
  const asPair = (v: unknown): CompliancePair => {
    if (v && typeof v === 'object') {
      const p = v as Record<string, unknown>
      if (typeof p['target'] === 'number' && typeof p['actual'] === 'number') {
        return {
          target: p['target'],
          actual: p['actual'],
          delta_pct: typeof p['delta_pct'] === 'number' ? p['delta_pct'] : 0,
          band: p['band'] === 'over' || p['band'] === 'under' ? p['band'] : 'match',
        }
      }
    }
    return zeroPair
  }
  const str = (v: unknown): string => (typeof v === 'string' ? v : '')
  const activities: ActivityWrapup[] = Array.isArray(r['activities'])
    ? (r['activities'] as unknown[]).flatMap((a): ActivityWrapup[] => {
        if (!a || typeof a !== 'object') return []
        const e = a as Record<string, unknown>
        return [{
          title: str(e['title']),
          sport: str(e['sport']) || 'other',
          tss: typeof e['tss'] === 'number' ? e['tss'] : null,
          duration_minutes: typeof e['duration_minutes'] === 'number' ? e['duration_minutes'] : null,
          distance_km: typeof e['distance_km'] === 'number' ? e['distance_km'] : null,
          intensity_factor: typeof e['intensity_factor'] === 'number' ? e['intensity_factor'] : null,
          efficiency_factor: typeof e['efficiency_factor'] === 'number' ? e['efficiency_factor'] : null,
          variability_index: typeof e['variability_index'] === 'number' ? e['variability_index'] : null,
          compliance_grade: null, // sport gate refused — never a grade
        }]
      })
    : []
  const totalsRaw = (r['totals'] ?? {}) as Record<string, unknown>
  return {
    grade: null,
    headline: r['headline'],
    duration: asPair(r['duration']),
    tss: asPair(r['tss']),
    intensity_factor: null,
    variability_index: null,
    ef: null,
    decoupling_pct: null,
    physiological_read: str(r['physiological_read']),
    goal_trajectory: str(r['goal_trajectory']),
    next_session_nudge: '', // ungraded day — never a nudge
    target_template_id: str(r['target_template_id']),
    target_template_title: str(r['target_template_title']),
    session_type: str(r['session_type']) || 'endurance',
    activities,
    totals: {
      tss: typeof totalsRaw['tss'] === 'number' ? totalsRaw['tss'] : 0,
      duration_minutes: typeof totalsRaw['duration_minutes'] === 'number' ? totalsRaw['duration_minutes'] : 0,
      distance_km: typeof totalsRaw['distance_km'] === 'number' ? totalsRaw['distance_km'] : 0,
      count: typeof totalsRaw['count'] === 'number' ? totalsRaw['count'] : activities.length,
    },
  }
}

export interface AdaptationChange {
  signal: string
  direction: 'up' | 'down' | 'flat'
  detail: string
  action: string
  principle: string
  severity: 'boost' | 'hold' | 'ease'
}
export interface Adaptations {
  summary: string
  changes: AdaptationChange[]
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
  locale: 'en' | 'de' = 'en',
): Promise<CoachBriefResponse> {
  const res = await apiClient.get<CoachBriefResponse>('/coach/brief', {
    params: { language, locale },
    timeout: 30_000, // LLM generation can take a few seconds
  })
  return res.data
}

export async function refreshCoachBrief(
  language: CoachLanguage = 'simple',
  locale: 'en' | 'de' = 'en',
): Promise<CoachBriefResponse> {
  const res = await apiClient.post<CoachBriefResponse>('/coach/brief/refresh', undefined, {
    params: { language, locale },
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

// Mirrors backend GoalTrajectoryRead (audit P0-4): every projection field is
// Optional — when the data can't support an honest projection the backend
// emits null and the UI must render an honest dash, never a fabricated number.
export interface GoalTrajectoryResponse {
  days_to_goal: number | null
  ctl_now: number | null
  ctl_7d_delta: number | null
  ctl_projected_at_goal: number | null
  ctl_target: number | null
  tsb_projected_at_goal: number | null
  taper_window: TaperWindow
  on_track: OnTrack
  weekly_tss_required: number | null
  weekly_tss_actual: number | null
  narrative_hook: string
  // What the projection is anchored on ('pmc', 'plan_simulation',
  // 'insufficient_data', …) — set by goal_trajectory.compute_goal_trajectory.
  projection_basis: string
  event_name: string | null
  event_date: string | null
  event_type: string | null
  target_priority: string | null
}

export async function fetchGoalTrajectory(locale = 'en'): Promise<GoalTrajectoryResponse> {
  const res = await apiClient.get<GoalTrajectoryResponse>('/coach/trajectory', { params: { lang: locale } })
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
