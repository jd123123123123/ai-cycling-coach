# User-reorderable card tabs — design

**Date:** 2026-06-24
**Status:** Approved (pending spec review)

## Goal

Let a user change the order of the cards/sections on the fixed dashboard tabs,
and hide cards they don't want — easily, with the layout saved to their account
so it follows them across devices.

## Scope

- **Surfaces:** all fixed card tabs — `TodayTab`, `TrendsTab`, `PlanTab`,
  `WeekTab`, `SportTab` (and any other stacked-card tab). The Analyze
  "Dashboards" workspace already has its own drag/resize grid and is **out of
  scope**.
- **Capabilities:** reorder cards **and** hide/show cards.
- **Interaction:** drag-and-drop inside an explicit "Customize" mode (a compact
  list editor), not always-on drag.
- **Persistence:** backend, per user account.
- **Decisions confirmed during brainstorming:**
  - Customize entry point is **per-tab** (a small "Customize" control at the top
    of each card tab), not a single global shell toggle.
  - **Nothing is pinned** — every top-level card/section on a tab is reorderable
    and hideable, including `TrainHero` / `TodayHero`.

## Non-goals (YAGNI)

- No drag of the live full-size cards — the editor is a compact labeled list.
- No resizing, multi-column bento, or cross-tab moves.
- No per-card settings beyond order + visibility.
- No reorder for the Analyze Dashboards workspace (already customizable).

## Architecture

### Per-tab card registry

Each tab is refactored from a hardcoded JSX sequence into a **registry** plus a
single shared renderer.

```ts
type CardDef = {
  id: string                 // stable slug, e.g. 'coach-brief'
  label: string              // human label shown in the editor, localized
  render: () => ReactNode    // the actual card element
}
```

Example (`TodayTab`):

```tsx
const TODAY_CARDS: CardDef[] = [
  { id: 'train-hero',     label: t('card_train_hero'),   render: () => <TrainHero /> },
  { id: 'morning-checkin',label: t('card_checkin'),      render: () => <MorningCheckin /> },
  { id: 'morning-recap',  label: t('card_recap'),        render: () => <MorningRecap /> },
  { id: 'today-hero',     label: t('card_today_hero'),   render: () => <TodayHero /> },
  { id: 'momentum',       label: t('card_momentum'),     render: () => <MomentumChips /> },
  { id: 'coach-brief',    label: t('card_coach_brief'),  render: () => <CoachBrief /> },
  { id: 'momentum-spine', label: t('card_streak'),       render: () => <StreakChallengeRow /> },
  { id: 'pmc',            label: t('card_pmc'),          render: () => <PMCCompact /> },
  { id: 'season-stats',   label: t('card_season'),       render: () => <SeasonStats /> },
  { id: 'achievements',   label: t('card_badges'),       render: () => <AchievementBadges /> },
  { id: 'did-you-know',   label: t('card_dyk'),          render: () => <DidYouKnow /> },
  { id: 'log-strip',      label: t('card_log'),          render: () => <TrainingLogStrip /> },
  { id: 'deep-dive',      label: t('card_deep_dive'),    render: () => <TodayDeepDive /> },
]

export default function TodayTab() {
  return <ReorderableTab tabId="today" cards={TODAY_CARDS} />
}
```

The grid pair (`StreakStrip` + `WeeklyChallenge`) and the deep-dive
`DashboardSection` each become a single registry unit (wrapped in tiny local
sub-components like `StreakChallengeRow` / `TodayDeepDive`).

### `<ReorderableTab>` — the shared primitive

Responsibilities:

1. Resolve order + visibility for `tabId` via `useTabOrder(tabId, cards)`.
2. **Normal mode:** render visible cards in resolved order inside the existing
   `flex flex-col gap-4 sm:gap-5` column. Hidden cards omitted. A small
   **"Customize"** text button sits top-right above the stack.
3. **Customize mode:** replace the stack with a compact list editor:
   - one row per registry card = drag handle (☰) + label + hide toggle (eye/
     eye-off). Cards that currently self-render `null` still appear here, so any
     card can be reordered/hidden regardless of today's data.
   - `@dnd-kit/sortable` (`DndContext` + `SortableContext` + `useSortable`,
     `verticalListSortingStrategy`) for drag.
   - Footer actions: **Done** (exit editor), **Reset to default**.
   - Edits mutate local working state; persistence is debounced/optimistic via
     `useUpdateTabLayouts()` (see below). "Done" just exits — order is already
     saved.

### Reconcile (pure function)

`reconcile(saved: CardPref[] | undefined, registry: CardDef[]): ResolvedCard[]`

- Walk `registry` in default order to establish each card's default index.
- Start from `saved` order/visibility for ids that still exist in `registry`.
- **Insert newly-shipped registry cards at their default index** (a new card
  lands near where the code placed it, not at the bottom).
- Drop saved ids no longer present in `registry`.
- Returns `{ id, label, render, hidden }[]` in final display order.

This makes old saved layouts forward-compatible as cards are added/removed.
It is pure and the primary unit of testable logic.

## Data model & API (backend)

### Model — `app/models/user_tab_layout.py`

One row per user; JSON blob; RLS-protected, mirroring `UserDashboard`.

```python
class UserTabLayout(Base):
    __tablename__ = "user_tab_layouts"
    id: Mapped[int]        = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int]   = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
        unique=True, index=True,
    )
    # { "today": [{"id": "coach-brief", "hidden": false}, ...], "trends": [...] }
    layouts: Mapped[dict]  = mapped_column(JSON, nullable=False, default=dict)
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
        onupdate=func.now(), nullable=True,
    )
```

### Schemas — `app/schemas/user_tab_layout.py`

```python
class CardPref(BaseModel):
    id: str
    hidden: bool = False

class TabLayoutsPayload(BaseModel):
    layouts: dict[str, list[CardPref]]   # keyed by tabId

class TabLayoutsRead(TabLayoutsPayload):
    pass
```

Tab keys are stored permissively (no server-side enum) so the frontend can add
tabs without a migration. Light caps to bound payload size: ≤ 32 tab keys, ≤ 64
cards/tab, id length ≤ 64.

### Router — `app/api/tab_layouts.py`

- `GET /tab-layouts` → `TabLayoutsRead`; returns `{ "layouts": {} }` when the
  user has no row yet.
- `PUT /tab-layouts` (body `TabLayoutsPayload`) → upsert the single row, replace
  `layouts` wholesale, return the saved blob.
- Both depend on `get_current_active_user` + `get_db_for_user` (RLS).
- Register in `app/main.py` alongside the other routers.

### Migration

New Alembic revision creating `user_tab_layouts` (unique `user_id`, JSON
`layouts`, timestamps), following the existing migration style.

## Frontend data layer

- `api/tabLayouts.ts` — typed `getTabLayouts()` / `putTabLayouts(payload)`.
- `hooks/useTabLayouts.ts` — `useTabLayouts()` (query, cached) +
  `useUpdateTabLayouts()` (mutation; optimistic update of the cached blob).
- `hooks/useTabOrder.ts` — given `tabId` + registry, returns the reconciled
  `ResolvedCard[]`, a `setOrder`/`toggleHidden`/`reset` API, and `save()` that
  PUTs the merged blob (other tabs' entries preserved).

## Localization

Card labels and the "Customize" / "Done" / "Reset to default" strings go through
the existing `useT()` / locale system (en + de), consistent with the rest of the
dashboard.

## Edge cases

- **No saved layout:** reconcile with `saved = undefined` → default order, all
  visible. Identical to today's behavior.
- **All cards hidden:** allowed; normal view shows just the "Customize" button so
  the user can re-enable cards. (Optional polish: an empty-state hint.)
- **Self-hiding cards:** a card that renders `null` for lack of data still has a
  registry slot and still appears in the editor; in normal view it simply
  produces no DOM node (flex `gap` only applies between rendered children, so no
  empty gaps).
- **Concurrent edits across devices:** last PUT wins (whole-blob replace). The
  per-tab `save()` always merges against the freshest cached blob so editing one
  tab never clobbers another tab's saved order.

## Testing

- **Backend (pytest):**
  - GET with no row → `{ "layouts": {} }`.
  - PUT then GET round-trips the blob.
  - PUT upserts (second PUT replaces, doesn't duplicate the row).
  - RLS: user A cannot read/affect user B's layout.
  - Validation: oversized payload (too many tabs/cards) rejected.
- **Reconcile function:** extracted pure; covered by behavior verification (no
  frontend test runner is configured — adding one is out of scope). Cases:
  default passthrough, reorder applied, hidden applied, new card inserted at
  default index, removed saved id dropped.
- **UI (Playwright, against the running app):** open Customize, drag a card,
  hide a card, Done, reload the page → order + visibility persisted; Reset →
  back to default.

## Files touched (estimate)

**Backend (new):** `models/user_tab_layout.py`, `schemas/user_tab_layout.py`,
`api/tab_layouts.py`, one Alembic migration; **edit** `models/__init__.py`,
`app/main.py`; **tests** `tests/test_tab_layouts.py`.

**Frontend (new):** `components/dashboard/ReorderableTab.tsx`,
`components/dashboard/CardRegistry.ts` (types), `utils/reconcileLayout.ts`,
`api/tabLayouts.ts`, `hooks/useTabLayouts.ts`, `hooks/useTabOrder.ts`;
**edit** each card tab (`TodayTab`, `TrendsTab`, `PlanTab`, `WeekTab`,
`SportTab`) to declare a registry + render `<ReorderableTab>`; add locale
strings.
