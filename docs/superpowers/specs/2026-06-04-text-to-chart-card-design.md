# Text → Chart Card — Design Spec

**Date:** 2026-06-04
**Status:** Approved for planning

## Goal

Let an athlete create a dashboard chart card by typing a plain-English phrase
(e.g. *"weekly TSS for the last 3 months"*). Claude interprets the phrase into
a `ChartSpec`, which opens in the existing ChartBuilder (preloaded) for
preview/tweak, then is committed via the existing "add chart" path.

This is the ONLY new capability. The edit mode (drag-reorder, resize, delete),
dashboard persistence (create/open/rename/delete/list on `/dashboards`), and
the 15-chart cap already exist and are reused unchanged.

## Decisions (locked during brainstorming)

| Question | Decision |
|---|---|
| What "create by text" produces | An **AI-built data chart** only. No note cards, no single-stat cards. |
| Where text-created cards live | The **`/dashboards` canvas** (the existing customizable dashboards). NOT the main Today/Train/Trends tabs. |
| Flow | **Preview-then-add**: the interpreted spec opens in the existing ChartBuilder so the user can tweak before committing. No instant-add. |

## Architecture

### Data flow

```
DashboardsPage DetailView (edit mode)
  → ChartTextPrompt: user types phrase, submits
    → interpretChart(text)               [frontend api/analytics.ts]
      → POST /analytics/interpret {text}  [backend]
        → chart_interpreter.interpret_chart(text)
            · system prompt built from DATASETS allowlist (datasets+columns+aggs+marks)
            · Claude structured output (temperature=0) → candidate ChartSpec JSON
            · validate against ChartSpec Pydantic model; 1 retry on failure
            · returns ChartSpec  (or raises → 422 / 503)
      ← ChartSpec
  → open existing <ChartBuilder initial={spec}>   (preview / tweak)
  → existing handleAddChart(spec)                  (cap-check + id mint + state update)
  → existing Save (PUT /dashboards/{id})           (persist)
```

### Backend components

**`app/services/chart_interpreter.py`** (new) — pure-ish orchestration:
- `build_system_prompt() -> str`: composes the dataset/column/aggregation/mark
  contract from `analytics_query.list_datasets()` (single source of truth for
  the allowlist) plus the `ChartSpec`/`QuerySpec` shape. Module-level constant
  parts cached; the dataset list is read at call time so new columns propagate.
- `async interpret_chart(text: str) -> ChartSpec`: calls
  `anthropic.AsyncAnthropic` with `model=settings.COACH_MODEL`,
  `temperature=0`, a tool/structured-output schema mirroring `ChartSpec`, the
  system prompt cached via `cache_control: ephemeral` (mirrors
  `/analytics/summarize`). Parses + validates the result into a `ChartSpec`.
  On validation failure, retries once with the validation error appended to
  the prompt. On second failure raises `ChartInterpretError`. When
  `settings.ANTHROPIC_API_KEY` is unset, raises `ChartInterpretError` with a
  message the UI surfaces (no rule-based NL fallback — out of scope).

**`app/api/analytics.py`** (edit) — add:
- `class InterpretRequest(BaseModel): text: str = Field(min_length=1, max_length=400)`
- `POST /analytics/interpret`, `response_model=ChartSpec`, auth via
  `get_current_active_user` (no DB needed — interpretation is stateless;
  query execution/RLS happens later when the card renders). Maps
  `ChartInterpretError` → `422` (bad/uninterpretable phrase) and missing key →
  `503`.

**Reused, unchanged:** `ChartSpec` + `QuerySpec` Pydantic models; the
`execute_query` compiler already validates every column against the allowlist
and is RLS-scoped, so a malformed/hostile spec cannot exfiltrate other tables
or users — defense in depth already exists at render time.

### Frontend components

**`api/analytics.ts`** (edit) — add `interpretChart(text: string): Promise<ChartSpec>`
posting to `/analytics/interpret`.

**`components/charts/ChartTextPrompt.tsx`** (new) — a compact text input +
submit button + loading/error state. Props:
`{ onSpec: (spec: ChartSpec) => void; disabled?: boolean }`. On submit it calls
`interpretChart`, and on success calls `onSpec(spec)`; on error shows an inline
message (e.g. *"Couldn't turn that into a chart — try naming a metric like TSS,
HRV, or sleep."*). Reuses existing design tokens.

**`pages/DashboardsPage.tsx` DetailView** (edit) — in edit mode, render
`<ChartTextPrompt>` next to the existing "Add chart" button. `onSpec` opens the
existing `ChartBuilder` modal with `initial={spec}` (the builder already
supports a preloaded spec for editing). The builder's existing confirm path
calls `handleAddChart`, so commit/cap/persistence are unchanged.

## Error handling & edge cases

- **Uninterpretable phrase** → backend `422`; UI shows the inline hint, no card added.
- **AI returns invalid spec** → one retry server-side; if still invalid, `422`.
- **No API key / Claude failure** → `503`; UI shows "AI card creation is
  unavailable right now."
- **Chart cap (15)** → already enforced by `handleAddChart` and the server PUT;
  the text path inherits it (the preview/add step is the same code).
- **Empty input** → submit disabled / `min_length` rejects.

## Testing strategy

- Backend unit tests (pytest, asyncio): mocked `AsyncAnthropic` returning a
  valid `ChartSpec` → endpoint returns it; returning an invalid shape twice →
  `422`; `ANTHROPIC_API_KEY` unset → `503`; system prompt includes the real
  dataset column names from `list_datasets()`.
- Frontend: type-check + lint; manual drive — type a phrase, see it preview in
  the builder, tweak, add, save, reload (persists). Try a nonsense phrase →
  inline error, no card.

## Out of scope (YAGNI)

- Note/markdown cards and single-stat cards.
- Adding custom cards to the main Today/Train/Trends tabs.
- Instant-add (no preview).
- A conversational/multi-turn refinement loop (single phrase → single spec;
  further tweaks happen in the existing builder).
- Editing an existing card by text (text path only creates new cards).

## Non-obvious integration notes

- `list_datasets()` in `analytics_query.py` is the single source of truth for
  valid datasets/columns; the interpreter prompt must derive from it (not a
  hardcoded copy) so schema changes propagate and the LLM can't be told about
  columns the compiler would later reject.
- The `ChartSpec` Pydantic model (nested `QuerySpec`) doubles as the structured
  -output schema for Claude — no separate response model to maintain.
- Mirror the caching + graceful-degradation conventions already used by
  `/analytics/summarize` (cached system block, `COACH_MODEL`, defensive
  parsing of `response.content`).
