import { apiClient } from './client'

// ──────────────────────────────────────────────────────────────────────
// Referrals — a recruiter shares a code; a referred rider's ride earnings
// accrue a 10% cut into the recruiter's 30-day window, claimed once it closes.
// "Violet is a promise, lime is a receipt": pending window → claimable payout.
// Backend: /referrals/*.
// ──────────────────────────────────────────────────────────────────────

export interface TimeLeft {
  days: number; hours: number; minutes: number; seconds: number; ended: boolean
}

export interface ReferralCard {
  id: number
  referred_id: number
  handle: string
  avatar_url: string | null
  accrued_rc: number
  power_claimed: number      // RideCoin the referred rider earned in the window
  distance_km: number
  rides: number
  ends_on: string
  started_at: string
  time_left: TimeLeft
  ended: boolean
  claimed: boolean
  claimed_at: string | null
  claimable: boolean
}

export interface MyReferrals {
  code: string
  active_count: number
  completed_count: number
  active: ReferralCard[]
  completed: ReferralCard[]
}

export interface ClaimResult {
  paid: number
  already: boolean
  accrued: number
  wallet?: { balance: number }
}

// GET /referrals/mine — my code + active/completed referrals.
export async function fetchMyReferrals(): Promise<MyReferrals> {
  const res = await apiClient.get<MyReferrals>('/referrals/mine')
  return res.data
}

// GET /referrals/user/{id} — one referred rider's detail card.
export async function fetchReferralUser(referredId: number): Promise<ReferralCard> {
  const res = await apiClient.get<ReferralCard>(`/referrals/user/${referredId}`)
  return res.data
}

// POST /referrals/{id}/claim — pay a completed window's accrued bonus.
export async function claimReferral(referralId: number): Promise<ClaimResult> {
  const res = await apiClient.post<ClaimResult>(`/referrals/${referralId}/claim`)
  return res.data
}
