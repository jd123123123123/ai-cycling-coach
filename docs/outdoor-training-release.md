# Outdoor training release

Scope: the researched workout/route preparation flow, integrated into the real
W3 session detail page. This release does not replace the Plan page with the
separate four-state design prototype.

- One date identifies the selected session throughout the detail, terrain
  analysis and FIT/ZWO/MRC/ERG downloads. Missing/rest/non-cycling dates refuse.
- A SHA-256 revision over date, FTP and resolved blocks prevents an automatic
  plan update from silently exporting a different workout than the preview.
- Own ridden routes (virtual titles excluded) and GPX upload. Activity and stream
  ownership are checked on the server. Uploads are bounded, no remote URL fetch.
- Complete work/recovery sequences placed on terrain at estimated target-power
  speeds. The first feasible start within 30 km extra approach is selected;
  no splitting or physiological rewriting of the session. Terrain thresholds
  are conservative product heuristics, not a road-safety classifier.
- Interactive elevation + prescribed blocks on one distance axis; extra travel
  time and approximate intensity-based TSS included. Air still, 9 kg bike,
  CdA 0.32 and Crr 0.005 are stated assumptions; weight and FTP must be real.
- Outdoor FIT inserts one open LAP-start step before the main set, retaining
  all timed steps. Route GPX is separate. No cloud Garmin/Wahoo integration,
  GPS-triggered intervals, weather/traffic predictions or Power Guide claims.
- Zwift ZWO and timed MRC/ERG stay fixed-duration. Wahoo device/import support
  is explicitly model dependent. No hardware imports were tested.

Validation: focused backend export, identity, route ownership, XML rejection,
set completeness and terrain tests; headless mobile interaction at 320/390/768
px (fixture labelled in the local harness), scrubber, download and runtime
errors; production build; forced TypeScript check. Fixture harness is not shipped.

Baseline: morning-release 4e70a28, successful Railway API deployment
79225647-2b64-4650-ae56-a26575146532. Target service:
bda428cd-994f-46f1-9042-79882880f6b3, project
0f06d274-aac4-455c-93f9-122ab1788dac, production environment
f45a7fab-bf17-4098-8937-ed616bb8b713.
