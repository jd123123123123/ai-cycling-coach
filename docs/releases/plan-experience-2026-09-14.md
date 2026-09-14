# Plan experience — 14 September 2026

The new Plan tab uses the reviewed dark W3 layout with actual saved plan and workout data. Four states: no saved plan, saved-plan confirmation, active plan, and results after a dated event passes. Empty state opens the existing goal creator or plan importer. Session selection opens the dated workout page, preserving route matching and exports. The introduction is a three-step animated visual, dismissible and remembered per authenticated rider on the current device.

GET /plan/current is read-only and owner-scoped. It displays the latest saved mesocycle instead of generating training when the page is opened. The engine stores mesocycle blocks; the UI does not invent an eight-week schedule or four fictitious phase allocations. Future week navigation uses the existing deterministic weeks API. Historical record comparisons use the existing progress explorer and its actual measurement provenance. Only persisted adaptation feed entries produce the adaptation notice.

Validation: 41 backend tests (current plan, build, exports, outdoor); 32 frontend interaction and plan-state/date tests; production TypeScript and Vite build. Visual inspection at 390×844: empty/active/created and intro. Local review harness is excluded from the deployment archive. No migration.

Limit: this connects the reviewed visual hierarchy to current backend capabilities. The prototype’s fabricated performance radar, fixed result improvements, and local keyword-based custom-goal inference are not production data and are not shipped. Existing document import remains the real import flow.

Previous deployment: bfe99ee8-1e22-41de-84f5-5cbaea66bcef.

## Follow-up: real goal intake and power comparison

The Plan entry now provides FTP, VO₂max and endurance presets plus the approved compact custom date/duration/distance/ascent/intent pickers. Rider-selected weekdays and weekly hours are persisted. `/plan/goal/preview` explains a deterministic demand-based recommendation without writes; `/plan/goal/apply` atomically persists the goal and rebuilds the real periodized week. A failed build rolls everything back. Fixed program templates cannot override these explicit available days. The training load safeguards remain in force.

The result/profile comparison uses real 5 s, 1 min, 5 min, 20 min and 60 min power records normalized to the rider's own observed best for each duration. Missing axes remain missing, never invented zeros. Record detail also exposes 1 s and 10 s when actually measured. Week/month/year history selectors work. Completed targets stop at their own end date; opening empty/ended Plan does not call the legacy auto-generating week endpoint. New custom plan history anchors to its saved starting date.

Document intake continues to use the existing real import flow. No made-up population percentile or numeric future improvement radar ships. The visible four-week chart is explicitly the current training block; presets have an eight-week goal horizon. Intro remains three visual, replayable, dismissible steps.

Validation: backend helper 167 tests (intake, generation, ownership, rollback and prior program behavior); focused follow-up current-plan/progress/intake tests; frontend confirmation flow and read-only opening tests; production build; mobile calendar, custom inputs and availability visually inspected.
