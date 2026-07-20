# V3 spec vs engine architecture — the challenge log (July 2026)

Requested: "implement it like it, and challenge where its structure is better
or yours." Verdicts below; the merged design is what ships.

## 1. Onboarding — V3 wins on friction, mine wins on feasibility → merged
**V3 (3 screens: Connect · Your Numbers · Goal & Depth)** is better UX than my
5-field PlanProfile form: it front-loads proof ("your engine, already
measured"), asks exactly one identity question (goal) and one register
question (depth). **But** hours/week + available days are load-bearing for a
feasible plan — skipping them recreates the audit's 800-TSS-wall failure
(plans a 3-h/week athlete can't live with). **Merged:** keep 3 screens; Goal &
Depth gains two compact rows (weekly hours slider · training-day chips).
Motivation/variety style is NOT asked — it defaults from the depth selector
and is *learned* from RPE feedback + completion patterns (SDT: fewer forms,
more observed preference). Fewer questions than my draft, more feasible than
the spec.

## 2. Start button + Live Ride — user decision overrides the spec
The spec's Workout card **Start** CTA and the Live Ride screen contradict two
explicit product decisions: "we can not start workout in the app" (July 20)
and Live Ride = won't-build (docs commit 8518a15 — "coach, not live during
the ride"). Shipping: honest "Workout ansehen" CTA, no Live Ride. If Live
Ride ever returns, the spec's blueprint is ready — but that's a product
reversal to make explicitly, not a design detail to sneak in.

## 3. Adaptation transparency — spec has the surface, mine has the substrate → merged
V3's violet adaptive card ("what changed, why, See-what-changed diff") is the
right SURFACE — but the spec has no persistence or stability model behind it.
The append-only `plan_adaptations` log (signal, rule, before→after, evidence,
bilingual no-guilt message) is the stronger substrate: it powers the violet
card, a full timeline, push notices, AND future undo from one stream.
**Merged:** violet card renders the newest feed row; "See what changed" opens
the timeline; every entry deep-links to AI Coach per spec law #2.

## 4. Hourly engine — mine is deeper where the spec is silent
The spec demands visible adaptation but specifies no cadence, no stability
rules. The engine ships with the evidence-backed rule set: 2-signal
agreement, ≤1 material change/day/direction, hysteresis, downgrade-not-
delete, reflow-not-scold, and a give-back rule (green streak → one upgrade)
so adaptation isn't only subtraction. The spec's fixed-weekly-skeleton
principle is adopted as the outer constraint.

## 5. Weather — V3 chip adopted; window math retained inside it
V3's always-visible greeting chip beats my conditional card (which read as
"missing" on rest days — the exact complaint). Kept from mine: the tested
ride-window computation now powers the chip's verdict ("Regen ab 15 Uhr",
"Trocken ab 16 Uhr") instead of a static "Good conditions" string — more
coach, same chrome. Full hourly WeatherWindow card lives on Routes (spec
ownership map).

## 6. Rest day — V3 Rest Card adopted, wired through audited paths
V3's green Rest Card (why-sentence, tomorrow preview, "Why rest?" → coach,
"Ride anyway · Z1", no-guilt footer) is richer than my copy-only rest state.
Adopted — with "Ride anyway" flowing through the EXISTING audited alternates/
modifier path (rails, watts authority, adaptation log) rather than a
freeform override.

## 7. The One Daily Decision — not in the spec, kept anyway
The spec's law #1 ("Recovery decides the plan") is exactly what the P0
DailyDecision object enforces across Today/Recovery/Load-Form/Coach. It stays
the coherence backbone under every V3 surface; the spec gains an enforcement
mechanism it only implied.
