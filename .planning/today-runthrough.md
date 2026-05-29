# Today Run-Through: Stale Numbers, Wake-vs-Now Biometrics, Coach Recap + Tomorrow + Eval

One continuous execution plan. No phase splits. Ship in this exact order; each step builds on the previous.

## Goal

After this run-through the user opens the app and sees: a readiness number that already reflects today's two completed workouts; a body battery / stress / HRV pair showing wake → now; a coach brief that recaps what was done, previews tomorrow, gives regen tips, and grades today's session against what was actually recommended yesterday. Real user is testing tonight, so visible bugs are fixed before architecture cleanup.

## Step 1 — Cache invalidation so today's data isn't stale (≤3h)

In `backend/app/services/garmin_sync_service.py`, after activities + daily metrics commit successfully, delete the row from `coach_briefs` for `(user_id, today_local)` so the next read regenerates. Do the same in `activity_service.create_activity` if that path is used independently. In `backend/app/api/garmin.py` the sync endpoint should return the date(s) touched in its response so the frontend can targeted-invalidate. In `frontend/src/hooks/useForceSync.ts`, on `onSuccess` invalidate `COACH_BRIEF_KEY_ROOT`, `['activities']`, `['daily-metrics']`, `['pmc']`. In `frontend/src/hooks/useCoachBrief.ts`, drop `staleTime` from 6h to 30min and add `refetchOnWindowFocus: true` while `data?.post_ride_review` is null and `today_tss > 0`. Verify in the browser: complete a sync, brief regenerates without a manual refresh.

## Step 2 — Athlete-local "today" boundary (~1h)

The `_todays_primary_activity` and `_weekly_progress` queries in `backend/app/services/coach_service.py` (~lines 198, 227) use UTC day windows. For a Berlin user that breaks at midnight local. Read `AthleteProfile.timezone` once per request, compute `today_local_start = datetime.now(tz).astimezone(UTC).date_window`, pass it into all "today" / "this week" filters. Same fix in `backend/app/services/coach_prompt.py` snapshot builders. This must land before any "yesterday's recommendation" lookup in Step 5 — otherwise the row fetched at midnight UTC is the wrong day.

## Step 3 — Multi-activity wrap-up (~3h)

`_todays_primary_activity` returns `LIMIT 1`, and `post_ride_review` only fires when `today_tss >= 25`. Replace with `_todays_activities` returning all activities for `today_local`, summed TSS / duration / distance plus a per-activity list `[{title, sport, tss, duration, distance, IF, EF, VI}]`. Lower the trigger to `len(activities) >= 1 AND total_duration_minutes >= 20`. Extend `backend/app/schemas/coach.py` `post_ride_review`: keep existing single-session shape, add `activities[]` and `totals{}`. In `frontend/src/components/dashboard/PostRideReview.tsx`, when `activities.length >= 2` render a stacked summary header ("2 sessions · 145 TSS · 3h 12m") + per-row mini cards (sport icon, title, duration, distance, TSS chip), then a single combined narrative + tomorrow-setup paragraph. Compliance grade only when n=1; for n≥2 show per-ride compliance chips. Add a discreet "2 today" pill to the `PulseStrip` masthead in `tabs/TodayTab.tsx` so the count is visible above the brief regenerates.

## Step 4 — `coach_recommendations` persistence (~3h)

New table — Alembic migration `add_coach_recommendations.py`:
```
coach_recommendations(id, user_id, target_date date indexed,
  template_id, title, duration_minutes, predicted_tss,
  framework_cited, blocks jsonb, why_this_workout,
  source_brief_id fk coach_briefs.id,
  evaluated_at nullable, eval_grade nullable, eval_payload jsonb nullable,
  created_at, updated_at)
```
RLS by `user_id` matching the existing pattern. In `backend/app/services/coach_service.get_or_generate_brief`, after a brief is generated, upsert one row per recommended target_date (today + tomorrow if the brief includes a tomorrow_plan in Step 6). Modify `backend/app/services/ride_compliance.score()` to read from `coach_recommendations` for `target_date == activity.local_date` instead of re-picking a template. Fall back to current re-pick logic when no recommendation row exists (so older briefs don't break). This is the single most important plumbing change — without it, "evaluation" is just the picker grading itself.

## Step 5 — Wake-vs-now biometrics backend (~3h)

The 04.5.1 hypertable already exists (`daily_metric_samples`, 3-min granularity for body_battery / stress / hrv). Migration adds nullable columns to `daily_metrics`: `body_battery_wake int`, `body_battery_now int`, `body_battery_now_at timestamptz`, `stress_wake int`, `stress_now int`, `hrv_overnight_avg int`, `training_readiness int`, `recovery_time_hours int`. New service `backend/app/services/biometrics_snapshot.py`: `compute_today_snapshot(user_id) -> Snapshot` reads `sleep.sleep_end_timestamp` from today's daily_metric, then queries `daily_metric_samples` for the first sample ≥ wake time (= wake values) and the latest sample (= now values). For training_readiness/recovery, add `garmin_client.get_training_readiness(date)` hitting `/metrics-service/metrics/trainingreadiness/{date}`; pull current load from `get_user_summary()` (already wired). New endpoint `GET /api/daily-metrics/today/snapshot` with 15-minute server-side cache (in-memory dict keyed by user_id is fine for solo-dev tonight); on cache miss it triggers a lightweight Garmin refresh hitting only `get_user_summary` + last hour of body_battery — well under rate limits. Sleep window missing? Fall back to 04:00 athlete-local as wake.

## Step 6 — Wake-vs-now UI surface (~2h)

In `frontend/src/components/dashboard/ReadinessHero.tsx`, replace the single Battery tile with a `wake → now` row: "Battery 82 → 64 ▼18" plus a 6h sparkline; same compact pair for Stress and HRV. Add `as of HH:MM` label tied to `body_battery_now_at` so freshness is honest about Garmin's ~5–10 min lag. Add `useTodaySnapshot` React Query hook (`staleTime: 5min`, `refetchOnWindowFocus: true`). `KpiStripCompact.tsx` shows compact wake/now pair for Battery only. Defer a separate `BiometricsTodayStrip` component — fold the data into the existing hero rather than introducing a new card tonight.

## Step 7 — Coach brief: tomorrow + regen + recap-with-eval (~3h)

In `backend/app/services/coach_prompt.py`, extend the `BRIEF_TOOL` schema with two new optional fields: `tomorrow_plan` (3–5 sentences + `predicted_tss`, `intensity_chip`) and `regeneration` (2–3 plain bullets covering sleep target, fuel window, mobility/active recovery, caffeine cutoff). Inputs added to the snapshot user message (not the cached system prefix): yesterday's `coach_recommendations` row for `target_date == today_local`, today's aggregated activity list (from Step 3), tomorrow's `outlook_7d[1]` plus any `PlannedWorkout` for tomorrow. Prompt instruction: "If no planned workout exists for tomorrow, describe the *type* of day, not specific intervals." Recap (`post_ride_review`) now references "what we recommended" by name, then quotes the actual numbers — that's the eval the user asked for. System prompt stays cached; new instruction text (~1KB) appended to the prefix without busting it. In `frontend/src/components/dashboard/CoachBrief.tsx`, render two new compact cards below the workout card: `TomorrowCard` (one paragraph + TSS chip) and `RegenerationCard` (bullets). No new tab; reuse existing card styling. Recap card already exists — it'll auto-populate from the enriched payload.

## Verification gate

Manual end-to-end before marking done: (1) sync after a ride, dashboard updates without manual refresh; (2) two activities today, recap shows both with combined narrative; (3) ReadinessHero shows wake → now with timestamp; (4) Coach brief shows recap citing yesterday's recommendation by name, plus tomorrow card and regen bullets; (5) midnight Berlin local → "today" rolls over without UTC stutter.

## Cuts (not happening in this run-through)

Standalone `BiometricsTodayStrip` component, formal 04.5.2 phase ceremony, separate "tomorrow" tab, calendar integration for tomorrow's planned workout (only `PlannedWorkout` table reads), per-ride compliance evaluation as a separate dashboard surface (chips only).

## Risks

Garmin rate limits if many users hit the snapshot endpoint — solo dev so non-issue tonight; revisit before scale. LLM token cost from invalidating brief on every sync — gated by "new activity since last brief generation" check (compare `coach_briefs.created_at` vs latest `Activity.created_at`). Prompt bloat from three new sections — token-budget each via `maxLength` on tool-schema descriptions. TZ migration touches scheduler-driven rule logic (`session_type_for_today`) — verify no off-by-one in week-start / hard-session quotas before merging Step 2.

## Files touched (full list)

Backend: `services/garmin_sync_service.py`, `services/activity_service.py`, `api/garmin.py`, `services/coach_service.py`, `services/coach_prompt.py`, `services/ride_compliance.py`, `services/garmin_client.py`, `services/biometrics_snapshot.py` (new), `schemas/coach.py`, `models/coach_recommendation.py` (new), `models/daily_metric.py`, `migrations/versions/add_coach_recommendations.py` (new), `migrations/versions/add_wake_now_columns.py` (new), `api/daily_metrics.py`. Frontend: `hooks/useForceSync.ts`, `hooks/useCoachBrief.ts`, `hooks/useTodaySnapshot.ts` (new), `components/dashboard/CoachBrief.tsx`, `components/dashboard/PostRideReview.tsx`, `components/dashboard/ReadinessHero.tsx`, `components/dashboard/KpiStripCompact.tsx`, `components/dashboard/TomorrowCard.tsx` (new), `components/dashboard/RegenerationCard.tsx` (new), `components/dashboard/tabs/TodayTab.tsx`.
