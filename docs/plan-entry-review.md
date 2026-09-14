# Plan entry review

Local review only; user approval is pending. No deployment.

- Empty/finished-plan entry leads to a new personal plan. An ended event with no stored plan history opens monthly progress and offers week/month/year, without an empty “Since plan” period.
- Ausdauer, FTP and VO₂max can be selected individually or combined. A focus block needs weekly time and available days, but no invented event date, distance or duration. The first progression horizon is eight weeks. Existing event and import routes remain available.
- Backend persists the selected focuses and shares existing quality slots while preserving recovery, age, availability and time-budget limits. Switching to a no-event focus plan clears obsolete event metadata/GPX while preserving unrelated goals.
- The one-time invitation is keyed to the signed-in user, does not modify a plan, waits for a successful plan read and respects the existing modal gate. The auth context already clears query data on account changes.
- Final review fixes: a `choose=1` navigation now opens the composer even on an already mounted plan page; closing consumes that query flag and avoids immediately opening the introductory walkthrough. Auto-event preview inputs remain replayable so activating the returned goal preserves the exact recommendation.

Validation: 8 focused frontend tests passed (7 composer cases + mounted-route regression). 126 backend tests passed across custom-plan goals, current-plan status and mesocycle generation, including three new preview/confirmation consistency cases. `npm run build` (`tsc -b` and Vite) passed; existing bundle-size warning remains. `git diff --check` passed. Isolated browser checks at 390×844 and 320×568 verified multi-selection → preview and invitation dismissal, with no horizontal overflow or browser errors. The two short-screen dialog screenshots were visually reviewed; the longer selection dialog scrolls normally.

Interactive comparison: http://127.0.0.1:5209/review-plan-entry.html. All review-page rider values and its plan preview are synthetic. It cannot save a plan or access rider data. Preview files and screenshots are intentionally excluded from this commit; production components use the authenticated APIs.
