# Retention Psychology for an AI Cycling Coach

*Research brief for Phase 9 (Social + Gamification). Target: serious athletes. Goal: sustained, intrinsically-motivated engagement — not dopamine-farm retention. Compiled April 2026.*

---

## Executive Summary — Top 10 Mechanisms Ranked by Ethical-Retention ROI

Ranking criterion: sustained behavior change for a serious-athlete audience with minimal dark-pattern surface area. Higher-ranked mechanisms map to intrinsic motivation (Self-Determination Theory); lower ones carry more misuse risk but still have their place.

1. **Competence feedback loops (SDT: competence).** Training progress made legible — CTL/fitness curves, FTP trajectory, HR-at-threshold drift, "you're 6 W/kg stronger than 90 days ago." Highest leverage, lowest ick factor.
2. **Identity reinforcement ("I'm a cyclist who trains").** Clear's Atomic Habits — every logged ride is a vote for the identity. Frame messaging and milestones around *who the user is becoming*, not what they did.
3. **Autonomy-supportive coaching (SDT: autonomy).** Offer choices, rationales, "skip/modify" on every prescription. Autonomy support is the single strongest predictor of long-term adherence in exercise psychology (Ryan & Deci 2000; Teixeira et al. 2012).
4. **Daily check-in ritual with real feedback (Fogg habit loop).** Morning readiness screen that tells them something *they didn't know* (based on HRV, sleep, load). The reward is insight, not confetti.
5. **Commitment devices — self-imposed, not app-imposed.** Public training goals, planned week published to a chosen accountability partner. Stakes chosen *by* the user, not extracted from them.
6. **1:1 rivalries and segment/local comparisons (social comparison with similar peers).** Strava segments, Peloton "here & now" leaderboards filtered to age/weight cohort. Upward comparison vs. *similar* others motivates; global leaderboards vs. pros demoralize.
7. **Variable *informational* rewards, not slot-machine rewards.** The unpredictability is in *what the data reveals* (today you're 4% better on endurance) — never in fake chests, badges, or random prizes. Eyal's variable rewards applied to insight, not loot.
8. **Streaks as gentle continuity, not ransom.** "Consistency of planning/check-in" over "consistency of hard workouts." Include freezes, auto-pauses for rest weeks, and *no* guilt push notifications.
9. **Relatedness via small, named groups (SDT: relatedness).** A "pack" of 4–12 training partners who see each other's completion (not output), celebrate PRs, reach out after a missed week. Zwift's weekly-group pattern.
10. **Post-ride reflection and Sunday planning ritual.** Bookending the week creates narrative — humans retain what they reflect on. Apps that own these two moments own the athlete.

---

## Per-Mechanism Analysis

### 1. Self-Determination Theory (SDT) — the foundational frame

**Psychological basis.** Deci & Ryan (1985, 2000, 2020) identified three innate psychological needs: **autonomy** (volitional action), **competence** (mastery/efficacy), and **relatedness** (meaningful connection). Meta-analyses in exercise psychology (Teixeira, Carraça, Markland, Silva & Ryan, 2012, *IJBNPA*) show autonomous motivation is the strongest predictor of long-term physical activity adherence — *controlled* motivation (guilt, external rewards) produces short-term compliance but drops off.

**Products using it well.** WHOOP (explains *why* today's recovery is low — competence/autonomy); Garmin Coach (adjustable plans — autonomy); TrainerRoad Adaptive Training (plan explains itself — autonomy + competence).

**Doing it badly.** Apps that push prescribed workouts with no "why," no "modify," no "skip" strip autonomy. Any system that uses shame-notifications ("You haven't worked out in 3 days") replaces autonomous with controlled motivation and accelerates churn post-honeymoon.

**Implementation for the AI coach.**
- Every prescription ships with a one-line *why* ("Aerobic base — you're under-filled on Z2 this block").
- Every prescription offers skip / swap / shorten with no guilt copy.
- Never use "you missed" language; use "the plan adjusted."
- Surface competence: weekly "what got stronger" card with measured evidence (e.g., HR drift at threshold down 3 bpm vs. 6 weeks ago).

---

### 2. Variable Rewards — Eyal's Hook Model, applied ethically

**Psychological basis.** Eyal (*Hooked*, 2014) extends Skinner's variable-ratio reinforcement to product design: trigger → action → variable reward → investment. Novelty activates dopamine; uncertainty of reward keeps users returning. Eyal explicitly warns against using this on products that don't "materially improve the user's life" (the "Manipulation Matrix").

**Works in fitness when.** The uncertainty is in *real data that varies*: today's readiness, today's recommended session, what the week of training revealed. Fitbod (Eyal's own case study) uses variety of programmed exercises as the variable reward — wrapped around a genuinely useful service.

**Backfires when.** Applied to fake rewards (random badge drops, mystery chests, streak bonuses). Serious athletes sniff this out in one session and churn. An "Incomplete Loop" critique (Behavioral Scientist, Ruth Schmidt) argues Hooked glosses over when habit-formation shades into compulsion.

**Implementation.**
- The morning dashboard's "reveal" — readiness score + recommended session — *is* the variable reward. It's different every day because the data is different.
- No random badges. No mystery boxes. No confetti animations.
- Acceptable: a varied "quote of the day from a coach/pro" that ties to today's session theme.

---

### 3. Streaks — Duolingo's guilt spiral vs. Apple Rings done right

**Psychological basis.** Streaks leverage **loss aversion** (Kahneman & Tversky, Prospect Theory, 1979 — losses loom ~2× larger than equivalent gains) plus the **sunk-cost** bias (the chain feels too expensive to break). Apple Rings additionally use the **Gestalt principle of closure** and the **goal-gradient effect** (Hull 1932; Kivetz, Urminsky & Zheng 2006) — effort accelerates near completion.

**Done right — Apple Activity Rings.** Daily target is user-configurable; rings are about movement *consistency* not performance; close-your-rings messaging is informational. Evidence: Asimakopoulos et al. (2024, *Health Informatics J*) found Apple Watch nudges produced measurable activity gains without high rates of reported pressure, *when users configured their own goals*. That said, multiple qualitative accounts document obsessive ring-closing damaging mood.

**Done wrong — Duolingo.** The streak becomes **goal displacement**: users do 1-minute filler lessons to preserve a number unrelated to language proficiency. Notifications shift to guilt tone ("You're about to lose your 400-day streak!"). University of Pennsylvania gamification studies found short-term engagement +40% but reduced intrinsic motivation and learning autonomy over time. Duolingo *mitigates* with streak freezes and breaks — the grace is doing real work. Snapchat streaks among teens have produced documented anxiety and social-obligation patterns (Nesi et al. 2018, *Clinical Child and Family Psychology Review*, on adolescent digital stress).

**Implementation.**
- If we use streaks, track **"planning/check-in consistency"** (low-stakes, low-cost) — not workout completion (which would punish recovery).
- Auto-pause during rest weeks, travel, illness (user self-declared — no verification theater).
- Streak freezes earned by normal use, not purchased.
- Notifications frame as information ("Your plan for tomorrow is ready") never ransom ("Don't lose your streak").

---

### 4. Social Comparison — the Festinger rule

**Psychological basis.** Festinger (1954) — people evaluate themselves against *similar* others when objective standards are absent. Wheeler's **similarity hypothesis** refines this: comparison is motivating when the target is similar on *related attributes* (age, weight, training history), demoralizing when too distant. Lockwood & Kunda (1997, *JPSP*) — upward comparison inspires when the target's success feels attainable, and threatens when it doesn't.

**Works.** Strava segment leaderboards filtered to your age/weight class; Peloton "here & now" showing riders currently in the class (roughly matched); Zwift category-based racing.

**Backfires.** Global leaderboards that put a Cat-4 rider 10,000 places behind WorldTour pros produce downward-spiral emotion, not inspiration. Early-Strava complaints about "feeds full of people faster than me" after injuries/layoffs are documented in Stragier et al. (*ScienceDirect*, 2022 — "Kudos make you run") and qualitative work on Strava self-surveillance (Barratt 2017; Mixed-Methods Analysis of Strava, PMC12938745, 2025).

**Implementation.**
- Leaderboards only by relevant cohort (age group, FTP/kg band, training hours/week).
- Default: compare to your own past self. Social overlay is opt-in.
- Never show pro tour watt numbers next to the user's — destroys self-efficacy.

---

### 5. Commitment Devices — self-imposed, chosen by the user

**Psychological basis.** Thaler & Shefrin (1981); Bryan, Karlan & Nelson (*Annu Rev Econ* 2010). Public pre-commitment raises stakes on defection. Ariely & Wertenbroch (2002) — people who set their own deadlines outperform no-deadline baselines. StickK (Yale economists Ayres, Karlan, Glaeser — 2008 onwards) shows users who stake money are ~3× more likely to achieve goals.

**Works.** Strava goals that post to followers; public race registration ("friends will see"); Beeminder's data-driven yellow-brick road with genuine voluntary stakes.

**Backfires.** App-imposed stakes (pay-or-lose subscription pressure masquerading as accountability); Noom-style guilt copy. The research is consistent that **self-chosen commitment** drives outcomes; coerced commitment backfires.

**Implementation.**
- Let users publish a training block goal ("Build to 4.5 W/kg by June") to a chosen pack (4–12 people).
- Opt-in "your coach told your pack you're in a build week" message.
- Optional integration with external commitment apps rather than building a financial stake system ourselves.

---

### 6. Identity-Based Habits — "I'm a cyclist"

**Psychological basis.** Clear (*Atomic Habits*, 2018) synthesizes self-concept and habit research (Aronson & Mills dissonance; Oyserman's identity-based motivation; BJ Fogg's identity-focused behavior design). "Every action is a vote for a type of person." Identity-level change outperforms outcome-focused change because behavior persists after the initial goal is hit.

**Works.** Peloton's post-class "You are a cyclist" language; Strava's "Find Your Tribe" framing; Runkeeper's "runner identity" onboarding.

**Backfires.** Identity claims that feel unearned (newbie app calling the user "elite athlete" after a single 20-min ride). Serious athletes reject hollow flattery instantly.

**Implementation.**
- Onboarding asks: "What kind of cyclist are you becoming?" (climber / endurance / racer / all-rounder / commuter-athlete).
- Weekly recap references identity: "This week a climber did what climbers do — 1,840 m vertical in zone 2."
- Milestone language: "You just completed your 100th base-building ride. That's what patient athletes do."
- Never award badges for arbitrary things — only for milestones that *matter to the identity*.

---

### 7. Rivalries vs. Leaderboards

**Psychological basis.** Kilduff, Elfenbein & Staw (2010, *Academy of Management Journal*) — rivalries (recurring head-to-head with named competitor) increase performance and engagement beyond generic competition. Kilduff (2014) — rivalry activates identity motivation and approach goals. Global leaderboards trigger social-comparison threat in the bottom 90% of participants.

**Works.** Peloton Here & Now leaderboard (20–30 people, matched-ish, scrolls off after class); Strava segments (my time vs. my PR vs. my specific training partner); Zwift race categories; "beat your nemesis" in individual sports.

**Backfires.** Global all-time leaderboards; badges-for-rank on community screens; any feature that tells the median user they're in the bottom half.

**Implementation.**
- Let users pick 1–3 "rivals" (real training partners or self-defined pace-mates).
- Surface rival's weekly volume/PR updates side-by-side with yours, like Peloton's direct-challenge feature.
- No global ranks anywhere. No "top 10% of riders in your city" — that's a 90% loss for a 10% feel-good.

---

### 8. Habit Loop Design — morning ritual as the anchor

**Psychological basis.** Fogg Behavior Model: **B = MAP** (Behavior = Motivation × Ability × Prompt) at the same moment. Duhigg (2012) — cue → routine → reward. Lally et al. (2010, *European J Social Psych*) — median 66 days to automaticity, with a range of 18–254 days; consistency matters more than intensity.

**Works.** Morning anchor rituals that fire on a stable cue (alarm, coffee, first phone unlock). WHOOP and Oura own this moment by delivering a single-page overnight-recovery story. Strava's post-ride story owns the other end.

**Backfires.** Apps whose prompts come at random times; apps that demand 10+ minute sessions when motivation is low (violates ability axis).

**Implementation.**
- **Morning ritual (30–60 seconds):** unlock → readiness hero → "today's session" → optional 1-tap subjective check-in. Nothing more required.
- **Post-ride ritual (90 seconds):** one-line AI summary + one reflection prompt ("Easier than expected / as expected / harder — why?"). Powerful because reflection *encodes* the experience into the identity narrative.
- **Sunday ritual (2–3 minutes):** last-week recap + next-week preview + one user-chosen intention. This is the commitment device moment.

---

### 9. Onboarding — IKEA Effect and first-session activation

**Psychological basis.** Norton, Mochon & Ariely (2012, *J Consumer Psychology*) — the **IKEA effect**: labor creates love. Users value what they build. Onboarding that asks the user to invest (plan, preferences, goal, identity) creates switching cost via sunk effort and increases activation through ownership.

**Works.** Drift doubled onboarding length (6 → 12 steps) and *improved* retention by asking for customization. WHOOP's onboarding journal. TrainerRoad's plan-builder conversation.

**Backfires.** Either extreme: too-long onboarding (death by form), or frictionless sign-up that never invokes ownership.

**Implementation.**
- Onboarding includes: identity question, cycling history, goal selection, first readiness baseline, optional name-your-pack. ~5 minutes of real input.
- Show the user *their* plan being built from *their* answers — explicit "because you said X, I prescribed Y."
- First 7 days: surface the user's inputs back to them frequently ("You said your A race is Stelvio — here's how today's ride gets you there").

---

### 10. Notification Psychology

**Psychological basis.** Fogg prompts fail when motivation or ability is low. Mehrotra et al. (2016, *CHI*) — notification *relevance* predicts response; irrelevant notifications produce app deletions. Attentional cost without payoff trains the user to ignore or delete.

**Works.** WHOOP daily strain/recovery summary (one notification, one insight, one tap). Garmin's Body Battery morning note. Training Peaks' "your plan for tomorrow is ready" (anticipatory, not demanding).

**Backfires.** Duolingo's passive-aggressive Duo owl; Noom "you're missing your plan"; any "streak about to break" panic notification.

**Implementation.**
- Max 1 notification/day by default, at a user-chosen time, containing *information* not demands.
- Copy test: does the notification tell me something I want to know? If yes, send. If it's guilt, delete.
- Zero notifications during self-declared rest/travel/illness.

---

### 11. Loss-Aversion vs. Gain Framing

**Psychological basis.** Tversky & Kahneman — losses loom ~2× gains. In health contexts, meta-analyses (Gallagher & Updegraff 2012, *Annals of Behavioral Medicine*) show *gain-framed* messages outperform loss-framed for prevention/maintenance behaviors (exercise); loss frames work better for detection behaviors (screening). Cycling training is a *maintenance* behavior — gain framing wins.

**Implementation.**
- "Complete today's ride to add +3 TSS to your fitness" (gain) rather than "Skip today and lose 2 days of fitness" (loss).
- Reserve loss framing only for genuine high-stakes warnings (overtraining risk, detected HRV collapse).

---

### 12. Social Features — what specifically works

**Strava.** Kudos mechanism studied in Stragier, Cocquyt, Mechant et al. 2022 ("Kudos make you run!", *Physica A / Social Networks*) — receiving kudos causally induces more running; users mimic the activity patterns of those they give kudos to. Mechanism: low-cost social affirmation (one tap) that satisfies relatedness without forcing public commentary. **Friction that kills it:** too-large feeds, comparison to much faster riders, quantified-self surveillance anxiety.

**Peloton.** 15% higher workout frequency for socially-engaged members (company-reported). Mechanism: Here & Now leaderboard (bounded cohort), high-fives (non-verbal low-cost relatedness), named instructors who feel like a coach relationship (parasocial competence/relatedness). **Friction that kills it:** output-cheating scandals that degrade leaderboard integrity — a reminder that **data trust is the foundation** of all social features for serious athletes.

**Zwift.** Group rides + voice chat + weekly cadence — builds small-world communities. Zwift Insider reports weekly-group participants have dramatically higher multi-year retention. Mechanism: relatedness + identity ("I'm a PACK rider") + Sunday ritual. **Friction that kills it:** flaky pace control, sandbagging, cheating in racing categories — again, integrity.

**Common thread for serious athletes.** Social features earn trust only when the underlying data does. Any whiff of fake numbers, inflated ranks, or ungoverned leaderboards and the audience walks. Peloton's output-cheater forum threads are instructive.

**Implementation for our app.**
- Pack (4–12 users) as the primary social unit — not global feed.
- Low-cost relatedness gestures: kudos-equivalent, post-PR auto-celebration, "nice base week" one-taps.
- Never gamify output — gamify *consistency* and *plan adherence*.
- Data integrity: power-meter/HR validation, outlier flagging, no leaderboard submissions without required sensor fidelity.

---

## Dark Patterns to Refuse

Reasoning below each; these would specifically alienate serious athletes.

1. **Streak ransom.** "Don't lose your 47-day streak!" push at 10pm. Replaces autonomous with controlled motivation (SDT); short-term compliance, long-term churn. Serious athletes see through it.
2. **Variable-ratio slot-machine rewards.** Random chests, mystery badges, confetti animations. Gimmicky, infantilizing; the Strava/WHOOP/TrainerRoad demographic actively mocks this.
3. **Global leaderboards ranking users 1–N.** 90% of users lose. Violates Festinger similarity hypothesis. Destroys self-efficacy.
4. **FOMO notifications.** "3 friends worked out today, did you?" Weaponized social comparison.
5. **Guilt copy.** "You haven't logged a ride in 4 days." Paternalistic; controlling; research consistently shows this degrades intrinsic motivation (Ryan & Deci 2000; Deci, Koestner & Ryan 1999 meta-analysis on undermining effect of extrinsic rewards).
6. **Confirmshaming unsubscribe flows.** "No thanks, I don't want to get fitter." Violates user autonomy and trust.
7. **Roach-motel subscription cancellation.** Easy to sign up, calls-only to cancel. Illegal in growing list of jurisdictions and reputational poison.
8. **Fake social proof.** "124 people are looking at this plan now." Serious athletes detect and churn.
9. **Goal displacement via meaningless metrics.** Rewarding time-in-app or screens-viewed rather than real training outcomes.
10. **Non-consensual data publication.** Any auto-share to feed that the user didn't explicitly opt into per-ride.
11. **Bad-data leaderboards.** Letting indoor/outdoor data mix, or unvalidated estimated power, compete with measured watts. Kills credibility.
12. **Identity flattery on empty.** Calling a new user "pro" or awarding mastery badges for trivial acts. Insulting to the audience we care about.

---

## Rituals Worth Designing For

### Morning Check-In (the "WHOOP moment")

**Why it's the prize.** First mobile interaction of the day is the most-owned notification slot in consumer tech. WHOOP, Oura, Apple Health all compete here. The app that delivers a surprising, actionable insight in < 60 seconds wins the morning.

**How apps won it.**
- WHOOP: single-page recovery story + day strain target, explained.
- Oura: readiness score + contributors + "today maybe do…"
- Garmin: Body Battery + training status + suggested workout.

**Our design.**
- Readiness hero (HRV, sleep, load) with one-line *interpretation* (not just a number).
- Today's prescribed session card — with "why this today."
- One subjective check-in tap (optional): legs, mood, motivation.
- Total time < 60 seconds. If a serious athlete can't get what they need in that window, they won't open it tomorrow.

### Post-Ride Reflection

**Why it's the prize.** Metacognition consolidates learning (Dunlosky & Rawson 2013, educational psych); reflection encodes the session into the identity narrative. Strava owns this moment today by default (upload → kudos). We can own it better by *asking* a reflection question.

**Design.**
- Auto-upload summary with AI-written one-paragraph coach read.
- One reflection prompt: *easier than expected / as expected / harder — one sentence why*.
- Used as fuel for adaptive planning (if "harder" 3x in a row, auto-propose a deload).
- Optional: share to pack.

### Sunday Planning Ritual

**Why it's the prize.** Pre-commitment for the coming week is the single most predictive behavior of week-ahead adherence (implementation intentions literature — Gollwitzer & Sheeran 2006, *Advances in Experimental Social Psychology*: if-then planning ~doubles goal attainment).

**Design.**
- Last-week recap card: volume, load, highlights, one thing that got stronger.
- Next-week preview: prescribed plan, key session, "one thing to commit to."
- Optional: publish intention to pack.
- Calendar integration so sessions become implementation-intention "if-then" plans.

---

## Notes on the Serious-Athlete Audience

Serious cyclists are the most UX-jaded health/fitness users in the market. They have:

- Already adopted WHOOP, Garmin, Oura, TrainerRoad, TrainingPeaks, Zwift, Strava.
- Strong identity as *trainers* (Clear's identity layer is already active).
- High tolerance for complexity *if* it's data-justified; zero tolerance for gimmicks.
- Deep suspicion of "gamification" that masks a lack of underlying substance.

Design consequence: **earn retention through insight, data integrity, and autonomy support, not through dopamine tricks.** The winning move against Strava/WHOOP for this audience is *more honesty and more help*, not more confetti.

---

## Sources

**Foundational papers.**
- Ryan, R. M., & Deci, E. L. (2000). [Self-determination theory and the facilitation of intrinsic motivation, social development, and well-being](https://selfdeterminationtheory.org/SDT/documents/2000_RyanDeci_SDT.pdf). *American Psychologist*.
- Ryan, R. M., & Deci, E. L. (2020). [Self-determination theory — contemporary update](https://stial.ie/resources/Ryan%20and%20Deci%202020%20self%20determination%20theory.pdf).
- Teixeira, Carraça, Markland, Silva & Ryan (2012). Exercise, physical activity, and SDT: systematic review. *IJBNPA*.
- Festinger, L. (1954). A theory of social comparison processes. Overview: [Wikipedia](https://en.wikipedia.org/wiki/Social_comparison_theory); [Decision Lab](https://thedecisionlab.com/reference-guide/psychology/social-comparison-theory).
- Norton, Mochon & Ariely (2012). The IKEA effect: when labor leads to love. *J Consumer Psychology*.
- Lally et al. (2010). How are habits formed. *European J Social Psychology*.
- Gollwitzer & Sheeran (2006). Implementation intentions and goal achievement.
- Kilduff, Elfenbein & Staw (2010). The psychology of rivalry. *Academy of Management Journal*.
- Kahneman & Tversky (1979). Prospect Theory.
- Gallagher & Updegraff (2012). Health message framing meta-analysis. *Annals of Behavioral Medicine*.

**Practitioner frameworks.**
- Fogg, B. J. (2009). A Behavior Model for Persuasive Design. [behaviormodel.org](https://www.behaviormodel.org); [Stanford Behavior Design Lab](https://behaviordesign.stanford.edu/resources/fogg-behavior-model).
- Eyal, N. (2014). *Hooked: How to Build Habit-Forming Products*. Summary: [Dovetail](https://dovetail.com/product-development/what-is-the-hook-model/); [Amplitude](https://amplitude.com/blog/the-hook-model); critique: [Behavioral Scientist](https://www.thebehavioralscientist.com/articles/an-incomplete-loop-a-review-of-nir-eyals-hooked).
- Clear, J. (2018). *Atomic Habits*. [Identity-based habits essay](https://jamesclear.com/identity-based-habits); [Identity votes](https://jamesclear.com/identity-votes).
- Duhigg, C. (2012). *The Power of Habit*.

**Fitness-specific empirical research.**
- Stragier, Cocquyt, Mechant et al. (2022). [Kudos make you run! How runners influence each other on Strava](https://www.sciencedirect.com/science/article/pii/S0378873322000909). *Social Networks / ScienceDirect*.
- Barratt (2017). Reflections from the 'Strava-sphere': Kudos, community, and self-surveillance. [ResearchGate](https://www.researchgate.net/publication/346678505).
- Mixed-Methods Analysis of Strava use in Active Club Runners (2025). [PMC12938745](https://pmc.ncbi.nlm.nih.gov/articles/PMC12938745/).
- Asimakopoulos, Asimakopoulos & Spillers (2024). [Apple Watch nudging and user adoption](https://journals.sagepub.com/doi/10.1177/14604582241291405). *Health Informatics Journal*.
- Technology Innovation and Guardrails in Elite Sport (2023). [PMC10721698](https://pmc.ncbi.nlm.nih.gov/articles/PMC10721698/).
- Instagram social comparison study: [PMC10604111](https://pmc.ncbi.nlm.nih.gov/articles/PMC10604111/).

**Commentary & case studies.**
- [The Psychology of Apple Watch's "Close Your Rings"](https://trophy.so/blog/the-psychology-of-apple-watchs-close-your-rings)
- [How Apple Watch Impacted My Mental Health](https://www.heather-grace.com/blog/how-my-apple-watch-impacted-my-mental-health-and-how-i-fixed-it)
- [The Psychology Behind Duolingo's Streak Feature](https://www.justanotherpm.com/blog/the-psychology-behind-duolingos-streak-feature)
- [How Duolingo Streak Builds Habit (Duolingo's own)](https://blog.duolingo.com/how-duolingo-streak-builds-habit/)
- [The Psychology of Peloton's Appeal](https://www.psychologytoday.com/us/blog/positively-media/202111/the-psychology-pelotons-appeal-what-keeps-us-riding)
- [Peloton community & network effect](https://researchci.com/the-network-effect-why-pelotons-community-is-its-secret-weapon-amidst-competition/)
- [How Zwift is creating an online community for cyclists](https://www.bikeradar.com/advertising-feature/zwift-online-community)
- [Zwift's 10 Most Popular Community-Led Group Rides](https://zwiftinsider.com/10-popular-rides/)
- [How Strava Uses Gamification](https://trophy.so/blog/strava-gamification-case-study)
- [WHOOP Marketing Strategy: Wearable Data and Elite Athlete Loyalty](https://www.latterly.org/whoop-marketing-strategy/)
- [Onboarding With The IKEA Effect (Amplitude)](https://amplitude.com/blog/onboarding-ikea-effect-retention)
- [Commitment Devices research summary (Beeminder)](https://blog.beeminder.com/deepresearch/)
- [StickK / behavioral economics of self-stakes](https://www.stickk.com/) (referenced in Beeminder post and C'Meet It)
- [Dark patterns: examples and ethics](https://www.scalablepath.com/ui-ux-design/dark-pattern-examples); [18 dark patterns](https://www.eleken.co/blog-posts/dark-patterns-examples)

---

*End of brief. ~2,900 words.*
