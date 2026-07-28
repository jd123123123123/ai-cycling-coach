# V3 screen council — July 2026

Four reviewers rated all 31 V3 pen frames (and the ~35 routed surfaces actually
shipping) from incompatible perspectives, deliberately not consulting each other:
a WorldTour pro + coach, a time-poor amateur four months from a first gran fondo,
a consumer-subscription strategist, and a principal designer/a11y specialist.

The disagreements are the useful part. Where all four agree, act. Where the pro
and the amateur invert, the answer is almost always "keep the data, change the
framing" — not "pick a side".

## Verified findings (computed, not asserted)

| Check | Result |
|---|---|
| `--color-muted` #8A93A3 on card #14181D | **5.76:1** — passes AA normal, fails AAA |
| Pen's label #5C6570 on card | **3.01:1** — **fails** AA normal. The app was right to override it |
| Accent #FF5A3C vs muted #8A93A3 | **1.000:1** — *isoluminant* |

The last row is the significant one. The brand accent and secondary-label grey
have identical relative luminance (ΔL = 0.00016). Every accent in the product
carries **zero luminance emphasis**: in greyscale, or to a rider with the most
common colour-vision deficiency, a coral CTA and a muted caption are the same
value. Colour is doing work that only colour can undo.

## Where all four agreed

**Core, untouchable:** Today · Train · Ride Recap · Workout Detail · AI Coach.
**Do not build:** Live Ride (loses to the head unit on the stem), Team Calendar,
Crew Switcher, Route Detail, Crew Week Highlights.
**Cut or fold:** the crew/social stack, Explore Routes, Dashboards, and one of
the two week-story screens (`/recap/week` and `/wrapped` both ship today).
**Duplicate authorities are the real IA bug**, not breadth: readiness is
answered by both Today and Recovery; fitness trajectory by Progress, Power
Profile, Season *and* Today's fitness block; one ride by Recap, Session Report
and Ride Debrief.

## Where they inverted — and the resolution

| Contested | Pro | Amateur | Resolution |
|---|---|---|---|
| **Power Profile** | IMPORTANT — CP/W′ matters | **ACTIVELY HARMFUL** — "a screen that exists to tell me I'm Cat 5" | Keep the curve, **kill the category ranking**. Benchmark against the rider's own best seasons, never against rider classes. |
| **Train / plan** | **ACTIVELY HARMFUL** — a second source of truth against my coach | **MANDATORY** — "absorbs the missed ride" is why the app survives | Amateur wins; he is the target user. The pro path is a read-only plan imported from his coach, not a competing planner. |
| **Recovery** | IMPORTANT — my physio asks for exactly this | NICE → harmful — "SpO2 means nothing to me" | Keep every metric; **demote from peer tab to Today's "Why" detail**. Two 224px rings answering one question is the shipped defect. |

## The line that should change the product

> "Naming a metric I can't interpret is not transparency, it's a small daily
> reminder that this app is for someone else." — the amateur

He is explicit that a one-sentence caption fixes the *decision* and not the
*feeling*: if the plain sentence sits next to the acronym, the acronym still
wins. His prescription is to **replace** the jargon at the default depth, not
caption it — "your fitness is climbing, you're a bit tired", with the number one
tap away for anyone who wants it.

## Two candidate moats, pointing the same direction

- **Strategist:** Ride Recap's "what this ride did" — the only place in the
  category where effort → adaptation is closed. Weakness: it fires on upload and
  goes cold. Needs a standing "what the last 8 weeks bought you" balance so each
  recap is a deposit, not a receipt.
- **Pro:** fatigued-state pacing on the real race GPX — watts for the Angliru's
  23% ramps given 4,200 kJ already spent and a *fatigued* CP, not a fresh one.
  Plus heat and altitude, which nothing here models.

Both are the same bet: **terrain × fatigue specificity**. No incumbent connects
the event's terrain to the plan, and Whoop structurally cannot copy the
honesty-on-stale-data position because its model requires a number every morning.

## Proposed target: four tabs, nine surfaces

**Today** (absorbs Recovery; ring→Body detail) · **Plan** (Train + Season & Race
Day + Calendar + Builder; race countdown becomes the plan header, where it can be
acted on) · **Progress** (segments: Trajectory / Volume / Power / Records —
absorbs History, Power Profile, Achievements) · **Crew** (trimmed, or cut).
Coach is not a tab: it is a persistent entry on Today plus contextual "ask about
this" on Workout Detail and Ride Recap, so it inherits context.

Scroll targets: Today 2500→1400px · Ride Recap 4400px behind a collapsed
"Full analysis" group · Progress 4100px into four ~1000px panes.

## Three a11y fixes that keep the colour

1. **Readiness state** — bind to arc length + a state glyph (▲ ready / ● steady /
   ▼ hold) + the verdict word at display size. Colour confirms, never carries.
2. **Z1–Z7 and gradient bands** — keep hue, add a monotonic luminance ramp
   (≥1.5:1 between adjacent steps) and the zone/gradient text in or beside each band.
3. **Dense strips** (7-day load, week strip, 4×6 leaderboard matrix, hourly
   weather) — 24 filter combinations cannot yield 44pt targets at 390px. Split
   into two stacked rows; give every bar an accessible name ("Tue, 62 TSS, easy").

## Deliberately unresolved (product calls, not engineering ones)

- Is the pro a target user at all? If not, Train stays as-is and the pro's
  read-only-plan path is never built.
- Does the crew stack get cut, or kept as the acquisition channel? Three of four
  reviewers said cut; the counter-argument is that it is the only social loop.
- Weekly Wrapped: the strategist wants exactly one week-story screen. Both riders
  called the shareable framing harmful ("3h20 is not worth sharing").
