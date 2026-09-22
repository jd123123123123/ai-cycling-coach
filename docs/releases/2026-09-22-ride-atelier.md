# Ride detail release — 22 September 2026

## Approved scope
User: “deploy”, narrowed immediately to “but not today jsut the fahrt”.
Production baseline verified through Railway deployment list: 9ae37b7794f673fc77cea1051ddeb3889aad0f52, deployment 42b86dce-429b-4292-abec-7d26339891b3.

Only the normal /e/w3-ride/:id route changes. The approved atelier now reads the authenticated rider's activity, recorded streams, stored training review and debrief. The preview's fixtures are separate modules, never defaults for live data. Today, its shared training review, existing ride celebration, existing map hero and legacy detail view are byte-identical to the baseline. Earlier prototype work remains on codex/focus-production-sept21.

## Behavior
- One viewport with Fahrt, Zonen, Analyse, Bestwerte, Plan, Beitrag and Coach chapters; map opens the existing full-screen map. Sharing is explicitly user-triggered.
- Small activity read renders independently of the slow debrief. Unavailable analyses have honest empty states and a retry control in details.
- New read-only owner-scoped /activities/:id/ride-chart returns aligned 1 Hz telemetry downsampled for plotting; full-resolution power-zone seconds; FTP snapshot or dated preceding history; measured MMP durations from 1 s to 20 min versus the preceding 90 days; complete calendar-year contribution through the ride.
- No current FTP substituted for an unknown historical FTP. No future rides in comparisons. Unknown totals remain unknown; annual history is not capped at the list endpoint's 500 rows.
- No changes to sync, training algorithms, automatic adaptation or database schema. Coach interprets already available debrief/stream analysis; it does not trigger an extra LLM request.

## Verification
- TypeScript and production Vite build passed. Existing MapLibre size warning remains.
- 47 focused frontend tests passed across six suites, including actual-vs-recommended zone geometry, missing values, independent recorded zone totals, prior records, coach interpretation and fixed explanation interaction.
- 8 backend tests passed: authentication, ownership before stream access, all history owner/date predicates, full-resolution zone totals, absent channels, dated FTP, recorded MMP and unknown aggregate semantics.
- 56 live-route component viewport checks with controlled API fixtures: 375×667, 390×844, 430×932, 1266×712, all six panels and eight Coach chapters. No document/panel overflow, no browser exceptions. These are synthetic functional scenarios, not real-user research.
- Missing-power/GPS/history scenario displayed only its recorded 54 km, 2 h, 640 hm; no demo FTP, route or chart appeared. Explanation closes with Escape. Actual production data is checked separately after deployment.
- Source diff confirms Today and shared live modules are unchanged.

## Release authorization
The user's existing reserve-mode instruction waives the design-review deployment block (“wir haben doch gesagt wenn ich auf reserve bin deploy ohne review”). This release does not claim nine agent reports or a formal design-review packet. The explicit latest approval covers only ride detail. Export exact commit using scripts/deploy_reviewed.py's clean archive helper, then use the fixed CLI-only Railway project/service/environment. No working-tree upload or unrelated application changes.

## Limits
Missing recordings cannot produce graphs. Historical FTP is shown only with a saved anchor. HR bands use the rider's current stored HFmax, labelled accordingly. FTP history is saved values, not an inferred gain from this ride. Prior efforts use a 90-day window; no all-time claim. Reduced motion is supported; accessibility text enlargement can fall back to scrolling rather than clipping content.
