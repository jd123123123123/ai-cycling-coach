# Plan · four-state concept

Local design proposal, 14 September 2026. Synthetic data only; no API writes or deployment.

## Ground truth

Production at 4e70a28 renders an active block alongside “Kein Ziel gesetzt”, a negative event countdown, and inconsistent four/six-week phase ranges. The page repeats goal, phase and adaptation information, making today's decision hard to find. W3 reference: w3.pen LJCJp, QfbgT, c0fmBu. Inter Tight; near-black surfaces; acid #BFFF3C for current position and the primary action. Rounded beam charts and detailed surfaces, not decorative microcopy.

## Shared structure

One quiet navigation header. One dominant answer per state. A visual training journey ties created/active/ended together: week-sized load beams grouped by actual phase lengths, with an optional road view on inspection. The graph encodes planned training load, never promised fitness. Acid means selected/current, mint means completed. A selected week reveals its own sessions and totals. At phone size the overview fits one screen; deeper interaction can replace content or expand explicitly. At short heights accessibility beats clipping.

## 1 — No plan

Question: what do I want to achieve? A short, expressive goal chooser: FTP, VO2max, endurance, event or own goal. Each has a distinct training glyph. No fake personal plan. Choose goal → available hours and weekdays → build. Do not promise guaranteed watt gains. Existing measurements can inform setup, but missing history must be explicit.

## 2 — Created, not activated

Question: does this fit my life? Show goal, dates, weekly time budget and training days, then a full eight-week load/phase overview. Rest weeks visible. The rider can inspect a week or change availability. One action: activate. State says “Entwurf”; creating never silently starts a plan. Prototype generates only a local deterministic sample.

## 3 — Active

Question: where am I, and what matters next? Lead with current phase, week within phase, weeks remaining. The eight-week graphic is the anchor. Current-week sessions are a selectable day strip with workout beams and one action to details. One concise adaptive-change statement can open before/after reasons; distinguish confirmed changes from suggestions. No unverified “on track” or forecast gain. A week selector changes chart detail as well as totals.

## 4 — Ended

Question: what did the work produce, and what's next? A measured before/after power graphic leads, with measurement dates and source on demand. Training completed (rides, hours, load) supports the result. Plan completion is not goal achievement. No invented VO2/FTP outcomes when no comparable measurements exist: show completed work and an assessment action. Next action: choose next goal; past plan remains inspectable. Celebrate effort without guilt or loss threats.

## Synthetic critique protocol

Review concepts as hypothetical riders; do not claim real usability research. Evaluate five-second clarity, trust, emotional appeal, cognitive load and next action. Return concrete changes and failure cases before visual implementation. Final prototype is reviewed again by the designer after screenshots at 390×844 and desktop.

## References

- https://developer.apple.com/design/awards/ — Tide Guide (clear rich data), (Not Boring) Camera (tactile controls with real utility), Harvee (one understandable central state).
- https://help.join.cc/hc/en-150/articles/4402679265809-Setting-up-your-first-JOIN-training-plan — goal-led training setup.
- https://www.reactbits.dev/get-started/index — interaction inspiration; no dependency installed just for effects.
- Existing Motion package: selection/layout transitions and brief completion reveal, respecting reduced motion. Existing W3 tokens/components remain authoritative.

## Applied critique / designer revision

- Today’s session moved ahead of the overall plan. A selected future week changes the session dates and total, with a one-tap return to the actual current week.
- Availability changes update the deterministic sample schedule. Peak time and longest session are derived from all sample weeks. These are UI fixtures, not coaching recommendations.
- Distinct no-measurement and early-ended samples retain recorded effort without inventing progress.
- Visual pass 1 found all four screens too tall. Repeated captions and redundant chart legends were removed, then spacing was revised without clipping content.
- Visual pass 2 raised the week/phase label contrast and size. The goal illustration now includes quieter weeks instead of implying uninterrupted improvement.
- The proposed mint “completed week” treatment was not adopted: these overview beams all represent planned load. Time passing alone cannot establish training completion. Current week has a persistent marker, selected week has an outline/acid beam.
- Animation is brief and tied to selection. No continuously running animation or delayed counters.

## Integration boundary

This is a local React prototype; production components and backend are untouched. A real integration needs a persistent draft → active → ended lifecycle and the actual backend phase schedule, session durations, evidence for comparable tests and adaptation receipts. The current backend’s stale-goal/negative-countdown issue is documented here, not silently solved by a fixture. Custom goals and edited availability are simulated locally; no live training plan is generated or activated.

## Verification of the review prototype

- TypeScript and production app build pass (existing large-chunk warning remains).
- 390×844: all four default states fit the viewport without page scrolling. Missing-comparison and early-ended variants fit as well.
- 320×568: no horizontal overflow; small-height devices retain vertical access rather than clipping content.
- Browser interaction checks pass: goal change, availability, draft, activation, week selection and return, workout detail, rest day, adaptation detail, metric switch, missing comparison.
- Keyboard week navigation and Escape work; canceling availability restores the prior selection. Zero selected days disables creation without crashing.
- Default session detail fits its dialog without inner scrolling at 390×844. Reduced-motion branch is checked.
- 616 deterministic fixture combinations have consistent time/TSS totals and nonnegative interval durations. These checks validate the prototype data, not coaching efficacy.
- No API mutation requests were issued by the interactive prototype.
