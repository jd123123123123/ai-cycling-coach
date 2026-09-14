# Plan review — results and direct goal selection

Local preview: `/review-plan-results.html`. Starts with the immediately preceding result view (`?v2`) next to the new version. The full four-state review remains available. No production routes, backend or deployment changed.

## Result

FTP stays the main outcome. Eight clickable best-power durations add 1 s, 5 s, 10 s, 30 s, 1 min, 5 min, 20 min and 60 min. The curve and KPI grid share the same selected duration; the selected reading shows baseline, finish value and percentage change. All duration cards show final watts and absolute improvement. Five-second, one-minute, five-minute and FTP fixtures agree with the existing radar. FTP and best 60-minute power are distinct values.

The separate work view shows completed/planned sessions, hours against the actual sum of the sample plan's durations, distance, elevation and longest recorded ride against the starting record. More recorded volume is not represented as a fitness score. There are no unsupported VO₂max or W/kg improvements.

The radar stays at five distinct areas. Adding overlapping 1/5/10-second axes would overrepresent sprint performance; the duration curve is the right place for those details. Current sample results are all positive, explicitly simulated. Real integration must retain negative/unknown changes and comparable measurement windows rather than reuse example headlines.

## Entry flow

The default is direct pills for goal date, expected ride duration, distance, elevation, main demand and outcome. Custom date/numeric inputs replace their pill row while editing to preserve screen height. Goal date, duration, demand and outcome are required; missing distance and elevation remain unspecified. A generated editable title avoids mandatory initial typing.

Description and goal-document import remain alternatives and lead back to the same editable choices. Existing training plans have an explicit file-import path, no goal-description text area. Coach wording in pasted text is still detected conservatively and cannot create a fabricated calendar. Original file text appears only when requested. File and description drafts stay separate when switching methods; pending file reads cannot populate another mode.

## Validation

TypeScript check; 12 state/viewport combinations; 390×844 main views fit without scrolling; 320×568 permits vertical access without horizontal clipping. Checked eight KPI selections, keyboard chart selection, source comparison, correct 36.5-hour target, missing-result fallback, quick setup through draft, custom numeric input fit, changing demand, coach-import protection, retained description draft, PDF/DOCX/TXT readers, native-dialog Escape, before/after frames and zero API writes. Evidence: `artifacts/plan-v3-qa.json`, `plan-v3-*.png`.

This remains a design prototype with synthetic results and rule-based text interpretation. AI plan creation, event-specific periodization and structured calendar import are not connected.
