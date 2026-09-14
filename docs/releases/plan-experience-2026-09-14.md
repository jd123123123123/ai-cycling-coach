# Plan experience — 14 September 2026

The new Plan tab uses the reviewed dark W3 layout with actual saved plan and workout data. Four states: no saved plan, saved-plan confirmation, active plan, and results after a dated event passes. Empty state opens the existing goal creator or plan importer. Session selection opens the dated workout page, preserving route matching and exports. The introduction is a three-step animated visual, dismissible and remembered per authenticated rider on the current device.

GET /plan/current is read-only and owner-scoped. It displays the latest saved mesocycle instead of generating training when the page is opened. The engine stores mesocycle blocks; the UI does not invent an eight-week schedule or four fictitious phase allocations. Future week navigation uses the existing deterministic weeks API. Historical record comparisons use the existing progress explorer and its actual measurement provenance. Only persisted adaptation feed entries produce the adaptation notice.

Validation: 41 backend tests (current plan, build, exports, outdoor); 32 frontend interaction and plan-state/date tests; production TypeScript and Vite build. Visual inspection at 390×844: empty/active/created and intro. Local review harness is excluded from the deployment archive. No migration.

Limit: this connects the reviewed visual hierarchy to current backend capabilities. The prototype’s fabricated performance radar, fixed result improvements, and local keyword-based custom-goal inference are not production data and are not shipped. Existing document import remains the real import flow.

Previous deployment: bfe99ee8-1e22-41de-84f5-5cbaea66bcef.
