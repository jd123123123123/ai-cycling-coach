# Backlog — Ready to Prioritize

Consolidated from the four lens backlogs (`01`–`04`), after auditing every item against
current code **and git history**. Each original item was tagged NEW / NEEDS-CHECK /
CONTRADICTS-DECISION; per-file tables live in `docs/backlog/tagged/`.

- **147 items audited** → **134 ready** · **11 decide-first** · **2 dropped**
- The audit's job was to catch items premised on a wrong picture of current state
  (e.g. "resurrect the analytics that were deliberately deleted"). ~91% survived.

> ⚠️ **Trust-but-verify the premises.** The audit agents themselves misread live/orphaned
> state more than once (claimed `PMCChart` / `InsightsSection` were live — both are dead;
> claimed shaders are "quarantined to Wrapped" — a shader already renders on the Today hero).
> Before committing effort to any item that says *"X already exists, just wire/widen it,"*
> do a 2-minute grep + `git log` on X. That single check is the highest-leverage habit here.

---

## 🔴 Dropped (2) — contradict deliberate decisions, do not build

| From | Item | Why it's out |
|------|------|--------------|
| `02` | **A1 — "Ship The Lab"** (resurrect AnalyzeTab/ReportTab + orphaned analytics cards) | Those surfaces were deleted across **two** deliberate redesigns (`cbe1a68` curated-Insights cleanup → `093dc04` V3 tabs). Live analytics is now dedicated pages (`PowerProfileView`, `SeasonView`, `DebriefView`, …). Reviving fights current architecture. |
| `03` | **D3 — "Mystery" achievement teasers** (locked silhouettes + collection-to-complete) | The curiosity-gap / collection-loot loop the roadmap explicitly **bans**, and a reversal of the intentional all-transparent Achievements design. |

---

## 🟡 Decide first (11) — a product call, not a build ticket

### These reverse a deliberate deletion — build only if you *want* to undo that curation (3)
| From | Item | The decision |
|------|------|--------------|
| `02` | **A4 — standalone W′bal "matches burned" card** | Science is live in ride/debrief, but the standalone `WBalanceTraceCard` was deleted in `cbe1a68`. Re-add a dedicated card, or keep W′bal inside the ride story? |
| `02` | **C3 — FFM projection bands as a first-class chart** | `TrajectoryCard` (CTL-projection-to-event) was deleted in `cbe1a68`. The scenario-fork ("if you do X") is genuinely new; the base chart duplicates the deleted one. |
| `01` | **C2 — forgiving single streak / "pause not break"** | Streak is already server-side forgiving and the break card is deliberately warm (`9449bd5`). Confirm this *extends* that model rather than neutering the break moment. |

### Primitive already ships — confirm the narrow scope wasn't intentional, then it's cheap (8)
| From | Item | What actually exists |
|------|------|----------------------|
| `03` | **F1 — post-ride "recap ready" push** | Post-ride trigger only refreshes brief *content*; there is **no** post-ride push job (only morning sends). More work than the "(S)" estimate — verify it wasn't deferred on purpose. |
| `04` | **#7 — toggle/segment morphs** | `SegmentedTabs` already ships the `layoutId` sliding pill; only the V3 bottom bar may be excluded. |
| `04` | **#8 — haptic vocabulary** | `lib/haptics.ts` exists (`hapticTick`/`hapticCelebrate`); only new verbs + opt-out. |
| `04` | **#9 — long-press metric peek** | `GlossarySheet` already does tap-to-explain on metric chips; peek overlaps it. |
| `04` | **#12 — staggered card cascade** | `card-enter` keyframe exists but used only in `KeyReads` — is the narrow scope a choice? |
| `04` | **#17 — HoverBars → TouchBars** | `HoverBars` already uses pointer events (tap works on touch); only drag-scrubber + haptic are new. |
| `04` | **#18 — sparklines everywhere** | `Sparkline` already used in several surfaces; "everywhere" is scope-broadening. |
| `04` | **#21 / #25 — shader on Coach / Wrapped auto-advance** | #21 rests on a false "shaders quarantined" premise; #25's story engine already has manual advance — only auto-advance timing is missing. |

---

## 🟢 Ready to prioritize (134)

All additive, no history risk. Grouped by lens; effort/impact detail is in the source
files (`01`–`04`). Naming note: item IDs repeat across lenses, so each is lens-prefixed.

### `01` Amateur cyclist — kindness on by default (31)
| ID | Item |
|----|------|
| 01·A1 | Beginner mode ON by default (auto-guide plain language) |
| 01·A2 | Day-one backfill "wow" card after connect |
| 01·A3 | First-ride celebration |
| 01·A4 | "A basic bike is perfect" reassurance on power-gated states |
| 01·A5 | Pick coach voice (warm default) |
| 01·B1 | Tap-to-explain on every surface (extend GlossarySheet) |
| 01·B2 | Finish wiring `simple` mode (kill leaked jargon) |
| 01·B3 | Encouraging verdict vs bare letter grade |
| 01·B4 | Plain-words ride analysis on recap |
| 01·B5 | Never hard-block the plan on missing FTP (inline estimator) |
| 01·C1 | Sync morning check-in → real daily ritual (POST + feed coach) |
| 01·C3 | Next-milestone forward nudge chip |
| 01·C4 | Invitational ring copy |
| 01·C5 | Guilt-free comeback flow |
| 01·D1 | Ride-logged burst |
| 01·D2 | Decouple celebration from the power meter (power-free firsts) |
| 01·D3 | "Did I do well?" verdict chip |
| 01·D4 | Human-scale comparisons per ride |
| 01·D5 | Delightful RPE reward loop |
| 01·D6 | Celebrate recovery / sleep wins |
| 01·D7 | Monthly identity beat |
| 01·E1 | One-glance "should I ride today?" (Guide-mode traffic light) |
| 01·E2 | "Am I doing okay?" coach check chip |
| 01·E3 | "Why rest is training" explainer |
| 01·F1 | Social default → encouragement, compete is opt-in |
| 01·F2 | Kudos & cheers (positive-only) |
| 01·F3 | Share cards as the primary social act |
| 01·F4 | "Follow my journey" public read-only link |
| 01·G1 | Friendly empty states (reframe honest "—", no fake data) |
| 01·G2 | Warmer optional skin |
| 01·G3 | "Explain my week like I'm new" one-tap |

### `02` Pro / sports-science — depth on the built engine (36)
| ID | Item |
|----|------|
| 02·A2 | CP/W′/eFTP as athlete-level number + FTP-drift prompt |
| 02·A3 | Durability-adjusted (fatigued) power-duration curve + season trend |
| 02·A5 | Forward/prescriptive W′bal — validate interval sessions survivable |
| 02·B1 | Pedaling dynamics panel (L/R, torque eff, smoothness, PCO) |
| 02·B2 | Torque–cadence / quadrant analysis surfaced |
| 02·B3 | Interactive per-second synced multi-channel ride viewer |
| 02·B4 | Continuous log-x power-duration curve w/ fatigued overlays |
| 02·C1 | CP model with fit quality, CI, protocol guidance |
| 02·C2 | FTP/eFTP tracking with change-detection + breakthrough tagging |
| 02·C4 | Wire individualized Banister τ into projection |
| 02·C5 | Bike-native power-based VO2 estimate; label Garmin's honestly |
| 02·D1 | Auditable periodization / mesocycle view |
| 02·D2 | Taper optimizer with race-day TSB targeting |
| 02·D3 | Deterministic plan re-solve on missed/downgraded sessions |
| 02·E1 | TID dashboard with phase target + drift alerts |
| 02·E2 | True per-second time-in-zone (replace whole-ride IF bucketing) |
| 02·F1 | HRV-guided autoregulation, per-session + legible |
| 02·F2 | NFOR / non-functional-overreaching block watch |
| 02·F3 | Reconcile readiness stack + consume stored intraday HRV |
| 02·F4 | Activate menstrual_adjustment (opt-in cycle-aware readiness) |
| 02·G1 | Heat-strain & thermal-load context per ride |
| 02·G2 | Altitude-aware load & performance adjustment |
| 02·G3 | CdA trend & aero-vs-terrain power decomposition |
| 02·H1 | Course-aware prospective pacing plan |
| 02·H2 | Post-race pacing execution vs optimal |
| 02·H3 | Fueling / CHO-demand modeling for long events |
| 02·I1 | Surface existing workout export (.zwo/.erg/.mrc) |
| 02·I2 | True Garmin/Wahoo push — gated on official API |
| 02·I3 | Pro-grade graphical workout builder + import |
| 02·J1 | .FIT upload endpoint (device-agnostic ingestion) |
| 02·J2 | Data export + one-way Intervals.icu push |
| 02·J3 | Data-trust/validation layer (dropouts, spikes, drift) |
| 02·J4 | Wahoo & Apple Health honesty sweep |
| 02·K1 | Coach/athlete multi-athlete roster view |
| 02·K2 | Annotatable/shareable reports + RPE reconciliation |
| 02·K3 | Model transparency / methods drawer |

### `03` Behavioral / dopamine — anticipation & identity, ban-list respected (39)
| ID | Item |
|----|------|
| 03·A1 | "Coach noticed" brief micro-reactions (variable cadence) |
| 03·A2 | Post-ride "one honest surprise" line |
| 03·A3 | Count-up reveal on hero numbers |
| 03·A4 | "The work paid rent" CTL ledger line |
| 03·B1 | Endowed "next milestone" progress bars |
| 03·B2 | Mastery ladders (Climber/Rouleur, W/kg bands) |
| 03·B3 | "You vs you, 90 days ago" ghost |
| 03·B4 | "Streak of quality" secondary streak |
| 03·C1 | Streak-freeze / "life happens" token |
| 03·C2 | One-tap streak repair morning-after |
| 03·C3 | Milestone anticipation countdown chip |
| 03·C4 | Milestone celebration variety (tiers) |
| 03·D1 | "Tomorrow's session unlocks tonight" |
| 03·D2 | Seasonal/event "chapter" unlocks (real periodization) |
| 03·E1 | Personalized celebration palette |
| 03·E2 | Celebration cooldown / moment budgeting |
| 03·E3 | Haptic/sound signatures per class |
| 03·F2 | Evening reflection RPE nudge |
| 03·F3 | "Weather window" opportunistic nudge |
| 03·F4 | Comeback "you're fresh again" nudge |
| 03·G1 | Asynchronous crew kudos (crew-scoped) |
| 03·G2 | "Someone in your crew is riding" presence |
| 03·G3 | Quality-based crew challenges |
| 03·G4 | Shared crew milestone cheer |
| 03·H1 | Earned rider identity title |
| 03·H2 | Physiology-earned badge cabinet (persist) |
| 03·H3 | Honest "era-arc" (rejects biological age) |
| 03·I1 | Gentle detraining loss-aversion nudge |
| 03·I2 | Endowed onboarding backfill |
| 03·I3 | "Almost a full week" close-the-gap |
| 03·J1 | Event countdown daily drumbeat |
| 03·J2 | Season Wrapped annual ritual |
| 03·J3 | Solstice/seasonal moments |
| 03·K1 | Breakthrough share card |
| 03·K2 | "Ride story" W′bal cinematic recap |
| 03·K3 | Animated route "your line" share |
| 03·L1 | Warm specific win-back push |
| 03·L2 | "Fresh start" on return, no shame |
| 03·L3 | Anniversary "on this day" resurfacing |

### `04` UI / visual 2026 — build on the live dark system + shaders (28)
| ID | Item |
|----|------|
| 04·1 | Living Readiness Ring (breathing bloom, orbit sheen, ember) |
| 04·2 | Score count-up odometer digits |
| 04·3 | Readiness aura background (score-keyed page tint) |
| 04·4 | Rest-day distinct material |
| 04·5 | Tactile press physics (spring-damped) |
| 04·6 | Pull-to-refresh cadence spinner |
| 04·10 | Shared-element continuity (card → detail hero flight) |
| 04·11 | Directional tab transitions |
| 04·13 | Scroll reveals & parallax |
| 04·14 | Charts that draw themselves |
| 04·15 | Live zone bars overshoot/shine |
| 04·16 | Power-duration signature chart |
| 04·19 | Glass materiality pass |
| 04·20 | Generative ride thumbnails |
| 04·22 | Film-grain & mesh consistency |
| 04·23 | Ride map as hero art |
| 04·24 | Climb companion live HUD polish |
| 04·26 | One-tap branded share cards |
| 04·27 | Breakthrough celebration choreography |
| 04·28 | Skeletons that become content |
| 04·29 | Empty states with personality |
| 04·30 | Onboarding cinematic reveal |
| 04·31 | Numeric typography system |
| 04·32 | Vertical rhythm & cadence |
| 04·33 | Time-of-day & seasonal theming |
| 04·34 | Iconography & motion-icon set |
| 04·35 | Reduced-motion parity pass *(guardrail — ship with each motion item)* |
| 04·36 | Contrast & focus guardrails *(guardrail — ship with each living surface)* |

---

## Where the lenses converge (highest-signal bets)

Themes ≥3 lenses proposed independently — strongest prioritization signal:

1. **The morning readiness moment** — the app's center of gravity. `04·1` living ring +
   `04·3` aura + `01·E1` "should I ride?" + `03·A1` coach-noticed openers all invest here.
   (Reinforced by the just-shipped readiness-pending honesty gate.)
2. **Decouple delight from the power meter** — `01·D2` + `03` breadth: a basic-bike rider
   currently gets no celebration. Cheap, high reach.
3. **Reach over new-build (the *honest* version)** — `01·B2` finish `simple` mode,
   `01·C1` wire the morning check-in, `02·I1` surface workout export: real unfinished
   wiring, *not* the deleted-analytics trap.
4. **Share as the acquisition loop** — `03·K1`/`04·26` branded share cards +
   `01·F3` share-first social.
