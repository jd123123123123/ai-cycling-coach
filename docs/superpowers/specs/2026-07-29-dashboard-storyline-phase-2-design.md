# Dashboard storyline — Phase 2: Heute and Körper on the kit

**Date:** 2026-07-29
**Status:** approved (design), implementation not started
**Depends on:** `docs/superpowers/specs/2026-07-28-dashboard-storyline-design.md` (Phase 1, shipped — the season-arc spine, the four-chapter nav, and the unconsumed narrative kit: `ChapterHero`, `MomentCard`, `CoachRead`, `NextChapter`)

## Scope

Phase 1 built the shared infrastructure and mounted only the `ChapterBar` —
no card moved. Phase 2 is where the kit gets used: Heute and Körper are
restructured onto it, and the one de-duplication edge that sits entirely
inside these two chapters (readiness detail, `MorningHealthCard`) is applied.

Per the Phase 1 spec's phase boundary, Fitness & Frische and "Wohin das
führt" stay in Heute, untouched, until Phase 3 — they move to Plan and
Verlauf, which don't exist on the kit yet. Moving them now would mean
dropping them into an unbuilt destination. That boundary is not
re-litigated here.

**Two sequential plans, one spec.** Heute (`TodayTab.tsx`, 1,668 lines) and
Körper (`RecoveryTab.tsx`, 902 lines) are coupled by one dependency —
`MorningHealthCard` is cut from Heute in 2a and received by Körper in 2b —
but each is independently large enough to warrant its own plan and its own
review cycle, matching how Phase 1 stayed manageable. 2a ships and deploys
before 2b starts.

## Phase 2a — Heute

Heute's content already matches the Phase 1 spec's slot list closely — the
July 2026 Today-tab reorder already put the session before the weather and
the coach's read after it. This phase is mostly extraction and restyling,
plus one real content move and one new element.

| slot | current | change |
|---|---|---|
| Hero | readiness ring + verdict + kicker | none |
| Moment | `<SessionOfTheDay />` | none — kept as its own component with its own coral-tinted gradient (see Decisions) |
| Read | inline coach prose inside the Drivers/Coach/Momentum block | extracted into `<CoachRead>` (built in Phase 1, unconsumed until now) |
| Evidence | weather window, drivers, momentum cues, missed-yesterday, rest card, session review, `ThisWeekCard` | unchanged, no cuts |
| Next | none | `<NextChapter from="today" de={de} />` added |

**The one move:** `<MorningHealthCard />` (mounted at `TodayTab.tsx:1159`)
is deleted from Heute in this plan. It is not re-mounted anywhere until 2b —
see Sequencing.

**Left alone (Phase 3's job):** the "Fitness & Frische" section
(`TodayTab.tsx:1527`) and any remaining "Wohin das führt" content.

## Phase 2b — Körper

The bigger edit. `RecoveryTab.tsx` today has no card that functions as a
Moment or a Read — its closest equivalents exist but are positioned and
shaped for a flat list, not a narrative arc.

| slot | current | change |
|---|---|---|
| Hero | readiness ring (`RecoveryTab.tsx:499-520`) | none |
| Moment | none — "Recovery Drivers" (`:523`) is a flat list of ~7 `<Driver>` tiles, each carrying a `dev` (deviation-from-baseline) value | the single tile with the worst `dev` is pulled out and featured on its own as the page's Moment, styled to read as "this is the thing limiting you today" |
| Read | "Recommendation" (`:757`, currently near the bottom, links to Heute) | moves up, directly after Moment, restyled as `<CoachRead>` |
| Evidence | full Recovery Drivers list, sleep stages, HRV/RHR/resp/skin temp, body battery, strain, today's load target, daytime stress, recovery outlook (`<RecoveryEtaCard />`), recovery calendar, behaviors & journal — plus incoming `<MorningHealthCard />` | all kept (per your call: no cuts), reordered by descending depth, restyled to the kit's plain-surface look |
| Next | none | `<NextChapter from="body" de={de} />` added |

**The one receive:** `<MorningHealthCard />` is mounted here, in the
Evidence section, once 2a has removed it from Heute.

**`ReadinessFreshnessNote` stays mounted in both Heroes.** Both Heute and
Körper show it inline within their own readiness ring today. This is the
same exception the Phase 1 spec already named for the readiness state word
— the verdict is unreadable without it, and both mounts are still gated by
`utils/readinessGate.ts`. Not new duplication; not touched by this phase.

## Decisions

**SessionOfTheDay keeps its own styling, not `MomentCard`'s amber shell.**
The Phase 1 spec's blanket rule ("every chapter's Moment uses the amber
achievement gradient") doesn't fit here: `SessionOfTheDay` already has a
tuned coral-accent gradient matching the coral CTA button it renders below
itself, and `MomentCard`'s amber ground is meant for genuine achievement
moments (a PR, a standout effort) — stretching it over every page's most
prominent card regardless of fit would mean redesigning a component that
isn't broken, for consistency's own sake. `SessionOfTheDay` fulfills the
Moment *role* without adopting the Moment *component*. This is a correction
to Phase 1's spec, made explicit here rather than silently ignored.

**RecoveryTab's evidence stays at full density.** ~11 sections is roughly
double what the Phase 1 spec anticipated for Körper. Nothing is cut. Every
existing card the app currently tells the athlete about their body keeps
existing — Körper becomes the one place all of it lives, which is the
point of the de-duplication, not an excuse to thin the content.

**Sequencing gap on `MorningHealthCard` is accepted, not engineered around.**
Between 2a shipping and 2b shipping, `MorningHealthCard` is mounted
nowhere. This is the smallest honest gap available — one deploy cycle,
since 2b is the very next plan — and preferable to either leaving it in
Heute past its stated owner or inventing a temporary third location for a
card that already has a real destination.

## Out of scope (unchanged from Phase 1's spec)

- Fitness & Frische, "Wohin das führt", Plan and Verlauf's own rebuild —
  Phase 3.
- Any change to what the coach *says* — this moves and restyles cards, not
  recommendation logic.
- Desktop layouts. Mobile-only, 390×844 target, desktop is a sanity check.

## Verification

Same discipline as Phase 1, per plan:

- `npx tsc -b --noEmit` clean.
- `npx vitest run` full suite green.
- `npx eslint` on touched files, compared against the pre-change output.
- A rendered frame at 390×844, before and after, for the chapter being
  changed — not a static read of JSX order. This is a real visual
  restructuring (Read moving up, a driver tile being extracted into its own
  card), not a pure reorder, so it gets screenshotted and critiqued, not
  just gate-checked.
- Railway deploy verified by byte-comparing served assets against the local
  build.
- 2a deploys and is verified live before 2b's plan begins.
