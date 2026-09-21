# Ride detail and Today training card — review candidate

Base: 9ae37b7794f673fc77cea1051ddeb3889aad0f52 (published focus release).
Status: implemented locally, preview ready; not deployed.

## Scope

Completed ride detail: one GPS-led hero; truthful NP/average-power labels; existing image available as a Moment toggle. A single training review, time-proportional power profile, plan comparison only when supported, dated adaptation outcomes, and selectable detailed evidence. Missing sensors do not create empty instrument tiles. Scene creation remains available by explicit action under the ride-image disclosure.

Today: only the recommended-training card, both collapsed and expanded. Larger session title, consistent insets, quieter black surface, integrated intervals, readable supporting metrics. Existing training, weather, explanation and adaptation controls retained. Bike, avatar, readiness and all other Today modules retain their existing structure.

## Synthetic review

Three independent agents covered recreational/time-limited/ambitious riders; W3 visual hierarchy, accessibility and interaction; data integrity and interpretation. These are simulated perspectives, not actual users or employees of design companies. No nine-person deployment panel is claimed.

Main findings addressed:
- Several competing coach summaries -> one primary training review.
- Latest PMC applied to old rides -> exact activity day plus exact seven-day prior comparison, otherwise absent.
- Invented annual targets -> recorded ride-year totals only, no assumed goals.
- Highest brief power-zone exposure misrepresented as entire ride -> longest recorded zone labeled as measured power distribution.
- Missing recommendation shown as pending score -> explicit absence; saved-but-incomparable prescription distinguished.
- Small pacing percentages inflated 100-fold -> consistent 0–100 API interpretation.
- Decimal watts corrupted by string parsing -> explicit numeric VM fields.
- Spectrum colors shifted after filtering -> stable zone indices.
- Sampling described as raw measurements -> disclosure identifies aggregated section values.
- Three Today labels and double inset -> one date line and aligned content.

## Validation

TypeScript build passes. Vite production build passes (existing map chunk size warning remains).
50 focused cases across ride review, no-power ride, historical context, similar climbs, evidence tabs and Today overview. Review suite rerun after final saved-prescription copy correction: 22/22.
Browser inspected actual components in desktop/mobile-width layouts, including expansion, analysis selection, no recommendation and historical copy. Comparison uses two fixed 390 × 844 iframes and identical deterministic demo data. The production rider's data and bike are not replaced.

## Preview

Comparison: http://127.0.0.1:8781/
After: http://127.0.0.1:5180/e/w3-today-preview?training
After ride: http://127.0.0.1:5180/e/w3-ride-preview
Ride variants: ?free&historical and ?limited
Before app components: http://127.0.0.1:5181/ (git archive of base frontend source, same review fixtures).

The preview host and baseline source live outside this repository. This document is a review record, not a deployment approval or gate packet.
