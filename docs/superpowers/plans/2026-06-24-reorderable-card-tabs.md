# Reorderable Card Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each user reorder and hide/show the cards on every fixed dashboard tab, with the layout saved to their account.

**Architecture:** Each card tab becomes a declarative *registry* of `CardDef`s rendered by one shared `<ReorderableTab>` primitive. A per-tab "Customize" button opens a compact `@dnd-kit/sortable` list editor (drag handle + hide toggle). Order/visibility persist to a new per-user `user_tab_layouts` table via `GET`/`PUT /tab-layouts`, surfaced through React Query. A pure `reconcileLayout()` merges saved prefs with the current registry so old layouts stay valid as cards are added/removed.

**Tech Stack:** FastAPI + SQLAlchemy (async) + Alembic + Postgres RLS (backend); React 19 + TypeScript + @tanstack/react-query + @dnd-kit/sortable + axios (frontend).

## Global Constraints

- Backend per-account persistence only — no localStorage fallback.
- New table mirrors `UserDashboard`: JSON blob column, RLS via `current_setting('app.current_user_id')`, accessed through `get_db_for_user`.
- One row per user: `user_id` is **unique**.
- API routes use `Annotated[User, Depends(get_current_active_user)]` + `Annotated[AsyncSession, Depends(get_db_for_user)]`.
- Payload caps (reject over): ≤ 32 tab keys, ≤ 64 cards per tab, card `id` length 1–64.
- All user-facing strings go through `useT()` / `i18n/strings.ts` with both `en` and `de`.
- New Alembic migration `down_revision = "c9d0e1f2a3b4"` (current head).
- Backend tests use `fastapi.testclient.TestClient` + `app.dependency_overrides` + `AsyncMock` db sessions (no real DB), per `tests/api/test_weeks.py`.
- Frontend has **no test runner**; verify the pure `reconcileLayout` via a browser-console check during the Playwright pass, and verify UI behavior end-to-end in the running app.
- Run backend commands from `backend/` using `.venv/bin/<tool>`. Dev servers: backend `uvicorn` on **:8042** (the frontend's `.env.local` `VITE_API_URL`), Vite on :5173, Postgres via `docker compose` on :5433.

---

## File Structure

**Backend**
- Create `backend/app/models/user_tab_layout.py` — `UserTabLayout` ORM model.
- Create `backend/app/schemas/user_tab_layout.py` — `CardPref`, `TabLayoutsPayload`, `TabLayoutsRead`.
- Create `backend/app/api/tab_layouts.py` — `GET`/`PUT /tab-layouts` router.
- Create `backend/migrations/versions/d0e1f2a3b4c5_add_user_tab_layouts.py` — table + RLS.
- Modify `backend/app/models/__init__.py` — register model.
- Modify `backend/app/main.py` — include router.
- Create `backend/tests/test_user_tab_layout_schema.py` — schema unit tests.
- Create `backend/tests/api/test_tab_layouts.py` — API integration tests.

**Frontend**
- Create `frontend/src/components/dashboard/cardRegistry.ts` — `CardDef`/`CardPref`/`ResolvedCard` types.
- Create `frontend/src/utils/reconcileLayout.ts` — pure merge function.
- Create `frontend/src/api/tabLayouts.ts` — typed client.
- Create `frontend/src/hooks/useTabLayouts.ts` — query + mutation.
- Create `frontend/src/hooks/useTabOrder.ts` — registry → resolved cards + persist.
- Create `frontend/src/components/dashboard/ReorderableTab.tsx` — normal render + editor.
- Modify `frontend/src/i18n/strings.ts` — editor + card-label strings.
- Modify `frontend/src/components/dashboard/tabs/TodayTab.tsx` — registry + `<ReorderableTab>`.
- Modify `frontend/src/components/dashboard/tabs/{TrendsTab,PlanTab,WeekTab,SportTab}.tsx` — same.

---

## Task 1: Backend persistence layer (model + schema + migration)

**Files:**
- Create: `backend/app/models/user_tab_layout.py`
- Create: `backend/app/schemas/user_tab_layout.py`
- Create: `backend/migrations/versions/d0e1f2a3b4c5_add_user_tab_layouts.py`
- Modify: `backend/app/models/__init__.py`
- Test: `backend/tests/test_user_tab_layout_schema.py`

**Interfaces:**
- Produces: `UserTabLayout` model (`id`, `user_id` unique, `layouts: dict`, `updated_at`); `CardPref(id: str, hidden: bool = False)`; `TabLayoutsPayload(layouts: dict[str, list[CardPref]])`; `TabLayoutsRead` (same shape). Caps enforced by a `field_validator` on `layouts`.

- [ ] **Step 1: Write the failing schema test**

Create `backend/tests/test_user_tab_layout_schema.py`:

```python
"""Validation tests for the tab-layouts schemas."""
import pytest
from pydantic import ValidationError

from app.schemas.user_tab_layout import CardPref, TabLayoutsPayload


def test_cardpref_defaults_hidden_false():
    assert CardPref(id="coach-brief").hidden is False


def test_payload_round_trips_layouts():
    payload = TabLayoutsPayload(
        layouts={"today": [{"id": "coach-brief", "hidden": True}, {"id": "today-hero"}]}
    )
    dumped = payload.model_dump()
    assert dumped["layouts"]["today"][0] == {"id": "coach-brief", "hidden": True}
    assert dumped["layouts"]["today"][1] == {"id": "today-hero", "hidden": False}


def test_payload_rejects_too_many_tabs():
    with pytest.raises(ValidationError):
        TabLayoutsPayload(layouts={f"tab{i}": [] for i in range(33)})


def test_payload_rejects_too_many_cards():
    with pytest.raises(ValidationError):
        TabLayoutsPayload(layouts={"today": [{"id": f"c{i}"} for i in range(65)]})


def test_cardpref_rejects_long_id():
    with pytest.raises(ValidationError):
        CardPref(id="x" * 65)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_user_tab_layout_schema.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.schemas.user_tab_layout'`

- [ ] **Step 3: Create the schema module**

Create `backend/app/schemas/user_tab_layout.py`:

```python
"""Schemas for per-user tab card layouts.

A user's layout is a JSON blob keyed by tab id (e.g. "today", "trends"),
each holding an ordered list of {id, hidden} entries. Stored opaquely at the
DB layer; validated here. Caps bound the payload so a malicious client can't
store an unbounded blob.
"""
from pydantic import BaseModel, Field, field_validator

MAX_TABS = 32
MAX_CARDS_PER_TAB = 64


class CardPref(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    hidden: bool = False


class TabLayoutsPayload(BaseModel):
    layouts: dict[str, list[CardPref]] = Field(default_factory=dict)

    @field_validator("layouts")
    @classmethod
    def _within_caps(cls, v: dict[str, list[CardPref]]) -> dict[str, list[CardPref]]:
        if len(v) > MAX_TABS:
            raise ValueError(f"too many tabs (max {MAX_TABS})")
        for tab, cards in v.items():
            if len(cards) > MAX_CARDS_PER_TAB:
                raise ValueError(f"too many cards in '{tab}' (max {MAX_CARDS_PER_TAB})")
        return v


class TabLayoutsRead(TabLayoutsPayload):
    pass
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && .venv/bin/pytest tests/test_user_tab_layout_schema.py -v`
Expected: PASS (5 passed)

- [ ] **Step 5: Create the ORM model**

Create `backend/app/models/user_tab_layout.py`:

```python
"""UserTabLayout — one row per user holding their per-tab card ordering.

`layouts` is a JSON blob keyed by tab id, each value an ordered list of
{id, hidden} dicts. One row per user (user_id unique). RLS-protected, same
pattern as UserDashboard — the API layer validates shape via TabLayoutsPayload.
"""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UserTabLayout(Base):
    __tablename__ = "user_tab_layouts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    layouts: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=True,
    )
```

- [ ] **Step 6: Register the model**

In `backend/app/models/__init__.py`, after the `UserDashboard` import line add:

```python
from app.models.user_tab_layout import UserTabLayout  # noqa: F401
```

And add `"UserTabLayout",` to the `__all__` list.

- [ ] **Step 7: Create the migration**

Create `backend/migrations/versions/d0e1f2a3b4c5_add_user_tab_layouts.py`:

```python
"""add user_tab_layouts table

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-06-24 00:00:00.000000

Per-user card ordering/visibility for the fixed dashboard tabs. One row per
user; layouts stored as a JSON blob keyed by tab id. Ownership via user_id +
RLS (same pattern as user_dashboards).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d0e1f2a3b4c5"
down_revision: Union[str, Sequence[str], None] = "c9d0e1f2a3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_tab_layouts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("layouts", sa.JSON(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_user_tab_layouts_user_id"),
        "user_tab_layouts",
        ["user_id"],
        unique=True,
    )

    op.execute("ALTER TABLE user_tab_layouts ENABLE ROW LEVEL SECURITY;")
    op.execute(
        """
        CREATE POLICY user_isolation ON user_tab_layouts
            USING (user_id = current_setting('app.current_user_id', true)::INTEGER);
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS user_isolation ON user_tab_layouts;")
    op.execute("ALTER TABLE user_tab_layouts DISABLE ROW LEVEL SECURITY;")
    op.drop_index(op.f("ix_user_tab_layouts_user_id"), table_name="user_tab_layouts")
    op.drop_table("user_tab_layouts")
```

- [ ] **Step 8: Apply the migration and verify up/down**

Run:
```bash
cd backend && .venv/bin/alembic upgrade head && .venv/bin/alembic downgrade -1 && .venv/bin/alembic upgrade head
```
Expected: no errors; final line leaves head at `d0e1f2a3b4c5`. (Postgres must be up: `docker compose up -d` from `backend/`.)

- [ ] **Step 9: Commit**

```bash
git add backend/app/models/user_tab_layout.py backend/app/schemas/user_tab_layout.py \
  backend/migrations/versions/d0e1f2a3b4c5_add_user_tab_layouts.py \
  backend/app/models/__init__.py backend/tests/test_user_tab_layout_schema.py
git commit -m "feat(tabs): user_tab_layouts model, schema, migration"
```

---

## Task 2: Backend API — GET/PUT /tab-layouts

**Files:**
- Create: `backend/app/api/tab_layouts.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/api/test_tab_layouts.py`

**Interfaces:**
- Consumes: `UserTabLayout`, `TabLayoutsPayload`, `TabLayoutsRead` (Task 1); `get_current_active_user`, `get_db_for_user`.
- Produces: `GET /tab-layouts` → `TabLayoutsRead` (`{"layouts": {}}` when no row); `PUT /tab-layouts` (body `TabLayoutsPayload`) → `TabLayoutsRead` (upsert, whole-blob replace).

- [ ] **Step 1: Write the failing API test**

Create `backend/tests/api/test_tab_layouts.py`:

```python
"""Integration tests for /tab-layouts (mocked db, dependency_overrides)."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.dependencies import get_current_active_user, get_db_for_user, get_current_user


def _make_user(user_id: int = 1) -> MagicMock:
    user = MagicMock()
    user.id = user_id
    user.is_active = True
    return user


def _make_mock_db(existing_row=None):
    """AsyncMock session whose execute().scalar_one_or_none() returns existing_row."""
    db = AsyncMock()

    async def _execute(query, *args, **kwargs):  # noqa: ANN001
        result = MagicMock()
        result.scalar_one_or_none.return_value = existing_row
        return result

    db.execute = _execute
    db.add = MagicMock()
    db.commit = AsyncMock()
    return db


def _override(user, db):
    async def _u():
        return user

    async def _d():
        yield db

    app.dependency_overrides[get_current_active_user] = _u
    app.dependency_overrides[get_current_user] = _u
    app.dependency_overrides[get_db_for_user] = _d


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=True)


@pytest.fixture(autouse=True)
def _clear():
    yield
    app.dependency_overrides.clear()


def test_get_requires_auth(client):
    assert client.get("/tab-layouts").status_code == 401


def test_get_returns_empty_when_no_row(client):
    _override(_make_user(), _make_mock_db(existing_row=None))
    resp = client.get("/tab-layouts")
    assert resp.status_code == 200
    assert resp.json() == {"layouts": {}}


def test_get_returns_saved_layouts(client):
    row = MagicMock()
    row.layouts = {"today": [{"id": "coach-brief", "hidden": True}]}
    _override(_make_user(), _make_mock_db(existing_row=row))
    resp = client.get("/tab-layouts")
    assert resp.json()["layouts"]["today"][0]["id"] == "coach-brief"


def test_put_creates_when_no_row(client):
    db = _make_mock_db(existing_row=None)
    _override(_make_user(), db)
    body = {"layouts": {"today": [{"id": "today-hero", "hidden": False}]}}
    resp = client.put("/tab-layouts", json=body)
    assert resp.status_code == 200
    assert resp.json() == body
    db.add.assert_called_once()
    db.commit.assert_awaited_once()


def test_put_updates_existing_row(client):
    row = MagicMock()
    row.layouts = {"today": []}
    db = _make_mock_db(existing_row=row)
    _override(_make_user(), db)
    body = {"layouts": {"trends": [{"id": "trends-hero", "hidden": False}]}}
    resp = client.put("/tab-layouts", json=body)
    assert resp.status_code == 200
    assert row.layouts == body["layouts"]
    db.add.assert_not_called()


def test_put_rejects_oversized_payload(client):
    _override(_make_user(), _make_mock_db(existing_row=None))
    body = {"layouts": {f"tab{i}": [] for i in range(33)}}
    assert client.put("/tab-layouts", json=body).status_code == 422
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/api/test_tab_layouts.py -v`
Expected: FAIL — 404s (router not registered) / import errors.

- [ ] **Step 3: Create the router**

Create `backend/app/api/tab_layouts.py`:

```python
"""Per-user tab card layouts.

  · GET /tab-layouts  — the caller's layout blob ({} when unset)
  · PUT /tab-layouts  — upsert (whole-blob replace)

One row per user. RLS-protected via get_db_for_user.
"""
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.user import User
from app.models.user_tab_layout import UserTabLayout
from app.schemas.user_tab_layout import TabLayoutsPayload, TabLayoutsRead

router = APIRouter(prefix="/tab-layouts", tags=["tab-layouts"])


@router.get("", response_model=TabLayoutsRead)
async def get_tab_layouts(
    _user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> TabLayoutsRead:
    result = await db.execute(select(UserTabLayout))
    row = result.scalar_one_or_none()
    return TabLayoutsRead(layouts=row.layouts if row else {})


@router.put("", response_model=TabLayoutsRead)
async def put_tab_layouts(
    payload: TabLayoutsPayload,
    user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> TabLayoutsRead:
    layouts = {
        tab: [c.model_dump() for c in cards] for tab, cards in payload.layouts.items()
    }
    result = await db.execute(select(UserTabLayout))
    row = result.scalar_one_or_none()
    if row is None:
        db.add(UserTabLayout(user_id=user.id, layouts=layouts))
    else:
        row.layouts = layouts
    await db.commit()
    return TabLayoutsRead(layouts=layouts)
```

- [ ] **Step 4: Register the router**

In `backend/app/main.py`, after the `crews_router` import line add:

```python
from app.api.tab_layouts import router as tab_layouts_router  # noqa: E402
```

After `app.include_router(crews_router)` add:

```python
app.include_router(tab_layouts_router)
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && .venv/bin/pytest tests/api/test_tab_layouts.py -v`
Expected: PASS (7 passed)

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/tab_layouts.py backend/app/main.py backend/tests/api/test_tab_layouts.py
git commit -m "feat(tabs): GET/PUT /tab-layouts endpoints"
```

---

## Task 3: Frontend types + pure reconcile function

**Files:**
- Create: `frontend/src/components/dashboard/cardRegistry.ts`
- Create: `frontend/src/utils/reconcileLayout.ts`

**Interfaces:**
- Produces: `CardPref { id: string; hidden: boolean }`; `CardDef { id: string; label: string; render: () => ReactNode }`; `ResolvedCard = CardDef & { hidden: boolean }`; `reconcileLayout(saved: CardPref[] | undefined, registry: CardDef[]): ResolvedCard[]`.

- [ ] **Step 1: Create the types**

Create `frontend/src/components/dashboard/cardRegistry.ts`:

```ts
import type { ReactNode } from 'react'

/** Saved per-card preference (order is implied by array position). */
export interface CardPref {
  id: string
  hidden: boolean
}

/** A card a tab can render. `id` is a stable slug; `label` shows in the editor. */
export interface CardDef {
  id: string
  label: string
  render: () => ReactNode
}

/** A registry card merged with its resolved visibility, in display order. */
export type ResolvedCard = CardDef & { hidden: boolean }
```

- [ ] **Step 2: Create the reconcile function**

Create `frontend/src/utils/reconcileLayout.ts`:

```ts
import type { CardDef, CardPref, ResolvedCard } from '../components/dashboard/cardRegistry'

/**
 * Merge a saved layout with the current registry.
 *
 * - Saved entries whose id still exists keep their order + hidden flag.
 * - Registry cards missing from `saved` are inserted at their default index
 *   (relative to already-placed cards), so a newly-shipped card lands near
 *   where the code placed it rather than at the bottom.
 * - Saved ids no longer in the registry are dropped.
 *
 * `saved` undefined/empty → the registry's default order, all visible.
 */
export function reconcileLayout(
  saved: CardPref[] | undefined,
  registry: CardDef[],
): ResolvedCard[] {
  const byId = new Map(registry.map((def, defaultIndex) => [def.id, { def, defaultIndex }]))

  const order: { id: string; hidden: boolean }[] = (saved ?? [])
    .filter((p) => byId.has(p.id))
    .map((p) => ({ id: p.id, hidden: p.hidden }))

  const present = new Set(order.map((o) => o.id))

  registry.forEach((def, defaultIndex) => {
    if (present.has(def.id)) return
    let pos = 0
    for (let k = 0; k < order.length; k++) {
      const di = byId.get(order[k].id)!.defaultIndex
      if (di < defaultIndex) pos = k + 1
    }
    order.splice(pos, 0, { id: def.id, hidden: false })
    present.add(def.id)
  })

  return order.map((o) => {
    const { def } = byId.get(o.id)!
    return { ...def, hidden: o.hidden }
  })
}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | grep -E "reconcileLayout|cardRegistry" || echo "no new type errors"`
Expected: `no new type errors`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/dashboard/cardRegistry.ts frontend/src/utils/reconcileLayout.ts
git commit -m "feat(tabs): card registry types + reconcileLayout"
```

---

## Task 4: Frontend data layer — api client + React Query hooks

**Files:**
- Create: `frontend/src/api/tabLayouts.ts`
- Create: `frontend/src/hooks/useTabLayouts.ts`

**Interfaces:**
- Consumes: `CardPref` (Task 3); `apiClient` from `../api/client`.
- Produces: `TabLayouts { layouts: Record<string, CardPref[]> }`; `getTabLayouts(): Promise<TabLayouts>`; `putTabLayouts(payload: TabLayouts): Promise<TabLayouts>`; `useTabLayouts()` (query, key `['tab-layouts']`); `useUpdateTabLayouts()` (mutation, optimistic via `qc.setQueryData`).

- [ ] **Step 1: Create the api client**

Create `frontend/src/api/tabLayouts.ts`:

```ts
import { apiClient } from './client'
import type { CardPref } from '../components/dashboard/cardRegistry'

export interface TabLayouts {
  layouts: Record<string, CardPref[]>
}

export async function getTabLayouts(): Promise<TabLayouts> {
  const res = await apiClient.get<TabLayouts>('/tab-layouts')
  return res.data
}

export async function putTabLayouts(payload: TabLayouts): Promise<TabLayouts> {
  const res = await apiClient.put<TabLayouts>('/tab-layouts', payload)
  return res.data
}
```

- [ ] **Step 2: Create the hooks**

Create `frontend/src/hooks/useTabLayouts.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getTabLayouts, putTabLayouts, type TabLayouts } from '../api/tabLayouts'

const KEY = ['tab-layouts'] as const

export function useTabLayouts() {
  return useQuery<TabLayouts>({
    queryKey: KEY,
    queryFn: getTabLayouts,
    staleTime: 5 * 60_000,
  })
}

export function useUpdateTabLayouts() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: TabLayouts) => putTabLayouts(payload),
    // Optimistic: write the new blob into cache immediately so the UI reflects
    // the reorder without waiting for the round-trip.
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: KEY })
      const prev = qc.getQueryData<TabLayouts>(KEY)
      qc.setQueryData<TabLayouts>(KEY, payload)
      return { prev }
    },
    onError: (_err, _payload, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: KEY })
    },
  })
}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | grep -E "tabLayouts|useTabLayouts" || echo "no new type errors"`
Expected: `no new type errors`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/tabLayouts.ts frontend/src/hooks/useTabLayouts.ts
git commit -m "feat(tabs): tab-layouts api client + react-query hooks"
```

---

## Task 5: Frontend — ReorderableTab + useTabOrder + strings

**Files:**
- Create: `frontend/src/hooks/useTabOrder.ts`
- Create: `frontend/src/components/dashboard/ReorderableTab.tsx`
- Modify: `frontend/src/i18n/strings.ts`

**Interfaces:**
- Consumes: `reconcileLayout` (Task 3); `useTabLayouts`/`useUpdateTabLayouts` (Task 4); `CardDef`/`CardPref`/`ResolvedCard` (Task 3); `useT` from `../../contexts/LocaleContext`; `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.
- Produces: `useTabOrder(tabId: string, registry: CardDef[]): { resolved: ResolvedCard[]; persist: (next: CardPref[]) => void }`; default export `ReorderableTab({ tabId: string; cards: CardDef[] })`.

- [ ] **Step 1: Add the editor strings**

In `frontend/src/i18n/strings.ts`, add inside the `STRINGS` object (near the top "Generic" block):

```ts
  customize: { en: 'Customize', de: 'Anpassen' },
  customize_done: { en: 'Done', de: 'Fertig' },
  customize_reset: { en: 'Reset to default', de: 'Zurücksetzen' },
  customize_hint: { en: 'Drag to reorder · tap the eye to hide', de: 'Ziehen zum Sortieren · Auge zum Ausblenden' },
  card_hidden: { en: 'Hidden', de: 'Ausgeblendet' },
```

- [ ] **Step 2: Create the useTabOrder hook**

Create `frontend/src/hooks/useTabOrder.ts`:

```ts
import { useMemo } from 'react'
import { reconcileLayout } from '../utils/reconcileLayout'
import { useTabLayouts, useUpdateTabLayouts } from './useTabLayouts'
import type { CardDef, CardPref, ResolvedCard } from '../components/dashboard/cardRegistry'

/**
 * Resolve a tab's cards (order + visibility) and expose a persist() that
 * writes just this tab's entry back, preserving every other tab's layout.
 */
export function useTabOrder(
  tabId: string,
  registry: CardDef[],
): { resolved: ResolvedCard[]; persist: (next: CardPref[]) => void } {
  const { data } = useTabLayouts()
  const update = useUpdateTabLayouts()

  const saved = data?.layouts?.[tabId]
  const resolved = useMemo(() => reconcileLayout(saved, registry), [saved, registry])

  const persist = (next: CardPref[]) => {
    const layouts = { ...(data?.layouts ?? {}), [tabId]: next }
    update.mutate({ layouts })
  }

  return { resolved, persist }
}
```

- [ ] **Step 3: Create the ReorderableTab component**

Create `frontend/src/components/dashboard/ReorderableTab.tsx`:

```tsx
import { useEffect, useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Eye, EyeOff, Settings2 } from 'lucide-react'
import { useT } from '../../contexts/LocaleContext'
import { useTabOrder } from '../../hooks/useTabOrder'
import type { CardDef, CardPref, ResolvedCard } from './cardRegistry'

function toPrefs(cards: ResolvedCard[]): CardPref[] {
  return cards.map((c) => ({ id: c.id, hidden: c.hidden }))
}

export default function ReorderableTab({ tabId, cards }: { tabId: string; cards: CardDef[] }) {
  const t = useT()
  const { resolved, persist } = useTabOrder(tabId, cards)
  const [editing, setEditing] = useState(false)
  // Local working copy while editing; re-seed whenever the resolved list changes.
  const [working, setWorking] = useState<ResolvedCard[]>(resolved)
  useEffect(() => setWorking(resolved), [resolved])

  const list = editing ? working : resolved

  if (!editing) {
    return (
      <div className="flex flex-col gap-4 sm:gap-5 min-w-0">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium"
            style={{ color: 'var(--color-muted)' }}
          >
            <Settings2 size={13} strokeWidth={2} />
            <span className="underline underline-offset-2 decoration-[var(--color-rule)]">
              {t('customize')}
            </span>
          </button>
        </div>
        {list
          .filter((c) => !c.hidden)
          .map((c) => (
            <div key={c.id}>{c.render()}</div>
          ))}
      </div>
    )
  }

  return (
    <ReorderEditor
      cards={working}
      onChange={(next) => {
        setWorking(next)
        persist(toPrefs(next))
      }}
      onReset={() => {
        const def = cards.map((c) => ({ ...c, hidden: false }))
        setWorking(def)
        persist(toPrefs(def))
      }}
      onDone={() => setEditing(false)}
    />
  )
}

function ReorderEditor({
  cards,
  onChange,
  onReset,
  onDone,
}: {
  cards: ResolvedCard[]
  onChange: (next: ResolvedCard[]) => void
  onReset: () => void
  onDone: () => void
}) {
  const t = useT()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = cards.findIndex((c) => c.id === active.id)
    const to = cards.findIndex((c) => c.id === over.id)
    if (from < 0 || to < 0) return
    onChange(arrayMove(cards, from, to))
  }

  const toggleHidden = (id: string) =>
    onChange(cards.map((c) => (c.id === id ? { ...c, hidden: !c.hidden } : c)))

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 10 }}>
          {t('customize_hint')}
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onReset}
            className="text-[12px] font-medium"
            style={{ color: 'var(--color-muted)' }}
          >
            {t('customize_reset')}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="inline-flex items-center rounded-full px-4 py-2 text-[13px] font-medium min-h-[40px]"
            style={{ backgroundColor: 'var(--color-ink)', color: 'var(--color-paper)' }}
          >
            {t('customize_done')}
          </button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {cards.map((c) => (
              <EditorRow key={c.id} card={c} onToggleHidden={() => toggleHidden(c.id)} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}

function EditorRow({ card, onToggleHidden }: { card: ResolvedCard; onToggleHidden: () => void }) {
  const t = useT()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  })
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
      }}
      className="flex items-center gap-3 rounded-[12px] px-3 py-2.5"
    >
      <button
        type="button"
        className="cursor-grab touch-none"
        style={{ color: 'var(--color-muted)' }}
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} strokeWidth={2} />
      </button>
      <span
        className="flex-1 text-[14px]"
        style={{ color: card.hidden ? 'var(--color-muted)' : 'var(--color-ink)' }}
      >
        {card.label}
        {card.hidden && (
          <span className="ml-2 num-mono" style={{ fontSize: 10, color: 'var(--color-muted)' }}>
            · {t('card_hidden')}
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={onToggleHidden}
        aria-label={card.hidden ? 'Show card' : 'Hide card'}
        style={{ color: card.hidden ? 'var(--color-muted)' : 'var(--color-ink-2)' }}
      >
        {card.hidden ? <EyeOff size={15} strokeWidth={2} /> : <Eye size={15} strokeWidth={2} />}
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | grep -E "ReorderableTab|useTabOrder" || echo "no new type errors"`
Expected: `no new type errors`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useTabOrder.ts frontend/src/components/dashboard/ReorderableTab.tsx frontend/src/i18n/strings.ts
git commit -m "feat(tabs): ReorderableTab editor + useTabOrder hook"
```

---

## Task 6: Wire TodayTab + end-to-end verify

**Files:**
- Modify: `frontend/src/components/dashboard/tabs/TodayTab.tsx`
- Modify: `frontend/src/i18n/strings.ts`

**Interfaces:**
- Consumes: `ReorderableTab` (Task 5); `CardDef` (Task 3); existing Today card components.

- [ ] **Step 1: Add Today card-label strings**

In `frontend/src/i18n/strings.ts`, add inside `STRINGS`:

```ts
  card_train_hero: { en: 'Week framing', de: 'Wochenrahmen' },
  card_checkin: { en: 'Morning check-in', de: 'Morgen-Check-in' },
  card_recap: { en: 'Yesterday recap', de: 'Rückblick gestern' },
  card_today_hero: { en: "Today's verdict", de: 'Heutiges Urteil' },
  card_momentum: { en: 'Momentum chips', de: 'Momentum-Chips' },
  card_coach_brief: { en: 'Coach brief', de: 'Coach-Briefing' },
  card_streak: { en: 'Streak & challenge', de: 'Serie & Challenge' },
  card_pmc: { en: 'Training state (PMC)', de: 'Trainingszustand (PMC)' },
  card_season: { en: 'Season stats', de: 'Saison-Statistik' },
  card_badges: { en: 'Achievements', de: 'Erfolge' },
  card_dyk: { en: 'Did you know', de: 'Wusstest du' },
  card_log: { en: 'Training log', de: 'Trainings-Log' },
  card_deep_dive: { en: 'Deep dive', de: 'Details' },
```

- [ ] **Step 2: Rewrite TodayTab as a registry**

Replace the body of `frontend/src/components/dashboard/tabs/TodayTab.tsx` with:

```tsx
/**
 * TodayTab — the verdict surface, now user-reorderable. The fixed sequence is
 * declared as a registry of cards; <ReorderableTab> renders them in the user's
 * saved order (hidden cards omitted) and hosts the Customize editor.
 */
import CoachBrief from '../CoachBrief'
import MorningCheckin from '../MorningCheckin'
import MorningRecap from '../MorningRecap'
import TrainHero from '../TrainHero'
import { useT } from '../../../contexts/LocaleContext'
import AchievementBadges from '../AchievementBadges'
import DidYouKnow from '../DidYouKnow'
import MomentumChips from '../MomentumChips'
import PMCCompact from '../PMCCompact'
import SeasonStats from '../SeasonStats'
import TrainingLogStrip from '../TrainingLogStrip'
import ExternalWorkouts from '../ExternalWorkouts'
import TodayHero from '../TodayHero'
import WorkoutExportRow from '../WorkoutExportRow'
import StreakStrip from '../StreakStrip'
import WeeklyChallenge from '../WeeklyChallenge'
import DashboardSection from '../DashboardSection'
import ReorderableTab from '../ReorderableTab'
import type { CardDef } from '../cardRegistry'

function StreakChallengeRow() {
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_auto] items-stretch">
      <StreakStrip />
      <WeeklyChallenge />
    </div>
  )
}

function TodayDeepDive() {
  const t = useT()
  return (
    <DashboardSection id="today-deep-dive" title={t('deep_dive')} defaultExpanded={false}>
      <div className="flex flex-col gap-6">
        <ExternalWorkouts />
        <WorkoutExportRow />
      </div>
    </DashboardSection>
  )
}

export default function TodayTab() {
  const t = useT()
  const cards: CardDef[] = [
    { id: 'train-hero', label: t('card_train_hero'), render: () => <TrainHero /> },
    { id: 'morning-checkin', label: t('card_checkin'), render: () => <MorningCheckin /> },
    { id: 'morning-recap', label: t('card_recap'), render: () => <MorningRecap /> },
    { id: 'today-hero', label: t('card_today_hero'), render: () => <TodayHero /> },
    { id: 'momentum', label: t('card_momentum'), render: () => <MomentumChips /> },
    { id: 'coach-brief', label: t('card_coach_brief'), render: () => <CoachBrief /> },
    { id: 'streak', label: t('card_streak'), render: () => <StreakChallengeRow /> },
    { id: 'pmc', label: t('card_pmc'), render: () => <PMCCompact /> },
    { id: 'season-stats', label: t('card_season'), render: () => <SeasonStats /> },
    { id: 'achievements', label: t('card_badges'), render: () => <AchievementBadges /> },
    { id: 'did-you-know', label: t('card_dyk'), render: () => <DidYouKnow /> },
    { id: 'log-strip', label: t('card_log'), render: () => <TrainingLogStrip /> },
    { id: 'deep-dive', label: t('card_deep_dive'), render: () => <TodayDeepDive /> },
  ]
  return <ReorderableTab tabId="today" cards={cards} />
}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | grep -E "TodayTab" || echo "no new type errors"`
Expected: `no new type errors`

- [ ] **Step 4: End-to-end UI verification (Playwright)**

Dev servers must be running: backend `uvicorn app.main:app --port 8042`, Vite `npm run dev`, Postgres `docker compose up -d`. This pass exercises `reconcileLayout` (default order, reorder, hidden, persistence) through the real UI:

1. Navigate to `http://localhost:5173/dashboard`, log in if needed.
2. Click **Customize** (top-right of the Today stack). Expect the compact list of card labels with grip handles + eye toggles.
3. Drag **Coach brief** above **Today's verdict**; click the eye on **Did you know** to hide it; click **Done**.
4. Confirm the stack now shows Coach brief before Today's verdict, and "Did you know" is gone.
5. Reload the page. Expect the **same** order + hidden state (proves backend persistence).
6. Customize → **Reset to default** → Done. Expect the original order, all cards visible.

Expected: all six checks pass; no console errors. Capture a screenshot after step 4.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/tabs/TodayTab.tsx frontend/src/i18n/strings.ts
git commit -m "feat(tabs): make Today tab reorderable"
```

---

## Task 7: Wire the remaining card tabs

**Files:**
- Modify: `frontend/src/components/dashboard/tabs/TrendsTab.tsx`
- Modify: `frontend/src/components/dashboard/tabs/PlanTab.tsx`
- Modify: `frontend/src/components/dashboard/tabs/WeekTab.tsx`
- Modify: `frontend/src/components/dashboard/tabs/SportTab.tsx`
- Modify: `frontend/src/i18n/strings.ts`

**Interfaces:**
- Consumes: `ReorderableTab` (Task 5); `CardDef` (Task 3). Same pattern as Task 6.

> For each tab below: read its current JSX, extract each top-level child of the
> outer stack into a `CardDef` (wrap multi-element groups in a small local
> sub-component like `StreakChallengeRow`/`TodayDeepDive` in Task 6), give each a
> stable `id` and a `t('card_*')` label (add the label strings to `strings.ts`),
> then `return <ReorderableTab tabId="<tab>" cards={cards} />`. Use `tabId`
> values `"trends"`, `"plan"`, `"week"`, `"sport"`.

- [ ] **Step 1: Convert TrendsTab**

Read `frontend/src/components/dashboard/tabs/TrendsTab.tsx`. For each top-level card in its stack, add a `card_*` string pair to `strings.ts` and build the `cards: CardDef[]` array exactly as in Task 6 Step 2. Replace the return with `return <ReorderableTab tabId="trends" cards={cards} />`. Preserve any props the cards currently receive by closing over them in `render`.

- [ ] **Step 2: Convert PlanTab, WeekTab, SportTab**

Repeat Step 1 for `PlanTab.tsx` (`tabId="plan"`), `WeekTab.tsx` (`tabId="week"`), `SportTab.tsx` (`tabId="sport"`). If a tab wraps cards in extra layout containers, keep those containers inside the relevant card's `render` so the visual result is unchanged when no customization is applied.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | grep -E "TrendsTab|PlanTab|WeekTab|SportTab" || echo "no new type errors"`
Expected: `no new type errors`

- [ ] **Step 4: Verify each tab renders + customizes**

In the running app, visit each of Trends, Plan, Week, Sport. Confirm: (a) the default render matches the pre-change layout, (b) Customize opens the list editor, (c) a reorder persists across reload. Spot-check one tab fully; smoke-check the others.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/tabs/TrendsTab.tsx \
  frontend/src/components/dashboard/tabs/PlanTab.tsx \
  frontend/src/components/dashboard/tabs/WeekTab.tsx \
  frontend/src/components/dashboard/tabs/SportTab.tsx \
  frontend/src/i18n/strings.ts
git commit -m "feat(tabs): make Trends/Plan/Week/Sport tabs reorderable"
```

---

## Self-Review Notes

- **Spec coverage:** registry + `<ReorderableTab>` (Tasks 3,5,6,7); compact list editor with drag + hide (Task 5); backend per-account model/API/migration (Tasks 1,2); reconcile (Task 3); React Query data layer (Task 4); localization (Tasks 5,6,7); per-tab Customize button + nothing pinned (Task 5/6). All spec sections map to a task.
- **RLS isolation** is provided by `get_db_for_user` + the migration's policy (same as every other table); the mocked-db tests assert scoping behavior (upsert vs update, user_id on create) rather than spinning a real Postgres — consistent with the existing `tests/api` style.
- **No real frontend unit test runner exists** (spec-acknowledged); `reconcileLayout` is pure and validated through the end-to-end UI checks in Task 6.
