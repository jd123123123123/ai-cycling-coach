# Dashboard Storyline — Phase 2a (Heute) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the Heute chapter on the narrative kit — its coach prose becomes the shared `CoachRead` component, it gains the `NextChapter` handoff that closes the chapter, and `MorningHealthCard` leaves for Körper.

**Architecture:** Phase 1 built `CoachRead` but never rendered it, so it has never been visually validated. Heute renders over a live WebGL readiness aura, and `CoachRead`'s translucent purple ground is the exact bug TodayTab's own coach card already fixed once. So Task 1 hardens `CoachRead` against that aura first; only then does Heute consume it. Nothing else about Heute's content changes — no card is cut except `MorningHealthCard`, which has a named destination in 2b.

**Tech Stack:** React 19 + TypeScript, Vite, vitest + jsdom + @testing-library/react, react-router-dom, lucide-react.

## Global Constraints

- **Mobile-only.** Target viewport 390×844. Desktop is a sanity check, never a design target.
- **Bike-only.** No sport branches.
- **German + English.** Every user-visible string is `de ? '…' : '…'` or goes through `tFor(locale, key)`. No untranslated copy.
- **Honest empties.** A missing figure renders `—`, never a zero or a guess.
- **Existing tokens only.** `--color-accent` `#FF5A3C`, purple `#8B5CF6` family, `--color-ink`, `--color-muted`, `--color-rule`. Introduce no new colours.
- **The aura rule.** Heute paints a full-screen WebGL readiness aura behind all its content (`DashboardShell` renders it; `TodayTab` publishes the state colour). Any card that sits on Heute needs its own dark ground — a translucent tint lets the aura through and fails contrast on the light faces (planned-rest `#3E9BFF`, ready `#16E08A`). This is documented in `TodayTab.tsx` at the coach card and is not a matter of taste.
- **Pre-existing findings are not yours.** `npx eslint` reports pre-existing errors on `TodayTab.tsx` and two accepted `react-refresh/only-export-components` findings (`ChapterBar.tsx`, `MobileBottomNav.tsx`). `src/auraprobe.tsx` is an untracked scratch file. Compare against the pre-change output; do not "fix" any of these.
- **Verification is a rendered frame.** This phase changes visual structure, so a screenshot at 390×844 is required, not just green gates.

---

## File Structure

**Modify:**
- `frontend/src/components/narrative/CoachRead.tsx` — harden for aura-backed pages; add an optional coach orb.
- `frontend/src/components/narrative/__tests__/narrativeKit.test.tsx` — add the two regression tests for the above.
- `frontend/src/components/dashboard/tabs/TodayTab.tsx` — consume `CoachRead`, add `NextChapter`, drop `MorningHealthCard`.

No new files. `NextChapter` and `CoachRead` already exist from Phase 1; this plan makes them real consumers.

---

### Task 1: Harden `CoachRead` for the aura, and give it the coach's orb

`CoachRead` was built in Phase 1 and has zero consumers, so its styling has never met a real background. Two things are wrong for its first real use:

1. Its ground is `#8B5CF612` — a *transparent* 12 % purple wash. `TodayTab.tsx` (~line 1486) uses `color-mix(in srgb, #8B5CF6 12%, #0A0C0FCC)` instead, and the comment above it records why: the transparent wash let the readiness aura through and, on the light faces, turned the card pale lavender with near-invisible body text and eyebrow. Consuming `CoachRead` as-is would re-introduce a bug this codebase already fixed.
2. It has no orb. The existing card carries a gradient orb with a `BrainCircuit` glyph — the coach's visual identity.

**Files:**
- Modify: `frontend/src/components/narrative/CoachRead.tsx` (whole component)
- Test: `frontend/src/components/narrative/__tests__/narrativeKit.test.tsx` (extend the existing `describe('CoachRead')` block; do not touch the other describes)

**Interfaces:**
- Consumes: `Link` from `react-router-dom`; `ChevronRight` and `type LucideIcon` from `lucide-react`.
- Produces, for Task 2 and for 2b:

```ts
export interface CoachReadProps {
  eyebrow: string
  body: string
  to?: string
  /** Renders the coach's gradient orb with this glyph inside. Omit for no orb. */
  icon?: LucideIcon
  children?: React.ReactNode
}
export default function CoachRead(props: CoachReadProps): JSX.Element
```

The rendered card carries `data-coach-read` on its inner card element, and `data-coach-orb` on the orb when one is rendered.

- [ ] **Step 1: Write the failing tests**

In `frontend/src/components/narrative/__tests__/narrativeKit.test.tsx`, add `BrainCircuit` to the existing `lucide-react` import (add the import line if the file has none), and replace the existing `describe('CoachRead', …)` block with this one. The first test in it is the file's existing test, unchanged — keep it:

```tsx
describe('CoachRead', () => {
  it('renders the coach prose under its eyebrow', () => {
    wrap(<CoachRead eyebrow="DEIN COACH" body="Du bist frisch — nutze es." />)
    expect(screen.getByText('DEIN COACH')).toBeTruthy()
    expect(screen.getByText('Du bist frisch — nutze es.')).toBeTruthy()
  })

  it('grounds itself darkly instead of as a translucent purple wash', () => {
    // Heute renders this over a live WebGL readiness aura. A transparent
    // #8B5CF612 wash let that aura through and left the body text and eyebrow
    // near-invisible on the light faces (planned-rest #3E9BFF, ready #16E08A)
    // — a bug already found and fixed once in TodayTab's own coach card. The
    // dark ground is what survives every aura state, so it is asserted here
    // rather than left to whoever next edits this file.
    const { container } = wrap(<CoachRead eyebrow="E" body="B" />)
    const card = container.querySelector('[data-coach-read]') as HTMLElement
    expect(card).toBeTruthy()
    expect(card.style.background).toContain('#0A0C0F')
  })

  it('renders the coach orb only when given a glyph', () => {
    const { container: withOrb } = wrap(<CoachRead eyebrow="E" body="B" icon={BrainCircuit} />)
    expect(withOrb.querySelector('[data-coach-orb]')).toBeTruthy()
    const { container: without } = wrap(<CoachRead eyebrow="E" body="B" />)
    expect(without.querySelector('[data-coach-orb]')).toBeNull()
  })

  it('still becomes a link when given a destination', () => {
    const { container } = wrap(<CoachRead eyebrow="E" body="B" to="/coach" />)
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/coach')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/narrative/__tests__/narrativeKit.test.tsx`
Expected: the two new tests FAIL — no `[data-coach-read]` element exists, and `icon` is not a valid prop (a TypeScript error at the `icon={BrainCircuit}` call site). The two pre-existing tests still pass.

- [ ] **Step 3: Rewrite the component**

Replace the whole body of `frontend/src/components/narrative/CoachRead.tsx` with:

```tsx
/**
 * CoachRead — what the chapter's numbers mean, in sentences.
 *
 * Purple is the app's established "this is the coach talking, not a
 * measurement" signal (pen Coach's Read, node qyeQT). Keeping it visually
 * distinct from evidence cards is what lets a reader skip interpretation and
 * go straight to data, or the reverse.
 *
 * ── Why the ground is dark, not a purple wash ──
 * This card's first real home is Heute, which paints a full-screen WebGL
 * readiness aura behind everything. A translucent 12 % purple (#8B5CF612) let
 * that aura through: on the light faces — planned-rest #3E9BFF, ready #16E08A
 * — the card became pale lavender carrying near-white body text and a #C4B5FD
 * eyebrow that disappeared outright. TodayTab's own coach card hit this and
 * fixed it by mixing the same 12 % purple into a DARK ground and moving the
 * purple identity to the border, the orb and the eyebrow, where it reads. That
 * fix lives here now, so every chapter inherits it instead of rediscovering it.
 */
import { Link } from 'react-router-dom'
import { ChevronRight, type LucideIcon } from 'lucide-react'

export interface CoachReadProps {
  eyebrow: string
  body: string
  to?: string
  /** Renders the coach's gradient orb with this glyph inside. Omit for no orb. */
  icon?: LucideIcon
  children?: React.ReactNode
}

export default function CoachRead({ eyebrow, body, to, icon: Icon, children }: CoachReadProps) {
  const inner = (
    <div
      data-coach-read
      className="flex gap-3 rounded-[24px] p-4"
      style={{
        background: 'color-mix(in srgb, #8B5CF6 12%, #0A0C0FCC)',
        border: '1px solid #8B5CF659',
        backdropFilter: 'blur(10px)',
      }}
    >
      {Icon ? (
        <div
          data-coach-orb
          className="shrink-0 grid place-items-center rounded-full"
          style={{
            width: 38, height: 38,
            background: 'linear-gradient(45deg, #8B5CF6, #59C3FF)',
            boxShadow: '0 0 12px #8B5CF666',
          }}
        >
          <Icon size={20} strokeWidth={2} style={{ color: '#FFFFFF' }} />
        </div>
      ) : null}
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="eyebrow" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', color: '#C4B5FD' }}>{eyebrow}</span>
          {to ? <ChevronRight size={16} className="shrink-0" style={{ color: '#C4B5FD' }} /> : null}
        </div>
        <p style={{ fontSize: 13.5, fontWeight: 500, color: '#FFFFFFF2', lineHeight: 1.4 }}>{body}</p>
        {children}
      </div>
    </div>
  )
  return to ? <Link to={to} className="hover-card block">{inner}</Link> : inner
}
```

Note the eyebrow colour moved from `#B79DFF` to `#C4B5FD` and the body type from 14/`--color-ink` to 13.5/`#FFFFFFF2` — these are the values TodayTab's card actually ships, and they are legible on the dark ground. This is deliberate alignment with the shipped card, not drift.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/narrative/`
Expected: PASS — all `ChapterBar` tests plus the kit tests including the two new ones.

- [ ] **Step 5: Typecheck and commit**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: no new findings.

```bash
git add frontend/src/components/narrative/CoachRead.tsx frontend/src/components/narrative/__tests__/narrativeKit.test.tsx
git commit -m "fix(narrative): CoachRead needs a dark ground, not a purple wash

Built in phase 1 with zero consumers, so its styling never met a real
background. Its first home is Heute, which paints a full-screen WebGL
readiness aura — and a translucent 12% purple is exactly what TodayTab's
own coach card already found and fixed: on the light faces the card went
pale lavender with an eyebrow that vanished. That fix now lives in the
shared component, with the coach's gradient orb as an opt-in glyph, so
every chapter inherits it rather than rediscovering it."
```

---

### Task 2: Heute consumes `CoachRead`

**Files:**
- Modify: `frontend/src/components/dashboard/tabs/TodayTab.tsx` — the coach-card block (locate it with `grep -n "8B5CF6 12%" src/components/dashboard/tabs/TodayTab.tsx`, currently ~line 1476–1500, inside the Drivers/Coach/Momentum group)

**Interfaces:**
- Consumes: `CoachRead` (default export) from `../../narrative/CoachRead`, with the props Task 1 produced.

- [ ] **Step 1: Replace the inline card**

The current block is a `{coachMessage && ( <Link to="/coach" …> … </Link> )}` carrying a 38 px gradient orb, a `BrainCircuit` glyph, an eyebrow from `tFor(locale, 'coach_label')`, and `{coachMessage}` as body text. Replace the entire `{coachMessage && (…)}` expression — including the long explanatory comment above it, whose content now lives in `CoachRead.tsx` — with:

```tsx
          {/* Coach card (pen CoachCard) — the coach's read for today. The
              purple identity, the dark aura-proof ground and the orb all live
              in <CoachRead> now, shared with every other chapter. */}
          {coachMessage && (
            <CoachRead
              eyebrow={tFor(locale, 'coach_label')}
              body={coachMessage}
              to="/coach"
              icon={BrainCircuit}
            />
          )}
```

Add `import CoachRead from '../../narrative/CoachRead'` alongside the file's other component imports.

- [ ] **Step 2: Check for imports that just went unused**

Run: `grep -n "BrainCircuit" src/components/dashboard/tabs/TodayTab.tsx`

`BrainCircuit` is still passed as the `icon` prop, so its import stays. Now check the others the deleted markup used:

Run: `grep -c "hover-card" src/components/dashboard/tabs/TodayTab.tsx`

If any import became unused, `npx tsc -b --noEmit` will say so in the next step — remove exactly what it names, nothing more.

- [ ] **Step 3: Typecheck and run the suite**

Run: `cd frontend && npx tsc -b --noEmit && npx vitest run`
Expected: clean typecheck, full suite green. The suite has no `TodayTab` render test (only pure-helper tests in `tabs/__tests__/`), so a green run here proves nothing visual — Task 4 does that.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/dashboard/tabs/TodayTab.tsx
git commit -m "refactor(today): the coach card becomes the shared CoachRead

Same ground, same orb, same type — the markup and its hard-won contrast
notes now live in the kit component instead of inline in a 1,668-line
file, so Körper and the other chapters get the identical treatment for
free."
```

---

### Task 3: Close the chapter — add `NextChapter`, hand `MorningHealthCard` off

Two single-element changes to the same render tree.

**Files:**
- Modify: `frontend/src/components/dashboard/tabs/TodayTab.tsx`

**Interfaces:**
- Consumes: `NextChapter` (default export) from `../../narrative/NextChapter`, props `{ from: ChapterId; de: boolean }`. Passing `from="today"` makes it link to `/dashboard?tab=plan` and read "WEITER — WO DAS HINGEHT" / "NEXT — WHERE THIS IS GOING"; the component derives both from `nextChapter()` and `CHAPTER_TITLES`, so no strings are passed.

- [ ] **Step 1: Add the handoff at the end of the chapter**

Find the end of the component's return (`grep -n "methods.sheet" src/components/dashboard/tabs/TodayTab.tsx` — currently ~line 1592). Insert immediately **before** the `{methods.sheet}` line:

```tsx
      {/* Chapter handoff — every chapter names the next one, which is what
          makes four pages read as one document rather than four menus. Last
          element before the methods drawer, which is an overlay, not content. */}
      <NextChapter from="today" de={de} />
```

Add `import NextChapter from '../../narrative/NextChapter'` alongside the other component imports.

- [ ] **Step 2: Remove `MorningHealthCard`**

Find it with `grep -n "MorningHealthCard" src/components/dashboard/tabs/TodayTab.tsx` (currently the import at ~line 35, a mention in a comment at ~line 65, and the mount at ~line 1159).

Delete the mount and the explanatory comment above it, and delete the import. In the comment at ~line 65 that lists the Today card components, remove `MorningHealthCard` from the list so the comment stays true.

Replace the deleted mount with a comment recording where it went, so the next reader does not think it was lost:

```tsx
      {/* MorningHealthCard moved to Körper (phase 2b) — an illness / downturn
          cluster from overnight vitals is a body signal, and Körper is where
          every body signal now lives. It is mounted nowhere between 2a and 2b
          shipping; that gap is one deploy cycle and is deliberate, rather than
          inventing a third temporary home for a card that has a real one. */}
```

- [ ] **Step 3: Typecheck and run the suite**

Run: `cd frontend && npx tsc -b --noEmit && npx vitest run`
Expected: clean typecheck (it will flag the `MorningHealthCard` import if you missed it), full suite green.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/dashboard/tabs/TodayTab.tsx
git commit -m "feat(today): close the chapter, hand the health card to Körper

Heute now ends by naming the next chapter instead of just stopping.
MorningHealthCard leaves for Körper, where every body signal lives after
2b; it is mounted nowhere for the one deploy cycle in between, which is
the smallest honest gap rather than a third temporary home."
```

---

### Task 4: Verify at 390×844 and ship

- [ ] **Step 1: Full gates**

```bash
cd frontend && npx tsc -b --noEmit && npx vitest run && npx eslint src/components/narrative src/components/dashboard/tabs/TodayTab.tsx
```

Compare the eslint output against the same command with your changes stashed, so pre-existing `TodayTab.tsx` findings are not attributed to this work.

- [ ] **Step 2: Render Heute and read it**

Dev servers: backend on `:8042`, frontend on `:5180` (the backend's `CORS_ORIGINS` allowlists only 5173 and 5180). DB on `:5433`.

At 390×844, load `/dashboard?tab=today` and check, by eye and not by grep:

1. The coach card is **legible** — eyebrow and body both readable against the aura. This is the whole point of Task 1, and it is the one thing no test can prove.
2. It still looks like the coach speaking — purple border, gradient orb, distinct from the plain evidence cards around it.
3. `NextChapter` sits at the very bottom, reads "WEITER — WO DAS HINGEHT", and its tap goes to Plan.
4. `MorningHealthCard` is gone and nothing is left behind where it was — no gap, no orphaned spacing.

Screenshot it. If the readiness state happens to be a dark face (e.g. `strain`), also check a light face if you can reach one, since the light faces are where the old wash failed.

- [ ] **Step 3: Build**

```bash
cd frontend && npm run build
```

- [ ] **Step 4: Deploy and verify by bytes, not by status**

Railway is CLI-only for this project — `git push` deploys nothing.

```bash
cd /Users/jannisdeters/Downloads/ai-cycling-coach && railway up --detach
```

Poll `railway deployment list --json` until `SUCCESS`, then byte-compare every built asset against what production serves:

```bash
URL="https://ai-cycling-coach-api-production.up.railway.app"
for f in frontend/dist/assets/*.js frontend/dist/assets/*.css; do
  n=$(basename "$f")
  curl -s "$URL/assets/$n" -o /tmp/s.bin
  cmp -s /tmp/s.bin "$f" || echo "MISMATCH: $n"
done
curl -s -D - -o /dev/null "$URL/" | grep -i cache-control   # must be no-cache
curl -s -o /dev/null -w "%{http_code}\n" "$URL/health"      # must be 200
```

- [ ] **Step 5: Push**

```bash
git push origin main
```

---

## Self-Review

**Spec coverage.** Heute's Read slot → Tasks 1–2. Heute's Next slot → Task 3. `MorningHealthCard` handoff → Task 3. Hero, Moment and Evidence slots require no change per the spec (Hero and Evidence are already correct; `SessionOfTheDay` keeps its own styling by explicit decision) — so they correctly have no task. Fitness & Frische and "Wohin das führt" are Phase 3 and are untouched here, as the spec requires.

**One thing the spec did not anticipate, resolved in Task 1.** The spec says Heute's Read is "extracted into `<CoachRead>` (built in Phase 1, unconsumed until now)" and treats that as a lift-and-drop. It is not: `CoachRead`'s `#8B5CF612` translucent ground is the precise bug `TodayTab` already fixed for this exact surface, so consuming it unchanged would regress a documented contrast fix. Task 1 therefore hardens the shared component *before* Heute consumes it, and asserts the dark ground in a test so the next editor cannot undo it silently. This is a correction to the spec's assumption, not a scope expansion — the deliverable is unchanged.

**Placeholder scan.** No TBDs. Every step names exact files, exact anchors to grep for (line numbers are given as "currently ~N" because `TodayTab.tsx` is edited by three of these tasks and numbers drift), and complete code.

**Type consistency.** `CoachReadProps` is defined once in Task 1 and consumed in Task 2 with exactly those four props (`eyebrow`, `body`, `to`, `icon`). `NextChapter`'s `{ from, de }` matches the Phase 1 component already on `main`. `data-coach-read` and `data-coach-orb` are the attribute names in both the Task 1 tests and the Task 1 implementation.
