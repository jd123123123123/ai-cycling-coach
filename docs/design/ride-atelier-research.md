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
