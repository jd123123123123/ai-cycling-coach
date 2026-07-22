# Audit — 04-ui-visual-2026.md vs. codebase state & history

Method: verified each item against `frontend/src` and `git log`. Key premise correction
up front, because it recurs in the doc: **WebGL shaders are NOT quarantined to Wrapped.**
A live `iri` `ShaderCanvas` already renders behind the Today readiness hero card
(`frontend/src/components/dashboard/tabs/TodayTab.tsx:923`, added in `71b7598`, tuned in
`b400b9a`). `ShaderCanvas` (`components/wrapped/ShaderCanvas.tsx`) is imported by both
`WeeklyWrapped.tsx` **and** `TodayTab.tsx`. Treat any "shaders are quarantined / bring one
home" framing with suspicion.

No item revives a deliberately-removed or toned-down visual treatment — git history shows
the shader was recently made *more* alive (`b400b9a`), not stripped; removals in history are
content sections, not motion/material treatments. Hence **0 CONTRADICTS-DECISION**. The
NEEDS-CHECK items are all "the primitive already exists — is the current limited scope
intentional?" cases.

| Item# | Short title | Tag | Evidence (file/commit or "n/a") |
|-------|-------------|-----|---------------------------------|
| 1 | Living Readiness Ring | NEW | `ring-reveal` + `tip-glow-pulse` keyframes exist (`index.css:176,213`); orbit sheen / breathing bloom / ember are genuinely new on top |
| 2 | Score count-up odometer digits | NEW | `useCountUp` (`utils/motion.ts`, `WeeklyWrapped.tsx:92`) + `score-enter` keyframe (`index.css:182`) exist; per-digit odometer roll is new |
| 3 | Readiness aura background | NEW | Page ambient glow is fixed green/blue (`index.css:263-264`); score-keyed page aura is new (card-level already tints by `rColor`, `TodayTab.tsx:913`) |
| 4 | Rest-day distinct material | NEW | Rest-day logic exists (`useTodaySession.ts`, `TodayTab.tsx`, `PlanTab.tsx`) but as copy/variant; distinct material (radii/saturation/easing) is new |
| 5 | Tactile press physics | NEW | Uniform `:active{scale(0.98)}` confirmed (`index.css:421-424`); spring-damped mass-based press is new |
| 6 | Pull-to-refresh cadence spinner | NEW | No pull gesture in code ("refresh" hits are refetch calls only); branded gesture is new |
| 7 | Toggle & segment morphs | NEEDS-CHECK | `SegmentedTabs.tsx:129-136` already ships a `layoutId` sliding pill w/ `springs.snappy`; unclear if the V3 bottom tab bar is intentionally excluded |
| 8 | Haptic vocabulary | NEEDS-CHECK | `lib/haptics.ts` already exists w/ `hapticTick`+`hapticCelebrate` (double-pop), reduced-motion guarded; ramp/warning verbs + opt-out are the new delta |
| 9 | Long-press metric peek | NEEDS-CHECK | `GlossarySheet.tsx` already gives tap-to-explain (definition+reading+action) wired to metric chips; long-press peek + sparkline is a parallel interaction, overlap unclear |
| 10 | Shared-element continuity | NEW | `motion/react` `layoutId` used for pills/sheets but not page→detail hero flight; FLIP hero transition is new |
| 11 | Directional tab transitions | NEW | `tabpanel-in` applied uniformly, reduced-motion aware (`DashboardPage.tsx:86`, `index.css:225`); directional slide is new |
| 12 | Staggered card cascade | NEEDS-CHECK | `card-enter` keyframe exists (`index.css:219`) but used only in `KeyReads.tsx`; whether its narrow current scope is intentional is unclear |
| 13 | Scroll reveals & parallax | NEW | `useInViewOnce` exists (`utils/motion.ts`) for enter reveals; parallax headers + on-scroll chart draw are new |
| 14 | Charts that draw themselves | NEW | `--ease-chart-draw` token defined (`index.css:99`) but unused by any chart; `stroke-dashoffset` only on rings (`ScoreRing`/`ActivityRings`), not line charts |
| 15 | Live zone bars overshoot/shine | NEW | Zone-colored bars exist; spring overshoot + shine + tap-to-lift are new |
| 16 | Power-duration signature chart | NEW | No mean-max power curve chart found; net-new hero object |
| 17 | HoverBars → TouchBars | NEEDS-CHECK | Premise "desktop-hover" is inaccurate: `HoverBars.tsx:69-71` already uses pointer events (tap works on touch); the new delta is drag-scrubber + per-point haptic tick |
| 18 | Sparklines everywhere | NEEDS-CHECK | `components/dashboard/Sparkline.tsx` exists and is already used in `SeasonStats`, `TrendsHero`, `BiometricsDetail`, `PMCChart`, `GradeHero`; "everywhere/every row" is a scope-broadening of uncertain intent |
| 19 | Glass materiality pass | NEW | `--shadow-glass-rim` token exists (`index.css:86`), tab bar uses glass; consistent recipe + scroll-refract is a new systemization |
| 20 | Generative ride thumbnails | NEW | Deterministic SVG thumbnails already exist (`HistoryTab.tsx:49-103`); shader-lite gradient + character-keying is a genuine enhancement on the acknowledged base |
| 21 | Shader on Coach surface | NEEDS-CHECK | Premise "Wrapped shaders are quarantined" is FALSE — `iri` shader already on Today hero (`TodayTab.tsx:923`, `71b7598`). Applying one to the AI-Coach header is new, but verify the false premise before scoping |
| 22 | Film-grain & mesh consistency | NEW | `.paper-grain` exists (`index.css:284`), mesh tokens exist but "unevenly applied"; consistency rule + animated mesh drift is new (note Today hero already carries a shader backdrop) |
| 23 | Ride map as hero art | NEW | `RouteMap.tsx` + `RideRecapView.tsx:36-52` already draw an SVG route line + elevation (not Google tiles); effort/power-colored glowing animated trace is the enhancement |
| 24 | Climb companion live HUD polish | NEW | No live-ride/climb-HUD component found; premise assumes an existing HUD, but net it is new work |
| 25 | Wrapped auto-advance story engine | NEEDS-CHECK | `WeeklyWrapped.tsx` already has segmented progress bars, tap/swipe/arrow advance, per-card count-up entrances, self-tracing route (lines 6, 92, 173, 485-564); only auto-advance timing + hold-to-pause appear missing |
| 26 | One-tap branded share cards | NEW | No branded 9:16 share-card renderer found; net-new acquisition loop |
| 27 | Breakthrough celebration choreography | NEW | `BreakthroughCelebration.tsx` + `lib/confetti.ts` (reduced-motion aware) exist; anticipation beat + shader bloom + odometer slam + auto share-card are new |
| 28 | Skeletons that become content | NEW | Skeletons exist widely (`.skeleton`, many views); morph-into-content is a new behavior |
| 29 | Empty states with personality | NEW | Bespoke generative empty-state illustrations are new |
| 30 | Onboarding cinematic reveal | NEW | `OnboardingV3.tsx` exists; live identity-preview assembly + shared-element steps are new |
| 31 | Numeric typography system | NEW | Sora `.num-display`, JetBrains `--font-mono`, `.eyebrow` all exist (`index.css:5,6,301,309,313`); this codifies + adds live weight-transition (largely a systemization) |
| 32 | Vertical rhythm & cadence | NEW | `.eyebrow` exists; strict spacing scale + section cadence is a new discipline pass |
| 33 | Time-of-day & seasonal theming | NEW | No time-of-day page theming exists; stays within dark system (no light flip) — constraint-safe |
| 34 | Iconography & motion-icon set | NEW | Code uses `lucide-react`; unifying family + micro-animated state icons is new |
| 35 | Reduced-motion parity pass | NEW | Reduced-motion already handled (`index.css:360`, shader freeze, `confetti` no-op, `PageTransition`, `GlossarySheet`); extending the discipline to every new item is the correct guardrail |
| 36 | Contrast & focus guardrails | NEW | AA muted token + focus ring already present; per-phase contrast clamp + scrim on living surfaces is the guardrail — constraint-aligned |

## Tag counts
- NEW: 28
- NEEDS-CHECK: 8
- CONTRADICTS-DECISION: 0
