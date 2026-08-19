# Your own bike, customised — dropping the catalogue

Design, 2026-08-19.

## What this reverses

`w3bikes.ts:5` carries a section headed "WHY A LADDER AND NOT AN UPLOAD". It
argued that digitalising the rider's own bike made the bike a fixed possession:
nothing to earn, nothing to spend RideCoin on, and a paid image-model call on
the critical path of onboarding. The 25-bike ladder inverted all three.

This design reverses that decision. The bike goes back to being the rider's own,
photographed and rendered — and the three problems the ladder solved are solved
differently:

| The ladder's argument | The answer here |
|---|---|
| nothing to earn | parts are earned; a build is a look you unlock |
| no RideCoin sink | parts are the sink (`REASON_PART_PURCHASE` already exists) |
| paid render on the onboarding path | the studio step is **skippable** |

## What survives, and why it matters

`docs/w3-bike-customisation.md` (2026-08-17) is a **measured** decision note and
it is load-bearing for this design. It records that paper-doll layer compositing
was built and failed — chroma-key turned spokes pink, frame geometry varied with
the seed, anchors could not be inferred — and that the replacement is
**image-conditioned editing**: the rendered bike goes back to the model as an
input image with "change only these components, keep everything else
pixel-identical".

Its measurements, against `alloy-allez`:

| Change | pixels altered |
|---|---|
| wheels only | 5.4 % |
| saddle only | 0.9 % |
| wheels + saddle + bar tape, one call | 5.8 % |
| stacked, step 1 → step 2 | 5.3 % → 6.3 % |

Two rules follow from those numbers and both are binding here:

1. **One call per combination, not one per part.** Three changes cost no more
   than one.
2. **Always edit from the original.** Stacking drifts. A build is composed from
   the rider's base render every time, never from an already-edited image.

So `services/bike_render.py` — which implements exactly this — is **kept and
rebased**, not deleted. `w3parts.ts` is kept as the customisation catalogue; the
24 isolated part images remain what a rider picks from, which is the role the
note's closing line already assigns them.

## The cost consequence, stated plainly

The old build cache was **global**: a lime Rostlaube on gold rims is the same
picture for every rider, so one render served the whole user base and
`bike_renders.build_key` needed no `user_id`.

The rider's own bike is a unique base image. **Nothing can be shared.** The
cache key becomes per-rider, and each rider pays one ~4s render the first time
they wear a given combination.

This retires the property `w3parts.ts:6` claimed for layering ("a rider trying
five bar tapes cannot mean five paid image-model calls"). It is now five calls.
The mitigation is that the cache is permanent and per-combination, so returning
to a build you have already worn is instant and free forever.

The honest free/paid line:

- **Free and instant** — naming the bike. Only that.
- **RideCoin** — buying a part. Permanent ownership, `REASON_PART_PURCHASE`.
- **~4s render** — the first wearing of a combination. Cached per
  `(user, combination)`.

## The trap

`services/shop.py:348` (`purchase`) holds the **only balance debit in the
application**. `services/rewards.py` has `_credit` and no counterpart. Deleting
the shop without extracting it first makes RideCoin unspendable by construction.

**Extraction happens before any deletion.** `rewards.spend(db, user_id, amount,
reason)` inherits the `SELECT … FOR UPDATE` balance lock and writes a negative
ledger row through the existing `_credit` path.

## Phase 1 — drop the catalogue, restore the upload, name it

### Backend

Delete:

- `api/shop.py`, `services/shop.py` (after the `spend` extraction)
- the bike half of `services/w3catalog.py`; what remains is parts-only and is
  renamed `services/w3parts.py`
- `scripts/generate-bikes.py`
- `frontend/public/w3/bikes/*.webp`

Keep, with changes:

- `models/shop.py` — renamed `models/garage_parts.py` (the module name; the three
  table names are unchanged, so the rename costs no migration). `GarageItem`
  keeps only `kind='part'` rows; `GarageLoadout` drops `bike_id` (the rider's
  bike is now the `GarageAsset`); `BikeRender` gains `user_id` and RLS.
- the idempotent stock-parts grant that `shop.get_garage` ran on every read
  moves to `services/parts.py` intact — it is why `GET /garage` is a writer and
  must commit.
- `models/garage.py` — `GarageAsset` gains `nickname` (String 60, nullable). The
  existing `name` keeps the vision pass's read ("Specialized Allez"). Both are
  true and both are shown; the rider's name never overwrites the model's.

Endpoints:

- `GET /garage` — absorbs what `GET /shop` returned: rider, bike, balance, owned
  part ids, loadout. One read, as before.
- `PATCH /garage/asset/bike` — sets `nickname`. Free, instant, no model call.
- `POST /garage/asset/render` — unchanged.
- `DELETE /garage/asset/{kind}` — unchanged.

Migration:

- add `garage_assets.nickname`
- add `bike_renders.user_id` + RLS policy, matching `garage_assets`, and
  **truncate `bike_renders`** — every cached row is a build of a catalogue bike
  that no longer exists, so the whole table is stale by definition
- drop `garage_loadout.bike_id`
- delete `garage_items` rows with `kind='bike'`, and **refund `price_paid` to
  the wallet** as a `REASON_ADJUSTMENT` ledger line per rider. Taking someone's
  coins in a refactor is not acceptable silently. Local dev has seeded fake data;
  this only bites in production.

### Frontend

Delete: `W3ShopView`/`Page`/`Preview` and `/e/w3-shop`; `W3FirstBikeView`/`Page`/
`Preview` and `/e/w3-first-bike`; `w3bikes.ts`, `w3shop.ts`, `starterBike.ts`,
`api/shop.ts`, `hooks/useShop.ts`.

Rewire the six collateral importers to `useGarage()`, which already exists and
already returns the rider's real bike: `W3AuthView`, `W3SessionView`,
`W3SharePage`, `W3SharePreview`, `W3TodayPage`, `W3TodayPreview`.

`W3BikeStudioView` (405 lines, still working, still routed at
`/e/w3-bike-studio`) returns to the GARAGE tab. Its reveal step gains the naming
beat — *"Wie heißt sie?"* — writing through `PATCH /garage/asset/bike`.

`W3OnboardGarageView` becomes the skippable studio step. A Skip is always
present; nothing blocks signup behind a render.

`W3GarageView` is rebuilt around the rider's own bike: the bike on
`W3BikeStage`, lit by `w3BikeSoul` (grime from real km, light from the real
hour, stance from whether they have ridden — unchanged, and better suited to a
bike that is actually theirs than it ever was to catalogue art). Nickname large,
the vision spec sheet below, one entry into customisation.

When `garage.bike == null` the screen is a real empty state — *"dein Platz ist
frei"* — never a stock bike wearing the rider's name.

## Phase 2 — customisation

### Backend

`services/bike_render.py` is rebased from `(bike_id, loadout)` onto
`(garage_asset, parts)`:

- `build_key(...)` becomes
  `f"u{user_id}:a{asset_id}:r{asset_updated_at_epoch}|{frame}|{wheels}|{bars}|{saddle}"`.
  Including the asset's `updated_at` means re-uploading the bike invalidates its
  build renders naturally rather than serving a build of a bike that no longer
  exists.
- `base_art_path(bike_id)` — which read a shipped catalogue WebP — is replaced by
  reading `GarageAsset.image_url` (the stored WebP data URL). This is the one
  structural change: the base image comes from the database, not from disk.
- `compose_prompt`, `describe`, `claim` and the pending-row race lock are
  unchanged. They already express the two binding rules.
- `is_stock` still short-circuits: a bike wearing no bought parts is the rider's
  own base render, which costs nothing and is instant.

`services/parts.py` (new, replacing the deleted `services/shop.py`) owns part
ownership, the equip transition, and the RC debit through `rewards.spend`. It
inherits the typed refusals the API layer already maps to status codes: 404
unknown item, 409 already owned, 402 insufficient balance.

Endpoints:

- `POST /garage/parts/buy/{item_id}` — price comes from `services/w3parts.py`,
  never from the request body. Unchanged anti-tamper property.
- `POST /garage/parts/equip/{item_id}` — writes the loadout slot and triggers the
  build render.

### Frontend

`W3CustomizeView` (new): the four slots from `w3parts.ts` (RAHMEN, REIFEN,
LENKER, SATTEL), each part shown as its isolated art with its RC price and
owned/affordable state. Buying is a confirm because it spends. Equipping a
combination the rider has worn before is instant from cache; a new combination
shows the honest pending state — their plain bike, with the composed one
arriving when it does.

`W3GarageView` gains the entry point. `W3BikeHero` and `W3BikeStage` are
unchanged.

## Honesty rules

Inherited from the surfaces this touches, and non-negotiable:

- **The debit fires only after the render lands.** Charging for an image that
  never arrived is the single failure that would poison this. The existing
  `image_model_unavailable` gating already carries the branch — no image model
  means no charge and no fake picture.
- **Never a stock bike presented as the rider's.** The empty state is real.
- **A build renders honestly or not at all.** The rider sees their plain bike
  until the composed one exists. Nothing blocks a page; nothing invents a bike.
- **`w3BikeSoul`'s grime is a function of real riding.** A bike that has not
  moved cannot be dirty. Unchanged.

## Out of scope

- The weekly Wrapped deck (parked, undesigned).
- Rider-figure (`kind='rider'`) customisation. Bikes only.
- Any change to earning: `award_ride`, streaks, challenges and referrals are
  untouched. This changes only what coins are spent on.
