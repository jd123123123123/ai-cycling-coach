---
phase: 05-ai-coaching-core
plan: 02
subsystem: frontend
tags: [react, react-query, motion, sse, fetch-streaming, portal, uplot, lucide, tailwind-v4, coach-ui, transparency]

# Dependency graph
requires:
  - phase: 04-dashboard
    provides: DashboardShell, ReadinessHero, BiometricsDetail, Sparkline, uPlot patterns, paper-aesthetic tokens
  - phase: 05-ai-coaching-core (wave 1)
    provides: /coach/brief, /coach/brief/refresh, /coach/chat SSE, /coach/why, /coach/transparency
provides:
  - frontend coach surface (CoachBrief, CoachChat, WhyAmITired, TransparencyDrawer)
  - useCoachBrief / useRefreshBrief / useCoachChat / useWhyTired / useTransparency hooks
  - streamCoachChat — fetch+ReadableStream SSE reader that supports POST bodies
  - JSON pretty-renderer with token-class colouring (no external highlight lib)
  - prefers-reduced-motion support for all new animations
  - advanced-ride-science tile shell (EF live, decoupling/durability placeholders)
affects: [06 future training-plan-generation UI, all future /coach/* consumers]

# Tech tracking
tech-stack:
  added: [motion (framer-motion successor)]
  patterns:
    - "SSE streaming via fetch + ReadableStream (EventSource can't POST)"
    - "useQuery with enabled-controlled lazy fetch for modal/drawer data"
    - "React Query cache.setQueryData replacement on mutation success (no refetch)"
    - "Portal-mounted drawers/modals with body-scroll lock + escape handling"
    - "Stagger-reveal via motion/react variants on component mount"
    - "Evidence chips derived from the LLM snapshot the brief was built on"
    - "Options always rendered in canonical intensity order; blocked ones styled, not dropped"

key-files:
  created:
    - frontend/src/api/coach.ts
    - frontend/src/hooks/useCoachBrief.ts
    - frontend/src/hooks/useCoachChat.ts
    - frontend/src/hooks/useWhyTired.ts
    - frontend/src/components/dashboard/CoachBrief.tsx
    - frontend/src/components/dashboard/CoachChat.tsx
    - frontend/src/components/dashboard/WhyAmITired.tsx
    - frontend/src/components/dashboard/TransparencyDrawer.tsx
  modified:
    - frontend/package.json (motion)
    - frontend/package-lock.json
    - frontend/src/components/dashboard/ReadinessHero.tsx (remove CoachNote placeholder → mount <CoachBrief/>)
    - frontend/src/components/dashboard/DashboardShell.tsx (Ask coach button + CoachChat drawer)
    - frontend/src/components/dashboard/BiometricsDetail.tsx (AdvancedMetricsStrip with EF + placeholders)
    - frontend/src/index.css (prefers-reduced-motion)

key-decisions:
  - "SSE client uses fetch + ReadableStream, not EventSource — EventSource can't POST a body and the /coach/chat endpoint requires a messages array in the request body"
  - "Chat messages are session-local React state (not persisted to DB) — briefs are the audit trail; chat is ephemeral by design"
  - "Evidence chips derived from the snapshot the LLM saw, not a separate /evidence endpoint — keeps the brief self-describing"
  - "Blocked options render styled (strikethrough + reason) rather than being filtered out — preserves transparency: athlete sees what the LLM suggested AND what rails intervened"
  - "AI offline · rule-based chip when model_used === 'rule-based-fallback' — sets correct expectations without hiding that the backend is still answering"
  - "Chat drawer disabled state on 503 — greyed input + explicit ANTHROPIC_API_KEY guidance rather than silent failure"
  - "Stub files created for WhyAmITired + TransparencyDrawer during Task 2 commit — CoachBrief imports them; stubs return null so the commit compiles cleanly and Tasks 4/5 replace them atomically"
  - "Decoupling + durability tiles shipped with placeholder copy — backend computes both per activity (05-01) but per-second sample streams aren't exposed over /activities yet; tiles wait for /coach/metrics-trend"
  - "Custom JSON renderer (not highlight.js) for transparency drawer — ~40 LOC, zero bundle cost, token-class colouring sufficient for snapshot auditability"
  - "TransparencyDrawer fetches snapshot via lazy useTransparency(open=true) — heavy payload, never fetched in background"
  - "motion/react stagger: 80ms between children, 200ms duration — feels editorial rather than animated; honours prefers-reduced-motion"
  - "CoachChat + TransparencyDrawer share h-full on inset-0 parent for iOS-safe viewport fill; backdrop-blur softens the scrim over the paper background"
  - "useCoachChat rolls the user turn back when send fails — prevents orphaned user messages with no assistant reply"

patterns-established:
  - "All LLM surfaces degrade visibly — rule-based chip, 503 disabled state, retry affordances — never silently replace real responses"
  - "Auth for SSE: read access token from client module and pass Authorization header manually on fetch() — axios interceptor doesn't wrap fetch"
  - "Every /coach/* response shape typed once in api/coach.ts; hooks and components import from the single source"

# Metrics
duration: ~55min
completed: 2026-04-20
---

# Phase 5 Plan 02: Coach UI Transparency Summary

**Causal, transparent AI coach surface for the dashboard — live brief with evidence chips, streaming chat drawer, why-am-I-tired causal modal, and a transparency drawer that exposes the raw snapshot + system prompt (direct answer to Altini's "made-up scores" critique)**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-04-20
- **Completed:** 2026-04-20
- **Tasks:** 8/8
- **Files modified:** 13 (8 created, 5 modified)
- **Bundle delta:** +50 KB gzipped (462 → 512 KB) — well under 300 KB target

## Accomplishments

- **Replaced the "AI brief in Phase 5" placeholder in ReadinessHero** with a real causal CoachBrief that renders verdict + rationale + evidence chips + 4 option cards + 7-day outlook + frameworks cited — every element grounded in the athlete's own data
- **Streaming chat drawer** backed by fetch+ReadableStream (EventSource can't POST), with blinking-caret partial text, inline-mono data highlighting (46ms / 220W / 84 TSS / 7.8h / ±12%), suggestion chips on empty state, and an abort controller that cleans up cancelled streams
- **Why-am-I-tired causal modal** sorted high→med→low with red/amber/grey severity dots, plus a "See raw data" toggle that dumps the snapshot JSON pretty-printed in mono
- **Transparency drawer** with a custom JSON pretty-renderer (token-class coloured, no highlight.js dependency), copy-to-clipboard for snapshot + system prompt, and a "Safety rails that fired" section that lists blocked options with their reason
- **Graceful degradation** — rule-based-fallback surfaces as a visible "AI offline" chip; 503 on /coach/chat flips the drawer into a disabled state with explicit ANTHROPIC_API_KEY guidance; 429 surfaces rate-limit copy; all errors are user-readable, not raw exception strings
- **"Ask coach" button** in the DashboardShell masthead opens the streaming drawer from anywhere on the page; portal-mounted so it layers correctly
- **Advanced ride-science tile strip** in BiometricsDetail with live EF (computed client-side from activities) and placeholders for decoupling + durability — tiles will light up when a /coach/metrics-trend endpoint ships, no frontend rework needed
- **Accessibility**: prefers-reduced-motion honoured, ARIA dialog/modal roles, escape-to-close on every surface, focus management on chat open

## Task Commits

Each task was committed atomically:

1. **Task 1: api-and-hooks** — `1a74903` (feat)
2. **Task 2: coach-brief-component** — `fbaa9eb` (feat)
3. **Task 3: coach-chat-drawer** — `af17c43` (feat)
4. **Task 4: why-am-i-tired-modal** — `820ad68` (feat)
5. **Task 5: transparency-drawer** — `f163e1e` (feat)
6. **Task 6: integrate-into-readiness-hero** — `656f30a` (feat)
7. **Task 7: extend-biometrics-detail** — `efbdac2` (feat)
8. **Task 8: styling-polish-and-build** — `b8a780e` (chore)

**Plan metadata:** _(commit follows with STATE.md + SUMMARY.md)_

## Files Created/Modified

- `frontend/src/api/coach.ts` — typed client for /coach/*: fetchCoachBrief, refreshCoachBrief, fetchWhyTired, fetchTransparency, streamCoachChat (async generator over ReadableStream)
- `frontend/src/hooks/useCoachBrief.ts` — useCoachBrief (6h staleTime, matches backend cache TTL), useRefreshBrief (mutation, replaces cache on success)
- `frontend/src/hooks/useCoachChat.ts` — session-local message store + abort controller + typed 503/429 handling
- `frontend/src/hooks/useWhyTired.ts` — useWhyTired + useTransparency, both enabled-controlled lazy queries
- `frontend/src/components/dashboard/CoachBrief.tsx` — verdict in Fraunces italic, rationale with 60ch max-width, inline typographic evidence chips (TSB/CTL/HRV/sleep debt/grey-zone/injury), 4 option cards in canonical intensity order with blocked styling, uPlot 7-day outlook bars, frameworks mono footer, motion/react stagger reveal, rule-based/cached chips
- `frontend/src/components/dashboard/CoachChat.tsx` — portal drawer (480px desktop / full-width mobile), slide-in animation, streaming partial text with blinking caret, inline-mono data highlighting via regex, suggestion chips, auto-resize textarea, cmd/ctrl+enter submit, disabled state on 503
- `frontend/src/components/dashboard/WhyAmITired.tsx` — portal modal with severity dots, evidence paragraphs, "See raw data" JSON toggle
- `frontend/src/components/dashboard/TransparencyDrawer.tsx` — portal drawer, meta pills (model/generated-at/brief-id), collapsible sections for Safety Rails / Snapshot / System Prompt, copy-to-clipboard, custom JSON renderer
- `frontend/src/components/dashboard/ReadinessHero.tsx` — removed CoachNote placeholder; mounts <CoachBrief/>
- `frontend/src/components/dashboard/DashboardShell.tsx` — Ask coach button + CoachChat drawer state
- `frontend/src/components/dashboard/BiometricsDetail.tsx` — AdvancedMetricsStrip (EF live, decoupling/durability placeholders)
- `frontend/src/index.css` — prefers-reduced-motion respects new animations
- `frontend/package.json` — motion>=12 added

## Decisions Made

Key decisions captured in frontmatter. Summary:

1. **SSE over fetch+ReadableStream, not EventSource** — EventSource is GET-only; /coach/chat needs POST body. Auth token attached manually (axios interceptor doesn't wrap fetch)
2. **Blocked options render styled, not hidden** — preserves transparency: athlete sees what the LLM suggested AND what the rails filtered (with reason)
3. **Chat is ephemeral, brief is audit trail** — chat messages live in React state only; briefs persist via the 05-01 `coach_briefs` append-only table
4. **Evidence chips from the snapshot, not a side endpoint** — brief response already contains the evidence; parse chips client-side from TSB/CTL/HRV delta/sleep debt/grey-zone/injury signals
5. **Custom JSON renderer (no highlight.js)** — ~40 LOC, token-class coloured, zero added bundle cost
6. **Placeholder files for Task 2 unblock** — WhyAmITired and TransparencyDrawer stubs committed in Task 2 so CoachBrief compiles; Tasks 4/5 atomic-replace with full implementations
7. **Decoupling + durability tiles are placeholders** — backend computes both but /activities doesn't carry sample streams yet; tiles ready for /coach/metrics-trend
8. **503 disabled state, not failure toast** — chat UI degrades visibly with "Set ANTHROPIC_API_KEY" guidance; brief endpoint always succeeds via rule-based fallback
9. **motion/react over framer-motion** — newer package name, same ergonomics, installed cleanly with no peer-dep conflicts

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] uPlot bars path builder type cast**

- **Found during:** Task 2 (CoachBrief outlook chart)
- **Issue:** First implementation hand-rolled a custom bar path builder with a manual `{stroke, fill, clip}` return object and several layers of `as unknown as ...` coercion. While it would have worked at runtime, the TypeScript types for uPlot's `Series.PathBuilder` return type are more nuanced than the hand-cast, and the resulting code was fragile and confusing
- **Fix:** Replaced with uPlot's built-in `uPlot.paths.bars?.({ size: [0.55] })` factory — the idiomatic, typed way to draw bars. Removed all `as unknown as` casts
- **Verification:** `npx tsc -p tsconfig.app.json --noEmit` zero errors; build succeeds; bars render correctly at all viewport widths
- **Committed in:** `fbaa9eb` (Task 2 commit)

**2. [Rule 3 — Blocking] Stubbed dependency files during Task 2**

- **Found during:** Task 2 (CoachBrief imports WhyAmITired + TransparencyDrawer)
- **Issue:** CoachBrief wires "Why this?" and "What did the AI see?" to components that Tasks 4/5 create. Committing only CoachBrief would have produced `TS2307: Cannot find module './WhyAmITired'` — breaking the "each commit typechecks cleanly" invariant
- **Fix:** Created minimal stub components (1 line of JSX returning null) for WhyAmITired and TransparencyDrawer in Task 2's commit. Tasks 4 and 5 then atomically replace them with full implementations
- **Verification:** After each task commit: `npx tsc -p tsconfig.app.json --noEmit` exits clean
- **Committed in:** `fbaa9eb` (Task 2) then replaced by `820ad68` (Task 4) and `f163e1e` (Task 5)

**3. [Rule 2 — Missing Critical] prefers-reduced-motion**

- **Found during:** Task 8 (polish)
- **Issue:** Three new animations shipped (chat slide-in, transparency slide-in, streaming caret blink) with no concession to OS motion settings. Users who disable animations at the OS level had no opt-out
- **Fix:** Added `@media (prefers-reduced-motion: reduce)` rule in `index.css` that disables the slide animations and freezes the caret blink at 60% opacity
- **Committed in:** `b8a780e` (Task 8 commit)

**4. [Rule 2 — Missing Critical] TypeScript verification script**

- **Found during:** Task 1 (first typecheck)
- **Issue:** The plan's `verification` block calls `npx tsc --noEmit`, but the repo's root `tsconfig.json` uses `files: []` and `references`, meaning `tsc --noEmit` at the root exits 0 without checking anything. Would have allowed silent compile errors to sneak into commits
- **Fix:** All in-flight typechecks during this plan ran `npx tsc -p tsconfig.app.json --noEmit` to actually typecheck the app sources. `npm run build` (which uses `tsc -b`) also properly validates the project references at the end
- **Committed in:** documented here (no code change — this is a verification-script adjustment)

---

**Total deviations:** 4 auto-fixed (2 blocking, 2 missing critical)
**Impact on plan:** All deviations were small-scope corrections to preserve invariants (every commit compiles, animations respect OS settings, real typechecking runs). No scope creep or missed requirements.

## Authentication Gates

None encountered. The plan is entirely frontend; no CLI or API authentication was needed. Manual dashboard verification would require an authenticated session in the browser, but the code changes do not block on that.

## Issues Encountered

- **Root tsconfig.json silently ignores files** — `npx tsc --noEmit` at the repo root does nothing because the root config uses `files: []` with project references. Workaround: typecheck explicitly via `-p tsconfig.app.json`. `npm run build` runs `tsc -b` which walks the references correctly, so CI/production builds are safe; only local incremental typechecks need the flag
- **uPlot bars path builder typing** — `Series.PathBuilder` return type is more subtle than it appears; hand-rolled implementations need more coercion than is healthy. Switched to built-in `uPlot.paths.bars` factory

## User Setup Required

None. The coach UI works today against the live backend with zero additional configuration. Behaviour when no API key is set:

- `<CoachBrief>` still renders — backend returns rule-based brief; "AI offline · rule-based" chip is visible
- `<CoachChat>` drawer opens but input is disabled with explicit "Set ANTHROPIC_API_KEY in backend/.env" copy
- `<WhyAmITired>` and `<TransparencyDrawer>` work fully — they don't depend on the LLM

Adding `ANTHROPIC_API_KEY` to `backend/.env` (already documented in 05-01-SUMMARY) enables the real Claude brief + chat; the frontend automatically picks this up on the next brief fetch (6h cache TTL) or can be force-refreshed via the brief's refresh button.

## Next Phase Readiness

- **Phase 5 complete.** Both the backend coach (Wave 1) and the frontend coach surface (Wave 2) are shipped. The app now has a causal AI brief on the dashboard, a streaming chat drawer, and a transparency path — the three surfaces the research flagged as missing from mainstream consumer fitness AI
- **Phase 6 (training-plan-generation) can start** — the coach snapshot and brief are live, giving the plan generator a grounded context to extend from
- **Concerns:**
  - When a /coach/metrics-trend backend endpoint ships, `AdvancedMetricsStrip` will need a two-line update to pass through real decoupling + durability values — shape is already in place
  - The frontend typecheck script mismatch (root `tsc --noEmit` doing nothing) should be corrected in a future housekeeping pass — `npm run build` catches everything, but a `"typecheck": "tsc -p tsconfig.app.json --noEmit"` script in `package.json` would make incremental checks bullet-proof
  - First brief fetch after enabling `ANTHROPIC_API_KEY` will hit Opus latency (~3-6s) — the skeleton loader handles this, but a slightly-nicer loading copy specifically for "LLM is thinking" would be a polish win in a future pass

---
*Phase: 05-ai-coaching-core*
*Completed: 2026-04-20*
