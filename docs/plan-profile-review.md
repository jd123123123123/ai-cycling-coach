# Cycling profile · synthetic design challenge

14 September 2026. Hypothetical critique through the perspectives of a data-focused cyclist and a product visualization designer. This is a reasoned design review, not interviews, observed usability research, validated coaching guidance or a performance prediction. Reviewed the existing plan concept and rider, athlete and designer critiques. No application changes.

## Recommendation

Proceed with a six-axis profile as a secondary overview of recorded evidence: 5-second sprint, 1-minute punch, 5-minute power, FTP, longest confirmed ride and late-ride power retention. Its strongest role is helping a rider explore their history and understand the proposed focus. It should not become an overall ability score, proof of event readiness or a promise of improvement. Put exact values and evidence alongside the radar, with an accessible list carrying the same information.

Current and baseline observations can share each axis's scale. Suggested training focus can appear as separate outer arcs, with equal radius and width so their geometry does not encode a predicted value. Review the event's requirements and the rider's available time before creating a plan. A thin or incomplete radar remains a valid profile; it must not manufacture certainty to look finished.

## Five material guardrails

1. **Disclose mixed scales and prevent area from becoming a score.** Watts, ride duration and a retention ratio have different meanings. Even a dimensionless radius does not make them equivalent or additive. Label each axis with its native unit, provide its bounds and scale rationale, and hold those bounds constant between baseline and current. Do not auto-fit each date range or silently cap outliers. Avoid an area total, a central percentage, population percentile, rank or words such as “balanced” derived from polygon shape. Keep fills very light or omit them; axis order changes area and apparent balance. Prefer explicit value differences to reading polygon expansion. If credible scale bounds are unavailable, the value list is the primary representation and the radar should remain provisional.

2. **Compare comparable observations and preserve missingness.** Define the current and baseline windows visibly and keep baseline fixed during a plan. Provide an axis-level date, source, measurement method and comparable/not-comparable status. Tested and estimated FTP must remain distinguishable. Missing, stale, invalid and non-comparable are different states; none means zero. Do not connect across a missing axis in a way that suggests a complete polygon or silently reuse an old value as current. Where only one period has usable evidence, show its observation and “No comparable baseline,” without a delta. Selecting a broader evidence window may reveal an older high value; it must not be narrated as a new gain or loss.

3. **Name what the last two axes actually establish.** “Longest confirmed ride” is the longest recorded qualifying ride in the named window, not a physiological endurance limit or a forecast of event completion. Choose one duration definition, expose it, and keep distance as context rather than mixing hours and kilometres on one axis. “Late-ride power retention” needs an explicit, reviewable comparison protocol: qualifying ride conditions, minimum evidence, earlier and later effort selection, exclusions and calculation. Pacing, route and opportunity to produce power can change the observation. Until that protocol and suitable evidence exist, use “Not assessed”; never derive a reassuring retention value simply by dividing power in arbitrary ride halves. Avoid renaming either axis “Endurance” or “Durability” without qualification.

4. **Separate recommendation from observed change and future performance.** Outer arcs say “Suggested focus” and remain outside the measurement grid. No upward-pointing extension, forecast polygon, timed growth animation or target radius. Arcs identify categories, not expected gains; selecting one reveals a plain reason, supporting observations, uncertainty and the training implication. Distinguish a rider-chosen focus from a system suggestion. An observed before/after improvement can say “Recorded change during this period,” not “The plan gave you +X watts.” No comparable measurements means no performance result, even when all scheduled sessions are completed.

5. **Let the event and feasibility determine relevance before plan creation.** A low normalized axis is not automatically the right training priority. First review the selected event, date, expected duration, course/elevation and any relevant repeated-effort demands, with source or rider-entered status. Unknown event requirements remain unknown; do not fabricate a numeric requirement polygon. Then review availability, longest available session and current recorded training context. Show the proposed focus and practical commitment before “Create draft.” If the event or rider inputs change, reconsider the recommendation visibly. A draft is still distinct from an activated plan, and a richer profile does not establish that a rider is ready to complete the event.

## Hierarchy and interaction

**Before a plan:** Lead with the rider's intention or event and the next decision. A compact “Your recorded profile” can support choosing a focus, but should not push a beginner through six unfamiliar metrics. Present one principal suggestion, optionally one supporting focus, and an understandable reason. Offer “Review event requirements” before draft creation; allow an honest basic setup when power history is absent.

**Draft:** Lead with the proposed goal, dates, weekly time, peak week and longest session. Show “Focus: …” and its rationale beside an optional profile expansion. Keep the radar smaller than the commitment preview. The primary action remains “Activate plan,” with edits available before commitment.

**Active:** Today's session, its duration and purpose remain dominant. Make the profile inspectable as supporting context, not a daily report card. Date the latest evidence and avoid presenting a peak-power curve as today's readiness. A selected axis reveals its record and comparison rather than changing the plan implicitly.

**Ended:** Lead with recorded work and comparable measured changes, according to evidence. A profile comparison may summarize several valid axes, but a large missing-data radar should not displace a clear account of what was completed. Separate plan ending reason, training completion and outcome evidence. Preserve the past plan and offer the next goal without implying that another block guarantees the missing result.

**At the chart:** Use text labels and distinct solid/dashed strokes for current and baseline, not color alone. Keep focus arcs visually distinct from both datasets and label their meaning directly. Each axis should have a generous tap/focus target that opens a small evidence panel with native values, dates, method, scale and comparison status. Provide the same panel through a six-row value list; mobile users should not have to hit a tiny point or rely on hover. Keyboard focus stays visible; Escape closes details and returns focus. Axis order is stable. No animated morph should imply that one measurement turns causally into another. Respect reduced motion.

At 390 × 844, preserve readable labels and normal scrolling rather than shrinking all evidence into one viewport. A useful first impression is “what was observed, what is suggested, and what happens next.” Do not make the measurement methodology a mandatory interruption, but keep dates and material uncertainty beside each value rather than burying all caveats in a tooltip.

## Concrete adversarial checks

| Synthetic case | Required behavior |
| --- | --- |
| Strong sprint, modest FTP, event focused on long sustained riding | Recommendation follows reviewed event relevance and feasibility; smallest radius does not automatically win. |
| No power meter, several long rides | Preserve usable ride-duration evidence; power and retention remain unassessed; setup still offers a meaningful next step. |
| Current FTP estimated, baseline from a different test method | Show methods and comparison limitation; no confident gain claim or automatic success headline. |
| Current window shortened and all-time records disappear | Explain window and evidence availability; do not narrate missing records as lost fitness. |
| Longest ride improves solely because a previously missing activity syncs | Label the updated evidence; do not attribute the change to training since the prior screen view. |
| Retention exceeds a proposed axis ceiling or reflects deliberate negative pacing | Do not silently clamp to “excellent”; inspect protocol and context or mark unassessed. |
| User taps a suggested outer arc | Explain suggested focus and its evidence; no future watt value appears and no plan is silently changed. |
| Several axes lack baseline evidence | Leave gaps, omit unsupported deltas and show available records in the list; no invented complete polygon. |
| Event requirements remain unconfirmed | Keep inputs reviewable and uncertainty explicit before creating an event-specific draft. |

These are proposed design checks, not measured rider responses. The concept earns credibility when uncertainty changes what is drawn and what can be claimed, rather than merely adding a disclaimer beneath a confident picture.
