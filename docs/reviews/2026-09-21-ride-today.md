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

## Second iteration — visual explanation, not more copy

The user rejected the first candidate as insufficiently visual and insightful. The three synthetic reviewers were reconvened for specific issues and a second check; no real-user validation or objective 10/10 rating is claimed.

Implemented:
- Recorded and prescribed power share one time axis and one FTP axis. The longer activity remains visible past the prescription. Aggregated intervals extend to supported boundaries; missing intervals remain gaps. Touch/keyboard inspection follows elapsed time, not array index, and respects each recording's end.
- The most material proportional duration/load difference leads. Unplanned rides lead with their longest measured power band. These are observations, not claims that a single ride increased fitness.
- The attributed, dated plan adjustment follows immediately, with its reason on demand. Historical pending/limited checks never masquerade as completed adaptations.
- Best efforts form a smooth, zero-based power-duration curve with a prior-record reference. Selecting a duration shows measured watts and the signed difference. No string parsing or invented performance score.
- Today uses one interactive workout instrument in quick and expanded views. Section selection survives expansion. The CTA follows the plot; optional execution, weather and route information sits in compact disclosure rows.
- Stable color roles: lime actual, white plan, zone colors only for power-zone distribution. Scoped W3 tokens and black surfaces retained.

Second-pass findings addressed: swapped comparison colors; low-value generic headline; irregular-time scrubbing; hidden interval tails; historical pending wording; readout after plan end; empty expanded-card spacing; repeated explanation labels; selection lost during expansion. The design reviewer found no remaining P1 issues and recommended user preview after the final boundary correction. This is not deployment approval.

Validation: TypeScript and production build pass. 27 review behavior tests, 20 ride evidence/history/no-power/repeats tests, and 18 Today/adaptation tests pass. Actual browser checks included Today section selection retained through expansion, CTA placement and disclosure spacing, planned/shared-axis ride review, best-effort selection and signed differences, and historical ride without a saved plan. Existing map bundle size and test-environment canvas warnings remain.

Current comparison: http://127.0.0.1:8781/?page=ride — before is commit 1179273, the previously rejected preview; after is this iteration. This supersedes the first iteration's live-base comparison above. On narrow review windows, use the Before/After toggle; both frames remain real app components with explicitly labeled example data. No new libraries or backend changes were necessary. Not deployed.
