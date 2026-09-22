# RIDR working agreement

Preserve the existing W3 black surfaces, design tokens, real rider/bike identity and user-approved component anatomy. Use the live app and supplied W3 designs as ground truth. Preview visual changes with before/after; do not silently substitute fixture data or reference bikes for production riders.

## Design previews

Always present both dark and light versions together, using real W3 theme tokens and matching data, viewport and state. The user explicitly requests both for every design iteration. Do not use image inversion as a substitute for the light theme.

## Required design review before deployment

For every UI deployment, use `docs/design-review-pipeline.md` and the guard in `scripts/design_review_gate.py`. The default requires nine independent synthetic agent reviews: the roles in `configs/design-review-roles.json`. When the user explicitly enables the Luna fallback because the full panel is unavailable, use `--luna-fallback` with exactly one genuine Luna report covering the Awwwards, Apple and Whoop lenses; label it as a fallback and never present it as nine reviewers. Do not claim real users/company affiliation/awards.

Keep one immutable packet containing exact candidate/base commits, actual changed files, checksummed before/after screenshots with matching viewport/data/scenario, functional checks and reduced-motion evidence when relevant. Deduplicate the independent findings centrally, resolve P0/P1, then show the concrete reviewed result. User approval must cover the deployment scope and be recorded against the final exact commit, packet and report hashes. Honor an existing explicit instruction to deploy that scope when ready; do not request it again just because validation finished. A request to preview before deciding still requires approval of that concrete result. Never synthesize a user approval or use test approvals for deployment.

Deploy through `scripts/deploy_reviewed.py` only after validation and actual user authorization. Its default is dry-run. Use CLI-only Railway, the explicit project/service/environment IDs in the runbook, and a clean git archive of the reviewed commit. Exclude local previews. Verify deployment success, live health and affected routes afterward. This local wrapper is not server-side/CI enforcement; do not claim it makes bypass impossible. Do not call Railway from tests or merely to validate the pipeline.

Non-UI-only changes still require explicit scope and nine role reports; an unaffected role may be N/A with an evidence-backed reason. Reuse reviews only when code, packet and role definitions are identical. User instructions and existing authorized scope take priority; do not introduce extra confirmations before producing the concrete reviewable result.
