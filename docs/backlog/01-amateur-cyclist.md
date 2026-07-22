# Product Backlog — The Amateur / Beginner Recreational Cyclist

*Reviewer persona lens. Research + ideation only — no code changes. Grounded in a page-by-page read of the current app (Today / Train / Recovery / History / Progress / Social tabs, RideRecap, WeeklyWrapped, WeeklyRecapStory, Coach, Onboarding V3, Profile/Settings, Power Profile) and the design source `pencil-new.pen`, plus `docs/competitive-analysis-2026-07.md` and `docs/competitive-roadmap-tasks.md`.*

---

## Persona

**Mara, 34 — rides 2–4 times a week for fun, fitness and headspace.** She has a mid-range bike, a phone, maybe a Garmin watch, and *no power meter*. She does not know her FTP, has never done a threshold test, and gets a small anxious jolt from words like "TSS", "CTL/ATL/TSB", "LTHR", "normalized power". She isn't training for anything — she wants to feel fitter, keep the habit alive, and occasionally feel like a bit of a hero. She opens the app hoping for two things: **"should I ride today?"** and **"did I do okay?"** — answered warmly, in plain words, with a little spark of delight. She will churn the first time the app makes her feel dumb, judged, behind, or excluded.

**What she needs:** plain language over jargon; encouragement over grading; low-stakes daily ritual; visible small wins that don't require a power meter; guilt-free rest and comebacks; sharing that makes her look good to non-cyclist friends without shoving her into a leaderboard she's losing. The app already has an unusually kind spine (guilt-free rest copy, honest "—" states, self-referential recaps, a coach-safety interlock, a `simple` language mode, a graduated first-ride badge ladder). **Most of these items are about turning that latent kindness ON by default for beginners, decoupling delight from the power meter, and lowering the jargon ceiling — not building from scratch.**

---

## Theme A — Onboarding & First-Run Delight

### A1. Beginner mode ON by default
- **Area/Page:** Onboarding V3 (Screen 2 depth selector) · Settings "Detail level" · global `metricLabel`/`LanguageContext`
- **Description:** The depth selector already offers *Guide me (plain language) / Show numbers / Full pro*, but defaults to **numbers**. When a rider chooses the "Just starting / little or no riding" self-assessment card (or connects no power data), auto-select **Guide me** and persist it. Everything downstream (`metricLabel` simple mode: TSS→Load, CTL→Fitness, TSB→Freshness) then reads plainly without her lifting a finger.
- **Expected improvement:** Removes the single biggest churn trigger (jargon wall) for the exact users most likely to bounce; higher activation of the plain-language path that already exists.
- **Effort:** S
- **Why it matters:** She never asked to be a data nerd — the app should meet her in plain words unless she opts up.

### A2. Day-one "Look what you've already done" moment
- **Area/Page:** Onboarding V3 (post-connect) → Today first-load
- **Description:** After Garmin/Apple connect, compute a warm backfill card from her last 90 days *before* dropping her on a Today page full of honest "—": "We read your last 3 months — 41 rides, 612 km, that's Berlin to Prague. Your first plan is ready." Reuse the `DidYouKnow` comparison engine (Berlin→Hamburg, Everest %) for the flourish.
- **Expected improvement:** Converts the cold-start void into a first-session "wow"; strong day-1 retention lever (competitive roadmap P2.10).
- **Effort:** M
- **Why it matters:** First impression is everything for a nervous beginner — start on a win, not empty boxes.

### A3. "First ride on the board" celebration
- **Area/Page:** Post-sync (garmin sync) · Today · reuse `lib/confetti.ts` + `AchievementBadges` ("First ride. The streak starts here.")
- **Description:** The badge ladder already has a "First ride" milestone, but it's localStorage-only and easy to miss. Make the *first ever synced ride* a deliberate full-screen moment: confetti, "You're on the board," and a one-tap "see your ride." 
- **Expected improvement:** Manufactures the earliest possible dopamine hit, the moment most predictive of a second session.
- **Effort:** S
- **Why it matters:** The first win has to be unmissable, or she never comes back for the second.

### A4. "A basic bike is perfect" reassurance
- **Area/Page:** Onboarding V3 (Screen 0 Connect + Screen 1 Numbers) · Power Profile empty state
- **Description:** Onboarding says "no test needed" (good) but still leads with an **FTP hero card** and later surfaces power-meter-gated screens. Add explicit, friendly framing that a phone/watch and a normal bike are entirely enough — "No power meter? No problem. We coach from your rides, heart rate and how you feel." Soften Power Profile's "no rides with a power meter yet" dead-end into "Here's what we *can* see" using HR/duration/distance.
- **Expected improvement:** Prevents the "this app isn't for people like me" bounce; widens the funnel to the non-power majority.
- **Effort:** S
- **Why it matters:** She'll assume premium hardware is required and quietly leave — unless told otherwise.

### A5. Pick your coach's voice (warm by default)
- **Area/Page:** Onboarding V3 + Settings (ties to roadmap P1.7 coach voices)
- **Description:** Offer a one-tap coach-vibe choice — **Compañero (warm & encouraging)** vs Analyst (watts & numbers) — defaulting beginners to Compañero. The `coach_service` already forks on tone and `metricLabel` on simple/technical; this just gives her an emotional on-ramp and consistent encouragement.
- **Expected improvement:** Personalization + tone match = higher perceived warmth and daily-open intent; differentiator vs. sterile engines.
- **Effort:** M
- **Why it matters:** She wants a cheerleader who happens to know the science, not a lab report.

---

## Theme B — Clarity & Plain Language (de-jargon)

### B1. Tap-to-explain on *every* metric, everywhere
- **Area/Page:** All tabs (Today, Train, Recovery, History, Progress, RideRecap) · extend `components/ui/GlossarySheet.tsx`
- **Description:** `GlossarySheet` (dotted-underline → plain-language bottom sheet) already exists but only on Power Profile, Recovery Trends and TrendsHero. Every jargon token elsewhere — TSS, IF, NP, HRV, CTL/ATL/TSB, Z1–Z7, %FTP, "decoupling", Strain/21, VO₂max — is bare. Route all metric chips through the glossary so any scary word is one tap from "what this means, in one sentence."
- **Expected improvement:** Turns intimidation into curiosity; retains the metric-literate power user while rescuing the beginner. Directly answers the audit's "acronyms with no inline explanation."
- **Effort:** M
- **Why it matters:** A single unexplained acronym can make her feel stupid; a tap-to-learn makes her feel smart.

### B2. Finish wiring `simple` mode across all surfaces
- **Area/Page:** Global — `metricLabel` + `LanguageContext`, applied in Today/Train/Recovery/History cards
- **Description:** The `metricLabel` simple/technical map exists (TSS→Load, CTL→Fitness, NP→Power…) but jargon still leaks across the main tabs (session meta like "Ø 215 W · Z4 · 82 TSS", "Fitness +N (7d)", "Strain /21"). Audit every hard-coded acronym and route it through `metricLabel(language, locale)` so choosing "Guide me" actually cleans the *whole* UI, not just a few cards.
- **Expected improvement:** Makes A1 real; consistency (no half-translated screens) is itself a trust signal.
- **Effort:** M
- **Why it matters:** A "plain language" toggle that only half-works is worse than none — it teases her then reverts to jargon.

### B3. Encouraging verdict instead of a report-card grade
- **Area/Page:** RideRecapView · SessionReviewCard (Today) — session grade (A+…F) + score/100
- **Description:** Every ride currently gets a **letter grade and a score out of 100**. To a beginner after a casual spin, "C−" reads as failure. In Guide-mode, replace the grade with a warm, honest verdict chip — "Solid steady ride," "Easy and exactly right," "A genuinely hard day, well done" — keeping the number available on tap for those who want it.
- **Expected improvement:** Removes a recurring de-motivator; reframes execution as encouragement, per the "celebrate, don't grade" thesis.
- **Effort:** S
- **Why it matters:** She rode her bike and had fun — the app should never hand her an F for it.

### B4. Plain-words ride analysis
- **Area/Page:** RideRecapView "Coach analysis" · reuse `ContributorsSheet` rewrite pattern
- **Description:** `ContributorsSheet` already rewrites jargon beautifully in simple mode ("HRV suppressed" → "Your body's showing signs of not fully recovering yet"). Apply the same rewrite bank to the ride recap narrative and trait tags so "Negative split · IF 0.87 · decoupling 4%" becomes "You rode the second half faster than the first — great pacing."
- **Expected improvement:** Makes the app's best storytelling surface legible to the persona; more "I understood my ride" moments.
- **Effort:** M
- **Why it matters:** The recap is where she looks for "did I do well?" — it must answer in her language.

### B5. Never hard-block the plan on FTP
- **Area/Page:** PlanTab 409 empty state ("We need your FTP… → Enter your FTP")
- **Description:** Onboarding V3 has a lovely "I don't know my FTP" self-assessment path, but the Plan tab still hard-gates behind a typed FTP number. Reuse that same feel-based estimator inline ("Just starting / Ride now and then / Ride a lot" + weight → conservative starter) so she always gets *a* plan, never a locked door.
- **Expected improvement:** Eliminates a genuine onboarding cliff; every user reaches a usable plan.
- **Effort:** S
- **Why it matters:** Being blocked by a number she's never heard of is exactly when she quits.

---

## Theme C — Motivation & Habit-Building

### C1. Sync the morning check-in and make it a ritual
- **Area/Page:** `MorningCheckin` (Today) — currently localStorage-only
- **Description:** The 3-tap "How do you feel?" (💪/😐/😴) is the highest-retention micro-interaction in the category, but today it only writes to localStorage and dies there. POST it to the backend, feed it into the coach brief ("You said tired — I softened today"), and close the loop with a warm one-liner. This is the daily hook that summons her back.
- **Expected improvement:** Establishes a 5-second daily ritual (Whoop/Bevel's core retention mechanic) *and* improves model quality via subjective input.
- **Effort:** M
- **Why it matters:** A tiny daily tap she can always do — even on rest days — is what turns "an app I have" into "an app I open."

### C2. Forgiving consistency, one honest streak
- **Area/Page:** History heatmap streak pill ("keep the fire alive") vs. Today weekly-rhythm framing · `useStreak` states (`healthy/sick/injured/break`)
- **Description:** There are two philosophies fighting: History's flame + "ride tomorrow to keep the fire alive" (guilt/loss-aversion) and the deliberately guilt-free weekly-rhythm framing everywhere else. Reconcile to one **forgiving** model — planned rest counts, a "life happens / sick / break" status *pauses* rather than breaks, and the copy celebrates showing up ("You rested when the plan said rest — that's the skill") rather than threatening a broken chain.
- **Expected improvement:** Kills the guilt mechanic that drives lapses into churn (Gentler Streak's most-thanked design); resolves an internal copy contradiction.
- **Effort:** M
- **Why it matters:** One missed week shouldn't set her flame on fire and shame her out of the app.

### C3. "Next milestone" nudge on Today
- **Area/Page:** Today · surface `AchievementBadges` ladder progress
- **Description:** The graduated badge ladder (First ride → 1h → 50 km → Century → first 7-day rhythm…) is celebration-only today. Add a gentle forward-looking chip on Today: "2 rides to your first 50 km badge" / "One more day this week completes your rhythm." Clear, achievable, non-competitive goals.
- **Expected improvement:** Gives the aimless "just get fitter" rider concrete short-horizon targets — the strongest ethical retention lever.
- **Effort:** S
- **Why it matters:** She has no race to train for; the app should hand her the next small, winnable goal.

### C4. Invitational weekly ring copy (kill the loss-aversion)
- **Area/Page:** `WeeklyChallenge` "behind" state
- **Description:** The weekly ring's behind-state copy leans on loss-aversion — "The week is asking," "protect the ring," "{h}h left to protect the ring." For a casual rider that reads as pressure. Swap to invitational, low-stakes framing — "A short spin would feel great today," "Plenty of week left — no rush." Keep the celebratory closed-state ("Ring closed. You showed up.").
- **Expected improvement:** Preserves the dopamine of closing the ring without the anxiety of "losing" it; on-brand with the no-guilt spine.
- **Effort:** S
- **Why it matters:** She rides for joy — a ring that nags her is a ring she'll mute.

### C5. Guilt-free comeback flow
- **Area/Page:** Today (return after a lapse) · Coach brief
- **Description:** When she returns after 10+ idle days, greet with warmth, not a broken streak or a red scoreboard: "Welcome back — the bike missed you. Let's start easy today." Auto-propose a gentle re-entry ride and reset expectations without a word of blame.
- **Expected improvement:** Recovers lapsed users instead of losing them at the exact fragile moment they reopen.
- **Effort:** M
- **Why it matters:** The reopen-after-a-gap is make-or-break; kindness there is the whole ballgame.

---

## Theme D — Micro-Dopamine (lots, tuned for casual riders)

### D1. Ride-logged burst
- **Area/Page:** Post-sync toast · Today
- **Description:** When a ride lands, fire a small, tasteful moment: count-up of km/time, a light confetti tick (`lib/confetti.ts` exists), and one warm line ("Ride logged — nice work, that's your 3rd this week"). Reduced-motion safe.
- **Expected improvement:** Reliable positive reinforcement on the app's most frequent event; trains the open-after-riding habit.
- **Effort:** S
- **Why it matters:** Every ride should end with a tiny high-five, not silence.

### D2. Decouple celebration from the power meter
- **Area/Page:** `BreakthroughCelebration` + new HR/duration/distance milestones
- **Description:** Breakthroughs and Peak-Power moments require a power meter, so a basic-bike beginner *never* gets one. Add power-free "firsts" and "bests" she *can* hit — longest ride, most days this month, farthest distance, longest climb by elevation, first sub-X HR on a familiar loop — each with the same confetti + share card.
- **Expected improvement:** Extends the app's best dopamine mechanic to the majority who have no watts; broad inclusion of delight.
- **Effort:** M
- **Why it matters:** She's currently locked out of the app's fun moments by hardware she doesn't own.

### D3. "Did I do well?" instant verdict chip
- **Area/Page:** RideRecapView (top) · SessionReviewCard
- **Description:** Before any chart, show a single reassuring sentence answering the only question she has: "Yes — that was a good, steady ride, right where it should be." Deterministic from duration/HR/effort vs. plan; always encouraging, never a grade.
- **Expected improvement:** Directly satisfies the core beginner need; reduces post-ride anxiety and self-doubt.
- **Effort:** S
- **Why it matters:** She finished the ride wondering if she "did it right" — answer her in the first line.

### D4. Fun, meaningful comparisons sprinkled in
- **Area/Page:** Today (`DidYouKnow`) · RideRecap · per-ride
- **Description:** `DidYouKnow` already turns numbers into delight (Berlin→Hamburg, "N pizzas", Everest %). Extend it to *per-ride* and Recap moments: "That climb = one Eiffel Tower," "You burned about 3 croissants," "620 W for 5s — you briefly out-powered your kettle." Household/landmark scale makes abstract numbers feel real.
- **Expected improvement:** Converts opaque metrics into shareable, brag-worthy, human-scale wins; playful without loot mechanics.
- **Effort:** S
- **Why it matters:** "12,480 kJ" means nothing to her; "3 croissants" makes her grin and screenshot it.

### D5. Delightful "how did it feel?" reward loop
- **Area/Page:** RideRecap RPE loop · MorningCheckin
- **Description:** The 1-tap RPE ("How hard did that feel?") exists and tunes next week. Make the *reward* for answering more delightful — a warm acknowledgement animation and "Thanks — I nudged Thursday to match how you feel." Reward the input, not just consume it.
- **Expected improvement:** Higher RPE-completion (better model + more trust) via visible reciprocity.
- **Effort:** S
- **Why it matters:** If tapping how she feels visibly changes her plan, she feels *heard* — that's retention.

### D6. Celebrate recovery & sleep wins too
- **Area/Page:** Recovery tab · Today
- **Description:** Celebration is all training/power today. Add gentle recovery-side dopamine that doesn't need watts: "Best sleep in 2 weeks 🌙," "HRV back to your baseline — nicely recovered," "3 green days in a row." Reuse the Recovery "green days" counter.
- **Expected improvement:** Rewards the whole-life behaviors casual riders *can* control; reinforces rest as a win, not a gap.
- **Effort:** S
- **Why it matters:** She can't always ride hard, but she can sleep well — let that count and feel good.

### D7. Monthly identity beat
- **Area/Page:** WeeklyRecapStory / monthly recap · Progress
- **Description:** Once a month, surface a self-referential identity line grounded in her own trend: "You're becoming an endurance rider — your easy rides are getting longer and steadier." No comparison to anyone else.
- **Expected improvement:** Identity reinforcement is the strongest ethical retention mechanism (per the playfulness strategy); makes her *feel* like a cyclist.
- **Effort:** M
- **Why it matters:** She wants to become "a person who rides" — reflect that identity back to her.

---

## Theme E — Confidence & Reassurance ("should I ride? did I do okay?")

### E1. One-glance "Should I ride today?" answer
- **Area/Page:** Today readiness hero (currently dense: shader ring + decision pill + morning-read paragraph + momentum chips + tiles)
- **Description:** The Today hero is gorgeous but *dense* for a nervous beginner. In Guide mode, lead with a single friendly traffic-light sentence at the very top — "Yes — a good day for an easy ride 🚲" / "Take it easy today, your body's still catching up" — with all the detail collapsed below for those who want it.
- **Expected improvement:** Answers her #1 daily question in under a second; reduces analysis paralysis.
- **Effort:** M
- **Why it matters:** She opens the app to be *told* what to do, kindly — not to interpret a dashboard.

### E2. "Am I doing okay?" one-tap coach check
- **Area/Page:** Coach chat suggestion chips · Today
- **Description:** Add a first-class suggestion chip / Today shortcut — "Am I doing okay?" — that returns a short, honest, encouraging read of her last two weeks in plain words. The coach + simple mode already support this tone; make the reassurance one tap away.
- **Expected improvement:** Gives the anxious beginner a safe, judgment-free "checkup" on demand; deepens the coach relationship.
- **Effort:** S
- **Why it matters:** Sometimes she just needs someone to say "you're doing fine" — the coach should offer it unprompted.

### E3. "Why rest is training" explainer on rest days
- **Area/Page:** Today V3 Rest Card · Recovery recommendation
- **Description:** Rest copy is already guilt-free ("the plan already counted this day"). Add a tappable, beginner-aimed "why does rest make me faster?" mini-explainer (one card, plain language, optional citation chip) so rest feels *productive*, not idle.
- **Expected improvement:** Turns the highest-anxiety day (a rest day for a keen beginner) into a confident, understood choice.
- **Effort:** S
- **Why it matters:** Left alone on a rest day she feels lazy and guilty — teach her it's the point.

---

## Theme F — Social & Sharing That Feels Good (not competitive)

### F1. Default beginners out of the competition, into encouragement
- **Area/Page:** Social tab (`SocialTab`) — currently greets with crew but centers leaderboards, 6-metric battles, "winner takes the week," trash-talk nudges
- **Description:** For beginners (or until they opt in), lead the Social surface with a *cheer/kudos* mode — celebrate crew members' rides, send encouragement — and keep battles/duels/leaderboards behind an explicit "Ready to compete?" opt-in. The coach-safety interlock and normalized scoring are excellent; this just changes the *default posture* from arena to clubhouse.
- **Expected improvement:** Removes the "I'm losing a scoreboard I never entered" bounce; makes social feel warm first, competitive only by choice.
- **Effort:** M
- **Why it matters:** She wants riding buddies and cheers, not to be ranked last against a racer.

### F2. Kudos & cheers (turn the "—" into 💚)
- **Area/Page:** Social feed · RideRecap (kudos footer deliberately omitted for honesty)
- **Description:** Kudos/comment counts currently render honest "—" because the data isn't backed. Build the lightweight, **positive-only** reaction layer (a cheer, a 🚲, a "nice one") so the feed and recaps can carry warmth without a full comment/competition system.
- **Expected improvement:** Adds the single most-loved Strava mechanic (kudos) in its kindest, non-comparative form; light social glue.
- **Effort:** M
- **Why it matters:** A tiny "nice ride!" from a friend is worth more to her than any leaderboard rank.

### F3. Share-worthy cards as the primary social act
- **Area/Page:** WeeklyWrapped / WeeklyRecapStory / RideRecap PNG export (all already render 1080×1350 PNGs)
- **Description:** The app already makes beautiful branded share images — that's the *right* social act for a solo beginner. Surface "Share this ride / your week" more prominently (first ride, first 50 km, breakthrough) and make the cards proud of *her* story, not stats-dense. These shareables are also the app's acquisition channel while crews are small.
- **Expected improvement:** Feel-good, low-stakes sharing that makes her look good to non-cyclist friends; organic growth loop.
- **Effort:** S
- **Why it matters:** She'll happily post "Berlin to Hamburg this month 🚴" to friends — that's social she *enjoys*.

### F4. "Follow my journey" link for non-cyclist friends & family
- **Area/Page:** Profile / Settings · new read-only public share
- **Description:** A private, read-only web link (no app, no account, no numbers-wall) that shows her friends/family a warm summary of her riding journey — distance this year, a highlight, a photo. Cheers from people who love her, not competition from strangers.
- **Expected improvement:** Brings her real support network in as encouragement; distinctive, kind, and viral-friendly.
- **Effort:** L
- **Why it matters:** Her mum cheering "so proud!" beats a KOM she'll never get.

---

## Theme G — Fun & Reducing Intimidation

### G1. Friendly empty states for basic-bike / no-data riders
- **Area/Page:** Recovery ("Not tracked"/"—" tiles: skin temp, SpO₂, latency…), Power Profile, Social segments
- **Description:** Many surfaces are peppered with honest "—" / "Not tracked" tiles that, to a beginner, read as *broken* rather than *intentional*. Reframe each with a warm, opt-in-forward note — "Wear a watch to bed to unlock this," "This appears once you've logged a few rides" — so absence feels like a friendly next step, not a fault.
- **Expected improvement:** Removes the "this app is half-empty / broken for me" impression; converts gaps into gentle upsells to habits.
- **Effort:** S
- **Why it matters:** A screen full of dashes makes her feel she's doing it wrong — a friendly note makes it feel within reach.

### G2. A warmer, less clinical skin (optional)
- **Area/Page:** Global theme (currently a dark WHOOP-style aesthetic with coral accents)
- **Description:** The dark, metric-forward design is beautiful but reads "serious athlete lab" to a casual rider. Offer an optional lighter, warmer, softer-typography theme for Guide mode — same information, friendlier clothing.
- **Expected improvement:** Lowers the intimidation of first impression; broadens appeal beyond the data-nerd aesthetic.
- **Effort:** L
- **Why it matters:** The vibe should say "come ride your bike," not "you'd better know your numbers."

### G3. "Explain my week like I'm new"
- **Area/Page:** Coach chat chip · WeeklyRecap
- **Description:** A one-tap coach action that narrates her week in the simplest possible terms — "You rode 3 times, one longer and easy, one with some hills. Your fitness is slowly building. Nice and steady." Reuses the simple-mode coach and the recap data.
- **Expected improvement:** Makes reflection accessible and reassuring; strengthens the plain-language brand promise.
- **Effort:** S
- **Why it matters:** She wants her week explained by a friendly human, not decoded from a chart.

---

## Quick prioritization view

| # | Item | Theme | Effort | Persona impact |
|---|------|-------|--------|----------------|
| A1 | Beginner mode ON by default | Onboarding | S | ★★★ churn-killer |
| B1 | Tap-to-explain everywhere | Clarity | M | ★★★ |
| B2 | Finish wiring simple mode | Clarity | M | ★★★ |
| C1 | Sync morning check-in → ritual | Motivation | M | ★★★ retention |
| C2 | Forgiving, single honest streak | Motivation | M | ★★★ |
| D2 | Decouple celebration from power meter | Dopamine | M | ★★★ inclusion |
| D3 | "Did I do well?" verdict chip | Reassurance | S | ★★★ |
| E1 | One-glance "should I ride?" | Reassurance | M | ★★★ |
| F1 | Social default → encouragement, not arena | Social | M | ★★★ |
| B3 | Encouraging verdict vs. letter grade | Clarity | S | ★★ |
| A2 | Day-one backfill wow | Onboarding | M | ★★ |
| A3/D1 | First-ride + ride-logged bursts | Dopamine | S | ★★ |
| B5 | Never hard-block plan on FTP | Clarity | S | ★★ |
| C3 | Next-milestone nudge | Motivation | S | ★★ |
| C4 | Invitational ring copy | Motivation | S | ★★ |
| C5 | Guilt-free comeback | Motivation | M | ★★ |
| D4 | Human-scale comparisons | Dopamine | S | ★★ |
| F2 | Kudos & cheers | Social | M | ★★ |
| F3 | Share cards as primary social act | Social | S | ★★ |
| A4 | "Basic bike is perfect" reassurance | Onboarding | S | ★★ |
| A5 | Pick your coach voice | Onboarding | M | ★ |
| B4 | Plain-words ride analysis | Clarity | M | ★★ |
| D5 | Delightful RPE reward loop | Dopamine | S | ★ |
| D6 | Celebrate recovery/sleep wins | Dopamine | S | ★★ |
| D7 | Monthly identity beat | Dopamine | M | ★★ |
| E2 | "Am I doing okay?" coach check | Reassurance | S | ★★ |
| E3 | "Why rest is training" explainer | Reassurance | S | ★ |
| F4 | "Follow my journey" link | Social | L | ★★ |
| G1 | Friendly empty states | Fun | S | ★★ |
| G2 | Warmer optional skin | Fun | L | ★ |
| G3 | "Explain my week like I'm new" | Fun | S | ★ |

*31 items across 7 themes. The through-line: the kindness is already built — default it ON for beginners, take the jargon ceiling down, and stop gating delight behind a power meter.*
