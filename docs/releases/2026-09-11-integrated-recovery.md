# Integrated recovery — ready for review, not yet deployed

## Sources

- Last approved W3 app: d324126 on codex/crew-progress-refinement.
- Incoming backend and scene rendering: /Users/jannisdeters/Downloads/ridr-deploy, as supplied on 2026-09-11. DEPLOY-README.md identifies its source as the in-flight cassette-reward-layer checkout.
- Shared Git ancestor used for three-way integration: c5a8ce4.
- Recovery branch: codex/recover-integrated-release.
- Working directory: /Users/jannisdeters/Documents/Codex/2026-09-09/thi/recovered-release.

## Result

The approved Today, readiness, week, form, Crew, rides, progress and goal UI comes from d324126. All frontend files are exactly d324126, including the studio stage, avatar, shared W3 tokens and cards. After reviewing the first recovery preview, the user clarified that the feature is unlockable backgrounds for the existing bike in the studio, not a full-screen replacement scene. The additional scene renderer has therefore been removed from this recovery. The existing background picker and backend stage catalogue remain available. The pale editorial Today rewrite, Today shell bypass and unrelated chart redesign are excluded. The user explicitly selected only Claude's background feature; the unpublished Codex milestone celebration work remains excluded.

Incoming backend app, migration and test changes are preserved. crew_chat.py is a three-way merge that keeps both routine filtering and approved power/telemetry functionality. Other approved backend endpoints remain intact. Docker SPA_CACHE_EPOCH 24 is retained from the incoming deployment. No dependencies change. Test-only fix: the image-size test mocks image-provider readiness so no real credential is required; the render call remains mocked.

The incoming routine-rides migration rr5e1b8c94d7 is retained; it is the single local Alembic head. DEPLOY-README.md reports it already applied in production. No database command was run against production. The incoming standalone routine preference router is not registered by its supplied main.py; this existing integration gap is preserved, rather than silently changing API exposure during frontend recovery. Likewise, the incoming past-ride render aspect limitation documented by Claude is unchanged.

## Validation

- Frontend production build passed.
- 50 focused frontend tests passed before removing the additional scene renderer; the final frontend is identical to the approved d324126 and the production build plus 9 focused shell/overview tests passed after that correction.
- Backend: 211 of 212 focused tests passed initially; the one failing test depended on local image credentials. After isolating that test, all 7 image-pixel tests passed. Thus all 212 selected cases have passed.
- Access tests include foreign-crew telemetry denial, routine preference ownership and ride-override ownership.
- git diff --check passed; incoming source hashes rechecked unchanged.
- Before/after preview uses identical fixture inputs and the same saved studio bike and avatar; preview files and art stay untracked and excluded from deployment.

## Publish process

1. Obtain explicit approval of this integrated recovery.
2. Deploy a git archive of its reviewed commit from the repository root to project 0f06d274-aac4-455c-93f9-122ab1788dac, service bda428cd-994f-46f1-9042-79882880f6b3, environment f45a7fab-bf17-4098-8937-ed616bb8b713.
3. Check deployment SUCCESS, /healthz, actual delivered Today chunk content and authenticated rendered UI.
4. Record the resulting commit and deployment as the shared production baseline. All later Codex and Claude releases must contain it as an ancestor and integrate backend/frontend together before upload. Never deploy an old isolated checkout or the unversioned ridr-deploy snapshot again.
5. Prior current deployment: 5992b411-67f3-4b53-aca2-fffd5b8b6cb0. Last approved UI deployment: 1978a065-67c3-4688-b0b9-2c1e2f972942.

There is no general need to change source or cache settings solely because local and Docker chunk hashes differ. Verify the served feature content. This incident involved divergent frontend source, not merely an unchanged asset hash.

Preview correction: the initially displayed Claude scene contained a different bicycle and was unsuitable as a reference. It has been removed. No generated replacement bike or scene is included in the release.
