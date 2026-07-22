# Suggested Build Order

Derived from the 134 ready items (`00-ready-to-prioritize.md`), each scored **Effort**
(S/M/L, from source) × **Impact** (1–5, discriminating, per-lens). Sequenced into waves:
cheap-and-valuable first, signature differentiators last. Impact ≤3 items sit in the
opportunistic tail — pull them in when they ride along with a wave item.

**How to read IDs:** `lens·item` (e.g. `01·A1`, `04·1`). Lenses: 01 amateur · 02 pro-science ·
03 behavioral · 04 UI.

---

## Wave 0 — Commit what's already built (do today)
Three audited, gates-green changesets are sitting uncommitted in the working tree. Land them
as three separate commits before starting new work:
1. **Coach chat load-failed fix** (`client.ts`/`coach.ts`/`useChatStream.ts`/`CoachChat.tsx`) — real prod bug.
2. **Readiness overnight-data gate** (`TodayTab.tsx` + test) — honesty fix, pairs with the flagship epic below.
3. **Page transitions** (`App.tsx` + `PageTransition.tsx`) — polish.

---

## ⭐ Flagship epic — "The Morning Readiness Moment"
The one theme all four lenses converged on independently. Ship it as a single themed release —
it's the app's emotional anchor and the reason to open every morning. Bundles across waves:

| ID | Item | Eff | Imp |
|----|------|:---:|:---:|
| 01·A1 | Beginner mode ON by default (plain-language readiness) | S | 5 |
| 04·2 | Score count-up odometer digits | S | 4 |
| 01·E1 | One-glance "should I ride today?" | M | 5 |
| 03·A1 | "Coach noticed" variable-cadence brief openers | M | 5 |
| 04·1 | Living Readiness Ring | M | 5 |
| 04·3 | Readiness aura background (score-keyed page tint) | M | 4 |

*(Reinforces the Wave-0 readiness-pending honesty gate — build these on top of it.)*

---

## Wave 1 — Quick wins · S effort, impact 4–5
Ship-this-sprint cheap value. Grouped by cluster; sequence top-to-bottom.

| ID | Item | Lens | Eff | Imp |
|----|------|:----:|:---:|:---:|
| 02·A2 | CP/W′/eFTP as headline number + FTP-drift prompt | pro | S | 5 |
| 01·A1 | Beginner mode ON by default | amateur | S | 5 |
| 03·C2 | One-tap streak repair morning-after | behav | S | 5 |
| 01·D3 | "Did I do well?" verdict chip | amateur | S | 4 |
| 01·B3 | Encouraging verdict vs bare letter grade | amateur | S | 4 |
| 01·A4 | "A basic bike is perfect" reassurance | amateur | S | 4 |
| 01·B5 | Never hard-block the plan on missing FTP | amateur | S | 4 |
| 01·A3 | First-ride celebration | amateur | S | 4 |
| 01·C3 | Next-milestone forward nudge | amateur | S | 4 |
| 01·F3 | Share cards as the primary social act | amateur | S | 4 |
| 04·2 | Score count-up odometer digits | UI | S | 4 |
| 02·I1 | Surface existing workout export (.zwo/.erg/.mrc) | pro | S | 4 |
| 02·K3 | Model transparency / methods drawer | pro | S | 4 |
| 02·F4 | Activate menstrual-cycle-aware readiness | pro | S–M | 4 |
| 03·C3 | Milestone anticipation countdown chip | behav | S | 4 |
| 03·D1 | "Tomorrow's session unlocks tonight" | behav | S | 4 |
| 03·F4 | Comeback "you're fresh again" nudge | behav | S | 4 |
| 03·F2 | Evening reflection RPE nudge | behav | S | 4 |
| 03·I1 | Gentle detraining loss-aversion nudge | behav | S | 4 |
| 03·I3 | "Almost a full week" close-the-gap | behav | S | 4 |
| 03·L3 | Anniversary "on this day" resurfacing | behav | S | 4 |

---

## Wave 2 — Core bets · M effort

### 2a · impact 5 (the meat — sequence these first within the wave)
| ID | Item | Lens | Imp |
|----|------|:----:|:---:|
| 01·C1 | Sync morning check-in → real daily ritual | amateur | 5 |
| 01·E1 | One-glance "should I ride today?" | amateur | 5 |
| 02·E2 | True per-second time-in-zone (accuracy fix) | pro | 5 |
| 02·A3 | Fatigued (durability) power-duration curve + trend | pro | 5 |
| 02·J1 | .FIT upload endpoint (device-agnostic) | pro | 5 |
| 03·A1 | "Coach noticed" brief micro-reactions | behav | 5 |
| 03·C1 | Streak-freeze / "life happens" token | behav | 5 |
| 03·H1 | Earned rider identity title | behav | 5 |
| 03·I2 | Endowed onboarding backfill | behav | 5 |
| 03·J1 | Event countdown daily drumbeat | behav | 5 |
| 04·1 | Living Readiness Ring | UI | 5 |
| 04·26 | One-tap branded share cards | UI | 5 |
| 04·27 | Breakthrough celebration choreography | UI | 5 |

### 2b · impact 4
| ID | Item | Lens |
|----|------|:----:|
| 01·A2 | Day-one backfill "wow" card | amateur |
| 01·B1 | Tap-to-explain on every surface | amateur |
| 01·B2 | Finish wiring `simple` mode | amateur |
| 01·C5 | Guilt-free comeback flow | amateur |
| 01·D2 | Decouple celebration from the power meter | amateur |
| 01·F1 | Social default → encouragement (compete opt-in) | amateur |
| 02·A5 | Prescriptive forward W′bal session validation | pro |
| 02·B4 | Continuous log-x PD curve + fresh/fatigued overlays | pro |
| 02·C1 | CP fit quality / CI / test protocol | pro |
| 02·C4 | Wire individualized Banister τ into projection | pro |
| 02·F1 | HRV autoregulation, legible + one-tap reshape | pro |
| 02·F3 | Reconcile readiness stack + consume intraday HRV | pro |
| 02·J3 | Data-trust layer (dropouts, spikes, drift) | pro |
| 02·D1 | Auditable periodization / mesocycle view | pro |
| 02·D2 | Taper optimizer with race-day TSB targeting | pro |
| 02·D3 | Deterministic plan re-solve on missed sessions | pro |
| 02·H2 | Post-race pacing execution vs optimal | pro |
| 02·H3 | Prospective fueling / CHO-demand modeling | pro |
| 03·A2 | Post-ride "one honest surprise" line | behav |
| 03·A4 | "The work paid rent" CTL ledger line | behav |
| 03·B1 | Endowed "next milestone" bars | behav |
| 03·D2 | Seasonal/event "chapter" unlocks | behav |
| 03·G1 | Asynchronous crew kudos | behav |
| 03·K1 | Breakthrough share card | behav |
| 03·L1 | Warm specific win-back push | behav |
| 03·L2 | "Fresh start" on return, no shame | behav |
| 04·3 | Readiness aura background | UI |
| 04·6 | Pull-to-refresh cadence spinner | UI |
| 04·14 | Charts that draw themselves | UI |

---

## Wave 3 — Big differentiators · L effort, impact 4–5
Heavy builds; schedule deliberately, one at a time.

| ID | Item | Lens | Imp |
|----|------|:----:|:---:|
| 04·23 | Ride map as hero art | UI | 5 |
| 04·16 | Power-duration signature chart | UI | 4 |
| 04·30 | Onboarding cinematic reveal | UI | 4 |
| 02·B3 | Per-second synced multi-channel ride viewer | pro | 4 |
| 02·H1 | Course-aware prospective pacing plan | pro | 4 |
| 03·B2 | Mastery ladders (Climber/Rouleur, W/kg bands) | behav | 4 |

---

## Opportunistic tail · impact ≤3
Not scheduled — pull in when adjacent to a wave item. Compact by lens:

- **amateur:** C4, D1, D4, D6, E2, G1, G3 (S); A5, B4, D7, F2 (M); D5, E3 (S, imp 2); F4, G2 (L).
- **pro:** C5, B2 (S); C2, J4 (S–M); B1, E1, F2, G1, G2, G3, J2, K2 (M); I3, K1 (L); I2 (API-gated — parked).
- **behavioral:** C4, G4, J3 (S); B3, B4, E1, E2, F3, G2, G3, H2, H3, K2, K3 (M); A3, E3 (S, imp 2); J2 (L).
- **UI:** 5, 15, 31 (S); 19, 20, 13, 28, 33, 4 (M); 22 (S, imp 2); 32, 34, 29 (M, imp 2); 10, 24 (L); 11 (S, imp 2).
- **Guardrails (ship *with* every motion/living-surface item, not standalone):** 04·35 reduced-motion parity, 04·36 contrast/focus.

---

## Before you build — unresolved gates
- **🔴 Dropped (2):** `02·A1` Ship-The-Lab, `03·D3` mystery achievements — do not build (see `00-ready-to-prioritize.md`).
- **🟡 Decide first (11):** 3 reverse deliberate deletions (`02·A4`, `02·C3`, `01·C2`); 8 are "primitive exists, confirm scope" (`03·F1`, `04·7/8/9/12/17/18/21/25`).
- **⚠️ Verify premises:** any "X already exists, just wire it" item gets a 2-min grep + `git log` first — the audit itself misjudged live/orphaned state twice.
