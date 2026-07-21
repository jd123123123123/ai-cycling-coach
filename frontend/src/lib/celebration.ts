// Pure celebration logic + honest dedup gating.
//
// Every celebration must fire ONCE per real achievement instance. These helpers
// keep that guarantee testable and free of React: milestone detection, PB
// selection, dedup-key construction, and a localStorage "seen" gate that no-ops
// safely in non-DOM environments (SSR / vitest node runner).

// ── Streak milestones ───────────────────────────────────────────────────────
// We celebrate the *arrival* at a milestone — not every day. A daily streak of
// e.g. 8 days is not a milestone; 7 is. Ordered ascending.
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365] as const

/** The milestone reached exactly at `streak`, or null if `streak` is not one. */
export function streakMilestone(streak: number | null | undefined): number | null {
  if (typeof streak !== 'number' || !Number.isFinite(streak)) return null
  return (STREAK_MILESTONES as readonly number[]).includes(streak) ? streak : null
}

// ── PB selection from ride efforts ──────────────────────────────────────────
export interface PrEffortLike {
  duration_s: number
  ride_watts: number
  is_pr: boolean
}

/** The single most impressive PB in a ride: the highest-wattage `is_pr` effort. */
export function bestPrEffort<T extends PrEffortLike>(efforts: T[] | null | undefined): T | null {
  if (!efforts || efforts.length === 0) return null
  let best: T | null = null
  for (const e of efforts) {
    if (!e.is_pr) continue
    if (typeof e.ride_watts !== 'number' || !(e.ride_watts > 0)) continue
    if (best === null || e.ride_watts > best.ride_watts) best = e
  }
  return best
}

/** Count of season-best efforts in a ride (drives the "N Erfolge" badge). */
export function prCount<T extends PrEffortLike>(efforts: T[] | null | undefined): number {
  if (!efforts) return 0
  return efforts.filter((e) => e.is_pr).length
}

/** Human duration label for a PB effort ("20s" / "5min" / "1h"). */
export function durationLabel(s: number): string {
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}min`
  return `${Math.round(s / 3600)}h`
}

// ── Dedup keys ──────────────────────────────────────────────────────────────
export function pbDedupKey(activityId: number): string {
  return `celebrate:pb:${activityId}`
}
export function streakDedupKey(milestone: number): string {
  return `celebrate:streak:${milestone}`
}
export function weeklyDedupKey(weekKey: string): string {
  return `celebrate:weekly:${weekKey}`
}

/**
 * ISO-week key (YYYY-Www) for the given date — the stable identity of a training
 * week, so the "week complete" celebration fires at most once per calendar week.
 */
export function isoWeekKey(d: Date): string {
  // Copy to a UTC-normalized date at midnight to avoid TZ/DST drift.
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  // ISO weeks start on Monday; shift so Thursday determines the year.
  const day = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - day + 3)
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  const firstDay = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3)
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000))
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

// ── Streak break (Duolingo-style "streak lost") ─────────────────────────────
// The server streak is already forgiving & plan-aware (services/streak.py): a
// planned Ruhetag counts as adherence and only a *skipped planned session* or
// an unplanned gap breaks it. So a genuine break shows up client-side as the
// live streak dropping from a meaningful length back to 0/1. We only ever fire
// the soft "streak lost" card on that real transition — never on first load
// with no history, never on a normal continuing streak, and never when the gap
// was a protected rest day (belt-and-suspenders check via the week states).

/** Minimum length a streak must have reached for its loss to be worth marking. */
export const STREAK_BREAK_MIN = 3

/** Per-user store of the last-seen streak length, so a *drop* is detectable. */
export function streakLastKey(userId: number | string): string {
  return `streak:last:${userId}`
}

export function readStoredStreak(userId: number | string): number | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(streakLastKey(userId))
    if (raw == null) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

export function writeStoredStreak(userId: number | string, value: number): void {
  try {
    if (typeof localStorage === 'undefined') return
    if (!Number.isFinite(value)) return
    localStorage.setItem(streakLastKey(userId), String(Math.trunc(value)))
  } catch {
    /* ignore — the store is best-effort */
  }
}

/** Local YYYY-MM-DD (athlete-local, matches the server's per-day attribution). */
export function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Dedup key for a single streak-break instance. Scoped to the user, the length
 * that broke, AND the day it was detected — so re-renders/revisits on the same
 * day no-op, but a genuinely new break later (even one of the same length)
 * still gets its own card.
 */
export function streakBreakDedupKey(
  userId: number | string,
  brokenLength: number,
  dateKey: string,
): string {
  return `streakbreak:${userId}:${brokenLength}:${dateKey}`
}

export interface StreakBreakResult {
  broke: boolean
  /** The length the streak had reached before it broke (0 when no break). */
  brokenLength: number
}

/**
 * Pure break detection from the stored previous streak and the live one.
 * Fires only when a meaningful streak (≥ STREAK_BREAK_MIN) collapsed back to
 * 0 or 1. `prev == null` (no history) never counts — we can't tell a break
 * from a first visit, so we stay silent and just seed the store.
 */
export function detectStreakBreak(
  prev: number | null | undefined,
  current: number | null | undefined,
): StreakBreakResult {
  const none: StreakBreakResult = { broke: false, brokenLength: 0 }
  if (typeof current !== 'number' || !Number.isFinite(current)) return none
  if (typeof prev !== 'number' || !Number.isFinite(prev)) return none
  if (prev >= STREAK_BREAK_MIN && current <= 1 && current < prev) {
    return { broke: true, brokenLength: prev }
  }
  return none
}

/**
 * True only if the recent week actually contains a break-causing day — a
 * `missed` (planned session skipped) or `unplanned` gap. If every recent gap
 * was a protected `rest`/`paused` day the streak could not honestly have
 * broken, so this returns false and the card is suppressed. This mirrors the
 * server's forgiving semantics on the client as a second, testable guard.
 */
export function hasGenuineBreakDay(
  week: ReadonlyArray<{ state: string }> | null | undefined,
): boolean {
  if (!week || week.length === 0) return false
  return week.some((d) => d.state === 'missed' || d.state === 'unplanned')
}

// ── Sequential celebration queue (pure, React-free) ─────────────────────────
// Several real wins can land in the same tick — a ride can set a PB *and* close
// the weekly rhythm *and* hit a streak milestone. The overlay can only show one
// card at a time, so instead of colliding (last-writer-wins) we QUEUE them and
// play one after another until the queue drains. This is the pure state machine
// behind CelebrationProvider; keeping it here makes enqueue / advance / drain /
// ordering fully unit-testable with no DOM.

/**
 * Priority weight per celebration kind — higher plays FIRST. Rationale: lead
 * with the biggest, rarest dopamine hit (a new power PB), then the streak
 * milestone, then the weekly-rhythm nod; a `break` (soft "streak lost") is the
 * quietest and always trails any happy card in the same burst so we never open
 * on a downer. Within the same priority, insertion order (FIFO) is preserved.
 */
export const CELEBRATION_PRIORITY: Record<string, number> = {
  pb: 5,
  ftp: 4,
  streak: 3,
  weekly: 2,
  generic: 1,
  break: 0,
}

export function celebrationPriority(kind: string): number {
  return CELEBRATION_PRIORITY[kind] ?? 1
}

/** Minimum shape the queue needs: a monotonic seq (stable tiebreak) + priority. */
export interface QueueEntry {
  /** Monotonic enqueue order — the stable tiebreak within equal priority. */
  seq: number
  /** Higher plays first (see CELEBRATION_PRIORITY). */
  priority: number
}

export interface QueueState<T extends QueueEntry> {
  /** The card currently on screen, or null when nothing is playing. */
  head: T | null
  /** Waiting cards, always kept sorted: priority desc, then seq asc. */
  pending: T[]
  /** 1-based position of `head` within the current run (for a "2/3" chip). */
  index: number
  /** Total cards seen in the current run (grows as more enqueue mid-run). */
  total: number
}

export function emptyQueue<T extends QueueEntry>(): QueueState<T> {
  return { head: null, pending: [], index: 0, total: 0 }
}

function sortPending<T extends QueueEntry>(items: T[]): T[] {
  return [...items].sort((a, b) => b.priority - a.priority || a.seq - b.seq)
}

/**
 * Enqueue a card. If nothing is playing it becomes the head immediately and a
 * fresh run starts (index 1 / total 1). Otherwise it joins `pending`, sorted by
 * priority (biggest-first) with seq as a stable FIFO tiebreak, and the run's
 * total grows so the progress chip stays honest.
 */
export function enqueueCelebration<T extends QueueEntry>(
  state: QueueState<T>,
  item: T,
): QueueState<T> {
  if (state.head == null) {
    return { head: item, pending: [], index: 1, total: 1 }
  }
  return {
    ...state,
    pending: sortPending([...state.pending, item]),
    total: state.total + 1,
  }
}

/**
 * Advance to the next card. Drains the highest-priority pending item into the
 * head and bumps the index; when nothing remains the run ends and the queue
 * resets to empty (so the next burst starts a clean 1/N run).
 */
export function advanceCelebration<T extends QueueEntry>(
  state: QueueState<T>,
): QueueState<T> {
  if (state.pending.length === 0) return emptyQueue<T>()
  const [next, ...rest] = state.pending
  return { head: next, pending: rest, index: state.index + 1, total: state.total }
}

/** True when the viewer asked for reduced motion (safe in non-DOM envs). */
export function prefersReducedMotion(): boolean {
  try {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

// ── localStorage "seen" gate ────────────────────────────────────────────────
export function hasCelebrated(key: string): boolean {
  try {
    if (typeof localStorage === 'undefined') return false
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

export function markCelebrated(key: string): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(key, '1')
  } catch {
    /* ignore — dedup is best-effort */
  }
}
