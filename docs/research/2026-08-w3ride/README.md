# W3:Ride — Reward System Teardown & Mechanic Map

**Date:** 2026-08-11 · **Branch:** `cassette-reward-layer`
**Subject:** `io.w3ride.w3ride` v0.14.6 (Expo SDK 49 / React Native), decompiled APK
**Method:** static extraction from a 13 MB unobfuscated `index.android.bundle` (plain minified JS, not
Hermes bytecode), plus `res/`, `app.config`, `AndroidManifest.xml`, and two marketing screenshots.

**Deliverable structure**
- Part A — what W3:Ride actually is (economy, API, design system), evidence-graded.
- Part B — each mechanic mapped onto this repo: **HAVE / ADAPT / REJECT / NEW**.
- Appendices A–D — the full extraction detail, with quoted evidence for every claim.

| Appendix | Contents |
|---|---|
| [A — Economy](./appendix-a-economy.md) | currencies, reward formula, claim budget, tiers, bikes, referrals, anti-cheat |
| [B — API](./appendix-b-api.md) | ~55 REST routes, data model, ride ingestion, auth, settlement |
| [C — Design system](./appendix-c-design-system.md) | full palette, type scale, 19 components, 31 icons, motion, tone |
| [D — Our substrate](./appendix-d-our-substrate.md) | what this repo already has, with file:line references |

---

## Evidence grading

Used throughout, and it matters more than usual here because most of this economy is server-side.

- **`[HARD]`** — a literal constant, enum, or verbatim UI string quoted from the bundle or from `res/`.
- **`[INFER]`** — a reading of hard evidence. Labelled, never presented as fact.
- **`[EYE]`** — read off a marketing screenshot. Approximate, and possibly not shipped.

> **Version caveat, stated up front.** The two screenshots (`w3-ride.jpg`, `w3-ride-app.jpg`) show a
> circular "Next milestone" ring pair and a "Badges / SEE ALL" rail. **Neither copy string exists in
> v0.14.6** (`"Next milestone"` → 0 hits, `"SEE ALL"` → 0 hits). Those are marketing renders that are
> newer, older, or aspirational. They are also, awkwardly, the two surfaces most relevant to us — so
> they are documented `[EYE]` and must not be cited as shipped competitor behaviour.
> Likewise **"Silver Tier"** from the screenshot is not a string in this build.

---

# Part A — What W3:Ride actually is

## A0. The structural finding that governs everything

**W3:Ride is a thin client over a server-authoritative economy.** No reward formula, tier threshold, or
exchange rate is in the JS. The client knows the *inputs* and renders the *outputs*.

Two consequences:
1. The exact earning curves are **unknowable from static analysis**. Anyone claiming a precise formula
   from this bundle is guessing. See "What we deliberately did not do" below.
2. The one place the rules *are* written down is a **"Bonus" help bottom-sheet** on the ride detail
   screen. That prose is the single richest artifact in the teardown.
   → *Generalisable lesson: read a competitor's help modals before you read their code.*

## A1. The earning model

**Verbatim from the in-app explainer `[HARD]`:**
> "Users receive a unique average speed bonus between **5-30 Mph**" · "Speed bonuses stop after **30 Mph**"
> "Users receive a unique bonus from **1-35 miles** traveled." · "After 35 miles, riders receive extra $Power per mile."
> `36-49 mi: +250 $Power` · `50-70: +500` · `71-90: +750` · `91-150: +1000`

**Machine constants `[HARD]`** — `RideDistanceBuckets`, in metres:

| Bucket | metres | miles | step bonus |
|---|---|---|---|
| First | 56 327 | 35.0 | (base band ends) |
| Second | 80 467.2 | 50.0 | +250 |
| Third | 112 654.1 | 70.0 | +500 |
| Fourth | 144 841 | 90.0 | +750 |
| Fifth | 193 121.3 | 120.0 | +1000 |

Note the copy says "91-150 miles" but the enum's fifth boundary is exactly 120.0 mi. Trust the enum;
"150" is hand-written marketing rounding.

Speed is normalised in the UI against `convertMilesToKm(30)` = **48.28 km/h** `[HARD]`, matching the
copy's cutoff.

**Defensible reconstruction `[HARD inputs, INFER shape]`:**
```
power(ride) = base(distance ∈ [1,35] mi)          # continuous, curve unknown
            × speedBonus(avgSpeed ∈ [5,30] mph)   # continuous, clamped above 30
            × bikeFactor(rarity ∈ [1.75,16])      # lower rarity ⇒ more power
            + distanceStepBonus(distance)          # +250/+500/+750/+1000
            × (1 + 0.10 referral, while window open)
```

### The two negatives that matter most

- **There is no elevation term and no heart-rate term `[HARD, negative]`.** `elevation` appears 47× in
  the bundle, exclusively as an RN shadow style prop or a HealthKit constant — never on a ride.
- **There is no XP, no level, no durability, no repair, no minting, no breeding, no sockets, and no
  energy/stamina system `[HARD, negative]`.**

So the economy pays for **going far, moderately fast, on an expensive NFT**. It cannot distinguish a
threshold interval from a coffee-shop spin, and it cannot see a climb. This is the incentive a coaching
app exists to counteract — which is the central reason most of Part A is a **REJECT** in Part B.

### The bike is one number

A bike carries a single stat: `rarity`, range **[1.75, 16], lower is better `[HARD]`**, described in-app
as having "an impact on the earning formula". Best-to-worst spread ≈ **9.14×**. 8088-piece Cardano
collection. That is the entire progression model — you do not train up, you buy up.

## A2. "3/6 RIDE LEFT" is a claim budget, not durability

The most commonly misread thing in the screenshots, and it was worth getting right.

`ridesLeftCount / ridesCount` from `GET user/current/summary` `[HARD]` is an **account-level allowance on
claiming**, not a consumable on the bike. Two disposals per ride, each with its own budget and cooldown:

- **Claim** (`ridesToInclude` / `nextIncludeOn`) — deterministic, credits full $Power.
- **Re:cycle** (`ridesToRecycle` / `nextRecycleOn`) — a **scratch-card gamble** paying a server-set
  `recyclePercentage` of the ride's Power. Copy: *"Scratch to Play" / "You Won!"*

The design intent `[INFER]`: **riding is never rationed — only monetising a ride is.** The scarce claim
budget is precisely what makes the gamble attractive. It is a cleaner idea than STEPN's shoe durability,
and it is still a manufactured scarcity with no physiological basis.

## A3. Tiers — shipped and switched off

Ladder `[HARD]`: `tutorial → rookie → funseeker → enthusiast → expert → pro`, drawn as stacked chevrons so
rank is legible at 16px with no text. Gated on completing tier challenges plus paying Σ`costAmount`.

**The upgrade button is hardcoded `disabled: true` in v0.14.6 `[HARD]`** — a complete tier UI held in
reserve as a live-ops lever. Every threshold value is server-side and **not found**.

## A4. Referrals

*"Recruit new riders and earn a 10% bonus on every ride they claim for 30 days when signing up."*
*"The total amount of your bonus will be available for you to claim at the end of the 30 days period."* `[HARD]`

Bilateral, paid in Power, **escrowed and released as a lump at period end**. No caps found.
The retention hook is the *delayed lump-sum reveal*, not the percentage.

## A5. Architecture (Appendix B)

- **Transport:** plain REST/JSON, one axios instance, `https://service.w3ride.io/api/`. Not GraphQL.
  ~55 routes, essentially the complete catalogue since paths are relative literals.
- **There is no in-app ride recording at all `[HARD]`.** No maps or location libraries; the
  AndroidManifest declares **no location, activity-recognition, or body-sensor permission**. iOS pushes
  the raw HealthKit `Workout` array to `POST ride/import/apple` on every foreground as a 10-day rolling
  re-sync (server dedupes). Strava/Google Fit connect via server-issued OAuth and are crawled backend-side
   — the Strava copy tells users to make rides *public*, which gives the method away.
- **Settlement is fully custodial and off-chain.** Despite the NFT framing: **zero web3 code** — no
  ethers, WalletConnect, chainId, or any `0x` address. `POST ride/include` credits a `WalletType.Internal`
  ledger row. Chain wallets are read-only; linking is pushed to desktop web.
- **Auth:** Auth0 Universal Login, Bearer token. *Noted for the record: both tokens are mirrored into
  plain AsyncStorage.* No analytics or crash SDK at all — errors go to their own `POST log`.

**The build lesson `[INFER]`:** import-don't-track saved them an enormous amount of engineering and gave
them an enormous fraud surface, which is why anti-cheat is 100% server-side and a ride can come back
flagged `isInvalid`.

## A6. The design system (Appendix C)

The whole token file is **one 30-line module**: 28 named colours plus `spacing: {padding:16,
marginTitle:15, marginBlock:30}`. Everything below is `[HARD]`.

**Palette** — accent `green600 #B5FF23`; violet `purple700 #854BFF`; lavender `purple500 #E6CDFF`;
page `dark #252525`; card `black #0F0F0F`; explainer surface `gray800 #1B1B1B`.

**Type** — Work Sans Regular/Medium/SemiBold. **No Bold.** Body defaults to **18px Medium** with a global
`letterSpacing: -0.94px` on every `Text`. Headings h1–h5 = 40/36/30/26/20, all at a ~1.056 line-height
ratio — set essentially solid. De-emphasis is opacity (0.4 / 0.6), never a grey token. `uppercase` is the
only transform used (41×), reserved for 10–12px metadata and reward CTAs.

**Radii** — base card 10, nested 8, hero 15, meter 32, pill 50; circles always exactly `height/2`, so
nothing is ever *nearly* round.

### The five moves worth stealing (independent of the economy)

1. **Inverted surface depth.** Cards (`#0F0F0F`) are *darker* than the page (`#252525`), with **zero
   shadow anywhere**. Panels read as cut-outs, not raised planes — and lime pops harder against deeper
   black than it would against grey.
2. **One accent that never dims.** `#B5FF23` is the accent in light theme, dark theme, splash, and
   launcher background. The app boots as a full-bleed lime screen.
3. **Two accents = two states, not two brand colours.** Violet = *pending / promised*; lime = *earned /
   settled*. The same pill flips between them on settle, and **every art asset ships in both variants**.
   This is the single clearest state-through-colour system in the app.
4. **A track is its own fill at 30% alpha.** One mechanical rule, four colour variants, always
   harmonious, no separate "track grey" token to maintain.
5. **The button *is* the timer.** Slide-to-claim's 42px knob refills over 24 h, so the primary action, its
   disabled state, and the countdown are **one object** rather than a button plus a label.

**Motion:** Reanimated + Skia, **zero Lottie and zero Rive**. All motion is code-driven. Signature
moments: a full-screen Skia scratch-to-reveal, the slide-to-claim refill, a claim overlay that floods the
card violet and lands the number at **90px**, and a 2 s count-up on the balance.

**Tone:** an enthusiastic crypto-native brand manager with cycling vocabulary bolted on. *It is not
coach-like — there is no training advice anywhere in the product.* Register drops to flat instruction
whenever money is involved. Copy is lightly unproofed (`"your are"`, `"25 rides streal"`).

## A7. What we deliberately did not do

The extraction identified `powerContextJson` — a server-produced blob attached to every ride, of which
the client reads only `BikeId`. One authenticated `GET /api/ride` would very likely expose the entire
reward breakdown.

**We did not make that request, and this document does not recommend it.** Reading a publicly
distributed binary is ordinary competitive analysis; authenticating against a third party's production
API to extract undisclosed business logic is not. The earning curves stay marked **NOT FOUND**.

---

# Part B — Mechanic map

Verdicts: **HAVE** (already built here) · **ADAPT** (idea survives, mechanism must change) ·
**REJECT** (with the reason) · **NEW** (genuine gap worth considering).

## B0. Read these three constraints first

1. **The cassette hero was already built and killed.** All 9 tasks of
   `docs/superpowers/plans/2026-08-07-today-cassette-reward-layer.md` were executed, then `c171bf7`
   (2026-08-08) deleted `Cassette.tsx`, `CassetteHero.tsx`, `cassetteScale.ts` and 5 test files.
   Owner ruling: *"a cog standing in for a body asked the reader to translate… People didn't get it."*
   **Do not re-propose a cassette hero.** The *mechanics* that spec introduced all survived and are the
   live contract: chain-as-streak, XP from planned load, one-highlighted-point charts, once-per-day motion.
2. **The written bans.** `docs/competitive-roadmap-tasks.md` prohibits global leaderboards, **loot
   mechanics, arbitrary badges, login streaks**. Celebration must be earned physiologically.
3. **The XP distinction, which is easy to get wrong.** XP as a *hidden mechanism* is in bounds — owner
   decision 2026-08-06, and `KetteStrip` ships it today (`weekLoad.spent / weekLoad.planned`, so junk
   miles cannot farm it). XP/levels as *vocabulary or surface* is banned — `usability-audit-2026-07.md`
   P1-11, and `LevelStripCard.tsx` carries the comment "no levels, no XP vocabulary".
   Both statements are true simultaneously. Don't collapse them.

## B1. The map

| # | W3:Ride mechanic | Verdict | Where we stand |
|---|---|---|---|
| 1 | **Two currencies** (Power earn-only, Cyclr tradable) | **REJECT** | No currency abstraction survives the "no XP vocabulary" ruling, and a tradable token needs an economy we have no reason to run. |
| 2 | **Reward = f(distance, avg speed)** | **REJECT — actively harmful** | Pays for volume at moderate speed; blind to elevation, HR, and intensity distribution. We already have the honest version: TSS/CTL and `crew_score` scoring against *your own* daily target. |
| 3 | **Bike rarity multiplier (9× spread)** | **REJECT** | Pay-to-earn. Nothing to adapt. |
| 4 | **Claim budget** ("3/6 rides left", cooldowns) | **REJECT as-built · ADAPT the reframe** | Manufactured scarcity with no physiological basis — explicitly out of bounds per the prior spec `:31`. *But* the underlying idea (ride freely, ration only the reward) has an honest analogue we already own: **recovery is the real budget**. TSB/readiness already gates what you can productively spend. Worth naming as a design frame, not a counter. |
| 5 | **Re:cycle scratch-card gamble** | **REJECT** | Textbook loot mechanic. Already tagged `CONTRADICTS-DECISION` as backlog item D3 ("mystery detector"), which reverses `AchievementsView`'s deliberate honest-transparency design. |
| 6 | **Six-rung tier ladder** | **ADAPT — strongest single import** | We have the honest substrate: **W/kg physiology bands** (backlog B2 "mastery ladders"), and roadmap item **P2.9** is open. A ladder earned by measured physiology is the version of this that survives our guardrails. Steal the *chevron legibility* (rank readable at 16px, no text), not the paywall. See the `BandChip` caveat below. |
| 7 | **Server-driven badges** | **HAVE** | `models/achievement.py` (table `achievements`, unique `(user_id, key)`, JSONB `context`), `services/achievement_service.py` with a 15-item catalog, `GET /achievements/mine`, `AchievementsView.tsx`. Ours are physiologically earned; theirs are `badgeName` strings. **We are ahead here.** |
| 8 | **Milestone progress rings** `[EYE]` | **HAVE (partial)** | `LevelStripCard.tsx` (kJ toward next 5,000) and `MilestoneStrip.tsx`. Caveat: the rings aren't in the shipped bundle, so there's no competitor behaviour to copy — only a visual. |
| 9 | **Streak** | **HAVE — and they have none** | W3:Ride has **no streak system whatsoever** `[HARD, negative]`. Ours (`services/streak.py`) is forgiving: rest days count, illness/injury *pauses*, a skipped *planned* session breaks it, today never breaks. This is a genuine competitive advantage, not a gap. |
| 10 | **Referral: +10%, 30 days, escrowed lump at period end** | **REJECT the payout · ADAPT the ritual** | No currency to pay in. The transferable part is the **escrowed period-end reveal** — accrue quietly, reveal as one lump. We already have the honest instance: Weekly Wrapped/Recap. |
| 11 | **Leaderboard** (PowerEarned, Distance) | **HAVE — better** | `crew_score.crew_standings_window:506` scores `min(1.5, dayTSS / personal_daily_target) × 100`, i.e. share of *your own* target, with full ranked UI at `SocialTab.tsx:707-853`. Absolute-output leaderboards are banned; ours already solves the demoralisation problem theirs has. |
| 12 | **Import-don't-track** | **HAVE** | Garmin ingestion; `create_activity` (`activity_service.py:280`) is where a ride becomes durable. Same architecture, arrived at independently. |
| 13 | **Slide-to-claim / "the button is the timer"** | **ADAPT — pure UI, no economy** | The best interaction idea in the app and it carries no economic baggage. Candidate home: any genuinely time-gated action we already have. Do **not** invent a cooldown just to use it. |
| 14 | **Count-up on value change** | **HAVE** | `editorial/motion/useCountUp.ts`, live in `MorningDeckView` and `FormBlock`. |
| 15 | **Claim overlay / bubble burst / scratch reveal** | **HAVE (engine) · ADAPT (variety)** | `CelebrationContext.tsx` has a priority queue, localStorage dedup, confetti + haptics, reduced-motion. Backlog E2 (cooldown/rate-limit) does **not** exist. The 90px reward numeral is a cheap, adoptable escalation. |
| 16 | **Design system moves 1–5 (A6)** | **ADAPT** | Fully separable from the economy. Highest value: **violet=pending / lime=settled** as a state system, and **track = fill @ 30% alpha**. Our palette differs; the *rules* port cleanly. |
| 17 | **Tone of voice** | **REJECT** | Hype-marketing with zero training advice. The opposite of our register — cf. `morning-health-card-tone-confirmed`. Useful only as a negative control. |

## B2. The four genuine gaps (NEW)

From Appendix D, ranked. None of these are copied from W3:Ride — they're the holes the comparison exposed.

1. **Awards are pull, not push.** `create_activity` (`activity_service.py:280`) — the natural hook point —
   fires **no award scan**. Achievements only compute when the user opens the page, so a rider can earn
   something and never learn it happened. W3:Ride's claim moment is crude, but it *does* guarantee the
   reward has a moment. **This is the highest-leverage fix on the list.**
2. **No period-end job.** The cron has 4 sweeps, none reward-related; `CrewChallenge` has no completed
   state and dedup is localStorage-only. Any escrow/reveal ritual (B1 #10) needs this first.
3. **Push is morning-only.** No post-ride push (backlog F1, tagged `NEEDS-CHECK`), no email.
4. **Nothing cosmetic to reward with.** Identity is `display_name` + a base64 avatar. W3:Ride's answer
   (buy an NFT) is not ours, and XP/levels are banned — so if a reward should feel *ownable*, the vehicle
   doesn't exist yet. **This is an open design question, not a task.**

*(Also noted: streak state is split across server, a localStorage mirror, and two UIs; celebration dedup
does not survive a device switch.)*

## B3. Recommendation

The economy is not the asset here — it's a distance-and-speed payout wearing an NFT costume, and it
fails the one test a coaching app has to pass. **Three things are worth taking:**

1. **Gap #1 — award on ingestion, not on page-open.** Backend, small, and it fixes a real hole where
   earned recognition silently doesn't happen.
2. **B1 #6 — the physiology-band ladder.** P2.9 is already on the roadmap. The teardown's contribution is
   the *chevron* idea: make rank legible at 16px without text.

   **`BandChip` caveat — verified 2026-08-11.** `frontend/src/components/social/BandChip.tsx` exists and
   has **zero importers**; it was created in `e0fdbf7` and never mounted. Note a *different*, locally
   defined `BandChip` inside `PostRideReview.tsx:77` **is** live — same name, unrelated component. Per
   the standing rule (`resurrect-means-redesign`), the orphan is **not** a component to mount as-is;
   treat it as evidence the idea was started and abandoned, and design the ladder fresh.
3. **A6 moves 3 and 4 — pending/settled as a colour system, and the 30%-alpha track rule.** Cheap,
   mechanical, and they make any future reward surface cohere.

Everything else is either already ours and better (streak, leaderboard, badges), or is loot.

---

## Provenance

Four parallel extraction agents over the decompiled APK and this repo, 2026-08-11. Every claim in the
appendices carries a quoted snippet or is explicitly marked NOT FOUND — Appendix A §15 lists 18 known
gaps so that no gap is mistaken for a zero. There is **no original W3:Ride source repo**; the bundle is
the only source. (`~/Downloads/meetride` is an unrelated local project and was ruled out.)
