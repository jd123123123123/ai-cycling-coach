# Ride atelier — researched proposal, 21 September 2026

Status: isolated DEV-only React proposal, not deployed and not approved as a production replacement. Fixtures are explicitly marked in the preview. Existing ride/Today components are unchanged, apart from exporting existing preview fixtures. Route: `/e/w3-ride-atelier-preview`; optional `?screen=today`, `?panel=Leistung`, `?panel=Bestwerte`, `?panel=Plan`.

## References actually inspected

- [Radian on Awwwards](https://www.awwwards.com/sites/radian), Site of the Day 4 July 2026, and [original site](https://rideradian.com/). Inspected listing and actual hero visually. A physical product leads the composition; restrained yellow/black roles; the listing documents contextual hotspots, scroll sequences and configurator. Transfer: make the rider's actual GPS trace the central visual object. Do not transplant a marketing site's scroll length into a utility app.
- [Tide Guide](https://tideguide.com/). Inspected official product screenshots. Charts occupy most of the surface; readings and interactions sit around the chart rather than competing cards. Transfer: one measured-zone visualization with direct selection and a stable reading, one comparative power curve, and progressive detail.
- [Apple Design Awards](https://developer.apple.com/design/awards/), 2026 listing. Tide Guide is a Visuals and Graphics winner and an Interaction finalist. The reference supports the interaction approach; it does not validate this proposal or confer an award on it.

## Design decisions

Four chapters retain the same navigation position: Fahrt, Leistung, Bestwerte, Plan. Each starts with one question: what did I ride, where did my effort go, how did it compare, what changed in my plan? Typography and measured evidence take priority over decorative microcopy. Existing W3 black, white, lime and neutral tokens remain authoritative.

GPS is projected north-up with latitude compensation; it is not rendered as fictional terrain. The zone dial uses recorded seconds only. The power curve retains the existing zero-based comparison. Actual versus planned duration/load share a common baseline per metric. No recommendation means no planned marker. A historical ride never substitutes current recovery advice for an attributed stored change.

The Today variant explores dimensional SVG training blocks. It is explicitly schematic, with no implied time axis; individual labels are accessible on selection. It is a visual direction requiring user feedback, not a new workout export or physiology model.

## Critical review and resulting corrections

One independent synthetic design review, source-based, not real customer testing and not affiliation with Apple, Whoop or Awwwards. Three concrete findings were implemented:

1. Replace generic motivational copy with measured plan difference and comparative readings; remove duplicated best-value headlines.
2. Pass ride dates into deeper review; omit current-sounding advice on historical rides without attributed changes.
3. Allow overflow within a chapter for long content rather than clipping it. Preserve navigation. Increase Today expansion hit target to 44 px and provide reduced-motion behavior.

## Validation and boundaries

Inspected actual React screens in a 390 × 844 iframe, including summary and comparative record curve. Six focused tests cover GPS orientation/missing GPS, actual-zone selection, absent plan references, absent zone data and historical attribution. TypeScript and production build pass. Existing build warns about large maplibre chunks; this proposal adds no library.

This is not yet the complete production ride page: the deeper existing review and map remain available, but full production navigation, every metadata field and authenticated live data integration remain for a separately approved implementation. Small viewports may scroll within a chapter to preserve legibility. No claim of universal one-screen fit, actual athlete feedback, a 10/10 score or measured emotional response.

## Second iteration: deeper analysis and shareable evidence

User liked the overall direction but asked for the data people seek in Strava and shareable views. Research extended to these primary sources:

- [Strava Heart Rate](https://support.strava.com/en-us/articles/15401762-heart-rate): time-series heart rate paired with elevation, averages/maxima and personal zones. Transfer: keep one shared time cursor across power, pulse, elevation, cadence and speed; give elevation its own labeled scale rather than superimposing incomparable units.
- [Strava Power](https://support.strava.com/en-us/articles/15402161-power): power analysis and FTP reference. Transfer: a ride's watts over time and the athlete's FTP over calendar dates are distinct views. FTP history uses stored observations, never a claimed gain from this single ride.
- [Strava's April 2025 update](https://press.strava.com/ea/articles/strava-updates-features-to-help-users-easily-plan-and-share-their-activities): full-screen activity detail and downloadable share stickers. Transfer: create a dedicated poster, leaving controls out, with the metric, period and comparison understandable outside the app.
- [Apple: Design app experiences with charts](https://developer.apple.com/videos/play/wwdc2022/110342/): clear self-contained reading, context and progressive exploration. A foundational design reference, not presented as newly published guidance.

Added to the isolated proposal:

- Analysis selectors: power, heart rate, altitude, cadence and speed. Color-coded FTP / HRmax bands, synchronized elevation and grade context. Keyboard range control and direct curve inspection. Time-weighted averages ignore missing intervals, zero remains a real measurement.
- Best efforts retain the existing measured power-duration curve and can now be controlled by the preview so the selected duration matches the export. Existing consumers retain their original behavior.
- FTP history for 30/90/180 days, actual calendar spacing, explicit recorded-source labels, dates and differences. No future observations in a historical window.
- Every ride chapter has a share action. SVG-based branded posters render to PNG at 1080 × 1350 or 1080 × 1920. Native share is user-triggered when supported; otherwise the local PNG can be saved. No posts are sent automatically. The GPS silhouette is opt-in on the ride poster. SVG text is escaped by React, with no external assets or HTML injection.
- These new streams and FTP values are intentionally synthetic fixtures. They are explicitly marked in the app preview and the exported image. They do not fetch or overwrite real athlete records. Production integration still requires mapping real stream timestamps (the existing crew telemetry contract contains normalized position but no elapsed seconds) and the rider's historical FTP/HR references. Do not infer clock time by multiplying sample position by ride duration.

No claim that share cards create virality, improve retention, or have been tested with real customers. The design makes the underlying personal evidence portable; growth impact needs measurement after an approved implementation.

Validation of the second iteration: 14 focused tests pass, including known/unknown HR-zone references, calendar filtering, irregular-interval averages, synchronized sample selection, controlled best-effort selection and safe SVG exports. Inspected the actual analysis, FTP period switch (90-day +16 W to 30-day +6 W with fixtures), and 4:5/9:16 export dialog. PNG rendering completed in the browser; the save action was exercised. Native OS share-sheet behavior is dependent on platform support and was not posted to any social platform. The Today workout preview also offers a share poster labeled as a planned session. No production deployment performed.

## Third iteration: purpose, comparison and contribution

The user explicitly asked for the training emphasis, an elevation profile directly under the route, plan-versus-actual consequences and a contribution chapter. Subsequent live feedback rejected an overloaded summary and circular contribution gauges. The final local proposal therefore keeps the map large and uses six direct chapters: Fahrt, Zonen, Analyse, Bestwerte, Plan, Beitrag. Coach-Read is a separate header destination with its own back button.

- Fahrt: larger GPS silhouette, height and distance axes directly underneath, three ride totals and one compact training-emphasis link. FTP at ride time sits beside distance and opens the stored FTP history. No claimed single-ride FTP gain.
- Zonen: the existing interactive dial remains prominent. Selecting a zone shows actual minutes, the saved recommendation, signed minute difference and two bars with a common baseline. Unknown actual values remain unknown, including a zone with a known planned dose.
- Plan: recorded power versus stored recommended power over elapsed time, with clearly distinguished lines and total duration/TSS differences. The stored next-session change, date and reason are visible. Pending changes are not labeled applied. The curve describes power, not cumulative TSS.
- Bestwerte: explicit demonstration records for 1/5/10/15/30 seconds and 1/2/3/5/10/20 minutes, compared with prior records. These records are separate from the downsampled illustrative telemetry and are not derived from it.
- Beitrag: real calendar spacing on a cumulative year chart, with the ride's final increment highlighted, previous/current totals and selectable distance/saddle time/ascent. History and totals in this prototype are explicitly synthetic. Production must supply period-matched aggregates excluding this activity from the baseline; the component does not invent a year curve if history is missing. Later calendar records are excluded. The rejected rings were removed.
- Coach-Read: training-dose pills, a short purpose explanation, the existing modeled fitness/fatigue difference relative to the recommendation, and a dated link to the attributed plan change. The model is explicitly labeled; it is not evidence of a measured performance gain.
- Sharing: all chapters, including zones, contribution and Coach-Read, have branded PNG views. GPS remains opt-in and all preview images retain their demo labels.

Physiology terminology was checked against TrainingPeaks' primary coaching references: [Coggan power levels](https://www.trainingpeaks.com/blog/power-training-levels/), [NP, IF and TSS](https://www.trainingpeaks.com/learn/articles/normalized-power-intensity-factor-training-stress/), and [individualized training levels](https://www.trainingpeaks.com/blog/individualized-training-the-what-why-and-how-of-the-new-wko4-ilevels/). Zone exposure identifies a workload emphasis, not a guaranteed adaptation. The coach is currently deterministic explanatory UI backed by the review object; this change does not add a production AI call or automatically change a real plan.

The illustrative stream now uses unequal climbs rather than identical repeated humps; recorded demo ascent remains 5,639 m and elapsed time 285 minutes. Its zone distribution is reused consistently by the training emphasis, dial and coach. This fixture refinement is not an edit to any real ride.

Final checks for this iteration: 30 focused tests pass, TypeScript and the production build pass, and the existing large-map-chunk warning remains. Visually inspected genuine React views at a 390 × 844 iframe viewport: coach next action, year contribution, zone plan difference, and the 1-second best-effort selection. Compacted the coach after its next-step card was initially clipped; shortened the best-effort heading to keep the enlarged duration selection legible. No production deployment was performed.

### 22 September — aligned zone references and deeper Coach-Read

User request: show recommended/actual in the zone graphic; make Coach-Read substantively deeper using Garmin bike data.

The two concentric zone tracks now share a seconds scale and each zone's start angle. Zone capacity is max(recorded, recommended); neither distribution is stretched independently to 100%. Missing recommendations have no reference arc, recorded zero remains zero. Centre shows selected recorded minutes plus recommended minutes. PNG shares use the identical geometry.

Coach is now an evidence adapter over existing `RaceDebrief` and `StreamAnalysis` types, not a new LLM call. Eight chapters: summary, pacing, body response, technique, climbing, energy, development, plan consequence. Summary links into the analysis. Detailed interpretation is progressively disclosed. UI remains W3 black, restrained lime, existing type and chart primitives. Local preview uses a separate explicitly synthetic API-shaped fixture; no real rider data was fetched and no live route was replaced. Production wiring is still part of adopting this preview.

Repository source audit:
- `garmin_details_parser.py` maps power, heart rate, cadence, GPS, distance, altitude, temperature, balance, pedal effectiveness/smoothness, PCO/power phases, stamina/potential and performance condition.
- `ActivityStream` persists raw channels plus NP, decoupling, kJ, power models and MMP.
- Existing debrief endpoint exposes pacing, climbs, efforts, efficiency, modeled W′ matches, quadrants, fueling and prescriptions.
- Existing stream-analysis endpoint exposes L/R, PCO, power phases, stamina and performance condition. Training Effect, consumed fuel/fluid and a temperature curve are not part of this typed Coach input; the UI explicitly does not invent them. More Garmin capabilities are possible than are currently exposed here.
- This adapter uses `durability.aerobic_decoupling`'s positive-drift convention via RaceDebrief, not the opposite-signed legacy advanced-metrics implementation.

Interpretation limits: second-half NP loss is not proof of fatigue; mixed terrain/variability changes its meaning. Device Stamina is an estimate. Fueling is modeled and intake unknown unless recorded. Single-ride MMP is not a measured FTP gain. Existing historical effort reference has no disclosed time window; label it a reference, not an invented before-plan or matched-ride baseline. Actual plan mutations remain the existing engine's responsibility; pending changes must never appear applied.

Primary references checked 22 September 2026:
- Garmin Training Effect: https://www.garmin.com/en-US/garmin-technology/cycling-science/physiological-measurements/training-effect/
- Garmin Normalized Power: https://support.garmin.com/en-AU/?faq=8r4llV3DFK5jc13BOHion5
- Garmin Real-time Stamina: https://www.garmin.com/en-AU/garmin-technology/cycling-science/physiological-measurements/real-time-stamina/
- Garmin Cycling Dynamics: https://www.garmin.com/de-AT/garmin-technology/cycling-science/cycling-dynamics/

Tests cover missing sensors and references, true zero vs null, interval-weighted cadence, split and drift semantics, pending adaptation, unknown intake, equal angular units in dual rings, and shared export. Preview validation is local only; not deployment approval.

### Viewport follow-up and final local validation

All seven ride panels (including FTP inside Bestwerte) and eight Coach chapters now use the available viewport height. Header and bottom navigation remain fixed in the layout, charts receive the flexible space. The small preview toolbar still identifies demonstration data. Explanation text, source coverage and ride details open a bounded reader with previous/next controls, focus management, Escape and close; they no longer append to the page. Technique switches between cadence and force distribution. Main UI keeps a scroll fallback for unusually large accessibility text, but the tested default layouts do not overflow.

Validated with Chromium, reduced motion, 375×667, 390×844, 430×932 and 1266×712: 60 panel/chapter scenarios, zero document or panel overflow. Another 44 explanation pages and share dialogs at 375×667 and 390×844: zero overflow. Genuine 375 px screenshots inspected for overview Coach and dual zone ring. Four test suites, 42 tests passed. TypeScript and production build passed; pre-existing large MapLibre chunk warning remains. No deployment performed.
