# Text → Chart Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user type a plain-English phrase on a `/dashboards` dashboard and have Claude turn it into a chart card, which opens in the existing ChartBuilder (preloaded) for preview/tweak before being added.

**Architecture:** A new backend service `chart_interpreter.py` calls Claude with a tool whose input schema mirrors `ChartSpec`, using the existing `list_datasets()` allowlist as the prompt's column contract; a thin `POST /analytics/interpret` route validates and returns the `ChartSpec`. The frontend adds a small text-prompt input to the dashboards edit toolbar that calls the endpoint and opens the **existing** `ChartBuilder` with the result as a draft. Everything else (edit mode, drag/reorder/delete, save, persistence, 15-chart cap) is reused unchanged.

**Tech Stack:** FastAPI + Pydantic + Anthropic SDK (backend); React 19 + TS + TanStack Query (frontend). Reuses `ChartSpec`/`QuerySpec` models, `ChartBuilder`, `handleAddChart`, `DashboardCanvas`.

**Builds on spec:** `docs/superpowers/specs/2026-06-04-text-to-chart-card-design.md`.

---

## File Structure

**Backend (create):**
- `backend/app/services/chart_interpreter.py` — prompt builder + Claude call + validation. One job: text → validated `ChartSpec`.
- `backend/tests/test_chart_interpreter.py` — unit tests (mocked Claude).

**Backend (modify):**
- `backend/app/api/analytics.py` — add `InterpretRequest` + `POST /analytics/interpret`.

**Frontend (create):**
- `frontend/src/components/charts/ChartTextPrompt.tsx` — text input + submit + loading/error; calls the API and hands back a `ChartSpec`.

**Frontend (modify):**
- `frontend/src/api/analytics.ts` — add `interpretChart(text)`.
- `frontend/src/pages/DashboardsPage.tsx` — render the prompt in edit mode; open the builder with the AI draft.

---

## Conventions (read once)
- Backend tests: `cd backend && uv run pytest`.
- Frontend type-check: `cd frontend && npx tsc -b --noEmit 2>&1 | grep <file>` — the project has ~22 PRE-EXISTING unrelated tsc errors; only failures referencing your touched files matter.
- Mirror the existing `/analytics/summarize` Anthropic conventions: `anthropic.AsyncAnthropic`, `model=settings.COACH_MODEL`, system block with `cache_control: {"type": "ephemeral"}`, defensive parsing of `response.content`.

---

### Task 1: chart_interpreter service

**Files:**
- Create: `backend/app/services/chart_interpreter.py`
- Test: `backend/tests/test_chart_interpreter.py`

- [ ] **Step 1: Write the failing tests**

```python
"""Unit tests for chart_interpreter — text → ChartSpec via (mocked) Claude."""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.schemas.user_dashboard import ChartSpec
from app.services import chart_interpreter
from app.services.chart_interpreter import (
    ChartInterpretError,
    build_system_prompt,
    interpret_chart,
)

VALID_INPUT = {
    "title": "Weekly TSS",
    "mark": "bar",
    "query": {
        "dataset": "activities",
        "dimensions": [{"column": "started_at", "time_grain": "week"}],
        "measures": [{"column": "tss", "aggregation": "sum", "alias": "total_tss"}],
        "filters": [],
        "order_by": "started_at",
        "order_dir": "asc",
    },
    "encoding": {"x": "started_at", "y": "total_tss"},
}


def _fake_response(tool_input):
    """A messages.create() return value carrying one emit_chart tool_use block."""
    block = SimpleNamespace(type="tool_use", name="emit_chart", input=tool_input)
    return SimpleNamespace(content=[block])


def _patch_anthropic(monkeypatch, *responses):
    """Patch anthropic.AsyncAnthropic so messages.create yields the given
    responses in order."""
    import anthropic

    create = AsyncMock(side_effect=list(responses))
    client = MagicMock()
    client.messages = MagicMock(create=create)
    monkeypatch.setattr(anthropic, "AsyncAnthropic", MagicMock(return_value=client))
    monkeypatch.setattr(chart_interpreter.settings, "ANTHROPIC_API_KEY", "test-key")
    return create


class TestBuildSystemPrompt:
    def test_includes_real_dataset_columns(self):
        prompt = build_system_prompt()
        # Columns come from list_datasets() — must mention real ones.
        assert "activities" in prompt and "daily_metrics" in prompt
        assert "tss" in prompt and "hrv_status" in prompt
        # And the allowed aggregations / marks.
        assert "avg" in prompt and "scatter" in prompt


@pytest.mark.asyncio
class TestInterpretChart:
    async def test_valid_spec_returned(self, monkeypatch):
        _patch_anthropic(monkeypatch, _fake_response(VALID_INPUT))
        spec = await interpret_chart("weekly tss")
        assert isinstance(spec, ChartSpec)
        assert spec.mark == "bar"
        assert spec.query.dataset == "activities"
        assert spec.encoding.y == "total_tss"

    async def test_retries_once_then_succeeds(self, monkeypatch):
        bad = {"mark": "bar", "query": {"dataset": "activities", "measures": []},
               "encoding": {"x": "started_at", "y": "total_tss"}}  # measures empty → invalid
        create = _patch_anthropic(
            monkeypatch, _fake_response(bad), _fake_response(VALID_INPUT)
        )
        spec = await interpret_chart("weekly tss")
        assert isinstance(spec, ChartSpec)
        assert create.await_count == 2  # retried once

    async def test_invalid_twice_raises(self, monkeypatch):
        bad = {"mark": "bar", "query": {"dataset": "activities", "measures": []},
               "encoding": {"x": "x", "y": "y"}}
        _patch_anthropic(monkeypatch, _fake_response(bad), _fake_response(bad))
        with pytest.raises(ChartInterpretError):
            await interpret_chart("nonsense")

    async def test_no_tool_call_raises(self, monkeypatch):
        empty = SimpleNamespace(content=[SimpleNamespace(type="text", text="hi")])
        _patch_anthropic(monkeypatch, empty, empty)
        with pytest.raises(ChartInterpretError):
            await interpret_chart("???")

    async def test_no_api_key_raises(self, monkeypatch):
        monkeypatch.setattr(chart_interpreter.settings, "ANTHROPIC_API_KEY", None)
        with pytest.raises(ChartInterpretError) as exc:
            await interpret_chart("weekly tss")
        assert exc.value.code == "no_key"
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd backend && uv run pytest tests/test_chart_interpreter.py -q`
Expected: FAIL — `ModuleNotFoundError`/`ImportError` (module + symbols not defined).

- [ ] **Step 3: Write the implementation**

Create `backend/app/services/chart_interpreter.py`:

```python
"""Turn a plain-English phrase into a validated ChartSpec via Claude tool-use.

The model is given the real dataset/column allowlist (from analytics_query.
list_datasets — single source of truth) and a forced tool whose input mirrors
ChartSpec. The result is validated by the ChartSpec Pydantic model; a malformed
spec triggers one retry, then ChartInterpretError. Even if a bad column slips
through, execute_query (RLS + allowlist) rejects it at render time — this layer
is best-effort interpretation, not the security boundary.
"""
from __future__ import annotations

import logging

from pydantic import ValidationError

from app.config import settings
from app.schemas.user_dashboard import ChartSpec
from app.services.analytics_query import list_datasets

logger = logging.getLogger(__name__)


class ChartInterpretError(Exception):
    """Raised when a phrase cannot be turned into a valid ChartSpec.

    `code` is 'no_key' (Claude unavailable) or 'invalid' (uninterpretable).
    """

    def __init__(self, message: str, code: str = "invalid") -> None:
        super().__init__(message)
        self.code = code


_CHART_TOOL = {
    "name": "emit_chart",
    "description": "Emit the chart specification that answers the user's request.",
    "input_schema": {
        "type": "object",
        "properties": {
            "title": {"type": "string", "description": "Short human title for the chart."},
            "mark": {"type": "string", "enum": ["line", "area", "bar", "scatter"]},
            "query": {
                "type": "object",
                "properties": {
                    "dataset": {"type": "string", "enum": ["activities", "daily_metrics"]},
                    "dimensions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "column": {"type": "string"},
                                "time_grain": {"type": "string", "enum": ["day", "week", "month", "year"]},
                                "alias": {"type": "string"},
                            },
                            "required": ["column"],
                        },
                    },
                    "measures": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "column": {"type": "string"},
                                "aggregation": {"type": "string", "enum": ["count", "sum", "avg", "min", "max", "p50", "p95"]},
                                "alias": {"type": "string"},
                            },
                            "required": ["column", "aggregation"],
                        },
                    },
                    "filters": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "column": {"type": "string"},
                                "op": {"type": "string", "enum": ["eq", "ne", "in", "gt", "gte", "lt", "lte"]},
                                "value": {},
                            },
                            "required": ["column", "op"],
                        },
                    },
                    "start_date": {"type": "string", "description": "YYYY-MM-DD"},
                    "end_date": {"type": "string", "description": "YYYY-MM-DD"},
                    "order_by": {"type": "string"},
                    "order_dir": {"type": "string", "enum": ["asc", "desc"]},
                },
                "required": ["dataset", "measures"],
            },
            "encoding": {
                "type": "object",
                "properties": {
                    "x": {"type": "string"},
                    "y": {"type": "string"},
                    "series": {"type": "string"},
                },
                "required": ["x", "y"],
            },
        },
        "required": ["mark", "query", "encoding"],
    },
}


def build_system_prompt() -> str:
    """Compose the dataset/column contract from the live allowlist so the model
    can only reference columns the query compiler will accept."""
    datasets = list_datasets()
    lines = [
        "You convert an athlete's request into ONE chart specification by calling "
        "the emit_chart tool. You only have these datasets and columns:",
        "",
    ]
    for ds_id, ds in datasets.items():
        cols = ", ".join(f"{c['name']} ({c['type']})" for c in ds["columns"])
        lines.append(f"- {ds_id} (time column: {ds['time_column']}): {cols}")
    lines += [
        "",
        "Rules:",
        "- Pick exactly one dataset. Use ONLY its columns above — never invent columns.",
        "- A chart is one X dimension + one Y measure (optionally split by a 'series').",
        "- For a time trend, make the X dimension the time column with a time_grain "
        "(day/week/month/year) and set mark to 'line' or 'bar'.",
        "- Aggregations: count, sum, avg, min, max, p50, p95.",
        "- Give the measure an explicit alias and set encoding.y to that alias. "
        "Set encoding.x to the X dimension's column name.",
        "- For relative ranges ('last 3 months') set query.start_date/end_date "
        "as YYYY-MM-DD using today as the end; otherwise omit them.",
        "- Always call emit_chart. Never answer in prose.",
    ]
    return "\n".join(lines)


def _extract_tool_input(response) -> dict | None:
    for block in getattr(response, "content", None) or []:
        if getattr(block, "type", None) == "tool_use" and getattr(block, "name", None) == "emit_chart":
            inp = getattr(block, "input", None)
            if isinstance(inp, dict):
                return inp
    return None


async def interpret_chart(text: str) -> ChartSpec:
    """Interpret `text` into a validated ChartSpec. Raises ChartInterpretError."""
    if not settings.ANTHROPIC_API_KEY:
        raise ChartInterpretError(
            "AI card creation is unavailable (no API key configured).", code="no_key"
        )

    import anthropic

    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    system = build_system_prompt()
    last_err = "no tool call"

    for attempt in range(2):
        user_content = text if attempt == 0 else (
            f"{text}\n\n(Your previous attempt was invalid: {last_err}. "
            "Return a valid emit_chart call using only the allowed columns.)"
        )
        try:
            response = await client.messages.create(
                model=settings.COACH_MODEL,
                max_tokens=700,
                temperature=0,
                system=[{"type": "text", "text": system,
                         "cache_control": {"type": "ephemeral"}}],
                tools=[_CHART_TOOL],
                tool_choice={"type": "tool", "name": "emit_chart"},
                messages=[{"role": "user", "content": user_content}],
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("chart interpret Claude call failed: %s", exc)
            raise ChartInterpretError(
                "AI card creation is temporarily unavailable.", code="no_key"
            ) from exc

        tool_input = _extract_tool_input(response)
        if tool_input is None:
            last_err = "model did not call emit_chart"
            continue
        try:
            return ChartSpec(**tool_input)
        except ValidationError as exc:
            last_err = str(exc)

    raise ChartInterpretError(
        f"Could not turn that into a chart. {last_err}", code="invalid"
    )
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd backend && uv run pytest tests/test_chart_interpreter.py -q`
Expected: PASS (all classes).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/chart_interpreter.py backend/tests/test_chart_interpreter.py
git commit -m "feat(analytics): chart_interpreter — text to validated ChartSpec via Claude"
```

---

### Task 2: POST /analytics/interpret route

**Files:**
- Modify: `backend/app/api/analytics.py`

- [ ] **Step 1: Add imports + route**

Add near the other imports at the top of `backend/app/api/analytics.py` (it already imports `BaseModel`, `Field`, `APIRouter`, `Depends`, `HTTPException`, `status`, `Annotated`, `User`, `get_current_active_user`):

```python
from app.schemas.user_dashboard import ChartSpec
from app.services.chart_interpreter import ChartInterpretError, interpret_chart
```

Append this route to the end of the file:

```python
class InterpretRequest(BaseModel):
    """A plain-English phrase describing the chart the user wants."""
    text: str = Field(min_length=1, max_length=400)


@router.post(
    "/interpret",
    response_model=ChartSpec,
    summary="Interpret a phrase into a ChartSpec (for the dashboard text-to-card flow)",
)
async def post_interpret(
    payload: InterpretRequest,
    _user: Annotated[User, Depends(get_current_active_user)],
) -> ChartSpec:
    # Stateless interpretation — no DB access here. The compiler enforces the
    # column allowlist + RLS when the resulting chart is actually rendered.
    try:
        return await interpret_chart(payload.text)
    except ChartInterpretError as exc:
        code = (
            status.HTTP_503_SERVICE_UNAVAILABLE
            if exc.code == "no_key"
            else status.HTTP_422_UNPROCESSABLE_ENTITY
        )
        raise HTTPException(status_code=code, detail=str(exc)) from exc
```

- [ ] **Step 2: Verify import + route registration**

Run: `cd backend && uv run python -c "from app.main import app; print([r.path for r in app.routes if r.path=='/analytics/interpret'])"`
Expected: `['/analytics/interpret']`

- [ ] **Step 3: Smoke (auth-guarded)**

Run: `curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Content-Type: application/json" -d '{"text":"weekly tss"}' http://127.0.0.1:8000/analytics/interpret`
Expected: `401` (route exists, requires auth). If the dev server isn't running this will be a connection error — that's fine; the import check in Step 2 is authoritative.

- [ ] **Step 4: Run full backend suite**

Run: `cd backend && uv run pytest -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/analytics.py
git commit -m "feat(analytics): POST /analytics/interpret route"
```

---

### Task 3: Frontend API client

**Files:**
- Modify: `frontend/src/api/analytics.ts`

- [ ] **Step 1: Add the client function**

Append to `frontend/src/api/analytics.ts` (it already imports `apiClient` and `ChartSpec`-related types live in `../types/chartSpec`; add the import if not present):

```typescript
import type { ChartSpec } from '../types/chartSpec'

export async function interpretChart(text: string): Promise<ChartSpec> {
  const res = await apiClient.post<ChartSpec>('/analytics/interpret', { text })
  return res.data
}
```

(If `ChartSpec` is already imported in this file, do not duplicate the import — just add the function.)

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | grep "api/analytics"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/analytics.ts
git commit -m "feat(dashboards): interpretChart api client"
```

---

### Task 4: ChartTextPrompt component

**Files:**
- Create: `frontend/src/components/charts/ChartTextPrompt.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { interpretChart } from '../../api/analytics'
import type { ChartSpec } from '../../types/chartSpec'

/**
 * ChartTextPrompt — type a phrase ("weekly TSS for the last 3 months") and get
 * back a ChartSpec the parent opens in the ChartBuilder for preview/tweak.
 * Shown in dashboard edit mode next to "Add chart".
 */
export default function ChartTextPrompt({
  onSpec,
  disabled,
}: {
  onSpec: (spec: ChartSpec) => void
  disabled?: boolean
}) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const phrase = text.trim()
    if (!phrase || loading) return
    setLoading(true)
    setError(null)
    try {
      const spec = await interpretChart(phrase)
      setText('')
      onSpec(spec)
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status
      setError(
        status === 503
          ? 'AI card creation is unavailable right now.'
          : "Couldn't turn that into a chart — try naming a metric like TSS, HRV, or sleep.",
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <div
          className="flex items-center gap-2 rounded-full px-3 py-1.5"
          style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
        >
          <Sparkles size={14} strokeWidth={2} style={{ color: 'var(--color-forest-2)' }} />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
            placeholder="Describe a chart…"
            disabled={disabled || loading}
            aria-label="Describe a chart to create"
            className="bg-transparent outline-none num-mono"
            style={{ fontSize: 12.5, color: 'var(--color-ink)', width: 180 }}
          />
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={disabled || loading || !text.trim()}
          className="inline-flex items-center rounded-full px-3 py-2 text-[12.5px] font-medium"
          style={{
            color: 'var(--color-paper)',
            backgroundColor: disabled || !text.trim() ? 'var(--color-muted)' : 'var(--color-forest-2)',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Thinking…' : 'Create'}
        </button>
      </div>
      {error && (
        <span style={{ color: 'var(--color-bad)', fontSize: 11 }}>{error}</span>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | grep "ChartTextPrompt"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/charts/ChartTextPrompt.tsx
git commit -m "feat(dashboards): ChartTextPrompt input component"
```

---

### Task 5: Wire ChartTextPrompt into DashboardsPage DetailView

**Files:**
- Modify: `frontend/src/pages/DashboardsPage.tsx`

The DetailView already has: `editing` state, `builderOpen`/`setBuilderOpen`, `editingChartId`/`setEditingChartId`, `editingChart` (derived), `handleAddChart`, a `<ChartBuilder open={builderOpen} ... initial={editingChart} />`, and an "Add chart" button inside the `{editing ? (<> ... </>)}` toolbar block. We add a transient `draftSpec` so the builder can open with an AI-generated spec that is NOT an existing saved chart.

- [ ] **Step 1: Add imports + draft state**

Add the import near the other component imports (next to `import ChartBuilder ...`):
```tsx
import ChartTextPrompt from '../components/charts/ChartTextPrompt'
```

Add this state next to `const [editingChartId, setEditingChartId] = useState<string | null>(null)`:
```tsx
  const [draftSpec, setDraftSpec] = useState<ChartSpec | null>(null)
```

- [ ] **Step 2: Render the prompt in the edit toolbar**

In the `{editing ? (` toolbar block, immediately BEFORE the "Add chart" `<button ... onClick={() => setBuilderOpen(true)} ...>`, insert:
```tsx
              <ChartTextPrompt
                disabled={charts.length >= MAX_CHARTS}
                onSpec={(spec) => {
                  setEditingChartId(null)
                  setDraftSpec(spec)
                  setBuilderOpen(true)
                }}
              />
```

- [ ] **Step 3: Feed the draft into the builder + clear on close**

Change the `<ChartBuilder ... />` props at the bottom of DetailView from:
```tsx
      <ChartBuilder
        open={builderOpen}
        onClose={() => {
          setBuilderOpen(false)
          setEditingChartId(null)
        }}
        onSave={handleAddChart}
        initial={editingChart}
      />
```
to:
```tsx
      <ChartBuilder
        open={builderOpen}
        onClose={() => {
          setBuilderOpen(false)
          setEditingChartId(null)
          setDraftSpec(null)
        }}
        onSave={(spec) => {
          setDraftSpec(null)
          handleAddChart(spec)
        }}
        initial={editingChart ?? draftSpec}
      />
```

Note: `handleAddChart` already appends a new chart when `editingChartId` is null (and the text path always sets `editingChartId = null`), so the AI draft is added as a new card. The "Add chart" button still opens an empty builder (`draftSpec` stays null, `editingChart` null → blank).

- [ ] **Step 4: Type-check + lint**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | grep "DashboardsPage"` → no output.
Run: `cd frontend && npx eslint src/pages/DashboardsPage.tsx src/components/charts/ChartTextPrompt.tsx` → clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/DashboardsPage.tsx
git commit -m "feat(dashboards): wire text-to-card prompt into dashboard edit mode"
```

---

### Task 6: End-to-end verification

- [ ] **Step 1:** Ensure backend (`:8000`, `--reload`) + frontend (`:5173`) + DB are running.
- [ ] **Step 2:** Open `/dashboards`, open or create a dashboard, click **Edit**. In the toolbar type e.g. *"weekly TSS for the last 3 months"* and click **Create**. Verify the **ChartBuilder opens preloaded** with a sensible dataset/axes/mark; the live preview renders data. Tweak if needed, click the builder's save → the card is added to the canvas. Click **Save** (dashboard) → reload the page → the card persists. **Look at the screenshot** — confirm the chart drew real data, not a blank panel.
- [ ] **Step 3:** Try a nonsense phrase (e.g. *"asdf qwer"*). Verify an inline error appears and no card is added.
- [ ] **Step 4:** Confirm the existing flows still work: the plain "Add chart" button opens a blank builder; drag-reorder, resize, and delete still function in edit mode.
- [ ] **Step 5:** Run full backend suite: `cd backend && uv run pytest -q` → all pass.

---

## Self-Review

**Spec coverage:**
- Text → AI-built chart → preview in existing builder → existing add path → Tasks 1-5. ✓
- Lives on the `/dashboards` canvas (reuse edit mode/storage) → Task 5 wires into DetailView; no main-tab changes. ✓
- Preview-then-add (not instant) → Task 5 opens `ChartBuilder` with the draft; commit only on the builder's save. ✓
- Backend uses `list_datasets()` allowlist as the column contract → Task 1 `build_system_prompt`. ✓
- Validation via `ChartSpec` Pydantic + one retry + errors → Task 1; `422`/`503` mapping → Task 2. ✓
- Defense-in-depth (execute_query allowlist + RLS at render) → unchanged, noted in Task 1 docstring. ✓
- Chart cap (15) inherited via `handleAddChart` → Task 5 (and `disabled` on the prompt). ✓
- No note/stat cards, no main-tab cards, no instant-add → not implemented (YAGNI). ✓
- Tests: interpreter unit tests (valid/retry/invalid/no-tool/no-key) → Task 1; manual E2E → Task 6. ✓

**Placeholder scan:** none — every code step is complete. ✓

**Type consistency:** `ChartSpec` is the same model end-to-end — backend `app/schemas/user_dashboard.ChartSpec` (response_model + validation target) and frontend `types/chartSpec.ChartSpec` (already structurally identical: `id?,title?,subtitle?,mark,query,encoding,accent?,smooth?,stacked?`). `interpret_chart` returns `ChartSpec`; `interpretChart` (TS) returns `ChartSpec`; `ChartTextPrompt.onSpec` passes `ChartSpec`; `handleAddChart(spec: ChartSpec)` consumes it. `ChartInterpretError.code ∈ {"no_key","invalid"}` maps to 503/422 in Task 2. The tool input keys (`title,mark,query{dataset,dimensions,measures,filters,start_date,end_date,order_by,order_dir},encoding{x,y,series}`) match `ChartSpec`/`QuerySpec` field names. ✓

**Note for executor:** `ChartSpec` field `subtitle` exists on the backend model but the tool schema omits it (the model doesn't need to set it) — that's fine, it's optional. The frontend `types/chartSpec.ChartSpec` is the source of truth for the TS side; if its field set differs from what's quoted, trust the file and adjust only the import, not the wiring.
