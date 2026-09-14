# Hypothetical rider critique

Concept review, 14 September 2026. These are synthetic perspectives, not observed research or real user quotations. Reviewed before visual implementation; no app changes.

**Rider A — new cyclist, intimidated by metrics.** Wants to ride longer comfortably, does not know FTP, and worries that missing sessions means failing. The state separation feels trustworthy. FTP/VO2max as the first choices and unexplained load beams could still make the product feel intended for experts.

**Rider B — time-poor intermediate, FTP-focused.** Understands training zones and wants two weekday sessions plus a longer weekend ride. Needs to see the hardest week and today's commitment immediately. A phase-first active state may delay the actual decision: can this session fit today?

## Five priority improvements

1. **Translate goals into rider intentions.** Pair FTP with “Mehr Leistung über längere Zeit”, VO2max with a short effort description, and endurance with “Länger entspannt fahren”. Offer “Ich bin unsicher” and explain the eventual goal before generating. Missing FTP must not block an endurance-oriented setup.
2. **Make time fit concrete before activation.** Show typical and maximum weekly hours, longest ride, planned weekdays and start date together. Include an example week with session duration and difficulty. The hardest week is a stronger commitment check than an average alone. Availability edits must visibly update the preview.
3. **Give today's decision equal or greater prominence than phase progress.** Active should immediately show today's workout or rest day, duration, plain-language purpose and one next action. Keep the journey as context. Selecting a future week must retain a conspicuous “Heute” return and must not imply the selected week is current.
4. **Explain what the beams encode without requiring inspection.** Place “Geplante Trainingsbelastung” beside the graphic, a small rest-week label and a compact current/completed legend. Pair every selected week with hours and session count. Do not rely on acid/mint alone; include labels or markers. If actual work appears, label it separately from planned load.
5. **Handle imperfect weeks and inconclusive endings kindly and honestly.** Distinguish “Vorschlag” from “Übernommen”, state the practical effect on the next session, and offer details. At ending, show completion and comparable measurement status separately; when no comparison exists, lead with completed work and a clear assessment option. A measurement change is not proof that the plan caused it.

## What must be visible in each state

| State | Visible without deeper inspection | Failure to avoid |
| --- | --- | --- |
| No plan | “Noch kein Plan”; understandable goal choices; hours/week and day selection as clear next steps; explicit optional/missing measurement status | Asking riders to understand FTP before they can start; suggesting a personalized result before inputs exist |
| Draft | “Entwurf · noch nicht aktiv”; goal and dates; typical/maximum hours; weekdays and longest ride; rest weeks; edit availability; “Plan aktivieren” | Average time concealing peak demands; implying creation starts the schedule; showing eight weeks if generated duration differs |
| Active | “Aktiv”; today’s workout/rest, duration and purpose; current phase/week and remaining weeks; journey with current marker; clear selected-week date range; adaptation status when applicable | Phase vocabulary pushing today's action below the fold; future-week selection looking like current state; an ambiguous automatically applied change |
| Ended | “Plan beendet”; completed work; measured result with comparison availability and dates; next goal action; assessment action when measurement is missing; past-plan access | Treating every ended plan as successful or fully completed; hiding measurement uncertainty behind a celebratory number |

**Suggested first visual check:** At 390×844, each rider should identify the state and next action within five seconds; on Active, also the time needed today. This is a proposed evaluation criterion, not a measured outcome. Preserve reading and zoom access rather than forcing all secondary information into one screen.
