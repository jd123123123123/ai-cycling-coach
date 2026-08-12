import { apiClient } from './client'

// ──────────────────────────────────────────────────────────────────────
// RideCoin — the cosmetic reward currency. Earned server-side from TSS at ride
// ingestion (base × forgiving-streak multiplier), plus the fixed 250 RC
// onboarding grant. Balances are permanent; only competitions reset.
// Spec: docs/superpowers/specs/2026-08-12-ridecoin-point-system-design.md
// ──────────────────────────────────────────────────────────────────────

export type LedgerReason =
  | 'onboarding_photo'
  | 'onboarding_device'
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
  ledger: LedgerEntry[]
  tier: TierProgress
}

export interface OnboardingGrantResult extends Wallet {
  granted: number
  reason: string
}

// GET /rewards/wallet — balance, recent ledger, and shop-tier progress.
export async function fetchWallet(): Promise<Wallet> {
  const res = await apiClient.get<Wallet>('/rewards/wallet')
  return res.data
}

// POST /rewards/onboarding/{kind} — award the one-time photo/device grant
// (idempotent; server returns granted:0 on repeat).
export async function grantOnboarding(
  kind: 'photo' | 'device',
): Promise<OnboardingGrantResult> {
  const res = await apiClient.post<OnboardingGrantResult>(
    `/rewards/onboarding/${kind}`,
  )
  return res.data
}
