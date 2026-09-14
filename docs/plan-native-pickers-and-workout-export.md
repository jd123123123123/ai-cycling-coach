# Plan input and workout export review

Local preview only. No API mutation or Railway deployment.

## Review

Open `/review-plan-entry-export.html` on the existing Vite server (5201). The left frame preserves V3 preset pills. The middle frame shows five compact fields with RIDR calendar, scroll-snap number wheels, and ambition sheets. The right frame opens workout export. `/research-outdoor-training.html` contains the sourced route-alignment research and proposed implementation stages.

Direct input requires a date, positive duration and ambition. Distance and elevation are optional. The next step asks about riding demands if those are not yet known; distance, elevation and an event name alone do not determine the training focus. Text and document methods remain available. Existing coaching-plan documents retain their separate flow.

Picker values are drafts until confirmed. Closing or Escape cancels only the picker. Native nested dialog focus management is retained, cancel propagation stopped, keyboard arrows supported and reduced-motion respected. Date selection uses a custom calendar with month/year navigation. Number wheels have direct numeric-entry alternatives and bounded ranges. The scenario date is 2026-09-14, consistent with the synthetic plan fixture.

## Export

From an active session, choose “Einheit ansehen” then “Einheit exportieren”. Formats:

- Zwift: ZWO with relative FTP targets.
- Garmin / Wahoo: FIT workout using the official Garmin SDK, absolute watt targets from fixture FTP.
- Other compatible software: MRC (% FTP) or ERG (absolute watts).
- Komoot: GPX only after the user supplies an actual valid route. Interval blocks never create fake geography.

The export is the selected sample session, not whatever the backend currently recommends today. It is a file download, not cloud sync or a guarantee that every model supports manual import. Outdoor flexibility, personalized watts and route matching are not implemented by this prototype. The new research explicitly addresses those gaps.

## Validation

TypeScript check passes. Browser checks cover date selection, cancellation, nested Escape, number-wheel keyboard operation, ambition selection, the demand follow-up, arbitrary numeric-input bounds and five mobile sheets. At 390×844, main input, workout details, export and picker sheets fit without internal scrolling. At 320×568, long parent dialogs may scroll vertically; no horizontal overflow.

ZWO, FIT, MRC, ERG and real GPX downloads tested. FIT decoded using Garmin SDK with valid integrity/CRC, expected selected session name, 10 steps and 4,500 seconds for the selected 75-minute Sweetspot example. Three work steps are 720 seconds at 216 W. Invalid GPX coordinates refused and rest-day export unavailable. Actual importing on Garmin/Wahoo/Zwift devices/apps remains untested.

Review scripts: `/tmp/ridr-picker-qa.cjs`, `/tmp/ridr-picker-edge.cjs`, `/tmp/ridr-v4-layout.cjs`, `/tmp/ridr-minimal-export.cjs` (native-input section predates the picker replacement; export portion remains relevant).
