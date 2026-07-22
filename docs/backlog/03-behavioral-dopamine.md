# Backlog 03 — Behavioral Dopamine, Habit Loops, Retention & Growth

*Reviewer persona: the habit-and-dopamine designer — the person who ships Duolingo's streak-freeze, Strava's kudos, and Whoop's morning "Recovery is in" pull. My job is to engineer **micro-dopamine** (small, well-timed, honestly-earned hits of reward and anticipation) into the daily loop without turning a coaching product into a slot machine. I use variable-ratio reward, endowed progress, loss-aversion, anticipation/unlock, identity and social proof — but only in the "tasteful, non-manipulative" register a serious cycling coach can stand behind.*

**Target group.** Watts-literate, event-driven road/gravel cyclists (gran fondos like the Maratona, threshold tests, W/kg goals) on mobile (390×844). They are motivated by *mastery and identity* ("I'm the kind of rider who shows up"), skeptical of gamification-as-manipulation, and allergic to guilt mechanics. So the dopamine has to be **earned by real physiology and adherence**, framed honestly, and never manufactured from fake data or fake urgency. This audience rewards *anticipation* ("what will tomorrow's brief say?") and *reflection* ("look how far the fitness moved") more than confetti.

**What already exists (so these items extend, not duplicate).** A queued celebration engine (`CelebrationContext.tsx` — PB/streak/weekly/ftp cards, confetti + haptics, reduced-motion + localStorage dedup, soft streak-break card); a forgiving plan-aware streak with pause states (`services/streak.py`, `useStreak.ts`) + weekly rhythm/consistency; Weekly Wrapped (7-card shader story + share PNG) and the Monday Weekly Recap story; Ride Recap (grade, AI narrative, 1-tap RPE, PR badges, share); server-detected physiology Achievements (hero ring, trophy cabinet, next-milestone progress bars — deliberately **no XP/levels/login streaks**); Crew (standings, duels, challenges) + physiology-gated nudges + coach-safety interlock; and the 4-trigger morning/post-ride/evening brief push.

**Hard product guardrails I inherit and honor throughout** (from `docs/competitive-roadmap-tasks.md` "Explicitly not doing" + project memory): no loot/arbitrary badges/login streaks; **celebration must be earned physiologically**; no global leaderboards or vs-pros; no visible AI metering; honest "—" over fabricated data; gentle continuity, never ransom; bike-only, mobile-first. Every item below is written to live inside those rails.

---

## Theme A — Reward schedules & micro-dopamine on the core loop

### A1. "Coach noticed" micro-reactions on the brief
**Area:** Today / morning brief (`useCoachBrief.ts`, `TodayTab.tsx`)
**Description:** Each brief occasionally opens with a specific, earned observation the athlete didn't know the app was tracking ("Third Tuesday in a row you beat the plan's TSS — you've quietly become a midweek animal"). These fire on a *variable* cadence, not every day, so the athlete never fully predicts which morning brings the extra nod. The pool is deterministic detections (adherence runs, negative-split habit, Z2 discipline), never free-form flattery.
**Behavioral principle:** Variable-ratio reinforcement + attention-as-reward — unpredictable but genuine recognition is the single strongest schedule for repeat opens.
**Expected improvement:** +8–12% morning-brief open rate; higher DAU on non-training mornings (the reason to open even on a rest day).
**Effort:** M
**Guardrail:** Only fires when a real detected pattern exists; if none, the brief is normal — no manufactured praise, no "you're amazing!" filler. Caps at ~2/week so it stays a treat, not noise.

### A2. Post-ride "one honest surprise" line
**Area:** Ride Recap (`RideRecapView.tsx`)
**Description:** After a ride, surface one non-obvious true fact chosen from a rotating detector set — "quietest heart rate you've held at 3.1 W/kg in 60 days," "you spent 71% in Z2, your most disciplined ride this month." Because *which* surprise appears varies ride to ride, the recap keeps a small anticipation hook even on unremarkable rides.
**Behavioral principle:** Variable-ratio + peak-end rule — a small positive surprise at the end of the ride experience lifts the remembered value of the whole session.
**Expected improvement:** +10–15% recap-view completion; more RPE taps (they scroll to the surprise and pass the RPE loop).
**Effort:** M
**Guardrail:** Detector-backed only; on a genuinely flat ride it can say something neutral-true ("steady base mile — exactly the deposit the plan wanted"), never invent a highlight.

### A3. Count-up "reveal" on every hero number
**Area:** Recap, Wrapped, Achievements, Today (extend `useCountUp.ts`)
**Description:** Standardize the animated count-up (already in Wrapped) as the default reveal for any newly-earned hero metric across surfaces, with a tiny tick haptic at settle. The half-second of rising numbers manufactures a micro-anticipation beat before the payoff, which is why slot machines and score screens both use it.
**Behavioral principle:** Anticipation loop / delayed gratification — a short, bounded delay before a known reward increases dopamine at delivery.
**Expected improvement:** +5% perceived-quality (session satisfaction proxy); marginal lift to share taps on Wrapped/Recap.
**Effort:** S
**Guardrail:** Respect `prefers-reduced-motion` (instant value, no animation); never slow down actionable data (today's target renders immediately, only celebratory numbers animate).

### A4. Effort-to-reward "the work paid rent" ledger line
**Area:** Ride Recap + Today "The Road" card
**Description:** Translate each ride's TSS into a visible, cumulative contribution to the athlete's own fitness ("this ride added ~0.6 CTL — your form is now the highest since April"). It closes the invisible gap between doing the work and seeing fitness move, making the reward legible on the same day rather than weeks later.
**Behavioral principle:** Immediate feedback / operant contingency — collapsing the delay between action and visible consequence strengthens the habit.
**Expected improvement:** +session frequency for base weeks (the boring Z2 rides finally feel rewarded).
**Effort:** M
**Guardrail:** Use honest modeled CTL deltas with the app's existing uncertainty framing; a junk-mile or overreach ride says so calmly rather than always cheering.

---

## Theme B — Progress & mastery loops

### B1. "Next milestone" endowed-progress bars everywhere they belong
**Area:** Achievements (`AchievementsView.tsx`), Progress
**Description:** The Achievements "next milestones" list already shows honest progress bars — extend the pattern so every long-horizon goal (climbing meters, longest ride, CTL band, W/kg tier) shows a bar that is **never empty on first view** because past rides already fill it. Seeing "you're 62% to your first 3,000 m climbing week" pulls harder than starting at zero.
**Behavioral principle:** Endowed progress effect — people work harder toward a goal they're already partway into; a pre-filled bar reframes a cold start as an almost-done.
**Expected improvement:** +completion of the "one more ride to unlock" behavior; +7-day retention for new users (their first bars are already partly full from backfill).
**Effort:** M
**Guardrail:** The endowment must be real (computed from actual history), not a fake "we gave you 20% for signing up." No manufactured head-starts.

### B2. Mastery ladders per capability ("Climber / Rouleur / Sprinter" tracks)
**Area:** Progress / Power Profile (`PowerProfileView.tsx`, `BikeProgressView.tsx`)
**Description:** Group achievements into a few identity-flavored *skill tracks* (climbing, sustained threshold, sprint, endurance) each with visible tiers tied to real W/kg and duration benchmarks. Progress on one track while another plateaus gives a constant "something is improving" signal, which sustains motivation through event-specific blocks.
**Behavioral principle:** Mastery loop + goal-gradient — visible, laddered competence in a domain the user cares about drives intrinsic motivation better than points.
**Expected improvement:** +monthly retention among event-training users; more Progress-tab sessions per week.
**Effort:** L
**Guardrail:** Tiers = physiology bands (W/kg, VAM), not arbitrary XP. Framed as "your strengths," never ranking against other people. A weak track is described as "room to grow," not "you're bad at."

### B3. "You vs. you, 90 days ago" ghost comparison
**Area:** Ride Analysis / Progress
**Description:** On a repeated segment, route, or benchmark effort, overlay the athlete's own past self as a ghost line ("same climb, 47 s faster than March"). Beating your former self is the cleanest, least-toxic competitive dopamine and it's always available even with zero crew.
**Behavioral principle:** Self-referential social comparison — competing against a past self delivers the win without the demoralization of losing to strangers.
**Expected improvement:** +ride-analysis opens; +session frequency (motivation to "re-run" known routes).
**Effort:** M
**Guardrail:** Only when a fair comparison exists (same/similar segment, adequate data); if conditions differ wildly (wind, fatigue) note it rather than crowning a false PR.

### B4. "Streak of quality," not just quantity
**Area:** Today / Progress (extends `streak.py`)
**Description:** Add a secondary, gently-surfaced progress signal for *training quality* streaks — e.g., consecutive weeks hitting the polarized/Z2 discipline target — distinct from the adherence streak. This rewards doing the *right* work, which is the coaching-differentiated behavior, not just showing up.
**Behavioral principle:** Progress loop aligned to the desired behavior — reinforcing quality prevents the streak from incentivizing junk miles.
**Expected improvement:** Better plan adherence quality; +Progress engagement.
**Effort:** M
**Guardrail:** Never let a quality streak create pressure to over-train; it pauses under rest/deload directives exactly like the adherence streak.

---

## Theme C — Streak psychology (freezes, repair, milestones)

### C1. Streak freeze / "life happens" token
**Area:** Streak (`streak.py`, `useStreak.ts`, status flow)
**Description:** Give athletes a small, replenishing bank of freeze tokens (earn ~1 per consistent week, cap ~2) that protect the streak for an unplanned off day — auto-offered by the streak-break watcher *before* the soft loss card, "Use a rest token? You've earned two." The status system already pauses for sick/injured; this covers the honest "life got busy" case Duolingo's freeze made famous.
**Behavioral principle:** Loss-aversion softened + earned insurance — protecting an accumulated asset is powerfully motivating, and letting them spend a *self-earned* token removes the manipulation sting.
**Expected improvement:** +streak length (fewer resets to zero); measurable drop in post-miss churn.
**Effort:** M
**Guardrail:** Tokens are earned by real consistency, never sold and never dark-pattern "buy a freeze now!" The copy frames rest as a skill, consistent with the existing forgiving-streak thesis.

### C2. One-tap streak repair the morning after
**Area:** Streak-break card (`StreakBreakOverlay.tsx`)
**Description:** When a genuine break occurs, the soft card offers a kind repair path: "Log yesterday's ride?" (if a sync is missing) or "Was that a rest you needed? Mark it and keep the chain." This catches the most common false breaks (unsynced ride, unlabeled rest) instead of punishing them.
**Behavioral principle:** Loss-aversion + fresh-start framing — an immediate, low-friction recovery ramp prevents the "I broke it, why bother" abandonment spiral.
**Expected improvement:** Recovers a chunk of would-be lapsers; +streak continuity.
**Effort:** S
**Guardrail:** Repair only when justified by real data (an actual unsynced activity, a real rest day); never let anyone "buy back" a streak they didn't earn.

### C3. Milestone anticipation ("2 days to your longest streak ever")
**Area:** Today streak chip
**Description:** As the athlete approaches a personal streak record or a defined milestone (7/14/30/…), the chip whispers the countdown ("2 days from your best-ever run"). This converts a passive counter into a forward-pulling goal in the goal-gradient's steepest zone.
**Behavioral principle:** Goal-gradient effect — effort accelerates as a visible goal nears; naming the near-miss creates approach motivation.
**Expected improvement:** +adherence in the days right before a milestone; +streak-length distribution shifting right.
**Effort:** S
**Guardrail:** Only surfaces near real milestones; never nags daily. Silent on rest days (the streak is protected, so there's nothing to "save").

### C4. Milestone celebration variety (not the same flame every time)
**Area:** Celebration engine (`celebration.ts`, `CelebrationOverlay.tsx`)
**Description:** Give each streak milestone (7/30/100/365) an escalating, distinct visual + copy identity so the 100-day card feels categorically bigger than the 7-day one. Currently the milestone set exists but rewards should visibly *tier up* in rarity and richness (color, particle density, a named "rare" badge at 100/365).
**Behavioral principle:** Escalating reward + collection/rarity — differentiated, rarer rewards at higher tiers sustain long-run motivation past the point daily streaks usually plateau.
**Expected improvement:** +long-tail retention (the 30→100 day survival curve).
**Effort:** S
**Guardrail:** Rarity reflects genuine difficulty; no "legendary" label on a trivial achievement. Reduced-motion path keeps a calm static badge.

---

## Theme D — Anticipation & unlock mechanics

### D1. "Tomorrow's session unlocks tonight" reveal
**Area:** Today / evening brief trigger
**Description:** Instead of always-visible, let the *next* day's headline workout have a gentle "revealed" moment in the evening brief ("Tomorrow's set is ready — tap to see what the coach lined up"). A tiny curtain over known-good content manufactures a nightly reason to open, Whoop-style.
**Behavioral principle:** Anticipation/unlock + Zeigarnik (open loop) — a pending reveal creates a small tension the brain wants to close.
**Expected improvement:** +evening session (a second daily open), feeding the multi-trigger brief system already built.
**Effort:** S
**Guardrail:** Never hide *actionable* info the athlete needs (if they must prep tonight, show it); the "unlock" is a framing on content that's genuinely finalized, not artificial withholding.

### D2. Seasonal/event "chapter" unlocks
**Area:** Event countdown (`goal_trajectory.py`, Train)
**Description:** As the athlete crosses real training-phase boundaries toward their event (base → build → peak → taper), unlock a new visual "chapter" for the plan with its own identity and a short coach note on what this phase is *for*. Phase transitions become anticipated milestones rather than silent calendar math.
**Behavioral principle:** Progress-through-narrative + variable unlock timing — chaptered journeys with earned transitions sustain long-arc engagement (the 12-week block).
**Expected improvement:** +retention across a full training block; lower mid-block churn.
**Effort:** M
**Guardrail:** Chapters map to real periodization the engine already computes; no fake gates that withhold planned workouts to force engagement.

### D3. "Mystery detector" teaser in Achievements
**Area:** Achievements
**Description:** Show a few locked achievements as silhouettes with a directional hint ("a long climb hides here") rather than exhaustively listed. Partial concealment turns the trophy cabinet into a collection to *complete*, which is far stickier than a fully-visible checklist.
**Behavioral principle:** Curiosity gap + collection completion drive — the desire to fill a visibly incomplete set.
**Expected improvement:** +Achievements-tab revisits; +exploratory rides (chasing a hinted unlock).
**Effort:** S
**Guardrail:** Hints must be truthful and physiologically reachable; no impossible or pay-to-unlock trophies. Keep most achievements visible — only a minority are teased, so it reads as delight not a gacha.

---

## Theme E — Celebration variety & personalization

### E1. Personalized celebration palette by rider identity
**Area:** Celebration engine
**Description:** Let the celebration accent, particle style, and copy voice track the athlete's chosen coach voice (Analyst vs. Compañero) and self-identified rider type. A data-nerd gets a crisp "5-min power +6 W, 94% confidence" card; a Compañero user gets warmth. Personalized reward feels *seen*, which deepens attachment.
**Behavioral principle:** Personalization / self-relevance — rewards tuned to identity are processed as more meaningful and reinforce the "this app gets me" bond.
**Expected improvement:** +celebration share rate; +overall retention via identity fit.
**Effort:** M
**Guardrail:** Personalization changes tone/skin only, never the *criteria* for earning — a PB is a PB regardless of voice. No creepy over-personalization from sensitive inferences.

### E2. Celebration cooldown & "moment budgeting"
**Area:** Celebration queue (`CelebrationContext.tsx`)
**Description:** Add an intelligence layer that spaces and rate-limits celebrations so wins stay special — if three fired this week, the fourth minor one downgrades to a quiet inline badge rather than a full confetti takeover. Scarcity is what keeps the big moments dopaminergic.
**Behavioral principle:** Habituation avoidance / reward scarcity — over-frequent rewards blunt the response; deliberate scarcity preserves potency.
**Expected improvement:** Sustained celebration impact over months (protects the whole system's ROI); fewer "confetti fatigue" dismissals.
**Effort:** M
**Guardrail:** Never *suppress* a genuinely major milestone; only demote redundant minor ones. Transparent — the win still registers in Achievements, it just doesn't always take the screen.

### E3. Haptic + sound "signatures" per achievement class
**Area:** `haptics.ts`, celebration
**Description:** Give distinct, short haptic patterns (and optional subtle sound) to different win classes — a PB feels different in the hand than a streak milestone. Multi-sensory reward markers make each win-type recognizable and more visceral without any visual noise.
**Behavioral principle:** Multi-sensory conditioning — congruent haptic/audio cues strengthen the reward memory and its recall.
**Expected improvement:** +perceived polish; marginal +celebration-completion.
**Effort:** S
**Guardrail:** Respect reduced-motion/silent preferences and device haptic settings; sound always off by default and opt-in. Keep patterns short and classy, never a slot-machine jingle.

---

## Theme F — Notifications & nudges timed to real moments

### F1. Post-ride sync-complete "your recap is ready" push
**Area:** Push service (`push.ts`, brief triggers)
**Description:** The moment a ride finishes syncing, fire a single deep-linked push straight to that ride's recap ("Ride's in — grade B+, and you set a 5-min best"). This rides the athlete's peak post-ride curiosity, the highest-intent window of the day.
**Behavioral principle:** Cue-timed to peak motivation — delivering the reward-pointer exactly when anticipation is highest maximizes open-through.
**Expected improvement:** +recap open rate; +second daily session (post-ride).
**Effort:** S (trigger exists) 
**Guardrail:** Exactly one push per ride, deep-linked to the real card (no dead links — a repeated competitor gripe); quiet-hours aware; suppress if the athlete is already in-app.
### F2. Evening reflection nudge on training days only
**Area:** Push / evening brief
**Description:** On days the athlete trained, an optional evening nudge invites a 1-tap RPE + a one-line "how'd that feel" — closing the loop while the ride is fresh and feeding the load model. It's a reflection ritual, not a re-engagement beg.
**Behavioral principle:** Habit stacking + implementation intention — anchoring a tiny reflective action to a consistent daily moment builds an automatic routine.
**Expected improvement:** +RPE completion (better model + P2.2 journal seed); +evening DAU on training days.
**Effort:** S
**Guardrail:** Only on real training days, never on rest days; fully skippable and frequency-capped; never guilt-frames a missed reflection.

### F3. "Weather window" opportunistic nudge
**Area:** Today weather (`useTodayWeather.ts`) + push
**Description:** When the plan has a flexible outdoor session and a genuinely good weather window opens (or a bad one is closing), offer a gentle, rare nudge ("Clear and 19°C at 5pm — perfect for today's Z2"). Timing a suggestion to real-world opportunity feels like a helpful coach, not a notification spammer.
**Behavioral principle:** Contextual cue / just-in-time nudge — action prompts tied to real opportunity windows convert far better than scheduled ones.
**Expected improvement:** +session completion on flexible days; +positive app sentiment.
**Effort:** M
**Guardrail:** Rare and truly opportunistic (real forecast delta), never daily; respects the coach-safety interlock (silent when the directive is rest/deload); honest when weather data is missing.

### F4. Comeback-ready "you're fresh again" nudge
**Area:** Recovery ETA (`useRecoveryEta.ts`) + push
**Description:** After a hard block or illness pause, when the model says freshness has returned, send a single celebratory-permission push ("Recovered — TSB back in the green. Green light for Saturday's build"). It converts recovery from dead time into an anticipated re-entry moment.
**Behavioral principle:** Anticipation + permission-to-act — a well-timed green light removes hesitation and reactivates dormant intent.
**Expected improvement:** Faster return-to-training after gaps; fewer multi-day lapses becoming multi-week ones.
**Effort:** S
**Guardrail:** Physiology-gated (only when genuinely recovered); never pressures an athlete who's still fatigued or sick. One push, not a drip.

---

## Theme G — Social proof & light competition

### G1. Asynchronous kudos on crew rides
**Area:** Social / Crew (`useCrew.ts`), Recap
**Description:** Let crew members drop a single earned kudos/reaction on each other's completed rides, surfaced in the recap and a lightweight crew feed. Strava proved the kudos loop is the strongest retention mechanic in endurance sport; scoped to real crew (not strangers) it stays supportive.
**Behavioral principle:** Social reinforcement + reciprocity — receiving recognition drives return visits, and giving it creates reciprocal obligation loops.
**Expected improvement:** +DAU among crewed users; the classic kudos retention lift (crew members retain markedly better than solo).
**Effort:** M
**Guardrail:** Only real crew, no public firehose or vanity metrics; kudos muted toward a member the interlock says should rest (no pressure to perform through fatigue). Invest only once there's user mass (per roadmap P2.8).

### G2. "Someone in your crew is riding" ambient presence
**Area:** Crew feed
**Description:** A quiet, opt-in presence signal ("2 of your crew rode this morning") — social proof that the norm is showing up, without turning it into a ranked competition. Seeing peers active is one of the most reliable drivers of one's own activity.
**Behavioral principle:** Descriptive social norms — people conform to what they see similar others doing; visible peer activity normalizes the behavior.
**Expected improvement:** +session frequency; +crew-tab opens.
**Effort:** M
**Guardrail:** Aggregate/soft ("2 of your crew"), never a shaming leaderboard or "you're last"; fully opt-in presence; suppressed when the viewer is in a prescribed rest state.

### G3. Quality-based crew challenges (not volume races)
**Area:** Challenges (`useChallenges.ts`)
**Description:** Ship challenge templates keyed to *training quality* — "Z2 discipline week," "everyone nails their planned TSS ±10%," "most consistent" — rather than raw-volume contests that reward over-training. Light competition on the right axis reinforces good coaching.
**Behavioral principle:** Light competition + goal commitment (public-ish stakes) channeled toward healthy behavior.
**Expected improvement:** +weekly adherence within crews; +challenge participation.
**Effort:** M
**Guardrail:** No volume/ego races that push overtraining; interlock-aware (a resting member isn't penalized); framed as collective, "we hit it," not "you lost."

### G4. Shared crew milestone moments
**Area:** Crew / celebration
**Description:** When a crewmate sets a breakthrough or hits a big streak milestone, offer the athlete a one-tap "cheer" that sends a warm, physiology-gated nudge. Celebrating others' wins deepens the social fabric and gives a reason to open unrelated to one's own training.
**Behavioral principle:** Vicarious reward + prosocial reciprocity — participating in others' wins builds belonging, a top-tier retention driver.
**Expected improvement:** +crew stickiness; +non-training-day DAU.
**Effort:** S
**Guardrail:** Uses the existing physiology-gated nudge path so cheers never pressure a resting rider; canned warm lines only, no free-text pile-ons.

---

## Theme H — Identity, badges & levels (done the classy way)

### H1. Earned rider identity title
**Area:** Profile / Progress
**Description:** Derive an honest, evolving identity label from real data ("Consistent Base-Builder," "Emerging Climber," "Threshold Specialist") shown on the profile and Wrapped. It answers "who am I as a rider?" — the deepest retention hook because it makes the app part of self-concept.
**Behavioral principle:** Identity-based habit / self-signaling — behaviors tied to "the kind of person I am" are the most durable; a mirror of identity keeps users invested.
**Expected improvement:** +long-term retention; +Wrapped share rate (identity is share-worthy).
**Effort:** M
**Guardrail:** Titles are computed from genuine strengths, never flattering fiction; evolve honestly (a title can change as the athlete changes); never rank identities against others.

### H2. Physiology-earned badge cabinet, curated
**Area:** Achievements (persist per roadmap P2.3)
**Description:** Keep badges strictly physiology/riding-milestone earned (longest ride, first HC climb, CTL band, negative-split mastery) and persist them server-side. The trophy cabinet becomes a durable identity artifact the athlete can revisit and show off.
**Behavioral principle:** Collection + status symbol — a permanent, earned collection creates sunk-value attachment and pride-of-ownership.
**Expected improvement:** +Achievements revisits; +retention via accumulated switching cost (their history lives here).
**Effort:** M
**Guardrail:** No arbitrary/login badges (explicit roadmap rule); every badge maps to a real physiological or riding feat with an honest unlock date.

### H3. "Fitness age" or era-arc, honestly framed
**Area:** Progress / Season Wrapped
**Description:** Instead of a gimmicky "fitness age," show an honest *era arc* — "your strongest 8-week block ever ended in June" — mapping the athlete's fitness journey as chapters. It gives a narrative identity to long-term progress without the pseudo-science of a single age number.
**Behavioral principle:** Narrative identity / life-story framing — people stay engaged with tools that tell a coherent story of their growth.
**Expected improvement:** +Season Wrapped engagement; +annual retention.
**Effort:** M
**Guardrail:** Explicitly avoid the "biological age" trap flagged in the roadmap; use real CTL/eFTP history with uncertainty, never a fabricated single score.

---

## Theme I — Loss-aversion (done kindly) & endowed progress

### I1. "Don't let the fitness fade" gentle detraining nudge
**Area:** Today "The Road" / Recovery
**Description:** When the model shows CTL starting to slip after a gap, frame it as protectable value, not failure — "Your form's still here, but it fades in ~10 days without a ride. One easy spin holds it." Loss-aversion toward *earned fitness* is honest and motivating; guilt about a missed day is not.
**Behavioral principle:** Loss-aversion — protecting an accumulated asset (fitness) motivates more strongly than pursuing an equivalent gain, but only when the asset is real.
**Expected improvement:** Fewer detraining spirals; +re-engagement inside the critical post-gap window.
**Effort:** S
**Guardrail:** Frame around real modeled fitness, never shame; silent during legitimate rest/taper/illness; never invents urgency ("act now or lose everything").

### I2. Endowed onboarding: "your first brief is already built"
**Area:** Onboarding / cold-start backfill (roadmap P2.10)
**Description:** During onboarding, compute from Garmin history and show the athlete a partly-complete profile before they do anything — "We read your last 90 days: FTP ~242 W, CTL 54, your first brief is ready." They start feeling *invested and mid-journey* rather than at zero.
**Behavioral principle:** Endowed progress + sunk-value — arriving to an already-populated, personalized state raises commitment and completion of onboarding.
**Expected improvement:** +onboarding completion; +day-1 and day-7 retention (biggest lever for new-user survival).
**Effort:** M (leans on existing backfill)
**Guardrail:** All endowed numbers are real (from their own history) with honest confidence; where history is thin, show honest "—" rather than fake a full profile.

### I3. "Almost a full week" close-the-gap prompt
**Area:** Today / weekly rhythm (`useStreak.ts` consistency)
**Description:** When the athlete is one session short of completing the planned week late in the week, a kind prompt frames the near-complete state ("3 of 4 done — one easy Z2 completes the week"). The near-miss of an almost-full bar is a strong, honest motivator.
**Behavioral principle:** Goal-gradient + completion bias (Zeigarnik) — an almost-complete unit exerts strong pull to close it.
**Expected improvement:** +weekly-plan completion rate; +weekend session frequency.
**Effort:** S
**Guardrail:** Only when completing is physiologically sound; if the athlete needs rest, the prompt says rest completes the week (the plan, not the tally, is the truth). Never pushes a fatigued rider to "finish the set."

---

## Theme J — Seasonal, event & ritual hooks

### J1. Event countdown as a daily anticipation drumbeat
**Area:** Event countdown (`EventCountdownCard`, roadmap P1.8)
**Description:** Turn the days-to-event number into a living daily hook — "141 days to the Maratona · today's 4×8 = the Campolongo, twice · climb readiness Cat-2." Tying today's suffering to the specific event terrain makes each session part of an epic build-up the athlete wants to check on.
**Behavioral principle:** Goal-proximity + purpose framing — connecting daily effort to a vivid future goal sustains motivation across a long block.
**Expected improvement:** +DAU across the training block; +adherence on hard days (they see the point).
**Effort:** M (card exists to extend)
**Guardrail:** Uses real terrain/readiness data; honest when the athlete is behind ("the Giau needs one more build block") rather than false reassurance.

### J2. Season Wrapped as an annual ritual
**Area:** Season Wrapped (roadmap P2.1)
**Description:** An end-of-season story — "3.2 Everests climbed, strongest block in June, 9 breakthroughs, your identity arc from base-builder to climber" — with a share-first card. Annual reflection rituals are among the strongest re-engagement and word-of-mouth events an app can own.
**Behavioral principle:** Reflection ritual + peak-end memory — a beautiful annual summary cements the year's value and reactivates lapsed users.
**Expected improvement:** Seasonal reactivation spike; acquisition via shares.
**Effort:** L (or descope to static per roadmap)
**Guardrail:** Every stat real and honestly-scoped; cards without data (no power meter → no peak-power card) omitted, never faked.

### J3. Solstice/seasonal riding moments
**Area:** Today / seasonal theming
**Description:** Mark a few genuine cycling-calendar moments (longest day of the year "get the epic in," first ride after clocks change, winter base kickoff) with light seasonal theming and an optional themed challenge. Time-bounded, recurring events create predictable anticipation spikes.
**Behavioral principle:** Temporal landmarks / fresh-start effect — calendar moments trigger renewed motivation and goal-setting.
**Expected improvement:** Periodic DAU spikes; seasonal re-engagement.
**Effort:** S
**Guardrail:** Tasteful and cycling-authentic, not holiday-marketing spam; opt-out theming; no fake FOMO countdowns.

---

## Theme K — Share-worthy WOW moments

### K1. Breakthrough share card as an acquisition engine
**Area:** Breakthrough moments (roadmap P1.2), Recap
**Description:** Make every breakthrough ("your 5-min power beat everything in 90 days — the ceiling moved") produce a genuinely beautiful, honest, brand-carrying share image. The share is both a dopamine peak for the athlete (pride broadcast) and the app's cheapest acquisition channel.
**Behavioral principle:** Broadcasting / self-presentation reward + social proof acquisition — sharing an earned win feels good and recruits lookalikes.
**Expected improvement:** +share rate; measurable referral installs from share cards.
**Effort:** M (detector + share exist to polish)
**Guardrail:** Only real, confidence-gated breakthroughs (never celebrate dirty/downsampled data per P1.2); the card states the real number, no inflation.

### K2. "Ride story" cinematic recap moment
**Area:** Ride Analysis / Recap (matches-burned, roadmap P1.9)
**Description:** Turn the W′bal "matches burned" drama into a shareable micro-story ("4 matches burned — the big one: 620 W for 40 s at km 72"). Cycling-native narrative drama is far more WOW than a stat table and gives the athlete a story to tell.
**Behavioral principle:** Narrative transportation + peak moment — a vivid story of one's own effort is more memorable and shareable than metrics.
**Expected improvement:** +recap depth/share; +ride-analysis opens.
**Effort:** M
**Guardrail:** Powered rides only with clean data; honest "—" when W′bal can't be computed; drama is descriptive, never exaggerated.

### K3. Animated route "your line" share
**Area:** Wrapped route card (exists) → extend to single rides
**Description:** Extend the Wrapped animated route into a per-ride "draw your line" shareable for standout rides (longest, biggest climb, new territory). Watching your own GPS trace draw itself is a small, reliable delight and highly screenshot-able.
**Behavioral principle:** Aesthetic-usability + self-expression — a beautiful artifact of one's own effort triggers pride and sharing.
**Expected improvement:** +share rate on notable rides; acquisition lift.
**Effort:** M
**Guardrail:** Location-privacy aware (offer start/end obfuscation before sharing); only offered on genuinely notable rides, not every commute.

---

## Theme L — Re-engagement of lapsed users

### L1. Warm, specific win-back ("your fitness is still here")
**Area:** Push / re-engagement
**Description:** For a lapsed athlete, the return message leads with *their* real data and a low-bar re-entry ("You built CTL 54 this spring — it's still mostly here. One easy 30-min spin restarts you"). Specificity + a tiny first step beats generic "we miss you."
**Behavioral principle:** Personalized loss-aversion + minimal-viable-restart — a concrete, self-relevant reason plus a trivially easy re-entry overcomes activation energy.
**Expected improvement:** +resurrection rate of 14–30 day lapsed users.
**Effort:** M
**Guardrail:** Truthful data only; caps strictly on win-back frequency (no nagging cadence); honors notification opt-out; never fabricates urgency or guilt.

### L2. "Fresh start" on return, no shame
**Area:** Today (return state)
**Description:** When a lapsed user opens the app, greet them with a clean fresh-start frame — plan re-scaled to current fitness, streak offered a graceful restart, zero guilt about the gap ("Welcome back — let's rebuild from where you are today"). Removing the shame wall is what determines whether they stay past the first re-open.
**Behavioral principle:** Fresh-start effect — a clean temporal boundary lets people re-commit without the weight of past failure.
**Expected improvement:** +second-session retention among returning users.
**Effort:** M
**Guardrail:** Plan re-scaling uses honest current fitness (no pretending they didn't detrain); never a wall of red missed-workout marks (the anti-guilt thesis).

### L3. Anniversary & "on this day" resurfacing
**Area:** Push / Today
**Description:** Surface honest memory moments — "One year ago today you rode your first century" — as a warm, low-frequency re-engagement and pride hook. Personal history is a uniquely powerful, non-manipulative reason to return.
**Behavioral principle:** Nostalgia / reminiscence reward + endowed history — revisiting one's own milestones reinforces attachment and identity.
**Expected improvement:** Periodic reactivation; +sentiment.
**Effort:** S
**Guardrail:** Only real, positive memories; rare cadence; easily disabled; never resurfaces a painful DNF or injury as if it were a celebration.

---

## Cross-cutting measurement note

Instrument every item against the metric it claims: streak-length distribution (C1–C4, I3), morning/evening brief open-through and deep-link CTR (A1, D1, F1–F4), recap completion and share rate (A2, K1–K3), Achievements/Progress revisit frequency (B1–B3, D3, H1–H3), crew DAU and kudos reciprocity (G1–G4), and lapsed-user resurrection curves (L1–L3). Hold every one to the project's honesty bar: if a hit of dopamine requires fabricating data, inventing urgency, or shaming a rest day, it does not ship — the reward has to be *real*, or it isn't classy enough for a coach.
