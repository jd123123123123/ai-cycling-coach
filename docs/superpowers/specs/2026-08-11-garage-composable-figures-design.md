# Garage: composable figures + RideCoin — design spec

**Date:** 2026-08-11 · **Branch:** `cassette-reward-layer`
**Status:** design, pending review
**Companion research:** `docs/research/2026-08-w3ride/` (W3:Ride teardown — economy, API, design system)
**Design source of truth:** `w3.pen` (frames `W3 · 01 TODAY` `gx4WA`, `W3 · 02 GARAGE` `TQZah`); tokens: Inter Tight / Archivo Narrow, acid `#C8FF00`, band `#0B0B0B` → card `#161616` r24.

---

## 1. Goal

Give riders a **Garage**: earn a spendable reward (**RideCoin**) from real training, spend it on **cosmetic parts** for a bike and an avatar, and see those parts **actually render on the figure**. The reward loop wraps the honest coaching app without corrupting it.

This reverses three prior owner rulings (no spendable currency, no loot, no XP vocabulary); see §8. It is a deliberate, owner-approved reversal, scoped hard to **cosmetics** so training integrity is untouched.

## 2. Decisions locked (this conversation)

| # | Decision | Rationale |
|---|---|---|
| D1 | **Spendable points** (`RideCoin`) + a shop | Owner choice, 2026-08-11, over the honest earn-to-unlock alternative. |
| D2 | **Earned by TSS**, not distance/time | The one W3 rule that fights coaching is volume-pay. TSS makes a hard session out-earn junk miles; coach and game pull together. |
| D3 | **One currency**, not W3's dual Power/Cyclr | No trading, no conversion valve, no speculation. RideCoin is earn-only, spend-only, integer. |
| D4 | **Parts are cosmetic only** | Hard line. A part must never change earning, training metrics, or recommendations. No pay-to-win. (W3's rarity multiplied earnings ~9×; we reject that.) |
| D5 | **Composable slot-layered figures** | Neither W3 nor the current pen swaps parts — both bake one image. This engine is the net-new "even better." |
| D6 | Award fires at **ride ingestion**, not on page-open | Fixes the "awards are pull, not push" gap (`activity_service.py:280`). Earning gets a moment. |

## 3. The composable figure engine

The core abstraction is identical for bikes and avatars.

### 3.1 Slots and the shared-anchor principle

A **figure** is a fixed art-board with an ordered stack of **slots**. Each slot holds exactly one **variant** at a time. **Every variant of a slot is authored to the same anchor box** (same canvas size, same registration point), so swapping a variant needs zero repositioning — the new tire/helmet lands correctly by construction. This is the whole trick.

**Bike slots** (z-order, back → front):
```
backdrop/glow · frame · rear-wheel · front-wheel · tires · drivetrain · saddle · bar-tape · accessory
```
**Avatar slots** (z-order, back → front):
```
body · jersey · head · hair · helmet · glasses
```

Slots are fixed and finite. Variants per slot grow over time (that's the shop catalog).

### 3.2 Part / variant model

```ts
type Slot = 'frame'|'rearWheel'|'frontWheel'|'tires'|'drivetrain'|'saddle'|'barTape'|'accessory'
          | 'body'|'jersey'|'head'|'hair'|'helmet'|'glasses'

interface Part {
  id: string
  figure: 'bike' | 'avatar'
  slot: Slot
  label: string            // "Gravel tires", "Aero helmet"
  asset: string            // svg id / layer key (see 3.4)
  tint?: string | null     // optional recolor for SVG variants
  priceRideCoin: number    // 0 = default/free
  unlock: UnlockRule       // 'purchase' | { achievement: string } | 'default'
  z: number                // slot's fixed z-index (denormalized for render)
}
```

`unlock` allows a hybrid: most parts are bought with RideCoin; a few **prestige** parts require a real achievement (e.g., a "century" bar-tape unlocks only after a first 100 km ride) and may still cost RideCoin on top. This keeps a thread of earned-through-training pride inside the shop.

### 3.3 Loadout (what a rider has equipped)

```ts
interface Loadout { [slot: Slot]: string /* partId */ }   // one per figure per user
```
Every slot resolves to a part: an equipped one, or the slot's `default` part (never empty for structural slots like frame/body; cosmetic slots like helmet/glasses/accessory may resolve to a `none` variant).

### 3.4 Rendering

**App** — a pure `<Figure>` that stacks slot layers in z-order:
```tsx
<Figure figure="bike" loadout={loadout} />
// renders slots.sort(byZ).map(slot => <Layer asset={catalog[loadout[slot]].asset} tint={…} />)
```
Buy → owned. Equip → `loadout[slot] = partId`. `<Figure>` re-renders → the part appears. Same component powers: Garage (large, interactive), Today bike-hero (`rMjk7`), profile, and the crew avatars.

**Pen** — each slot is a reusable component; the figure is a frame stacking slot instances with `layout:"none"` absolute positioning on the shared anchor. Swapping a part = `Replace` the slot node's image / variant, or toggle variant `enabled`. This is the pattern the Garage upgrade list (`EX1Vt`) should drive — today those upgrade cards name parts that never appear on the bike.

### 3.5 Asset strategy

Ranked; the art is the hard part, not the code.

- **A · SVG-layered side-profile (recommended v1).** Each slot is an SVG `<g>`; variants are path sets, optionally `tint`-recolored. Cheap, scalable, recolorable, on-brand with an editorial register, and a single artist can produce a full catalog. Genuinely swappable from day one.
- **B · Matched PNG renders.** Every variant rendered from *one shared 3D camera + light rig* as transparent PNGs, stacked by z. Photoreal (matches the current baked hero) but needs a disciplined render pipeline and re-renders for every new part.
- **C · Runtime 3D** (three.js / GLTF, swappable meshes). Most flexible, most expensive; defer.

**Decision:** ship **A** for the interactive figure. Optionally keep the existing baked photoreal image as a static "hero showcase" where no swapping is needed.

## 4. The RideCoin economy

### 4.1 Currency

- **RideCoin** — earn-only, spend-only, non-tradable, integer. One currency (not W3's Power+Cyclr). No conversion, no marketplace, no cash-out.

### 4.2 Earning (TSS-based)

- `earned = round(TSS × k)` for a validated ride, `k` a single tunable constant (start `k = 1`, i.e. RideCoin ≈ TSS).
- Computed and credited at **ride ingestion** (`backend/app/services/activity_service.py` `create_activity:280`, right after the row is durable), so a ride *always* has an earning moment.
- No distance or duration term. No elevation bonus. Intensity is already inside TSS.
- Anti-farm: reuse existing validation; only rides that pass the normal pipeline earn. No manual-entry or duplicate credit.

### 4.3 Spending

- Buy a `Part` → debit `priceRideCoin`, insert an `owned_part` row.
- Equip an owned part → update `loadout`. Equipping is free and unlimited.
- Prestige parts additionally check `unlock.achievement` against the existing `achievements` table before purchase is allowed.

### 4.4 Ledger

Double-entry-lite, auditable:
```
points_ledger(id, user_id, created_at, delta, reason, ref_type, ref_id)
  reason ∈ {'ride_earn','part_purchase','adjustment'}
wallet(user_id, balance)   -- materialized sum, updated in the same tx
```

## 5. Persistence (backend)

New Alembic migration, following existing model conventions (`backend/app/models/*`, cf. `achievement.py`):

- `wallet(user_id PK/FK, balance int default 0)`
- `points_ledger(id, user_id FK, created_at, delta int, reason, ref_type, ref_id, JSONB context)`
- `parts_catalog` — **static** (a versioned TS/Python constant like the achievement `CATALOG`), not a table, until it needs live editing. Fields per §3.2.
- `owned_parts(id, user_id FK, part_id, acquired_at, unique(user_id, part_id))`
- `loadouts(user_id FK, figure, slot, part_id, unique(user_id, figure, slot))`

Award hook: extend `create_activity` to compute TSS-earn and write a `ride_earn` ledger row + wallet increment in the same transaction. Emit a post-ride notification (new; today push is morning-only) carrying the RideCoin earned.

API (REST, matching existing `api/` style):
```
GET  /garage/wallet                     -> {balance}
GET  /garage/catalog?figure=bike|avatar -> Part[]
GET  /garage/owned                      -> partId[]
GET  /garage/loadout?figure=            -> Loadout
POST /garage/purchase {partId}          -> {balance, owned}
POST /garage/equip   {figure,slot,partId}
GET  /garage/ledger?limit=              -> LedgerRow[]
```

## 6. Surfaces

- **Garage** (`W3 · 02 GARAGE` `TQZah`): the `<Figure>` preview at top; below it, the shop as slot-grouped part lists (the `EX1Vt` "Upgrades" pattern already exists — wire each card to buy/equip and to the figure). Owned = acid chip; locked = progress/price. Balance chip in header.
- **Today** (`gx4WA`): bike-hero shows the equipped bike loadout; the **crew band** (built, node `Krj7x`) shows equipped avatars; the session card's reward line reads RideCoin (= TSS earn) — replacing W3's "4,200 POWER · 12 CYCLE".
- **Profile / crew**: avatar figure everywhere a rider is shown.

## 7. Honest-design guardrails to KEEP

Non-negotiable, even inside the reversal:
1. **Cosmetic only.** No part changes earning, TSS, recommendations, or any training metric. (Reject W3's rarity-multiplier entirely.)
2. **Earn reflects training, never volume.** TSS only; never re-introduce distance/time pay.
3. **No gacha / loot boxes / scratch reveals.** Purchases are deterministic: you see the part, you buy the part. (Reject W3's Re:cycle scratch-card.)
4. **No second currency, no trading, no cash-out.** Nothing to speculate on.
5. **Streak/achievements stay physiological.** The Garage sits beside them; it does not replace earned celebration.

## 8. Guardrail reversals to record (deliberate)

When implemented, update — as an explicit, dated owner decision, not a silent contradiction:
- `docs/competitive-roadmap-tasks.md` — "Explicitly not doing": lift the blanket *spendable-currency / loot* ban to allow **cosmetic-only** RideCoin; keep the loot-box and pay-to-win bans.
- `frontend/src/pages/AchievementsView.tsx` header comment ("no XP, no levels") — scope it to *achievements*; note RideCoin is a separate cosmetic economy.
- `docs/usability-audit-2026-07.md` P1-11 — annotate that levels/XP vocabulary stays banned; RideCoin is currency, not levels.

## 9. Phasing

1. **Engine + economy backend** — tables, TSS-earn at ingestion, wallet/ledger, purchase/equip APIs.
2. **`<Figure>` + one figure's SVG slot set** (bike, tires + frame + wheels swappable) — prove the render/swap.
3. **Garage surface** — shop wired to buy/equip/preview.
4. **Avatar figure** — second slot set; crew + profile adopt it.
5. **Prestige unlocks** — achievement-gated parts; post-ride earning notification.

## 10. Out of scope

Trading/marketplace, real-money purchase of RideCoin, on-chain anything, part rarity/stats, breeding/minting, durability/repair, a second currency. All explicitly rejected.
