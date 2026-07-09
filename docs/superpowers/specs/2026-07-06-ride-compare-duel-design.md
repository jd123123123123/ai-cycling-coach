# Ride Compare / "Duel" — Design

**Date:** 2026-07-06
**Status:** Approved (design), pending implementation
**Goal:** On a Race Debrief, auto-surface a head-to-head against a crew-mate who rode
the same ride, framed competitively as a VS scoreboard that crowns a winner.

## Motivation

The debrief today is a solo analysis. When a friend rode the same route at the same
time, the most engaging story is *comparative*: who won each climb, who had the bigger
punch, who paced smarter. This feature adds that competitive layer without disturbing
the existing solo debrief.

## User-facing behaviour

- Open a debrief for a ride you did with a crew-mate → a **Compare / VS** section appears
  automatically (no manual selection).
- The section leads with a **"who won the day"** scoreboard: both riders, a points tally,
  and a WON badge for the winner.
- Below the hero: a **climb-by-climb battle**, a **peak-power duel**, and a
  **pacing & effort** comparison — each metric marked with the winner.
- If no crew-mate rode the same ride, the section renders nothing (the solo debrief is
  unchanged).

## Architecture

Three layers mirror the existing debrief pipeline (matching → assemble → serve), and the
frontend adds one new section to `DebriefView`.

### 1. Matching — `backend/app/services/ride_matching.py` (new)

`find_rival_ride(db, user, activity) -> RivalMatch | None`

- Resolve the user's crew via `CrewMembership` (reuse `crew_score._crew_member_user_ids`
  to get the other member user_ids; exclude self).
- For each member, query their activities where `started_at` falls within a tolerance
  window of the reference ride's `started_at` **and** `distance_meters` is within ±15%
  of the reference distance (confirms "same ride", not just same day). Reuse the
  `started_at` range pattern from `crew_score._activities_for_user_in_window`.
- **Tolerance:** start within ±90 minutes; distance within ±15%. If multiple candidates,
  pick the one with the smallest combined (start-delta, distance-delta) score.
- Return `RivalMatch { rival_user_id, rival_activity_id }` or `None`.
- **Access model:** cross-user reads of the rival's `Activity`/`ActivityStream` happen in
  the same DB session (the app's owner role bypasses non-forced RLS — the same mechanism
  `crew_score` relies on to read other members' rides). Authorization is enforced in
  application code by requiring the rival share the caller's crew.

### 2. Duel assembly — `backend/app/services/ride_compare.py` (new)

`build_comparison(db, user_id, activity_id, lang="en") -> RideComparison | None`

- Call `find_rival_ride`; return `None` if no rival.
- Build both debriefs via the existing `get_or_build_debrief(db, uid, aid, lang)` — once
  for the caller, once for the rival. This reuses every analyzer, so climbs, peak-power
  `efforts`, `pacing`, `efficiency`, and `matchbook` are available for both riders with no
  new analysis code.
- Compute the duel layer from the two `RaceDebrief` objects:
  - **Climb-by-climb:** align the two climb lists by order/position (nearest start
    distance). For each aligned pair compare duration (faster wins), VAM, and W·kg⁻¹.
    Winner = faster time. Unmatched climbs are listed without a duel result.
  - **Peak-power duel:** for each standard duration present in both `efforts` lists
    (5s, 15s, 30s, 1m, 5m, 20m, …), compare `ride_watts`; higher wins.
  - **Pacing & effort:** compare NP, IF, split discipline (`|split_pct|` closer to 0
    wins), `surge_count`, and W′ depletion (`matchbook.min_bal_j` / `fully_depleted`).
    Each metric declares a winner and which direction is "better".
  - **Overall "who won the day":** each sub-battle contributes points (climbs weighted
    highest, then power, then pacing). Sum → `overall_winner`, `self_points`,
    `rival_points`, and a one-line headline.
- Every sub-block is optional and degrades gracefully (missing climbs/streams → that
  block is empty, never an error), mirroring the debrief's `_try` contract.

### 3. Schema — `backend/app/schemas/ride_compare.py` (new)

```
RiderRef        { user_id, display_name, is_self }
ClimbDuel       { label, distance_m, elev_gain_m,
                  self_time_s, rival_time_s, self_vam, rival_vam,
                  self_wkg, rival_wkg, winner }              # winner: "self"|"rival"|"tie"
PowerDuel       { duration_s, self_watts, rival_watts, winner }
PacingDuel      { metric, self_value, rival_value, winner, better }  # better: "higher"|"lower"
RideComparison  { activity_id, me: RiderRef, rival: RiderRef,
                  overall_winner, self_points, rival_points, headline,
                  climb_duels: [ClimbDuel], power_duels: [PowerDuel],
                  pacing_duels: [PacingDuel], lang }
```

### 4. Endpoint — `backend/app/api/analytics.py`

`GET /activity-debrief/{activity_id}/compare?lang=` → `response_model=RideComparison`.
- Auth/DB via existing `get_current_active_user` + `get_db_for_user`.
- Calls `build_comparison(db, user.id, activity_id, lang)`.
- Returns the comparison, or **HTTP 204 No Content** when no rival exists (frontend treats
  204 as "render nothing").

### 5. Frontend

- `frontend/src/api/compare.ts` — TS types mirroring the schema + `fetchRideComparison`
  (a 204 resolves to `null`).
- `frontend/src/hooks/useRideCompare.ts` — react-query hook keyed by `[activityId, locale]`.
- `frontend/src/components/debrief/CompareDuel.tsx` — the VS view:
  - **Scoreboard hero:** both riders (initials/avatar), points tally, WON badge/trophy for
    the winner, headline.
  - **Climb battle:** one row per climb, both riders' times/VAM/W·kg, winner highlighted.
  - **Power duel:** grouped bars per duration, win/lose colour coding.
  - **Pacing chips:** metric chips with the winner marked.
  - Visual language matches the existing WHOOP-tier debrief polish (uses the same CSS
    variables, card radii, typography); win = `--color-good`, loss = `--color-ink-2`.
- `frontend/src/pages/DebriefView.tsx` — render `<CompareDuel activityId=... />` as a new
  `<section>` (after `KeyReads`); it renders nothing when the hook returns `null`.
- `frontend/src/i18n/strings.ts` — EN + DE strings for all new labels.

### 6. Seed — `backend/scripts/seed_rival.py` (new)

Makes the feature demoable on activity 71:
- Create a rival user, add them to crew "Maratona Squad" (id 2) as a member, give them an
  `AthleteProfile`.
- Create an `Activity` overlapping activity 71 (same `started_at`, similar duration and
  distance) plus an `ActivityStream` derived from user 5's activity-71 streams, perturbed
  so the rival is **stronger on climbs** and **weaker on the flats** → a close, interesting
  duel. Recompute the rival's derived scalars / `mmp_curve` as the debrief pipeline expects.
- Idempotent: re-running updates rather than duplicates.

## Testing

- **Backend unit tests:**
  - `ride_matching`: overlap window + distance-tolerance selection (match, no-match,
    best-of-several).
  - `ride_compare`: duel scoring — winner selection per battle and overall points, using
    two synthetic `RaceDebrief` objects.
- **Visual verification:** drive the app with Playwright and screenshot the VS view on
  activity 71 (desktop + mobile), iterate until it meets the polish bar.

## Non-goals (YAGNI)

- No live/real-time comparison.
- No changes to the crew leaderboard or scoring.
- No notifications or invitations flow.
- No comparison against non-crew users or arbitrary rides.

## Risks / notes

- Cross-user reads rely on owner-role RLS bypass; authorization is enforced in app code by
  crew membership. If `FORCE ROW LEVEL SECURITY` is ever enabled, the rival read path must
  switch to an explicit elevated query.
- Climb alignment is heuristic (position/distance based); mismatched climb counts are shown
  without a duel result rather than forced into pairs.
