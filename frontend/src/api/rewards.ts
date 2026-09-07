import { apiClient } from './client'

// ──────────────────────────────────────────────────────────────────────
// RideCoin — the cosmetic reward currency. Earned server-side from TSS at ride
// ingestion (base × forgiving-streak multiplier), plus the fixed 400 RC
// onboarding grants. Balances are permanent; only competitions reset.
// Spec: docs/superpowers/specs/2026-08-12-ridecoin-point-system-design.md
// ──────────────────────────────────────────────────────────────────────

export type LedgerReason =
  | 'onboarding_photo'
  | 'onboarding_device'
  | 'onboarding_bike'
  | 'ride_earn'
  | 'streak_bonus'
  | 'challenge_bonus'
  | 'part_purchase'
  | 'adjustment'

export interface LedgerEntry {
  reason: LedgerReason
  amount: number
  base_tss: number | null
  multiplier: number | null
  activity_id: number | null
  at: string | null
}

// Where the balance sits against the next shop tier (for the Biker tier gauge).
export interface TierProgress {
  next_tier: 'entry' | 'mid' | 'prestige' | 'rare' | null
  next_price: number
  balance: number
  to_go: number
  pct: number
}

export interface Wallet {
  balance: number
  /** Sum of every positive ledger line, ever. Levels are built on THIS —
   *  spending moves `balance`, never what was earned. Optional because a
   *  server that predates the field may still answer. */
  lifetime_earned?: number
  ledger: LedgerEntry[]
  tier: TierProgress
}

export interface OnboardingGrantResult extends Wallet {
  /** RC actually credited by this call. 0 when the grant was already claimed
   *  (idempotent server-side) or when the step isn't done yet — see `reason`
   *  (`no_avatar_yet` / `no_bike_yet`). */
  granted: number
  reason: string
}

/** The one-time onboarding steps, and what each pays.
 *
 *  SOURCE OF TRUTH: `backend/app/services/rewards.py` → `ONBOARDING_GRANT_RC`,
 *  which is what actually credits the ledger. These are mirrored here (the same
 *  arrangement `STREAK_MULTIPLIER_TIERS` already uses) so a screen can name the
 *  reward BEFORE the rider earns it — "digitalise your bike → +150 RC" — without
 *  a second hand-written number somewhere in a view. What was actually granted
 *  always comes from the server's `granted`, never from this table. */
export const ONBOARDING_GRANT_RC: Record<OnboardingKind, number> = {
  photo: 125,
  device: 125,
  bike: 150,
} as const

/** The equal head start every rider gets, once all three steps are done. */
export const ONBOARDING_TOTAL_RC = Object.values(ONBOARDING_GRANT_RC).reduce((a, b) => a + b, 0)

/** The onboarding steps that pay RideCoin — the `{kind}` of the grant route. */
export type OnboardingKind = 'photo' | 'device' | 'bike'

// The RideCoin a single ride earned, broken down (for the celebration screen).
export interface RideEarning {
  activity_id: number
  banked: boolean
  total: number
  base: number
  streak_bonus: number
  multiplier: number
  base_tss?: number | null
  at?: string | null
  /** Whether these coins have reached the wallet yet. False = still sealed. */
  claimed?: boolean
  /** What is still sitting in the chest, unbanked. */
  pending?: number
  /** Everything the ride paid — base, streak, gear bonus, Eddington. This is
   *  the number the swipe banks, so it is the number the screen counts up. */
  total_all?: number
  lines?: { reason: string; amount: number }[]
}

// ──────────────────────────────────────────────────────────────────────
// THE SEALED CHEST — a ride's coins are earned when it syncs and BANKED
// when the rider opens it. `GET /rewards/chest` is what the Today screen
// asks to know whether there is a ride waiting; it is the only thing in
// the app allowed to interrupt the day, so `sealed: false` is normal and
// the screen shows nothing at all.
// ──────────────────────────────────────────────────────────────────────

export interface ChestLine {
  reason: string
  amount: number
  multiplier?: number | null
}

/** A real breakthrough this ride made against the rider's own 90-day bests.
 *  Never invented: an ordinary Tuesday has none, and the screen says nothing. */
export interface ChestUnlock {
  kind: string
  headline: string
  detail: string
  value_w?: number | null
  prior_best_w?: number | null
  gain_pct?: number | null
}

export interface ChestRide {
  title: string | null
  started_at: string | null
  distance_km: number | null
  elevation_m: number | null
  duration_s: number | null
  tss: number | null
}

export interface Chest {
  sealed: boolean
  activity_id?: number
  total?: number
  lines?: ChestLine[]
  sealed_since?: string | null
  /** How many rides are unopened in total — the newest is the one shown. */
  waiting?: number
  ride?: ChestRide
  unlocks?: ChestUnlock[]
  unlock_count?: number
}

export interface ClaimResult {
  activity_id: number
  /** What just landed. Zero on a second tap, which is not an error. */
  claimed: number
  balance: number
  tier?: TierProgress
}

// ──────────────────────────────────────────────────────────────────────
// Streak → earn multiplier. THE ONE FRONTEND COPY of the server's earn rule.
//
// SOURCE OF TRUTH: `backend/app/services/rewards.py` — `_STREAK_TIERS` +
// `streak_multiplier()`, which is what actually mints RideCoin at ride
// ingestion (`ride_award`), with a documented HARD CEILING of ×1.5.
//
// Nothing on the wire carries the rider's CURRENT multiplier: `/rewards/wallet`
// returns `{balance, ledger, tier}`, and the only `multiplier` fields there are
// historical — one per past ledger line (what THAT ride was paid at). The
// forward-looking "if you ride today, you earn ×N" number therefore has to be
// derived client-side, from the same real streak the server would read
// (`GET /athletes/me/streak` → `streak`).
//
// Keep these tiers byte-for-byte in step with rewards.py. A number here that
// the server can't pay is a promise the app breaks the moment a ride lands.
// ──────────────────────────────────────────────────────────────────────

/** [minimum streak days, multiplier], highest tier first — mirrors `_STREAK_TIERS`. */
export const STREAK_MULTIPLIER_TIERS: readonly (readonly [number, number])[] = [
  [30, 1.5],
  [14, 1.4],
  [7, 1.25],
  [3, 1.1],
  [0, 1.0],
] as const

/** The ceiling rewards.py enforces — no rider ever earns above this. */
export const STREAK_MULTIPLIER_CAP = 1.5

/** The earn multiplier a streak of `streakDays` buys, capped at ×1.5.
 *  Port of `rewards.streak_multiplier()`. */
export function streakMultiplier(streakDays: number): number {
  for (const [threshold, mult] of STREAK_MULTIPLIER_TIERS) {
    if (streakDays >= threshold) return mult
  }
  return 1.0
}

/** 1 RC per TSS point — mirrors `rewards.RC_PER_TSS`. */
export const RC_PER_TSS = 1.0
/** A ride's earning plateaus here — mirrors `rewards.PER_RIDE_SOFT_CAP`. */
export const PER_RIDE_SOFT_CAP = 150

/** Base RideCoin a ride of `tss` earns before any multiplier.
 *  Port of `rewards.base_ride_rc()`. No measured stress → no reward, so a null
 *  or zero TSS earns nothing rather than a hopeful guess. */
export function baseRideRc(tss: number | null | undefined): number {
  if (!tss || tss <= 0) return 0
  return Math.min(PER_RIDE_SOFT_CAP, Math.round(tss * RC_PER_TSS))
}

/** What a planned session is on track to pay: its base times the rider's
 *  current streak multiplier. A FORECAST — the session has not been ridden, so
 *  callers must label it as such. Null when there is no planned TSS to compute
 *  from, which is the honest answer for a rest day or an unset session. */
export function forecastRideRc(
  plannedTss: number | null | undefined,
  streakDays: number | null | undefined,
): number | null {
  const base = baseRideRc(plannedTss)
  if (base <= 0) return null
  return Math.round(base * streakMultiplier(streakDays ?? 0))
}

/** The next tier up from `streakDays`, or null once the rider is at the cap.
 *  Lets a surface say "3 more days → ×1.4" from the same table, never a second
 *  hand-written ladder. */
export function nextStreakTier(streakDays: number): { days: number; multiplier: number } | null {
  const ascending = [...STREAK_MULTIPLIER_TIERS].sort((a, b) => a[0] - b[0])
  for (const [threshold, mult] of ascending) {
    if (streakDays < threshold) return { days: threshold, multiplier: mult }
  }
  return null
}

/** "1.25×" / "1×" — the multiplier as the reward surfaces print it. */
export function formatMultiplier(mult: number): string {
  return `${Number(mult.toFixed(2))}×`
}

// GET /rewards/wallet — balance, recent ledger, and shop-tier progress.
export async function fetchWallet(): Promise<Wallet> {
  const res = await apiClient.get<Wallet>('/rewards/wallet')
  return res.data
}

// GET /rewards/ride/{id} — how one ride's RideCoin was made.
export async function fetchRideEarning(activityId: number): Promise<RideEarning> {
  const res = await apiClient.get<RideEarning>(`/rewards/ride/${activityId}`)
  return res.data
}

// POST /rewards/onboarding/{kind} — award the one-time photo/device/bike grant
// (idempotent; server returns granted:0 on repeat).
export async function grantOnboarding(
  kind: OnboardingKind,
): Promise<OnboardingGrantResult> {
  const res = await apiClient.post<OnboardingGrantResult>(
    `/rewards/onboarding/${kind}`,
  )
  return res.data
}


// GET /rewards/chest — the newest unopened ride, and what it is holding.
export async function fetchChest(): Promise<Chest> {
  const res = await apiClient.get<Chest>('/rewards/chest')
  return res.data
}

// POST /rewards/ride/{id}/claim — open the chest. THE moment the coins land.
export async function claimRide(activityId: number): Promise<ClaimResult> {
  const res = await apiClient.post<ClaimResult>(`/rewards/ride/${activityId}/claim`)
  return res.data
}
