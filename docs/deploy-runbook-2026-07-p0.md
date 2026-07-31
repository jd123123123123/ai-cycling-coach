# Deploy runbook — P0/P1 usability-audit waves (July 2026)

One-time steps and expected effects when this branch reaches production.
Context: docs/usability-audit-2026-07.md; implementation commits `9fc8827..HEAD`.

## Before/at deploy (in order)

1. **Alembic**: `alembic upgrade head` — applies `b8d1c2e3f4a5`
   (`coach_recommendations.sport`, nullable; legacy NULL reads as cycling).
2. **One-time data repairs** (idempotent, run once):
   ```bash
   python -m scripts.repair_run_power_models        # nulls cycling power models on legacy run rows
   python -m scripts.clear_autoseeded_ftp_targets   # removes onboarding-era goals.target_ftp seeds
   ```
   Dev already ran both (16 stream rows, 3 profiles).
3. **Env**: `ANTHROPIC_API_KEY` still unset in prod → coach runs the
   rule-based fallback; all P0 behavior (One Daily Decision, planned-rest
   override, day-fresh cache) works in the fallback path by design.
4. **SPA cache**: index.html must ship no-cache (see memory: stale-bundle
   trap); verify the loaded script hash after deploy.

## Expected one-time, user-visible effects

- **Numbers recalibrate once, everywhere together**: window-invariant PMC
  (full-history EWMA seed), athlete-local day bucketing, and run/gym hrTSS
  backfill (`recompute_missing_tss` now runs post-sync + on threshold
  changes) shift CTL/ATL/TSB slightly on all surfaces. This is the audit's
  "one producer per number" landing — communicate as a recalibration, not a bug.
- **Threshold surfaces converge**: CP/eFTP recompute on the sanitized
  envelope; `/analytics/power-profile` may flip `model_valid` for athletes
  whose corrupt best-efforts previously inflated CP (dev athlete: 363→248 W,
  now agreeing with FTP 240).
- **LLM prompt caches rotate once** (system-prompt edits: sport-split
  tallies, plan-truth section, ALREADY-TRAINED rules) → one cold brief per
  user after rollout.
- **Timezone handshake**: the frontend now PATCHes the browser's IANA tz to
  the profile on first load; athletes outside Europe/Berlin get correct
  local-day attribution from their first session.

## ~~BLOCKER~~ — map attribution (added 2026-07-28, CLEARED 2026-07-31)

**Cleared. No logo is required, and the map is free to ship.**

The original entry claimed Maptoolkit's licence required the Maptoolkit *logo*
in addition to the text notice, and treated the missing asset as a ship
blocker. Checked against the source on 2026-07-31:

- maptoolkit.com/copyright — the canonical page, and the one their own
  attribution links to — states the requirement as a visible
  "© Maptoolkit © OSM" with each part linking to its copyright page. No logo
  is mentioned anywhere.
- Their TileJSON (tiles.maptoolkit.org/mtk.json) ships that exact text, with
  both links, and no image — which is what a provider serves when text alone
  satisfies them.

What the requirement actually is: the notice must be **visible** and
**clickable**. That is now guaranteed rather than assumed. `RouteMap` no longer
uses MapLibre's `AttributionControl`; it renders `<MapAttribution/>` itself,
permanently open, outside the map container so nothing the canvas draws can
cover it. The previous setup force-collapsed the control to an `(i)` badge on
every frame to stop a white bar covering the ride title — a notice that starts
closed is a weak reading of "visible", and it is gone.

Covered by `RouteMapAttribution.test.tsx`, which asserts both notices, both
hrefs and `rel="noopener"` render even when the basemap cannot initialise.

Still worth doing (not a blocker): register the production domain with
Maptoolkit. Free, and it raises the rate ceiling 5× (120 → 600 tiles/s
sustained).

## Watchlist (first week)

- `GET /coach/brief` latency: now also computes the fresh DailyDecision
  (~8–12 light queries) and may force one regeneration when a cached brief's
  day-shape diverges from the decision (divergence guard in api/coach.py).
- Breakthrough celebrations for >5% one-off jumps are silent until a second
  ride corroborates (sanitizer semantics) — expect "where's my PB?" tickets
  only for genuinely corrupt files.
- Duel/challenge payloads change with the P1 social wave (athlete-scaled
  targets); crew screens tolerate both shapes during rollout.
