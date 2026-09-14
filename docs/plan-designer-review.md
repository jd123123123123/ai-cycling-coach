# Plan · critical designer review

Synthetic product-design review, 14 September 2026. These are design judgments and hypothetical rider responses, not findings from user research.

## Verdict

The concept has the right questions and credible data boundaries. Its main weakness is compositional: a dominant eight-week graph in three states could still produce three near-identical dashboards. Keep the same visual grammar, but change what occupies the center. Distinction must survive removal of the state label and primary button.

## Composition I would design

| State | First five seconds | Dominant composition | Primary action |
|---|---|---|---|
| No plan | “I choose what I train for.” | A large goal name and expressive training glyph, with a short, plain goal list. Selection changes the main glyph and one practical description. No chart. | Weiter, then Plan erstellen |
| Draft | “This is the commitment I am considering.” | Full plan preview: the goal and total duration above one broad beam field; actual phase spans below. Weekly time and available days form a readable summary beside it, or immediately above it on mobile. | Plan aktivieren |
| Active | “This is my week; this is my next session.” | Current phase and week establish position. A compact full-plan beam strip leads into a much larger selected-week/session view. Today has visual priority over the distant weeks. | Einheit ansehen |
| Ended | “This is what I completed and what was measured.” | One large, honest result graphic or completed-work graphic. The finished plan is a secondary collapsed timeline. Avoid turning the result into another status dashboard. | Nächstes Ziel wählen |

The common system is typography, alignment, beam geometry, selection behavior and color meaning—not a repeated stack of cards. Use open sections divided by space or thin rules. Reserve an enclosing surface for a meaningful interactive group.

## Changes before implementation

1. **Reduce the active overview's dominance.** An eight-week anchor is useful for orientation but should not compete with today's session. Make the full-plan strip compact, then give the current week a larger surface with a readable workout shape and duration. Include “Ruhetag” as a valid, complete answer.
2. **Make the draft an explicit commitment preview.** Dates, days and hours belong in the primary reading path. Do not scatter them into equal stat tiles. A short line such as “8 Wochen · 4 Tage/Woche · bis 6 Std.” should be readable at normal text size. If availability varies, show the actual range instead of an invented constant.
3. **Use phase spans, not repeating labels.** Group weekly beams with one phase label and its real length. A two-week phase occupies two weeks of width; a four-week phase occupies four. Mark recovery with readable text when inspected and visibly lower load, not an obscure icon.
4. **Separate selection from current position.** Acid may highlight the selected week; “Jetzt” or a fixed position marker identifies the current week independently. Completed weeks may use mint. Color alone cannot communicate these distinctions. Selecting a future week must never suggest that today moved.
5. **Give the ended state a deliberate no-measurement design.** Lead with completed hours or completed sessions in a large graphic, then say that comparable measurements are missing. Do not place an empty before/after chart in the hero. If a measurement exists, label metric and units immediately; source and dates can be opened for detail. Avoid implying the plan caused every observed gain.
6. **Limit the active adaptation message to actual significance.** Show one change only when there is one. A suggestion needs an acceptance control; a confirmed change needs a view of what changed. Do not use “optimiert” or “angepasst” as decorative reassurance.

## Graphic and interaction direction

- Use W3 near-black `#0b0b0b`, acid `#bfff3c` and Inter Tight. Keep large type confident, labels legible and surfaces quiet. Default supporting text should remain comfortable at approximately 15–16 px on mobile; do not make the design fit by shrinking it into microtext.
- Rounded beams encode one defined quantity at a time. Name planned load and the unit near the chart. Within the plan, retain a stable scale when switching weeks. If the workout detail encodes intensity over time, label that chart separately so the same shape does not silently acquire another meaning.
- Let a selected week reveal content through a short shared-layout transition. Display a visible selected label, update sessions and totals together, and preserve keyboard focus. Avoid continuous glow, count-up numbers and motion that delays reading.
- Make every week tappable with a generous target even when its beam is short. Support focus and arrow-key navigation. Use a visible selection outline or marker in addition to color.
- On mobile, target a complete first answer and primary action in the initial viewport. Allow normal scrolling for supporting material. Do not treat one-screen fitting as a reason to hide commitments, compress charts beyond usefulness or clip larger text.
- The optional road view currently adds another visualization without a clear decision it improves. Exclude it from the first version. The beam system already provides sequence, effort and phase structure.

## Failure cases to test against screenshots and behavior

| Failure | Concrete check |
|---|---|
| All four states look alike | Hide headings and buttons; each state's main composition should still be recognizable. |
| Active feels like a reporting screen | In five seconds a hypothetical rider can identify the next session or rest day and open it. |
| Selection corrupts orientation | Inspect a future week; the actual current week stays visibly marked and today's context remains recoverable. |
| A beautiful graph is semantically empty | A reader can tell what height means, which week is selected, and where each phase begins without opening a legend. |
| Draft hides time requirements | At 390 × 844, weekly time and training days are readable before activation. |
| Completion implies success without evidence | The no-measurement state shows completed work; missed goals and partial completion do not trigger false celebration or guilt. |
| Real content breaks the layout | Check long goal names, a twelve-week plan, a short phase, missing sessions, a rest day and larger system text. No fixed eight-week assumption. |
| Decorative polish masks inactivity | Goal selection, week selection, availability changes and primary actions produce coherent visible results; none are dead controls. |

Review after rendering at 390 × 844 and desktop. The immediate acceptance bar is four distinct first impressions, one clear action per state, readable commitments and no unexplained chart semantics.
