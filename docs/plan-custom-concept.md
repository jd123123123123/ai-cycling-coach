# Custom plan & capability profile · design revision

14 September 2026. Local review only. The reference is the user's HYBRD radar screenshot; W3 palette/type remain authoritative.

## Decision before generation

A name and deadline do not establish training requirements. Collect: rider's outcome (finish, target time, race), event format, expected duration, elevation and climb/effort pattern; existing training and current measured capabilities; available time and fixed days. A profile's missing sprint efforts are not a proven weakness. If requirements remain unknown, retain unknowns and ask rather than assigning an explosive/endurance block from a title.

Input options: describe the goal (AI-guided workflow prototype), or attach PDF/DOCX/TXT. Existing code has a PDF/image AI plan-import endpoint, but no Word input; its extraction/application paths must remain separate. The local review does real browser-only text extraction and a clearly disclosed rule-based interpretation, with no AI request and no production writes. Never present this local interpreter as the production AI engine.

Import intent must distinguish an event brief from a coach's existing schedule. For coach content, preserve vs adapt is an explicit choice. Text extraction is not workout parsing: show source text, allow correction, and do not claim an imported schedule is ready for activation. Scans and legacy .doc are unsupported in this local reader and explained without pretending success.

## Visualization

Five axes: recorded 5-second, 1-minute, 5-minute power, FTP and longest recorded ride. Lasting power after fatigue is left for a separate future measure until comparable efforts/protocol exist. Tour duration is recorded exposure, not maximum endurance capacity. Fixed per-axis display scales stay identical between compared snapshots. No total score, no population percentile, no shape-area interpretation.

Acid = current values; dotted gray = baseline in comparison mode; lilac outer arcs = categorical training priorities in focus mode. Priority is not a performance projection and has no numeric improvement promise. Native-unit values and dates appear on axis selection. Unknown axes have no filled polygon or connection across the gap.

State integration: no-plan → description/document → review demands → profile and proposed focus → local plan draft. Draft/active have Plan/Profile tabs so the chart adds depth without turning the page into a long dashboard. Ended profile compares measured samples only.

## Hypothetical critique applied

Read plan-custom-targetgroups.md (first-time endurance finisher, competitive criterium racer, time-poor coached rider) and plan-profile-review.md (data rider + visual designer). They are simulated perspectives, not real research or efficacy validation.

## References

- https://www.trainingpeaks.com/blog/power-profiling/ — duration-specific cycling power profile; not justification for an arbitrary aggregate score.
- https://support.trainerroad.com/hc/en-us/articles/46538001951643-Choosing-the-Right-Discipline-For-Your-Events — demands differ within broad event labels.
- https://support.trainerroad.com/hc/en-us/articles/360037666312-Plan-Builder-FAQs — goal, availability, event demands.
- https://github.com/mwilliamson/mammoth.js — DOCX raw-text extraction; avoid unsanitized HTML output.
- https://mozilla.github.io/pdf.js/examples/ — browser PDF processing.

## Implemented review and self-review

Local review: `/review-plan-profile.html`. The previous design remains available with `?v1`; the original shipped component with `?before`. All four plan states remain accessible. The header switches between Plan and Profile without adding vertical dashboard bulk.

Real local raw-text readers handle PDF, DOCX and TXT/Markdown. Legacy DOC, empty, malformed and oversized inputs show an error. Both pasted text and documents can be marked as existing coach schedules. Recognized coach-plan wording takes the protected source-review path: no invented event facts, no silent replacement, and no calendar activation before structured sessions exist.

The goal flow separates event demands from athlete intent. A named event alone does not populate the demand field. Finishing the alpine example prioritizes tour duration and sustained power; seeking a faster result prioritizes sustained power and hard climbing minutes. These are illustrative rules, not an individually validated training prescription. The prototype deliberately does not claim a model integration.

Final design critique corrected mismatched end/current evidence and unified the 5-minute baseline with the original result card (330 → 349 W). Missing power data remains missing in the chart and evidence. Chart sectors have generous pointer targets and keyboard support. False “today” labels were removed when a viewed custom-plan date differs from the sample date. The eight-week calendar itself remains a layout fixture, not an event-specific periodization engine.

Validation includes 390×844 one-screen states, 320×568 access without horizontal clipping, desktop layout, native-dialog Escape, real document-reader fixtures, rejected invalid files, changed priorities after intent selection, missing-demand clarification, coach-source protection, state-consistent evidence, before/after comparison and no server writes. The browser preview itself labels the simulated data and rule-based extraction.
