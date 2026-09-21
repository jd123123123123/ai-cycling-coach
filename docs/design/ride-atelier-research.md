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
