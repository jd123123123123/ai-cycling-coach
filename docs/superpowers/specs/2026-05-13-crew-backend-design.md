# Crew backend — Design

Date: 2026-05-13
Status: Spec ready for implementation; no code in this doc.

## What this is

The Crew tab today is a localStorage-only stub: invites live in the browser,
"members" can never actually join, the leaderboard always shows one row (you).
The mechanic itself — a 7-day Squad Cup where each rider earns up to 100 points
per day from `min(1.5, daily_TSS / daily_target)` — is solid and already
implemented in `frontend/src/components/dashboard/tabs/CrewTab.tsx`. This spec
defines the backend needed to make it real: a friendship graph, an invite flow,
and a scoring endpoint that returns the standings for the athlete's crew.

The constraint that shapes everything: **trust matters**. A crew is not a
public leaderboard; it's a small group of people who agreed to see each
other's training load. Strava-style social-graph + Whoop-style team-mechanic
hybrid. Privacy defaults must be tighter than Strava (no public crews, no
discovery, no public profiles) and the scoring data we expose must be load-
only (no individual workouts, no GPS, no power numbers — just TSS toward the
weekly cup).

## Goals

1. **Two people can actually compete** — invite by email, the invitee accepts,
   they both see each other in the standings the next morning.
2. **Scoring is the existing Squad Cup mechanic, server-computed** — pure
   function of TSS history and the daily-target derivation, identical math
   to the current frontend code.
3. **Privacy is the default** — crew membership requires mutual consent;
   leaving a crew is one click; no public visibility; minimum data shared.
4. **The Crew tab becomes useful at N=2** — most cycling app social features
   require 5+ to feel alive; this should work for a pair of training partners.

## Non-goals

- Public crews / discovery / search.
- Kudos / comments / activity feed. (Strava already does that; we're the
  "load competition" axis, not the social feed.)
- Multi-crew membership. One athlete is in at most one crew at a time. (Adds
  query complexity for no clear v1 user value.)
- Real-time push / WebSocket. Standings refresh on tab focus is enough.
- Cross-sport scoring nuance. TSS is the lingua franca; if a runner and a
  cyclist are in the same crew, both contribute TSS the same way.

## Data model

Three tables, two of them small. All `created_at`/`updated_at`
`DateTime(timezone=True)`, default UTC now. RLS policies follow the
`set_athlete_tz_from_profile` pattern — the user can only read/write rows
where they're a participant.

### `crews`

The crew itself — just an id + a display name + the owner.

| Column | Type | Notes |
|---|---|---|
| `id` | `int` PK | |
| `name` | `String(60)` | User-supplied. No uniqueness constraint. |
| `owner_user_id` | `int` FK → users.id | The user who created the crew. Cannot be removed except by deleting the crew. |
| `created_at` | timestamp | |

**Index:** `(owner_user_id)`.

### `crew_memberships`

Join table — one row per accepted (user × crew) pair. An invite that is
*accepted* writes here; pending invites live in `crew_invites`.

| Column | Type | Notes |
|---|---|---|
| `id` | `int` PK | |
| `crew_id` | `int` FK → crews.id | `ON DELETE CASCADE` |
| `user_id` | `int` FK → users.id | `ON DELETE CASCADE` |
| `joined_at` | timestamp | |
| `role` | `String(10)` | `'owner'` or `'member'`. The owner gets the same scoring but can't be kicked. |

**Constraints:**
- `UNIQUE (user_id)` — an athlete is in at most one crew (the non-goal above).
- `UNIQUE (crew_id, user_id)` — defense-in-depth against duplicate rows.

**Index:** `(crew_id)` for the standings query.

### `crew_invites`

Pending invitations. Token-based so the invitee doesn't need to know who
invited them until they click the link.

| Column | Type | Notes |
|---|---|---|
| `id` | `int` PK | |
| `crew_id` | `int` FK → crews.id | `ON DELETE CASCADE` |
| `inviter_user_id` | `int` FK → users.id | |
| `invitee_email` | `CITEXT` (or `String(254)` lowered at insert) | The address the invite was sent to. We do *not* require the invitee to already have an account. |
| `token` | `String(48)` | Random URL-safe slug. Indexed for accept lookup. |
| `status` | `String(10)` | `'pending' \| 'accepted' \| 'revoked' \| 'expired'` |
| `created_at` | timestamp | |
| `expires_at` | timestamp | Default `created_at + 14 days`. Background job marks `'expired'` past this. |
| `accepted_at` | timestamp \| null | |

**Constraints:**
- `UNIQUE (token)`.
- Partial unique: `UNIQUE (crew_id, invitee_email) WHERE status = 'pending'`
  — prevents spamming the same email with multiple pending invites for the
  same crew.

**Index:** `(invitee_email, status)` for the "invites for me" query.

## Endpoints

All under `/crews/...`, JWT-authenticated like the rest of the API. Schemas
in `app/schemas/crew.py`.

### `GET /crews/me` — the athlete's crew

Returns the current crew (with members) or 204 No Content if not in a crew.

```
200 OK
{
  "crew": { "id": 12, "name": "Maratona Squad", "owner_user_id": 5 },
  "members": [
    { "user_id": 5, "handle": "jannis", "joined_at": "...", "role": "owner" },
    { "user_id": 8, "handle": "ben",    "joined_at": "...", "role": "member" }
  ],
  "pending_invites": [
    { "id": 33, "invitee_email": "marc@example.com", "created_at": "...", "expires_at": "..." }
  ]
}
```

`handle` is derived from the user's email local-part (matches the existing
`deriveFirstName` helper in `AIGreeting.tsx`). No emails are returned for
*accepted* members — accepted membership reveals identity, not contact
info.

### `POST /crews` — create a crew

Body: `{ "name": "Maratona Squad" }`. Returns the same shape as `GET /crews/me`.
The caller becomes the owner + first member. **422** if the caller is already
in a crew.

### `DELETE /crews/{crew_id}` — disband

Owner only. Cascades to memberships and invites.

### `POST /crews/{crew_id}/invites` — invite by email

Body: `{ "email": "ben@example.com" }`. Auth: must be a member of `crew_id`
(members can invite, not just the owner — keeps friction low).

Behavior:
- If the email already has an account *and* that user is in another crew →
  422 with a clear error code (`already_in_crew`).
- Otherwise: insert `crew_invites` row, generate token, send an email via
  the existing transactional-email path (Postmark / Resend — whichever ships
  first; this spec doesn't pin the provider). Subject: *"$inviter invited you
  to their training crew"*. Link: `https://app/crews/accept/{token}`.

Returns the new invite row.

### `POST /crews/invites/{token}/accept` — accept

No auth: a non-account-holder follows the link, signs up, *then* hits accept
post-auth (the frontend flow chains these). Anonymous accept is **not** valid
— the token is bound to the invitee on acceptance, so the action requires a
logged-in user whose email matches `crew_invites.invitee_email` (case-insensitive).

Behavior:
- 422 if status ≠ `pending` or `expires_at < now`.
- 422 if the accepting user's email ≠ `invitee_email` (token is *for* this
  email; not transferable).
- 422 if the accepting user is already in a crew.
- Else: insert `crew_memberships`, flip the invite to `accepted`, set
  `accepted_at`. Return the new crew shape.

### `POST /crews/invites/{invite_id}/revoke` — undo a pending invite

Auth: the inviter or the crew owner. Sets status to `'revoked'`.

### `DELETE /crews/me/membership` — leave

Removes the caller's row from `crew_memberships`. If the owner leaves, they
must transfer or disband first (422 with a `must_transfer_ownership` code).

### `GET /crews/me/standings?week=2026-W19` — the Squad Cup leaderboard

The keystone read endpoint. Server-side scoring identical to the existing
frontend math.

Returns:

```
{
  "crew_id": 12,
  "week_start": "2026-05-11",
  "week_end": "2026-05-17",
  "daily_target_tss": 70,
  "standings": [
    {
      "user_id": 5,
      "handle": "jannis",
      "is_you": true,
      "weekly_score": 612,
      "weekly_tss": 510,
      "daily_pct": [85, 110, 0, 65, 80, 0, 0]   // Mon..Sun, capped at 150
    },
    { "user_id": 8, "handle": "ben", "is_you": false, ... }
  ]
}
```

`week` query param defaults to current ISO week in the caller's local tz.

### `GET /crews/me/standings/history?weeks=8` — trailing 8-week comparison

For the "beat last week" mechanic. Returns a list of weekly summaries (no
per-day breakdown) — total score, total TSS, finishing position.

## Scoring service

`app/services/crew_score.py`. One function, pure-functional:

```
async def crew_standings(
    db, crew_id: int, week_start: date, week_end: date,
) -> CrewStandings:
    ...
```

Steps:

1. Load `crew_memberships` for `crew_id`. Build a list of user_ids.
2. For each user, query `activities` over `[week_start, week_end]`, sum TSS
   per local day (the activity table already stores `started_at` in UTC; we
   anchor to each athlete's `AthleteProfile.timezone` for the day boundary,
   matching the rest of the periodization system).
3. Load each user's `daily_target_tss`. Derivation matches the frontend:
   `max(30, round(weekly_hours * 70 / 7))`. Cached on the user row would be
   premature; just compute on the fly.
4. Per-day points: `min(1.5, daily_tss / daily_target) * 100`. Cap at 150.
5. Weekly score = sum across 7 days. Max ≈ 1050.
6. Sort descending; mark `is_you` for the caller.

Pure read; no writes. Idempotent. Safe to cache for ~60 s per
(crew_id, week_start) — invalidation on activity sync isn't required at v1
(the worst stale data is yesterday's standings being one ride behind).

## Privacy

- **No public profiles, no discovery, no search.** The only way to join a
  crew is via a token in an emailed invite link.
- **No GPS / activity content shared.** The standings endpoint returns only
  TSS aggregates per day. The Crew tab UI must not deep-link to individual
  activities of other members.
- **Email is invite-only data.** Once an invite is accepted, the inviter's
  email is not returned via any endpoint; only the derived handle.
- **Leave is one-click.** Re-joining the same crew requires a fresh invite.
- **Owner deletion cascades.** Disbanding a crew immediately removes all
  membership rows and revokes pending invites.

## Migration from the localStorage stub

The existing `useCrew` hook is a clean swap point. It currently reads/writes
`localStorage`. Replace its body with a React Query wrapper around
`GET /crews/me` and the mutation endpoints. The `CrewTab.tsx` component's
mechanic continues to work; the data shape just becomes server-authoritative.

A migration step on first sign-in: if `localStorage["crew_v0"]` exists and
the user has no server crew, prompt them ("we found pending invites you
typed in your browser — want us to email them?") and forward each
`handle`-only entry to the new invite endpoint as a best-effort send (or
silently discard if the entry has no email field).

## Phased rollout

| Phase | Scope | Effort |
|---|---|---|
| **1 — Solo + pair** | Tables, `GET /crews/me`, `POST /crews`, invite flow, accept flow, leave, standings (current week only). Crew tab works for a pair. | ~1 week backend, ~2 days frontend hook swap |
| **2 — History** | `/standings/history?weeks=8`, the "beat last week" UX line on Crew, last-week vs this-week deltas | ~2 days |
| **3 — Squad polish** | Multi-member ordering, owner transfer, crew name editing, member kick (owner only) | ~3 days |
| **Later** | Cross-sport scoring nuance · streak preservation when a member is on holiday · simple "kudos" reactions on weekly recap (one tap, no comments) | TBD |

## Tests

Each endpoint gets a happy-path + 1–2 failure-mode test pinning the 422
contract. Standings logic gets the same numeric tests as the current
frontend mechanic (the comment in `CrewTab.tsx` documents the cap and
daily-target derivation — port those expectations directly).

## What this spec is *not*

- Not a UI redesign. Crew tab stays as-is; the mechanic is good.
- Not an email provider decision. Pick Postmark / Resend / etc. at impl time.
- Not a real-time spec. Standings refresh on tab focus is fine for v1.
- Not a notification spec. No "your crew passed you" pings (saved for when
  the Crew engagement loop earns it).

## Open questions for impl time

1. Do we want a public RPC to *check* if an email already has an account
   before sending an invite, to display "ben@x.com is on the app, they'll
   see this instantly" vs. "we'll email them to sign up"? Better UX, but
   exposes user-existence — a small privacy leak. Default to *no*; revisit
   once we have v1 data on conversion.
2. Cap on crew size? Hard cap of 8 at v1 keeps the UI sane and standings
   query fast. Soft, configurable on the crew row.
3. Should owners see pending-invite emails (currently yes in `GET /crews/me`)
   or only the count? Yes for v1 — the owner is the social hub and needs to
   know what's outstanding.
