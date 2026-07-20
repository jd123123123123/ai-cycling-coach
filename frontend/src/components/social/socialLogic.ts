/**
 * socialLogic — pure helpers behind SocialTab (audit P1-10).
 *
 * The backend (be-social) is concurrently adding athlete-scaled challenge
 * targets, per-rider leaderboard targets, a last_week_at_now pace field and an
 * unambiguous crew object to the crews payloads. Every reader here is
 * structural + tolerant: it probes the plausible field names and falls back to
 * an honest client-side derivation (or null) when the field isn't there yet,
 * so the UI never hardcodes 800 TSS / 7 days and never crashes on either
 * payload generation.
 */

type Rec = Record<string, unknown>

/** Coerce unknown → finite number, else null. */
export function numOrNull(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

function firstPositive(...vals: unknown[]): number | null {
  for (const v of vals) {
    const n = numOrNull(v)
    if (n != null && n > 0) return n
  }
  return null
}

const asRec = (v: unknown): Rec | undefined =>
  v != null && typeof v === 'object' ? (v as Rec) : undefined

// ── Personal challenge targets ────────────────────────────────────────

export interface PersonalTargets {
  /** Weekly load target in TSS — null when there is no honest basis yet. */
  loadTargetTss: number | null
  /** Active-days target — athlete-scaled, defaults to 4 (never 7). */
  activeDaysTarget: number
}

/**
 * Athlete-scaled personal targets. Prefers the backend's scaled targets
 * (own 4-week average × 1.05); falls back to last week's total × 1.05 when
 * the field hasn't landed, and to NO load challenge (null) when there's no
 * history at all — never a fixed 800 TSS.
 */
export function pickPersonalTargets(duel: unknown): PersonalTargets {
  const d = asRec(duel)
  const t = asRec(d?.personal_targets) ?? asRec(d?.targets)
  const backendLoad = firstPositive(
    d?.weekly_target_tss, // landed field name (DuelResponse)
    t?.weekly_tss, t?.weekly_load_tss, t?.load_tss,
    d?.weekly_load_target, d?.weekly_tss_target,
  )
  const backendDays = firstPositive(
    d?.active_days_target, // landed field name (DuelResponse)
    t?.active_days, t?.weekly_active_days,
  )
  const lastWeekTss = numOrNull(asRec(d?.you_last_week)?.tss)
  const loadTargetTss =
    backendLoad ??
    (lastWeekTss != null && lastWeekTss > 0 ? Math.round(lastWeekTss * 1.05) : null)
  const activeDaysTarget = Math.min(7, Math.max(1, Math.round(backendDays ?? 4)))
  return { loadTargetTss, activeDaysTarget }
}

// ── Self-duel pace (last week at this point of the week) ─────────────

/**
 * TSS the athlete had banked by this point of LAST week — the backend's
 * `last_week_at_now` pace field. Accepts a bare number or a stats object with
 * a `tss` field; null when the field hasn't landed yet.
 */
export function readPaceTss(duel: unknown): number | null {
  const d = asRec(duel)
  const raw = d?.last_week_at_now ?? d?.you_last_week_at_now
  const direct = numOrNull(raw)
  if (direct != null) return direct
  return numOrNull(asRec(raw)?.tss)
}

/**
 * Early-week = before ~Thursday of the running week, OR while the athlete's
 * own total is below 40% of last week's final. During this window the
 * self-duel renders the pace line instead of a raw 0:60 losing scoreboard.
 */
export function isEarlyWeek(
  weekStart: string | undefined | null,
  nowMs: number,
  youTss: number,
  lastWeekFinalTss: number,
): boolean {
  let beforeThu = false
  if (weekStart) {
    const start = new Date(weekStart).getTime()
    if (Number.isFinite(start)) {
      const dayIdx = Math.floor((nowMs - start) / 86_400_000) // 0 = week's first day
      beforeThu = dayIdx < 3
    }
  }
  const belowPace = lastWeekFinalTss > 0 && youTss < 0.4 * lastWeekFinalTss
  return beforeThu || belowPace
}

// ── Duel column headers — never DU / DU ──────────────────────────────

export function duelColumnHeaders(
  isPast: boolean,
  de: boolean,
  opponentHandle: string,
): { you: string; opp: string } {
  if (isPast) {
    return de
      ? { you: 'DIESE WO.', opp: 'LETZTE WO.' }
      : { you: 'THIS WK', opp: 'LAST WK' }
  }
  return { you: de ? 'DU' : 'YOU', opp: opponentHandle.toUpperCase() }
}

// ── Friend-add opt-in ─────────────────────────────────────────────────

/**
 * POST /crews/connect body. The crew-challenge invite is OPT-IN: the flag is
 * always sent explicitly so an unchecked box means "do not enter anyone".
 * Sent under both plausible names (`invite_to_challenge`,
 * `join_challenges`) — the backend ignores unknown extra fields harmlessly
 * and picks up whichever it models on the connect side.
 */
export function buildConnectPayload(
  userId: number,
  inviteToChallenge: boolean,
): { user_id: number; invite_to_challenge: boolean; join_challenges: boolean } {
  return {
    user_id: userId,
    invite_to_challenge: inviteToChallenge,
    join_challenges: inviteToChallenge,
  }
}

/**
 * POST /crews/invites/{id}/accept-mine body — the landed backend flag:
 * `join_challenges` (default false). Accepting a crew invite never silently
 * enters the new member into pre-existing challenges.
 */
export function buildAcceptPayload(
  joinChallenges: boolean,
): { join_challenges: boolean } {
  return { join_challenges: joinChallenges }
}

// ── One unambiguous crew state ────────────────────────────────────────

export interface CrewInfo {
  exists: boolean
  name: string | null
  memberCount: number
}

/**
 * Single source of truth for "do I have a crew?" — merges the /crews/me crew
 * object with the duel roster so the UI can never show an existing crew and a
 * "no crew yet" empty state at the same time.
 */
export function resolveCrewInfo(myCrew: unknown, duelCrewCount: number): CrewInfo {
  const m = asRec(myCrew)
  const crew = asRec(m?.crew)
  const members = Array.isArray(m?.members) ? (m?.members as unknown[]) : []
  const rawName = crew?.name
  const name = typeof rawName === 'string' && rawName.trim() !== '' ? rawName : null
  const memberCount =
    firstPositive(
      crew?.member_count,
      members.length,
      duelCrewCount > 0 ? duelCrewCount + 1 : null,
    ) ?? 0
  return { exists: crew != null || duelCrewCount > 0, name, memberCount }
}

// ── Per-rider leaderboard target ──────────────────────────────────────

/** A standing row's own weekly target (TSS) — null until the backend sends it. */
export function readRowTargetTss(row: unknown): number | null {
  const r = asRec(row)
  return firstPositive(r?.weekly_target_tss, r?.target_tss, r?.weekly_target)
}
