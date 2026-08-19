# The bike economy — earn it on the road, spend it in the workshop

Concept, 2026-08-19. Researched before designed; sources at the foot.

## The brief, and the one part of it that has to change

> "with every ride it gets dirty based on the environment it was in, the chain
> needs to be oiled, otherwise we get less and less token per ride … How often
> he can use it, unexpected repairs … Make it addictive"

Everything here is built from that except one mechanic, which the evidence says
backfires and which this document replaces with something that produces the same
pull without the cost.

**Decay-on-neglect punishes the rider at the exact moment they are most
recoverable.** A rider who has been ill for a fortnight opens the app to find
their bike rotted and their earn rate cut — the moment they most needed a reason
to come back is the moment the app charges them for leaving. This is documented
"Black Hat burnout": short-term engagement up, next-quarter retention down. It is
also why Duolingo retreated to streak freezes.

**And it contradicts this app's own stated values.** `w3BikeSoul.ts` already
says it: *"an idle bike is an invitation, not a debt"*, *"Never scolds"*.

**"How often he can use it" must not ship at all.** Zwift's sharpest criticism is
that it is "not trying to make you train well — it is trying to make you train
more, because that is what keeps you subscribed". A cycling *coach* that gates
riding is the mirror image and it is worse: it is a training app telling an
athlete not to train. Nothing in this system may ever reduce, delay or discourage
a ride.

### The inversion that keeps the pull

**Riding banks value into the bike. Servicing withdraws it.**

Every kilometre accrues a **Service Bonus** on each component. Ride 250 km on a
chain, clean and lube it, and you are paid for all 250 km at once.

Neglect costs nothing. It only leaves money on the table, and the pile grows. The
behavioural pull is identical — you want to go and service it — but the emotional
sign is inverted. Three weeks off the bike rots nothing; it leaves an unharvested
bonus sitting there, which is a *reason to return* rather than a debt to face.

A harvest loop, not a decay loop.

### What stays from the brief, unchanged

- Dirt is real and comes from the real environment (weather, surface, terrain,
  and now the real region via `ride_place`).
- The chain genuinely needs oiling, on a genuinely real interval.
- Unexpected mechanicals happen.
- It is meant to be addictive. It is — see the five hooks.

## The physics is real, so nothing has to be invented

| Fact | Source | Used for |
|---|---|---|
| Re-lube every 160–320 km | BikeRadar / industry benchmark | the chain's service interval |
| A dirty chain costs 3–5 W at 250 W (1–2 %) | BikeRadar | the *stated* efficiency line — a fact, not a penalty |
| 70 % of chain failures come from poor maintenance timing | European Cyclists' Federation, via BikeRadar | event probability weighting |

The app never says "you lose coins because your chain is dirty." It says "your
drivetrain is costing you about 4 W" — which is true, and which a cyclist
respects far more than a made-up debuff.

## The spine: the Eddington number

The largest **E** such that you have ridden at least E km on at least E days.

It is the ideal long-horizon ladder and it costs nothing to build:

- **It gets harder by itself.** Moving 70 → 75 requires more than five new rides,
  because every ride under 75 km stops counting. No artificial difficulty curve.
- **It never decays.** Perfectly compatible with the no-punishment rule.
- **It is one number.** Fits the dock, the share card, the profile.
- **It is already theirs.** Cyclists call it addictive without any prompting from
  us; VeloViewer's leaderboard tops out around 192.
- **It produces honest near-misses.** "Three more 48 km rides reaches E48" is a
  true statement of proximity — the real version of the mechanic slot machines
  fake.

Each new E pays a large one-off RideCoin milestone. Rare, permanent, unforgeable.

## Faucets — five ways coins arrive

| Faucet | Cadence | Feel |
|---|---|---|
| Base ride earn (`rewards.award_ride`, exists) | every ride | steady, predictable |
| Streak multiplier (exists) | continuous | compounding |
| **Service Bonus** | every ~250 km per component | the big harvest |
| **Eddington milestone** | a few times a year | rare, huge, permanent |
| **Road finds** | variable, ~1 ride in 5 | the surprise |

**Road finds are the variable-ratio reward**, and their placement is the ethical
crux. A variable reward schedule is the most powerful retention mechanic known;
attaching it to a slot-machine tap would be exploitative. Attaching it to
*finishing a bike ride* means the unpredictable payoff reinforces the exact
behaviour the product exists to encourage. Same psychology, aimed at the
athlete's benefit rather than against it.

A find is: a region decal, a rare patina, a consumable, or a component in good
condition. Weighted by ride length, terrain and weather — a filthy 120 km in the
rain finds more than a dry 20 km commute, which is also just true.

## Sinks — where the coins go, and why they keep going

The research is blunt about the failure mode: too few sinks and the currency
inflates, loses value, and the faucet stops being motivating. So the sinks are
tiered by frequency, and the cheapest one is deliberately the most frequent.

### 1. Consumables — the volume sink

Chain lube, degreaser, tubes, brake pads, bar tape. Cheap, repeatable, consumed.

**This is the load-bearing sink**, and it is what makes the loop tight: *you must
spend a little to harvest a lot.* Servicing the chain requires lube you bought.
Spend 15 → harvest 100. The spend is trivial, always worth it, and it means every
harvest is preceded by a purchase. Currency circulates instead of piling up.

### 2. Parts — the visible sink

The four cosmetic slots that already exist (`w3parts.ts`): frame, wheels, bars,
saddle. Permanent, and — critically — **rendered**. What you buy shows up in the
photograph of your next ride, through the image-conditioned edit path.

### 3. Framings — the world sink

The six scene framings (`ride_framing.py`, built and render-verified). Your rides
are shot in the world you bought. GPX still decides which one you *earned* free.

### 4. Restoration — the sentimental sink

Reset a component's wear *without* losing its odometer record. Expensive.
Purely emotional, which is exactly why it sells.

### 5. The n+1 — the horizon sink

A second bike. Very expensive, months away, and the thing the whole economy is
quietly pointed at. Cyclists have an actual joke about this.

## Five hooks that make it addictive without making it a chore

### 1. Patina is a collectible, not a debuff

Every ride stamps the bike with where it actually was — Dolomites limestone dust,
coastal salt, autumn leaf mulch — via `ride_place` and the framing edit path.

Before you clean it you may **keep the dirt**: freeze that state permanently as a
ride skin in the garage. Cleaning now costs you something you chose to give up.

That single decision does an enormous amount of work. It converts maintenance
from a chore into a trade-off, it makes dirt desirable rather than shameful, and
it turns the garage into a museum of real rides.

### 2. Collection sets, with the first stamps free

A set of region patinas, and a wall of retired components with their lifetime km.

The endowed-progress effect is well established: hand over the first two stamps
and completion drive does the rest. Every rider starts with two regions already
collected from their existing history, so nobody ever stares at an empty set.

Partial ownership beats zero ownership by a wide margin. Half a set is when it
stops being optional.

### 3. Records, never streaks

"Most km on one chain" is a leaderboard cyclists genuinely brag about. "You
missed a service day" is a scold. We ship the first and never the second.

### 4. Mechanicals are stories, never blocks

A flat at km 40 becomes a small coin, a stat, and a line in the ride's history —
"punctured at 40 km, patched it, carried on." It never makes a bike unusable and
never delays a ride. The user asked for unexpected repairs; this is that, with
the blocking removed.

### 5. The investment loop closes visually

Hook-model investment is the phase most products skip. Here it is automatic: coins
buy parts and framings, parts and framings change the render, and the render is
the hero of the next ride's page. The rider is not accumulating a number — they
are accumulating an artifact that becomes more theirs, and that they see.

## The loop, end to end

```
        ride  ─────────────►  base earn + streak
          │                        │
          ├──► wear on components ─┤
          ├──► patina from region  │
          └──► road find (1 in 5)  │
                                   ▼
      buy lube (small spend)  ◄─── RideCoin
          │                        ▲
          ▼                        │
      SERVICE  ─────────────►  Service Bonus (large)
          │
          └──► keep the dirt?  ──► ride skin (collection)

      Eddington milestone ────►  rare large payout
      RideCoin  ─────────────►  parts · framings · restoration · n+1
                                   │
                                   ▼
                          the render changes
                                   │
                                   ▼
                       next ride's hero shows it
```

## What already exists

Almost all of it. This is assembly, not construction.

| Piece | State |
|---|---|
| `rewards.py` — wallet, ledger, `award_ride`, streak tiers | built |
| `w3BikeSoul.ts` — grime derived from real km | built, and this is the seed |
| `w3parts.ts` — four cosmetic slots | built |
| `bike_render.py` — image-conditioned edits | built, needs rebasing off the catalogue |
| `ride_framing.py` — six framings | built, render-verified |
| `ride_place.py` — GPX → real region | built, render-verified |
| `rewards.spend()` | **missing** — still trapped in `services/shop.purchase` |
| Component odometers, service state | **new** — one table |
| Eddington | **new** — a pure function over ride history |

## Open questions worth deciding before building

1. **One currency or two?** RideCoin alone is simpler and this concept assumes
   it. A separate maintenance currency would let the two economies be tuned
   independently but adds a second thing to explain.
2. **Do components ever actually die?** A chain at 4 000 km could refuse to hold
   a service bonus until replaced. That is a soft sink with real bite — and the
   first place this design could tip back into punishment, so it needs care.
3. **How much of the wear model is visible?** A per-component odometer is honest
   and legible. A single "condition %" is friendlier but hides the mechanic.
4. **Constants.** Every number here is a ratio, not a value. The Service Bonus
   must be tuned against real ledger data so it lands meaningfully above a single
   ride's earn without dwarfing a week of training.

## Sources

- [How to clean and lube a bike chain — BikeRadar](https://www.bikeradar.com/advice/workshop/how-to-clean-a-bike-chain)
- [Gamification or Manipulation? Ethics of Engagement Loops — UX Magazine](https://uxmag.medium.com/gamification-or-manipulation-understanding-the-ethics-of-engagement-loops-920f2fa2b0eb)
- [Are you a Zwift addict? — road.cc](https://road.cc/content/feature/are-you-zwift-addict-279023)
- [The Eddington Number for Cycling — Old Roots, New Routes](https://alchemyrider.me/2017/01/26/the-eddington-number-for-cycling/)
- [Eddington Numbers from your Strava Data — VeloViewer](https://blog.veloviewer.com/eddington-numbers-from-your-strava-data/)
- [Collection Sets in Gamification — Yu-kai Chou](https://yukaichou.com/advanced-gamification/game-design-technique-collection-sets/)
- [The Endowed Progress Effect and Game Quests — Game Developer](https://www.gamedeveloper.com/game-platforms/the-psychology-of-games-the-endowed-progress-effect-and-game-quests)
- [The Hooked Model — Nir & Far](https://www.nirandfar.com/how-to-manufacture-desire/)
- [Game economy design in Free-to-Play games — Machinations.io](https://machinations.io/articles/game-economy-design-free-to-play-games)
- [How to Create a Balanced Mobile Game Economy — Udonis](https://www.blog.udonis.co/mobile-marketing/mobile-games/balanced-mobile-game-economy)
