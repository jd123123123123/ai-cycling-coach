# RIDR working agreement

Preserve the existing W3 black surfaces, design tokens, real rider/bike identity and user-approved component anatomy. Use the live app and supplied W3 designs as ground truth. Preview visual changes with before/after; do not silently substitute fixture data or reference bikes for production riders.

## Required design review before deployment

For every UI deployment, use `docs/design-review-pipeline.md` and the guard in `scripts/design_review_gate.py`. The user explicitly requires nine independent synthetic agent reviews: the roles in `configs/design-review-roles.json`. Spawn each with `fork_turns="none"`, shared exact evidence packet, and at most three evidence-backed findings. Batch within the available slots. Do not impersonate nine reviewers from one agent or claim real users/company affiliation/awards.

Keep one immutable packet containing exact candidate/base commits, actual changed files, checksummed before/after screenshots with matching viewport/data/scenario, functional checks and reduced-motion evidence when relevant. Deduplicate the independent findings centrally, resolve P0/P1, then show the concrete reviewed result. User approval is the final step and must match exact commit, packet and report hashes. Existing approval only applies to that unchanged candidate. Never synthesize a user approval or use test approvals for deployment.

Deploy through `scripts/deploy_reviewed.py` only after validation and actual user authorization. Its default is dry-run. Use CLI-only Railway, the explicit project/service/environment IDs in the runbook, and a clean git archive of the reviewed commit. Exclude local previews. Verify deployment success, live health and affected routes afterward. This local wrapper is not server-side/CI enforcement; do not claim it makes bypass impossible. Do not call Railway from tests or merely to validate the pipeline.

Non-UI-only changes still require explicit scope and nine role reports; an unaffected role may be N/A with an evidence-backed reason. Reuse reviews only when code, packet and role definitions are identical. User instructions and existing authorized scope take priority; do not introduce extra confirmations before producing the concrete reviewable result.
