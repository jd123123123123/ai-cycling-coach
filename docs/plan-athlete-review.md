# Synthetic athlete critique · Plan concept

14 September 2026. This is a reasoned review through two hypothetical rider perspectives, not interviews, observed usability findings or evidence of user preference. No scores are assigned. Scope: the four-state concept in `plan-design-concept.md`; no app changes.

## Competitive, data-focused cyclist

**Likely first question:** “What is the next prescribed session, and how does it relate to my event or target?”

The distinction between planned load and fitness, inspection by week, visible rest weeks and confirmed versus suggested adaptations make the concept credible. However, phase/week/remaining-weeks alone do not answer what to do today. Put a dated next-session summary alongside the current position: workout type, duration and a short purpose, or an explicit rest-day state. Opening workout details should be the immediate action when a session is scheduled.

The proposed eight-week anchor must describe the sample, not become a rule for all plans. Render the actual start/end dates and phase lengths, including shortened final weeks. For event plans, make the event date available beside the goal; an event in the past needs a resolved state rather than a negative countdown. “Weeks remaining” should say whether it includes the current week, or use an unambiguous end date.

Load beams need a visible unit and a concise explanation of how load is derived. A rider should be able to distinguish planned, recorded and missing values without interpreting color alone. Acid currently means both “selected” and “current”; use a separate current-week marker so inspecting week seven does not imply that the rider has reached it. Mint should represent recorded completed training, never the mere passage of a calendar week. A mixed week needs a partial state, not a completed mint beam.

For the ended state, show a before/after comparison only when the metric and measurement method support comparison. Label measured versus estimated FTP and show both dates and sources near the values, with deeper methodology on inspection. An increase during a plan is an observed change, not proof the plan caused it. Completion, adherence and performance change should remain separate facts. Goal attainment needs its own evidence; eight weeks passing does not demonstrate it.

**Concrete failure cases:** event date already passed; planned sessions with no recorded rides; outdoor ride completed instead of the prescribed workout; estimated starting FTP compared with a tested final FTP; missing load values; an inspected future week mistaken for the current week.

## Returning cyclist after an interrupted plan

**Likely first question:** “Is this still my plan, what happened while I was away, and what is reasonable to do next?”

The promise of effort-based celebration and inspectable history is useful, but four states leave an ambiguity: an interrupted plan can be active in the system while no longer describing the rider's circumstances. Add an explicit interruption treatment within the active state, with “Last recorded training” and the scheduled plan dates. Missing activity is uncertainty, not evidence that the rider did no training. Use “No recorded session” rather than “You missed this workout.”

A returning rider should not be pushed straight into a stale hard workout. Make “Review plan” available when the dates or a rider-reported break indicate the schedule needs attention. Let the rider confirm current availability and whether to continue, revise, or end the plan; do not silently rewrite history, schedule catch-up sessions or claim that the rider is ready. Keep proposed adjustments separate from applied changes.

“Ended” must visibly distinguish **completed**, **ended early**, and **scheduled period elapsed**. Lead with truthful work completed and dates when no comparable assessments exist. A large improvement chart or completion celebration would be misleading for a plan ended after two weeks. The headline should reflect the ending reason; a neutral “Plan ended” can support acknowledged effort without presenting interruption as failure.

“No plan” also needs two treatments: first-time setup and no current plan with history. For the latter, preserve a compact “Last plan” entry and its ending reason, with “Choose next goal” as the primary action. Otherwise the returning rider may infer that previous training was deleted. A saved draft should remain discoverable rather than being conflated with no plan.

**Concrete failure cases:** return after three weeks with no synced activities; calendar advances beyond the event; plan deliberately ended early; rides exist but the integration has not updated; several saved drafts; no comparable baseline measurement.

## Changes to carry into the visual design

1. Put state label, relevant dates and immediate next action in the initial view. In active mode, include today's session/rest state, not only phase position.
2. Use actual plan duration; reserve eight weeks for this synthetic example. Keep start/end dates and phase ranges derived from the same data.
3. Separate current week from inspected week, and distinguish planned, recorded, partial and unavailable data with labels or shape as well as color.
4. Preserve planned versus completed totals; elapsed weeks are not completed training. Show the selected week's date range with its sessions and totals.
5. Add an active-plan interruption treatment and ended reasons without expanding the top-level four-state model. Make review of a stale schedule possible and explicit.
6. Show prior-plan history in the no-current-plan state. Keep first-time setup visually distinct from returning without an active plan.
7. Show outcome comparison only with suitable evidence. Put dates and measured/estimated labels close to the values; otherwise lead with recorded work and offer assessment.
8. Prioritize state, today's decision and one action on phones. Allow the journey to compress or scroll; an entire rich graph plus all sessions need not fit one viewport at the cost of legibility.

## Prototype checks before calling this ready

Inspect both 390×844 and desktop with synthetic examples covering first-time no plan; no current plan with history; an unactivated draft; active rest day; active session day; a future week selected; partial week completion; returning with a stale schedule; completed plan with comparable measurements; and plan ended early without measurements. Check whether the state and next action are apparent without opening details, whether dates/totals agree, and whether every outcome claim can be traced to the displayed synthetic evidence. These checks can expose design errors; they do not substitute for research with actual riders.
