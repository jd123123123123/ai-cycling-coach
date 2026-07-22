# Backlog 03 — Behavioral Dopamine — Audit vs. codebase state & history

Audited against live code (`frontend/src`, `backend/app`) and git history on 2026-07-22.
Ban list respected (per `docs/competitive-roadmap-tasks.md:112-121` + memory): loot/XP/arbitrary-badges,
global leaderboards, login-streak gacha, guilt mechanics, celebration not earned physiologically, biological age.

| Item# | Short title | Tag | Evidence (file/commit or n/a) |
|-------|-------------|-----|-------------------------------|
| A1 | "Coach noticed" brief micro-reactions | NEW | New deterministic-detector pool on `useCoachBrief.ts`; detector-gated, capped ~2/wk. No banned mechanic. |
| A2 | Post-ride "one honest surprise" line | NEW | Extends `RideRecapView.tsx` with detector-backed line. Honest, no fabrication. |
| A3 | Count-up reveal on hero numbers | NEW | `useCountUp.ts` already used in ~10 components; standardizing an existing pattern, reduced-motion guarded. |
| A4 | "The work paid rent" CTL ledger line | NEW | Honest modeled CTL delta on Recap/The-Road; uses existing PMC. |
| B1 | Endowed "next milestone" progress bars | NEW | `AchievementsView.tsx` already renders honest in-progress bars (in_progress + progress bars); endowment from real history. Roadmap-consistent. |
| B2 | Mastery ladders (Climber/Rouleur tiers) | NEW | Tiers = physiology W/kg-VAM bands, not XP (guardrail); roadmap endorses W/kg BandChip (P2.9). Extends `PowerProfileView`/`BikeProgressView`. |
| B3 | "You vs you, 90 days ago" ghost | NEW | No ghost-compare in code today (grep: none); self-referential, explicitly not vs-strangers. Avoids leaderboard ban. |
| B4 | "Streak of quality" secondary streak | NEW | Extends `streak.py`; adherence-quality signal, pauses on deload like main streak. |
| C1 | Streak freeze / "life happens" token | NEW | Task lists "a new streak-freeze token" as a NEW example. No freeze logic exists today (`git log -S freeze` on streak files: none). Complements existing status pause (P0.2). |
| C2 | One-tap streak repair morning-after | NEW | Extends `StreakBreakOverlay.tsx`; repair gated on real unsynced data. Anti-guilt, roadmap-consistent. |
| C3 | Milestone anticipation chip countdown | NEW | Today streak chip; near real milestones only, silent on rest days. Not guilt. |
| C4 | Milestone celebration variety (tiers) | NEW | `celebration.ts` STREAK_MILESTONES [3,7,14,30,50,100,200,365] already exist + engine celebrates streaks; this varies visuals. Note: "rare/legendary badge" rarity wording flirts with loot vocab but stays cosmetic on earned adherence milestones. |
| D1 | "Tomorrow's session unlocks tonight" | NEW | UI reveal on evening brief; evening brief-refresh trigger already exists (commit a9f536a #4). Content genuinely finalized, no withholding of actionable info. |
| D2 | Seasonal/event "chapter" unlocks | NEW | Maps to real periodization (`goal_trajectory.py`); no fake gates. |
| D3 | "Mystery detector" teaser in Achievements | CONTRADICTS-DECISION | Current `AchievementsView.tsx` + `achievement_service.py` are ALL-transparent (unlocked grid + honest progress bars; grep for hidden/silhouette/secret/mystery: none). Introducing locked "mystery" silhouettes + "collection to complete" drift is exactly the curiosity-gap/collection loot loop the roadmap bans (`competitive-roadmap-tasks.md:115`) and reverses the deliberate honest-transparency design. |
| E1 | Personalized celebration palette | NEW | Skins tone by coach voice only; criteria unchanged (guardrail). No banned mechanic. |
| E2 | Celebration cooldown / moment budgeting | NEW | Queue exists (`CelebrationContext.tsx`) with dedup+biggest-first only; NO cooldown/rate-limit today (grep: none). Adds new scarcity logic; never suppresses major wins. |
| E3 | Haptic/sound signatures per class | NEW | Extends `haptics.ts`; reduced-motion/silent respected. |
| F1 | Post-ride sync "recap ready" push | NEEDS-CHECK | Claims "trigger exists (S)". Reality: commit a9f536a's post-ride trigger refreshes the BRIEF only; `push_service.py` schedules `run_morning_briefs` (morning-only). `send_user_push` primitive exists but no post-ride push job — the "just turn it on" premise is only half-true; unclear if post-ride push was deliberately deferred vs not-yet-built. |
| F2 | Evening reflection RPE nudge | NEW | New training-day-only push; RPE loop exists (`useRideRpe.ts`). Honestly labeled new work. |
| F3 | "Weather window" opportunistic nudge | NEW | `WeatherWindowCard`/`WeatherNudge` already mounted in `TodayTab.tsx`; item adds a new push channel (push is morning-only today). Interlock-aware, rare. |
| F4 | Comeback "you're fresh again" nudge | NEW | New physiology-gated push on `useRecoveryEta.ts`; one push, not a drip. |
| G1 | Asynchronous crew kudos | NEW | Kudos not built yet (grep: only "no kudos" copy + omitted footer); matches roadmap P2.8 (crew-scoped, interlock-aware). Not a global firehose. |
| G2 | "Someone in your crew is riding" presence | NEW | Aggregate/opt-in, no ranked leaderboard; crew-scoped. |
| G3 | Quality-based crew challenges | NEW | `useChallenges.ts` exists (TSS competition); this adds quality templates = roadmap P2.9. Not volume/ego race. |
| G4 | Shared crew milestone cheer | NEW | Reuses existing physiology-gated crew nudge path (`crew_nudge`); canned warm lines. |
| H1 | Earned rider identity title | NEW | Computed from real data, never ranked vs others. No banned mechanic. |
| H2 | Physiology-earned badge cabinet (persist) | NEW | `achievement_service.py` + `achievement.py` model + migration f3d7a1c already physiology-only (code comments: "no XP/levels/login streaks"); roadmap P2.3. |
| H3 | "Fitness age"/era-arc, honest | NEW | Explicitly REJECTS biological-age (the banned trap, roadmap:118); proposes honest CTL/eFTP era arc instead. |
| I1 | Gentle detraining loss-aversion nudge | NEW | Loss-aversion "done kindly"; silent on rest/taper/illness; no manufactured urgency. Roadmap endorses kind continuity. |
| I2 | Endowed onboarding backfill | NEW | Roadmap P2.10; real Garmin-history numbers, honest "—" when thin. |
| I3 | "Almost a full week" close-the-gap | NEW | Goal-gradient; only when physiologically sound, says rest completes the week if needed. Anti-guilt guarded. |
| J1 | Event countdown daily drumbeat | NEW | `EventCountdownCard`/`goal_trajectory.py` exist to extend (P1.8); real terrain/readiness, honest when behind. |
| J2 | Season Wrapped annual ritual | NEW | Roadmap P2.1; every stat real, dataless cards omitted. |
| J3 | Solstice/seasonal moments | NEW | Cycling-calendar theming, opt-out, no fake FOMO. |
| K1 | Breakthrough share card | NEW | Detector shipped P1.2 (`BreakthroughCelebration.tsx`); confidence-gated, no inflation. |
| K2 | "Ride story" W'bal cinematic recap | NEW | Roadmap P1.9; powered/clean rides only, honest "—". |
| K3 | Animated route "your line" share | NEW | Extends existing Wrapped route card to single rides; location-privacy aware. |
| L1 | Warm specific win-back push | NEW | Real-data re-engagement, strict frequency cap, honors opt-out, no guilt. |
| L2 | "Fresh start" on return, no shame | NEW | Anti-guilt fresh-start; honest re-scale to current fitness. |
| L3 | Anniversary "on this day" resurfacing | NEW | Real positive memories only, rare, disableable. |

## Summary counts
- NEW: 39
- NEEDS-CHECK: 1 (F1)
- CONTRADICTS-DECISION: 1 (D3)

## Forensic notes
- No item revives deliberately-removed code (DuelArena/PowerArena/StreakStrip/CoachBrief stubs stay unmounted; none referenced).
- Kudos (G1): only "no kudos" copy exists (`strings.ts:188`, `RideRecapView.tsx:13`); real kudos = future roadmap P2.8. Building it is NEW, not a revival.
- Streak-freeze token (C1): no freeze logic in history; net-new, and named as a NEW archetype by the audit brief.
- MorningCheckin.tsx is orphaned (localStorage-only, mounted nowhere but i18n) — no backlog item proposes wiring it, so it did not affect any tag.
