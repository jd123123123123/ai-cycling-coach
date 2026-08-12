# RideCoin — the point-system design

**Date:** 2026-08-12 · **Branch:** `cassette-reward-layer` · **Status:** design, pending review
**Grounded in:** `docs/research/2026-08-w3ride/` + the 2026 points-economy research brief (Duolingo/Strava/battle-pass evidence, cited inline below).
**Companion:** the RideCoin currency introduced in `2026-08-11-garage-composable-figures-design.md` (cosmetic-only, earn-only, no cash-out). This spec sets the **numbers and rules**.

---

## 1. Goal & the owner's requirements

A cosmetic reward currency (**RideCoin**) that is *"not too cheap, not too expensive, and keeps users attracted like Strava."* Hard requirements from the owner:

1. **Equal start** — everyone gets the **same** RideCoin for uploading a profile picture and connecting their watch, so all riders begin level.
2. **Streak multiplier** — riding consistency multiplies earnings.
3. **Challenge multiplier** — completing challenges multiplies earnings.

And the standing guardrails: **cosmetic-only** (no pay-to-win), earned by **TSS** (training stress), never distance.

---

## 2. The four evidence-based principles (why the numbers below are shaped this way)

1. **Faucet/sink balance → aim for the "pinch point."** Points in must never leave a permanent surplus, or prices lose meaning and aspiration dies ("inflation is the enemy of the economy designer"). Since this economy is **cosmetic-only with no cash-out**, we fully control both faucet and sink — the real risk is *motivational* (too cheap = boredom; too expensive = grind/churn), not economic collapse.
2. **Cap multipliers; never let them run linear or stack multiplicatively.** Uncapped streak/challenge multipliers blow out the faucet, alienate newcomers permanently, and drive burnout. The fix is **tiers with a hard ceiling** and **additive, not multiplicative, stacking**.
3. **The onboarding grant is a *head start*, not a jackpot** (endowed-progress effect — the pre-filled loyalty card that ~doubled completion). Size it so every rider is *visibly partway* to their first cosmetic — reachable in ~1 ride — but can't buy a top item outright.
4. **Long-term health = new sinks, not price-tuning.** Add **seasonal cosmetic drops** (8–12 week cadence, the battle-pass standard) so veterans always have something to chase. **Balances are permanent; only competitions reset.**

---

## 3. The currency & base earn

**RideCoin (RC).** Earn-only, spend-only, non-tradable, integer.

**Base earn per ride:**
```
base_RC(ride) = round(TSS)          # 1 RC per TSS point, k = 1
```
- Honest and legible: a rider *feels* that a hard hour (TSS ~90) pays more than an easy two hours (TSS ~60). Coach and game pull the same way.
- **Per-ride soft cap: 150 RC.** A ride's *earning* plateaus at TSS 150 even though the training still counts fully. Protects the pinch point from a single 5-hour epic minting a week of currency, and stops "grind an epic for coins" behaviour. (Epics above TSS 150 are rare; the cap rarely bites.)

**What a week earns (base, before multipliers):**
| Rider | Typical weekly TSS | Base RC / week |
|---|---|---|
| Beginner / casual | 150–250 | 150–250 |
| Committed | 350–500 | 350–500 |
| Serious | 600–800 | 550–700 (cap trims the biggest rides) |

---

## 4. The equal onboarding grant (requirement #1)

A **fixed, identical, one-time** grant — the same for every rider, no matter their history:

| Action | RideCoin |
|---|---|
| Add your profile photo / create your avatar | **125 RC** |
| Connect your watch (Garmin / COROS / Wahoo) | **125 RC** |
| **Onboarding total** | **250 RC** |

- **Everyone starts at exactly 250 RC.** Fairness the owner asked for: a 6-year Garmin veteran and a brand-new rider begin level — the grant rewards *joining and sharing*, not past volume. (The celebration screen still honours their history emotionally; it just doesn't pay differently.)
- **Sized as a head start.** The entry-tier cosmetic costs **300 RC** (§6), so after onboarding a rider sits at **250 / 300 — 83% of the way there**, one short ride from their first unlock. That's the endowed-progress "partway there" pull, and it hits the ideal **time-to-first-reward: ~1 ride**.
- It is **not** enough to buy a mid or prestige item outright — the aspiration still requires real training.

---

## 5. The two multipliers (requirements #2 & #3)

**Design rule that keeps this safe:** the **streak multiplier is live** (applies to every ride as you earn); the **challenge multiplier is a completion bonus** computed on *base* earnings. They stack **additively, not multiplicatively**, so the faucet can never run away.

### 5a. Streak multiplier — tiered, hard-capped at ×1.5

Applied to base earn on every qualifying ride. Uses the app's **existing forgiving streak** (rest days count, illness/injury pauses — `services/streak.py`), so consistency is rewarded without punishing rest.

| Forgiving-streak length | Multiplier |
|---|---|
| Day 1–2 | ×1.0 |
| Day 3–6 | ×1.1 |
| Day 7–13 | ×1.25 |
| Day 14–29 | ×1.4 |
| **Day 30+** | **×1.5 (hard ceiling)** |

```
ride_RC = min(150, round(TSS)) × streak_multiplier      # streak_multiplier ∈ [1.0, 1.5]
```
- **Capped at ×1.5.** Evidence-backed: a linear/uncapped streak multiplier both inflates the faucet unpredictably *and* creates streak-anxiety/burnout, and it permanently disadvantages newcomers. ×1.5 is a meaningful pull (7-day streaks ~2.4× retention in the reference data) without those failure modes.
- **Prestige is visual, not economic.** Keep the *badge* of a long unbroken streak (a "perfect streak" halo) separate from the earn cap, so the forgiveness mechanic never cheapens the streak's prestige.

### 5b. Challenge multiplier — completion bonus, bounded, computed on base

Completing a crew/monthly challenge awards a **one-time bonus** expressed as a multiplier on the **base RC** you earned *during that challenge's window*:

| Challenge tier | Completion multiplier | Bonus formula |
|---|---|---|
| Bronze | ×1.25 | `+0.25 × base_RC earned in window` |
| Silver | ×1.5 | `+0.50 × base_RC earned in window` |
| Gold | ×2.0 | `+1.00 × base_RC earned in window` |

```
challenge_bonus = (challenge_mult − 1) × base_RC_earned_during_challenge     # on BASE, pre-streak
```
- **Why on base, not on streak-boosted earn:** this makes the challenge bonus *additive* with the streak multiplier instead of multiplying it. Streak (×1.5 max) × challenge (×2.0) would be ×3.0 runaway; computing the challenge bonus on base and adding it keeps the effective ceiling bounded (~×2.5 in the extreme) and predictable.
- **Also bounded by a per-challenge cap** (e.g. Gold bonus capped at 1,000 RC) so a month-long mega-challenge can't mint a prestige item in one shot.
- Honours the owner's "challenge multiplier" ask, safely.

---

## 6. The shop — price tiers (the sink)

Four tiers so there's always both an attainable win and a long-term chase:

| Tier | Price | ~Time to earn (committed rider, ~400 RC/wk × ~1.3 avg mult) | Example |
|---|---|---|---|
| **Entry** | **300 RC** | onboarding + ~1 ride | a bar-tape colour, a bottle |
| **Mid** | **900 RC** | ~1.5 weeks | wheels, a jersey colourway |
| **Prestige** | **2,500 RC** | ~4–5 weeks | a frame paint, a signature helmet |
| **Rare / seasonal** | **6,000 RC** or achievement-gated | ~2–3 months | a limited seasonal figure/kit |

- **Time-to-first-reward ≈ 1 ride** (grant 250 → entry 300). Early win = habit forms = the streak/retention flywheel starts.
- Tiers give the "not too cheap" (prestige takes a month of real training) and "not too expensive" (an entry win is immediate) balance the owner wants.

---

## 7. Long-term health (anti-inflation)

- **Seasonal cosmetic drops every 8–12 weeks** — the durable defense against the maxed-out veteran. New sinks, not price changes.
- **Balances are permanent and never expire.** Wiping earned RC violates loss aversion and feels punitive. **Reset the *competition* (challenge leaderboards), never the *wallet*.**
- **Prestige/streak-gated exclusives** give the most dedicated riders a permanent chase (e.g. a figure only buyable at a 100-day streak).
- **Pair with intrinsic feedback** (the coach's real training verdicts) so the reward layer enhances, never replaces, the training signal.

---

## 8. Worked examples ("does it feel right?")

**New rider, week 1:** onboarding → **250 RC**. First ride TSS 65 (×1.0 streak) → +65 → **315 RC** → buys the entry bar-tape (300), lands at 15. *First unlock on day one.* ✓

**Committed rider, a strong month:** ~400 base RC/week; by week 3 the streak sits at ×1.4. Roughly 4 × 400 × ~1.3 ≈ **2,080 RC/month**, plus a Silver challenge (+~250) ≈ **2,330** → affords a **Prestige** frame paint in ~a month of consistent training. *Aspirational but reachable.* ✓

**Rest-heavy week (illness):** streak *pauses* (not broken), earns 0–low RC that week, keeps the ×1.4 tier on return. *No punishment for recovering.* ✓

---

## 9. How it wires to the codebase

- **Award at ingestion** — compute `ride_RC` in `create_activity` (`activity_service.py:280`, the durable-row hook), write a `points_ledger` row + increment `wallet` in the same transaction, and fire a post-ride notification carrying the RC earned. (Fixes the "awards are pull, not push" gap.)
- **Streak multiplier** — read the forgiving streak from the existing `services/streak.py`; map length → multiplier per §5a.
- **Challenge bonus** — on `CrewChallenge` completion (needs the "completed" state the crew spec flagged as missing), award the §5b bonus from the window's base-RC sum.
- **Onboarding grant** — award the two fixed grants when `avatar_url` is first set and when a device connection first succeeds (idempotent — once each, ever).
- **Tables** — `wallet`, `points_ledger`, `parts_catalog` (static), `owned_parts`, `loadouts` (from the garage spec). Ledger `reason ∈ {onboarding_photo, onboarding_device, ride_earn, streak_bonus, challenge_bonus, part_purchase, adjustment}`.

---

## 10. Parameters to tune with real data (flagged honest)

These are evidence-shaped **starting points**, not measured optima — tune against real rider data and A/B tests:
- **`k = 1` (TSS→RC rate)** and the **150 RC per-ride cap** — model against *your* riders' median weekly TSS so a committed rider earns ~1 mid-item every ~1.5 weeks.
- **Streak ceiling ×1.5** and the tier breakpoints.
- **Grant 250 RC vs entry 300 RC** — the 83%-of-first-item ratio is the lever for time-to-first-reward.
- **Shop tier prices** — the whole sink side; adjust as the cosmetic catalog grows.

## 11. Out of scope
Real-money purchase of RC, trading/marketplace, cash-out, RC that expires, distance-based earning, pay-to-win stat parts, uncapped or multiplicatively-stacking multipliers.
