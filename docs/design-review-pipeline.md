# Reviewed UI deployment

This is a local CLI guard and Codex working agreement. It is **not Railway-side or CI enforcement**: direct Railway commands could bypass it. No new AI API, account or paid dependency is used. Python 3.12+ and the existing Git/Railway CLI are sufficient.

## One packet, nine independent reviews

1. Finish implementation and functional checks. Commit the exact candidate. Choose its exact base commit. Keep evidence/reports outside the deploy archive, e.g. `/tmp/ridr-review/<commit>/`.
2. Build one small evidence packet shared by all reviewers. Capture before/after with the **same data fixture, viewport and scenario**. Include all changed states, at least the narrowest supported mobile and desktop when both are affected. Cover loading, missing data, long text, and interactive expansion as applicable. Motion changes need reduced-motion before/after plus a recorded animation observation/check: static screenshots do not validate animation. Never label fixture values as actual rider data.
3. Spawn nine **distinct agents**, one per role in `configs/design-review-roles.json`, `fork_turns="none"`. With limited slots, run successive batches. Give each the identical packet, screenshot paths, source scope and its role brief. Each must actually inspect the evidence, independently; do not substitute one agent impersonating nine people. The role labels are lenses, never claimed employment, awards or real human research. Reviewers return at most three concrete findings with evidence IDs and no numerical aesthetic score.
4. Root deduplicates findings by issue/evidence into one short improvement list; retain all nine original reports. Resolve P0/P1, then create a new candidate commit and packet if code changed. Cached reports may be reused **only when code commit, complete packet hash and role definition are identical**; changed evidence/code requires renewed independent review. Set the packet `roles_version` to the SHA-256 of the roles config (include role changes in the candidate commit).
5. Show the exact reviewed before/after with concise remaining P2/P3 findings. If the user requested a preview before deciding, obtain approval of that result as the final step. If they already explicitly authorized this scope to deploy when ready, honor that instruction without asking again. Record the actual message reference and exact text in `approval.json`, bound to the final validated candidate; never invent approval, infer it from agent praise, or copy test fixtures. Changes invalidate the recorded hashes and require renewed validation; the original user instruction remains valid only within its authorized scope.
6. Run the guard, then the deployment wrapper. Default is read-only/dry-run. Only an explicit `--execute` performs Railway CLI linking/upload from a temporary **git archive of the reviewed SHA**. Working-tree changes are never included; local previews, node_modules and .env credentials are excluded. No migrations or unrelated service deploys are implied.
7. After upload, verify Railway deployment success, health and the live bundle/affected routes. Upload acceptance is not deployment success. Record deployment ID and reviewed SHA; retain the previous deployment for rollback.

## File contract

All JSON uses schema below. Hashes are lowercase SHA-256. The packet hash is `sha256(json.dumps(packet,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode())`; reports hash uses the same function on the entire report array. `scripts/design_review_gate.py` exports `digest` for this; no self-hash field is added to the packet.

`packet.json`:

```json
{
  "schema_version": 1,
  "scope_commit": "EXACT_40_CHARACTER_CANDIDATE_SHA",
  "base_commit": "EXACT_40_CHARACTER_BASE_SHA",
  "scope_summary": "Concrete changed behavior and affected screens",
  "changed_files": ["frontend/src/path.tsx"],
  "change_kind": "ui",
  "roles_version": "SHA256_OF_REVIEW_ROLES_CONFIG",
  "motion_relevant": false,
  "evidence": [
    {"id":"mobile-before","kind":"screenshot","path":"before.png","sha256":"FILE_SHA256","state":"before","source_commit":"BASE_SHA","viewport":{"width":390,"height":844},"scenario":"collapsed","data_fixture":"fixture-v3","reduced_motion":false},
    {"id":"mobile-after","kind":"screenshot","path":"after.png","sha256":"FILE_SHA256","state":"after","source_commit":"CANDIDATE_SHA","viewport":{"width":390,"height":844},"scenario":"collapsed","data_fixture":"fixture-v3","reduced_motion":false},
    {"id":"functional-checks","kind":"check-output","path":"checks.txt","sha256":"FILE_SHA256"}
  ]
}
```

For motion, add `motion_check_refs` referencing an actual `check-output` evidence file with checksummed observations (including actual observed animation, timings and reduced-motion behavior). Add screenshots with `reduced_motion:true` in both states. For non-UI changes, keep all nine reports: `change_kind:"non-ui"`, an explicit `non_ui_reason`, and check-output evidence. Roles genuinely unaffected may return explained `not-applicable`; this is not permission to skip nine reviews.

Each entry in `reports.json` (an array of exactly nine):

```json
{"role":"amateur","agent_id":"REAL_DISTINCT_CODEX_AGENT_ID","synthetic":true,"scope_commit":"CANDIDATE_SHA","packet_sha256":"PACKET_HASH","summary":"Observed conclusion","evidence_refs":["mobile-after"],"verdict":"pass","findings":[{"id":"contrast-1","severity":"P2","description":"Concrete issue and proposed fix","status":"open","evidence_refs":["mobile-after"]}]}
```

Valid verdicts: `pass`, `revise`, `not-applicable`. `revise` blocks. A resolved finding needs `resolution:{"explanation":"What changed or was verified","evidence_refs":["..."]}`. P0/P1 cannot stay open. N/A requires `not_applicable_reason` and non-UI scope. Evidence IDs must exist; every report references actual evidence.

`approval.json`, written only after the real user's approval:

```json
{"approved":true,"source":"user-message","message_reference":"ACTUAL_USER_MESSAGE_REFERENCE","verbatim_approval":"ACTUAL_USER_WORDS","scope_commit":"CANDIDATE_SHA","packet_sha256":"PACKET_HASH","reports_sha256":"REPORT_ARRAY_HASH"}
```

The script checks the recorded provenance fields and exact hashes, but cannot cryptographically authenticate a human message or prove an agent really viewed an image. Codex must preserve genuine tool/message provenance. This is deliberately not presented as tamper-proof authorization.

## Commands

```sh
python3 scripts/design_review_gate.py --repo /absolute/repo --packet /absolute/evidence/packet.json --reports /absolute/evidence/reports.json --approval /absolute/evidence/approval.json --commit EXACT_SHA
python3 scripts/deploy_reviewed.py --repo /absolute/repo --packet /absolute/evidence/packet.json --reports /absolute/evidence/reports.json --approval /absolute/evidence/approval.json --commit EXACT_SHA
# Only after the above passes and real user authorization exists:
python3 scripts/deploy_reviewed.py --repo /absolute/repo --packet /absolute/evidence/packet.json --reports /absolute/evidence/reports.json --approval /absolute/evidence/approval.json --commit EXACT_SHA --execute
python3 -m unittest discover -s scripts/tests -v
```

Railway target is explicit: project `0f06d274-aac4-455c-93f9-122ab1788dac`, service `bda428cd-994f-46f1-9042-79882880f6b3`, environment `f45a7fab-bf17-4098-8937-ed616bb8b713`. No Railway commands run during validation or tests.
