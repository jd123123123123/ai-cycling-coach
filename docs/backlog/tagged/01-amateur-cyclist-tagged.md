# Backlog Audit — 01 Amateur Cyclist (tagged against codebase state + history)

Method: each item verified against `frontend/src` / `backend/` and git history. Special
attention to any item proposing to "turn on / wire up / surface the existing" something,
which was checked against `git log` for deliberate removal/consolidation. Result: the
backlog is overwhelmingly additive — every proposal builds on real, still-wired
infrastructure. No item proposes reviving a deliberately-deleted feature (no
orphaned-analytics resurrection, no running/lift revival). One item (C2) rests on a
concern that is already partly resolved by deliberate design, so it is flagged for check.

| Item | Short title | Tag | Evidence (file / commit) |
|------|-------------|-----|--------------------------|
| A1 | Beginner mode ON by default | NEW | `OnboardingV3.tsx:152` depth `useState<Depth>('numbers')` — default IS numbers; proposes conditional auto-guide (additive). `LanguageContext.ts:32` already `simple` default. |
| A2 | Day-one backfill "wow" | NEW | `DidYouKnow.tsx` comparison engine exists (Berlin→Hamburg, pizzas); no such post-connect card today. |
| A3 | First-ride celebration | NEW | `AchievementBadges.tsx` "First ride" milestone is localStorage-only (line 20, 162); `lib/confetti.ts` + `CelebrationContext` exist to reuse. |
| A4 | "A basic bike is perfect" reassurance | NEW | `PowerProfileView.tsx` power-gated empty state exists; proposes softer copy. Additive. |
| A5 | Pick coach voice (warm default) | NEW | `coach_service.py` forks tone by register (guide\|numbers\|pro, lines 2397/3044); `motivation_style` in backend. Proposes new one-tap selector. |
| B1 | Tap-to-explain everywhere | NEW | `GlossarySheet.tsx` wired on only 3 surfaces (TrendsHero, RecoveryTrendsView, PowerProfileView); proposes extending — no removal. |
| B2 | Finish wiring `simple` mode | NEW | `utils/metricLabel.ts` map exists; jargon still hard-coded in several tabs. Additive coverage work. |
| B3 | Encouraging verdict vs letter grade | NEW | `SessionReportCard.tsx:41` grade letter + `{score}/100`; `RideRecapView.tsx:346` grade_letter. Proposes warm alt, keeps number on tap. |
| B4 | Plain-words ride analysis | NEW | `ContributorsSheet.tsx:75-101` simple-mode rewrite bank exists; proposes applying same pattern to recap. |
| B5 | Never hard-block plan on FTP | NEW | `PlanTab.tsx:569-599` real 409 FTP gate ("Enter your FTP"); proposes inline estimator fallback. |
| C1 | Sync morning check-in → ritual | NEW | `MorningCheckin.tsx:11-12` explicitly localStorage-only with `// Future: POST to backend`; no backend endpoint exists. Explicitly-planned new wiring. |
| C2 | Forgiving, single honest streak | NEEDS-CHECK | Streak is ALREADY server-side forgiving/rest-protected (`useStreak.ts:16` P0.2; `TrainingLogStrip.tsx:44` "ONLY streak producer, audit P0-5") and streak-break is a deliberately warm, rest-protected card (commit `9449bd5`, `StreakBreakOverlay.tsx`). Residual loss-aversion is one History line "ride tomorrow to keep the fire alive" (`HistoryTab.tsx:509`, added by pen-apply `093dc04`). Whether "pause not break" reconciliation extends the forgiving model or contradicts the deliberate break-card is ambiguous. |
| C3 | Next-milestone nudge | NEW | `AchievementBadges.tsx` ladder is celebration-only; proposes forward-looking Today chip. |
| C4 | Invitational ring copy | NEW | `WeeklyChallenge.tsx:72-75` "The week is asking." / "left to protect the ring" loss-aversion copy confirmed; proposes copy swap. |
| C5 | Guilt-free comeback flow | NEW | No lapse-return greeting today; builds on existing coach brief. |
| D1 | Ride-logged burst | NEW | `lib/confetti.ts` + post-sync path exist; proposes new tasteful moment. |
| D2 | Decouple celebration from power meter | NEW | `BreakthroughCelebration.tsx:18` gated to `power_pb`/`eftp_shift` (deliberate server gates, P1.2); proposes ADD power-free firsts alongside. |
| D3 | "Did I do well?" verdict chip | NEW | `RideRecapView` / `SessionReportCard` exist; proposes new lead reassurance line. |
| D4 | Human-scale comparisons per-ride | NEW | `DidYouKnow.tsx:25-176` engine exists (yearly); proposes per-ride/recap extension. |
| D5 | Delightful RPE reward loop | NEW | `RideRecapView.tsx:9,28` RPE 1-tap loop exists (`useRideRpe`); proposes richer reward animation. |
| D6 | Celebrate recovery/sleep wins | NEW | `RecoveryTab.tsx:287,650` green-days counter exists; proposes power-free recovery celebrations. |
| D7 | Monthly identity beat | NEW | `WeeklyRecapStory` exists; proposes new monthly identity line. |
| E1 | One-glance "should I ride?" | NEW | Today readiness hero exists (dense); proposes Guide-mode traffic-light lead. No removed simple-hero found. |
| E2 | "Am I doing okay?" coach check | NEW | Coach + simple mode support tone (`coach_service.py`); proposes new first-class chip. |
| E3 | "Why rest is training" explainer | NEW | Guilt-free rest copy exists; proposes tappable mini-explainer. |
| F1 | Social default → encouragement | NEW | `SocialTab.tsx` centers leaderboards/battles; proposes default posture change (cheer-first, opt-in compete). Additive gating. |
| F2 | Kudos & cheers | NEW | Kudos footer INTENTIONALLY omitted pending data, not decided-against (`RideRecapView.tsx:13` "real kudos need crew/social"). Proposes building positive-only layer. |
| F3 | Share cards as primary social act | NEW | `WeeklyWrapped.tsx` / `WeeklyRecapStory.tsx` render PNG shareables; proposes surfacing them more prominently. |
| F4 | "Follow my journey" public link | NEW | No public read-only share exists today; net-new (L). |
| G1 | Friendly empty states | NEW | Honest "—"/"Not tracked" tiles are deliberate (memory), but proposal REFRAMES copy (keeps honesty), does not fill with fake data. Additive. |
| G2 | Warmer optional skin | NEW | No prior light/warm theme in git history (`-S "light theme"` empty); net-new optional theme (L). |
| G3 | "Explain my week like I'm new" | NEW | Simple-mode coach + recap data exist; proposes new one-tap chip. |

## Summary counts
- NEW: 31
- CONTRADICTS-DECISION: 0
- NEEDS-CHECK: 1
