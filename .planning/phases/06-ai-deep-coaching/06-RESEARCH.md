# Phase 6: AI Deep Coaching — Research

**Researched:** 2026-04-20
**Domain:** LLM tool-use, multi-turn analytical chat, LLM-driven workout modification
**Confidence:** HIGH for SDK patterns, MEDIUM for UX design, HIGH for codebase integration points

---

## Summary

Phase 6 extends the single-turn, grounded-in-snapshot `/coach/chat` into two new capabilities: (1) **analytical Q&A** where the LLM calls into a tool registry to pull targeted data on demand ("why am I tired?", "analyze my last 4 weeks"), and (2) **workout modification via chat** ("I only have 45 min", "make it harder", "swap to indoor") that mutates PlannedWorkouts on the calendar through the same template library + safety-rails pipeline that Phase 5.1 established.

The core architectural shift is moving from a **pre-assembled-snapshot** model (one fat `build_snapshot()` payload per chat turn) to a **tool-use agentic loop** where the LLM decides which data to fetch and which mutation to execute. Every tool call is server-authoritative — the LLM never mutates state directly; it calls `modify_planned_workout(...)` and the backend re-runs the rails + template downgrade cascade before returning the diff.

**Primary recommendation:** Build a **manual tool-use loop** (not the beta `tool_runner`) using the existing `anthropic>=0.42.0` SDK, with 5 read tools + 1 write tool (`modify_planned_workout`). Stream the final text response only — tool calls run non-streamed, with UI "thinking…" + status frames between them. Persist conversation state (new `coach_chat_threads` + `coach_chat_messages` tables) so follow-ups ("what should I do about it?") work. Route all workout mutations through a new `modify_planned_workout_service` that re-runs `resolve_and_prescribe`-style rails checks. Invalidate `planned-workouts` + `coach-brief` React Query keys on every successful mutation.

---

## Standard Stack

### Already in the codebase (reuse, don't add)

| Library | Version | Phase 6 Purpose |
|---------|---------|-----------------|
| `anthropic` | 0.43.1 (installed), `>=0.42.0` required | Tool-use loop via raw `messages.create` / `messages.stream` |
| FastAPI + SSE (StreamingResponse) | current | Status frames + final text streaming |
| SQLAlchemy async + Alembic | current | New `coach_chat_threads` / `coach_chat_messages` tables |
| React Query | current | Cache invalidation after modifications |
| uPlot + recharts | current | Inline analytical charts in chat (CTL sparkline, zone bars) |
| Pydantic v2 | current | Tool input/output schemas (same pattern as `BRIEF_TOOL`) |

### Not needed (explicitly do NOT add)

| Temptation | Why not |
|------------|---------|
| `langchain` / `llama-index` | Over-engineered for 5 tools; raw SDK is 200 lines |
| Vector DB / RAG | Data is structured, not documents; SQL queries beat semantic search |
| `pydantic-ai` / `instructor` | Raw SDK + JSON schema already works; switching costs a phase |
| Anthropic `tool_runner` beta | Only in SDK `>=0.68` (not installed); beta API; hides the loop we need control over |
| `openai` / multi-model abstraction | One provider, keep the prompt-caching cost advantage |

### Anthropic SDK capability matrix (verified via docs)

| Feature | Available in 0.43.1 | Phase 6 usage |
|---------|---------------------|---------------|
| `messages.create` with `tools=[...]` | YES | Tool-use loop (non-streamed during loop) |
| `messages.stream(...)` with tools | YES | Stream the final turn after loop exits |
| `stop_reason == "tool_use"` vs `"end_turn"` | YES | Loop termination check |
| `cache_control: ephemeral` on system prompt | YES (5.x uses it) | Keep; 80% cost savings on system prompt |
| `cache_control` on tool_result blocks | YES | Cache expensive aggregations (e.g. 4-week analysis) |
| `eager_input_streaming` / fine-grained tool streaming | YES | NOT needed for Phase 6 (we don't need to see partial tool args) |
| `tool_runner` beta decorator | SDK >=0.68 only | SKIP; manual loop is simpler + more explicit for rails integration |
| `beta_async_tool` | SDK >=0.68 only | SKIP |

**Source:** [Handle tool calls](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls), [Tool Runner](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-runner), [Fine-grained tool streaming](https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming).

---

## Architecture Patterns

### Recommended Module Structure

```
backend/app/services/
├── coach_service.py            # UNCHANGED — brief generation path
├── coach_prompt.py             # Extend with SYSTEM_PROMPT_DEEP (optional) + tool schemas
├── coach_chat_service.py       # NEW — tool-use loop orchestrator (replaces inlined `coach_chat_stream`)
├── coach_tools.py              # NEW — tool registry: schemas + Python impls (fetch_*)
├── workout_modification.py     # NEW — modify_planned_workout logic (rails-gated)
└── chat_thread_service.py      # NEW — thread + message persistence

backend/app/models/
├── coach_chat_thread.py        # NEW — { id, user_id, title, created_at, last_msg_at }
└── coach_chat_message.py       # NEW — { id, thread_id, role, content (JSONB blocks), model_used, tool_calls_json, created_at }

backend/app/api/
└── coach.py                    # Extend: /coach/chat stays SSE; add /coach/threads CRUD
```

### The Tool-Use Loop (canonical Python pattern)

This is the pattern documented at [Handle tool calls](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls) — it's what 05-xx's single-turn chat doesn't do today.

```python
# Source: synthesized from platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls
# and handle-tool-calls format requirements (tool_result MUST be first in user content)

async def run_tool_loop(
    client: AsyncAnthropic,
    system_blocks: list,
    messages: list[dict],
    tools: list[dict],
    tool_impls: dict[str, callable],   # name → async callable(input: dict) -> str | list[dict]
    model: str,
    max_iterations: int = 8,
) -> tuple[list[dict], str]:
    """Run the agentic loop. Returns (updated_messages, final_text).

    Emits status frames via the caller's SSE generator between turns.
    """
    for _ in range(max_iterations):
        response = await client.messages.create(
            model=model,
            max_tokens=2048,
            system=system_blocks,
            tools=tools,
            messages=messages,
        )

        # Append assistant turn (must include ALL content blocks, not just text)
        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason == "end_turn":
            # Extract final text
            final_text = "".join(
                b.text for b in response.content if getattr(b, "type", None) == "text"
            )
            return messages, final_text

        if response.stop_reason != "tool_use":
            # max_tokens / stop_sequence / pause_turn — treat as end of loop
            return messages, ""

        # Run every tool_use block in parallel (API allows N per turn)
        tool_results: list[dict] = []
        for block in response.content:
            if getattr(block, "type", None) != "tool_use":
                continue
            fn = tool_impls.get(block.name)
            try:
                result = await fn(block.input)   # dict input
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result,  # str or content-block list
                })
            except Exception as exc:
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": f"Tool error: {exc}",
                    "is_error": True,
                })

        # CRITICAL: tool_result blocks MUST come first in the user content array
        messages.append({"role": "user", "content": tool_results})

    # Safety: max iterations reached
    return messages, "I've gathered the data but couldn't wrap up — ask me to summarize."
```

**Critical formatting rules** (from docs, not optional):

1. `tool_result` blocks MUST immediately follow their corresponding `tool_use` message — no intervening messages.
2. In the user message, `tool_result` blocks MUST come FIRST in the content array. Text (if any) comes AFTER.
3. The assistant message must be appended with its **full** `content` array (all `text` and `tool_use` blocks), not just a stringified summary.

**Source:** [Handle tool calls — Important formatting requirements](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls)

### Streaming strategy: loop first, stream last

Tool-use loops don't stream cleanly because each turn may be a tool call, not text. The recommended pattern:

1. **During the loop:** emit SSE `{"type":"tool_call","name":"fetch_pmc_window","status":"running"}` frames so the UI can show "Checking your last 4 weeks…" status messages.
2. **After `stop_reason == "end_turn"`:** the *loop itself* isn't streamed, but we have the final message already. Either:
   - Option A (simpler): emit the final text as one `{"type":"final","text":"..."}` SSE frame.
   - Option B (nicer UX): after the loop exits with `end_turn`, do **one more** `messages.stream(...)` call with the same accumulated messages — Claude will produce the same final answer token-by-token (deterministic because tool results are stable). Expensive but optional.

**Recommendation: Option A for MVP.** Option B is a polish pass. With prompt caching, re-running the same messages is cheap (~80% discount), but adds a round-trip.

### Alternative: stream text blocks WITHIN the tool-use loop

`messages.stream` with tools does yield text deltas between tool calls. Pattern:
```python
async with client.messages.stream(...) as stream:
    async for event in stream:
        if event.type == "content_block_start" and event.content_block.type == "text":
            # Forward text deltas as SSE
        elif event.type == "content_block_start" and event.content_block.type == "tool_use":
            # Emit tool_call_start status frame
    final = await stream.get_final_message()
    # Then dispatch tools, loop
```

This gives the "I'll check your last 4 weeks…" intro text streamed character-by-character, then a tool call, then the final narrative streamed character-by-character. More work but feels faster.

**Recommendation: land the simple path first.** Decide streaming polish in Plan 03 (frontend).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multi-turn tool execution | Custom "detect tool call in string" regex | Raw `messages.create` + `stop_reason == "tool_use"` | SDK handles the protocol; structured content blocks are the contract |
| Conversation compaction | Hand-written summarizer | Prompt caching + thread-level summary on load (if >30 msgs) | Let cache_control do the work for short threads |
| Workout mutation logic | Parse free-text LLM output ("shorten by 15 min") | Structured tool `modify_planned_workout(modification_type, params)` | Structured input = rails-validatable = safe |
| Watts recalculation | Let LLM re-emit watts | `parametrize_template(template, ftp, duration_scale)` | Phase 5.1 invariant: server-side authority for watts |
| Rails enforcement | Re-author ceiling logic in chat path | Reuse `RailContext`, `intensity_ceiling()`, `_safe_template_for_ceiling()` | Same cascade as `resolve_and_prescribe` |
| Template substitution | LLM invents new interval structure | Enum of `modification_type`: `shorten`, `lengthen`, `easier`, `harder`, `indoor`, `swap_template` | Constrained vocabulary = safety |
| Activity aggregation | LLM computes weekly TSS from raw activity rows | `fetch_pmc_window(start, end)` returns pre-aggregated dict | Token efficiency + numerical correctness |
| Diff rendering | Line-by-line textual diff | Structured `{before: PrescribedWorkout, after: PrescribedWorkout, reason: str}` payload | UI can render both cards side-by-side |

**Key insight:** Every place in Phase 5-5.4 where "watts are server-authoritative" or "rails run after the LLM" is now also true for chat modifications. The tool contract MUST force the LLM to produce a `template_id` + modification op — never a raw interval structure.

---

## Code Examples

### 1. Tool schema registry (backend/app/services/coach_tools.py — proposed)

```python
# Source: pattern from backend/app/services/coach_prompt.py BRIEF_TOOL definition
# combined with handle-tool-calls docs for tool_result shape.

FETCH_PMC_WINDOW_TOOL = {
    "name": "fetch_pmc_window",
    "description": (
        "Return CTL/ATL/TSB trajectory + aggregated TSS and zone distribution for "
        "a date range. Use when the athlete asks about training load, fitness "
        "trends, weekly or multi-week summaries ('last 4 weeks', 'this month'). "
        "Returns per-week aggregates, not per-day — call fetch_recent_activities "
        "if the athlete wants a specific ride."
    ),
    "input_schema": {
        "type": "object",
        "required": ["start_date", "end_date"],
        "properties": {
            "start_date": {"type": "string", "description": "ISO date, inclusive"},
            "end_date":   {"type": "string", "description": "ISO date, inclusive"},
        },
    },
}

FETCH_RECOVERY_CONTEXT_TOOL = {
    "name": "fetch_recovery_context",
    "description": (
        "Return recent sleep score, HRV (7d vs 28d delta), resting HR, body "
        "battery, and the causal 'why am I tired?' synthesizer output. Use when "
        "the athlete asks about feeling tired, recovery, sleep quality, or "
        "'how's my body doing?'. Always returns the last 7 days."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "days": {"type": "integer", "default": 7, "minimum": 3, "maximum": 30},
        },
    },
}

FETCH_RECENT_ACTIVITIES_TOOL = {
    "name": "fetch_recent_activities",
    "description": (
        "Return structured list of recent completed activities with duration, TSS, "
        "normalized power, avg HR, EF, decoupling. Use when athlete asks about a "
        "specific ride, recent sessions, or activity-level detail."
    ),
    "input_schema": {
        "type": "object",
        "required": ["limit"],
        "properties": {
            "limit": {"type": "integer", "minimum": 1, "maximum": 30, "default": 10},
            "sport_filter": {"type": "string", "enum": ["cycling", "running", "gym", "any"], "default": "any"},
            "days_back": {"type": "integer", "minimum": 1, "maximum": 90, "default": 14},
        },
    },
}

FETCH_PLANNED_WORKOUT_TOOL = {
    "name": "fetch_planned_workout",
    "description": (
        "Return the athlete's planned workout for a given date (template_id, "
        "blocks, target TSS, duration). Use BEFORE modify_planned_workout to "
        "confirm what's scheduled."
    ),
    "input_schema": {
        "type": "object",
        "required": ["date"],
        "properties": {
            "date": {"type": "string", "description": "ISO date (YYYY-MM-DD)"},
        },
    },
}

MODIFY_PLANNED_WORKOUT_TOOL = {
    "name": "modify_planned_workout",
    "description": (
        "Modify a scheduled workout. Use when the athlete requests a change: "
        "'I only have 45 min', 'make it harder', 'swap to indoor', 'make it "
        "easier', 'add intervals'. The backend validates the modification "
        "against safety rails (intensity ceiling, TSS cap, injury flag) and "
        "may downgrade or reject. Returns the before/after PrescribedWorkout "
        "payloads and a reason string describing any rails adjustments. "
        "You MUST call fetch_planned_workout first to know what's scheduled."
    ),
    "input_schema": {
        "type": "object",
        "required": ["date", "modification"],
        "properties": {
            "date": {"type": "string"},
            "modification": {
                "type": "object",
                "required": ["type"],
                "properties": {
                    "type": {
                        "type": "string",
                        "enum": [
                            "shorten",        # params: duration_minutes
                            "lengthen",       # params: duration_minutes
                            "easier",         # substitute category-adjacent template
                            "harder",         # substitute category-adjacent template (rails may reject)
                            "swap_indoor",    # flag as indoor; may substitute to stable-power template
                            "swap_outdoor",
                            "swap_template",  # explicit template_id swap — LLM must supply
                            "move_to_date",   # params: new_date
                        ],
                    },
                    "duration_minutes": {"type": "integer", "minimum": 15, "maximum": 300},
                    "new_template_id": {"type": "string"},
                    "new_date": {"type": "string"},
                    "reason": {"type": "string", "description": "Why this change (shown to athlete in diff)"},
                },
            },
        },
    },
}

CHAT_TOOLS = [
    FETCH_PMC_WINDOW_TOOL,
    FETCH_RECOVERY_CONTEXT_TOOL,
    FETCH_RECENT_ACTIVITIES_TOOL,
    FETCH_PLANNED_WORKOUT_TOOL,
    MODIFY_PLANNED_WORKOUT_TOOL,
]
```

### 2. Tool implementation wrappers (Python callables)

```python
# Each tool_impl is async def (input: dict) -> str | list[dict]
# Reuses existing services — no duplication.

async def fetch_pmc_window_impl(db, user_id, input_: dict) -> str:
    """Aggregate weekly CTL/ATL/TSB + TSS + zone hours in range."""
    start = date.fromisoformat(input_["start_date"])
    end = date.fromisoformat(input_["end_date"])
    pmc = await compute_user_pmc(db, user_id, days=(end - start).days + 1)
    activities = await _activities_in_range(db, user_id, start, end)   # helper
    weekly = _group_by_iso_week(activities, pmc)
    # Return as JSON string — Claude reads JSON in tool_result fine
    return json.dumps({
        "start": start.isoformat(),
        "end": end.isoformat(),
        "weekly": weekly,  # [{week_start, ctl_end, tss_total, zone_hours, ...}]
        "ctl_delta_over_period": weekly[-1]["ctl_end"] - weekly[0]["ctl_start"],
    })

async def fetch_recovery_context_impl(db, user_id, input_: dict) -> str:
    days = input_.get("days", 7)
    hrv = await hrv_trend(db, user_id, days=days)
    rhr = await rhr_trend(db, user_id, days=days)
    sleep = await sleep_debt(db, user_id, days=14)
    tired = await why_am_i_tired(db, user_id)
    return json.dumps({"hrv": hrv, "rhr": rhr, "sleep": sleep, "causes": tired["causes"]})

async def modify_planned_workout_impl(db, user_id, input_: dict) -> str:
    """ALL mutations go through this. Rails run here. Diff is returned."""
    from app.services.workout_modification import modify_workout
    result = await modify_workout(
        db, user_id,
        date_=date.fromisoformat(input_["date"]),
        modification=input_["modification"],
    )
    # result: {before, after, rails_applied, rails_reason, accepted, persisted_id}
    return json.dumps(result)
```

### 3. Workout modification service — rails-gated

```python
# NEW — backend/app/services/workout_modification.py
# Pattern mirrors coach_service.resolve_and_prescribe (which already has the
# template-downgrade cascade). We reuse the SAME helpers.

from app.services.coach_service import (
    _SESSION_RANK, _CEILING_MAX_RANK, _safe_template_for_ceiling,
    _rewrite_prescribed_workout, _rails_from_snapshot,
)
from app.services.safety_rails import intensity_ceiling, max_tss_for_day
from app.services.workout_templates import TEMPLATES, parametrize_template

# Modification-type → candidate template resolver
_CATEGORY_CHAIN = {
    # current → easier (downgrade) / harder (upgrade)
    "recovery":   ("rest_day", "z2_endurance_60"),
    "endurance":  ("recovery_30", "tempo_3x10"),
    "tempo":      ("z2_endurance_90", "sweet_spot_2x20"),
    "sweet_spot": ("tempo_3x10", "threshold_2x15"),
    "threshold":  ("sweet_spot_2x20", "vo2_5x4"),
    "vo2":        ("threshold_2x15", "vo2_micro_30x30"),
}

async def modify_workout(db, user_id, date_, modification: dict) -> dict:
    # 1. Load current PlannedWorkout
    pw = await _load_planned_workout_for_date(db, user_id, date_)
    if pw is None:
        return {"accepted": False, "reason": "No workout scheduled for that date."}

    before = _serialize_planned_as_prescribed(pw)  # dict shape matching PrescribedWorkout
    current_template_id = _template_id_from_pw(pw)

    # 2. Resolve target template_id from modification op
    mod_type = modification["type"]
    new_template_id = current_template_id
    duration_scale = 1.0

    if mod_type == "shorten" or mod_type == "lengthen":
        # Duration change → same template, different scale (clamped in parametrize)
        target_min = modification["duration_minutes"]
        default_min = _default_minutes(current_template_id)
        duration_scale = target_min / default_min
        # If >15% delta from current, substitute to an appropriately-sized template
        # from the same category (e.g., z2_long_180 → z2_endurance_90 for ≤60min)
        if duration_scale < 0.85 or duration_scale > 1.15:
            new_template_id = _pick_duration_match(current_template_id, target_min)
            duration_scale = 1.0
    elif mod_type == "easier":
        easier, _ = _CATEGORY_CHAIN.get(TEMPLATES[current_template_id].category, (current_template_id, None))
        new_template_id = easier
    elif mod_type == "harder":
        _, harder = _CATEGORY_CHAIN.get(TEMPLATES[current_template_id].category, (None, current_template_id))
        new_template_id = harder or current_template_id
    elif mod_type == "swap_template":
        new_template_id = modification["new_template_id"]
        if new_template_id not in TEMPLATES:
            return {"accepted": False, "reason": f"Unknown template: {new_template_id}"}
    elif mod_type == "swap_indoor":
        # Heuristic: long Z2 outdoor → shorter steadier indoor (trainer can't coast)
        # Or: keep template, just flag indoor in metadata
        new_template_id = _indoor_equivalent(current_template_id)
    # ... etc

    # 3. Run safety rails (same as brief-time)
    snapshot = await coach_service.build_snapshot(db, user_id, language="simple")
    rails_ctx = _rails_from_snapshot(snapshot)
    ceiling = intensity_ceiling(rails_ctx)
    rank = _SESSION_RANK.get(new_template_id, 0)
    max_rank = _CEILING_MAX_RANK.get(ceiling, 6)

    rails_reason = None
    if rank > max_rank:
        downgraded = _safe_template_for_ceiling(ceiling)
        rails_reason = (
            f"Requested {new_template_id} but intensity ceiling is '{ceiling}' "
            f"(TSB {rails_ctx.tsb:.0f}, HRV {rails_ctx.hrv_delta_pct:+.0f}%). "
            f"Downgraded to {downgraded}."
        )
        new_template_id = downgraded

    # 4. Rewrite watts + persist
    profile = await _load_profile(db, user_id)
    ftp = profile.ftp_watts if profile else 0
    after = _rewrite_prescribed_workout(
        new_template_id, ftp,
        duration_minutes_hint=modification.get("duration_minutes"),
        why_this_workout=modification.get("reason"),
    )

    # 5. Persist back to PlannedWorkout.interval_structure + title + duration
    await _persist_modification(db, pw, after, new_date=modification.get("new_date"))
    await db.commit()

    return {
        "accepted": True,
        "persisted_id": pw.id,
        "before": before,
        "after": after,
        "rails_applied": rails_reason is not None,
        "rails_reason": rails_reason,
        "modification_type": mod_type,
    }
```

### 4. Chat SSE generator with status frames

```python
# Source: extend backend/app/services/coach_service.py::coach_chat_stream

async def coach_deep_chat_stream(
    db, user_id, thread_id: int, user_message: str, language: str,
) -> AsyncIterator[str]:
    import json as _json

    # 1. Load thread history
    messages = await _load_thread_messages(db, thread_id)
    messages.append({"role": "user", "content": user_message})

    # 2. Build system + tools
    system_blocks = [{
        "type": "text",
        "text": system_prompt_for_language(language) + DEEP_COACH_ADDENDUM,
        "cache_control": {"type": "ephemeral"},
    }]
    tools = CHAT_TOOLS
    tool_impls = {
        "fetch_pmc_window": lambda i: fetch_pmc_window_impl(db, user_id, i),
        "fetch_recovery_context": lambda i: fetch_recovery_context_impl(db, user_id, i),
        "fetch_recent_activities": lambda i: fetch_recent_activities_impl(db, user_id, i),
        "fetch_planned_workout": lambda i: fetch_planned_workout_impl(db, user_id, i),
        "modify_planned_workout": lambda i: modify_planned_workout_impl(db, user_id, i),
    }

    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    # 3. Tool loop — non-streaming, status frames between turns
    for iteration in range(8):
        yield f"data: {_json.dumps({'type':'thinking','iteration':iteration})}\n\n"

        response = await client.messages.create(
            model=settings.COACH_CHAT_MODEL,
            max_tokens=2048, system=system_blocks, tools=tools, messages=messages,
        )
        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason == "end_turn":
            final_text = "".join(b.text for b in response.content if getattr(b,"type",None) == "text")
            # Safety filter + stream to client as one frame (or re-stream for polish)
            allowed, safe = validate_chat_response(final_text)
            if not allowed:
                yield f"data: {_json.dumps({'type':'replace','text':safe})}\n\n"
            else:
                yield f"data: {_json.dumps({'type':'final','text':final_text})}\n\n"
            # Persist both turns to coach_chat_messages
            await _persist_turn(db, thread_id, user_message, messages[-1], response.usage)
            yield f"data: {_json.dumps({'type':'done'})}\n\n"
            return

        if response.stop_reason != "tool_use":
            yield f"data: {_json.dumps({'type':'error','message':f'stop_reason={response.stop_reason}'})}\n\n"
            return

        # Run tools; emit status + tool_modification frames (so UI can refetch)
        tool_results = []
        for block in response.content:
            if getattr(block, "type", None) != "tool_use":
                continue
            yield f"data: {_json.dumps({'type':'tool_call','name':block.name,'input':block.input})}\n\n"
            try:
                result = await tool_impls[block.name](block.input)
            except Exception as exc:
                result = f"Error: {exc}"
                tool_results.append({"type":"tool_result","tool_use_id":block.id,"content":result,"is_error":True})
                yield f"data: {_json.dumps({'type':'tool_error','name':block.name,'error':str(exc)})}\n\n"
                continue
            tool_results.append({"type":"tool_result","tool_use_id":block.id,"content":result})
            # Side-channel: if modification happened, emit frame so UI invalidates caches
            if block.name == "modify_planned_workout":
                yield f"data: {_json.dumps({'type':'workout_modified','result':_json.loads(result)})}\n\n"

        messages.append({"role": "user", "content": tool_results})

    yield f"data: {_json.dumps({'type':'error','message':'max iterations reached'})}\n\n"
```

### 5. Conversation persistence schema

```python
# NEW models — additive, no backward-compat issues

class CoachChatThread(Base):
    __tablename__ = "coach_chat_threads"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)  # LLM-generated from first msg
    language: Mapped[str] = mapped_column(String(20), nullable=False, default="simple")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_message_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class CoachChatMessage(Base):
    __tablename__ = "coach_chat_messages"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    thread_id: Mapped[int] = mapped_column(ForeignKey("coach_chat_threads.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # user | assistant
    # Store the FULL content blocks (text + tool_use + tool_result) so replay is exact
    content: Mapped[list] = mapped_column(JSONB, nullable=False)
    model_used: Mapped[str | None] = mapped_column(String(50), nullable=True)
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cache_hit_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

---

## Common Pitfalls

### Pitfall 1: Losing the full assistant content when persisting

**What goes wrong:** Storing only `text` content of the assistant turn (not the `tool_use` blocks) makes replay impossible — next turn, the loop breaks because `tool_result` blocks lack a matching `tool_use`.

**Why it happens:** Developers intuitively store "the text the user saw" but the API protocol requires the full content array as-is.

**How to avoid:** Persist `response.content` as JSONB (all blocks). On thread reload, reconstruct the exact message list. See [Handle tool calls — Important formatting requirements](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls).

**Warning signs:** API 400 "tool_use ids were found without tool_result blocks immediately after".

### Pitfall 2: Letting the LLM author raw intervals

**What goes wrong:** LLM responds with `{"intervals": [{"duration_seconds": 1800, "power_watts": 280}]}` and the backend trusts it. User gets a workout at wrong watts or above rails.

**Why it happens:** Open-ended tool schema; no enum on `modification_type`.

**How to avoid:** Tool schema enums `modification.type`; new_template_id is validated against `TEMPLATES`; rails run after; `parametrize_template` recomputes watts from FTP.

**Warning signs:** `new_template_id` not in `TEMPLATES` dict → reject with tool error. In tests: fuzz the tool input with garbage and assert rails catch every path.

### Pitfall 3: Modification bypasses rails

**What goes wrong:** Athlete says "make tomorrow a VO2 day" at TSB -25. Chat mutation skips `intensity_ceiling()` check that `resolve_and_prescribe` applies.

**Why it happens:** Two code paths to PlannedWorkout (brief + chat) with rails only on one.

**How to avoid:** `modify_workout()` calls `build_snapshot()` → `_rails_from_snapshot()` → `intensity_ceiling()` before persisting. Every mutation re-evaluates rails. Downgrade reason is returned in the tool_result so the LLM narrates it.

**Warning signs:** Tests: mock `rails_ctx` with TSB -40, request VO2 modification, assert template is downgraded and `rails_reason` is populated.

### Pitfall 4: Frontend cache stale after modification

**What goes wrong:** LLM modifies tomorrow's workout. Calendar still shows old version because React Query didn't invalidate.

**Why it happens:** Chat component doesn't know it caused a server mutation.

**How to avoid:** Server emits `{"type":"workout_modified",...}` SSE frame; `useCoachChat` hook invalidates these keys on receipt:
- `['planned-workouts', ...]` (from `usePlannedWorkouts.ts`)
- `['coach', 'brief', language]` (from `useCoachBrief.ts`)
- `['pmc']` (if TSS changed materially — optional)

**Warning signs:** Stale workout card after "shorten to 45 min"; user has to refresh.

### Pitfall 5: "Analyze my last 4 weeks" blows the token budget

**What goes wrong:** LLM calls `fetch_recent_activities(limit=30, days_back=28)` — 30 activities × 500 tokens each = 15K tokens in one tool_result. Context fills, later turns fail.

**Why it happens:** No pre-aggregation; raw activity rows go to the LLM.

**How to avoid:** `fetch_pmc_window` returns **weekly aggregates**, not activities. Separate tool for individual activities with `limit <= 30`. Cache large tool_results with `cache_control: ephemeral` on the result block so iteration within the same thread reuses them.

**Warning signs:** Context-length 400 errors; slow turn latency.

### Pitfall 6: Stateless chat can't handle follow-ups

**What goes wrong:** "Why am I tired?" → LLM answers. "What should I do about it?" — session cleared, LLM has no context, gives generic advice.

**Why it happens:** Phase 5 chat is session-local React state; snapshot rebuilt every request.

**How to avoid:** Persist threads. Default: each new page visit = new thread unless thread_id passed in URL. Threads auto-expire (configurable, e.g., 30 days) for GDPR compliance.

**Warning signs:** Athletes report "the coach forgets what I asked".

### Pitfall 7: Prompt cache invalidation on tool_choice changes

**What goes wrong:** Switching `tool_choice` between turns invalidates the cache prefix.

**Why it happens:** Per docs: *"changes to the tool_choice parameter will invalidate cached message blocks"*.

**How to avoid:** Keep `tool_choice` consistent — don't toggle between "auto" and "any" within a thread. We use "auto" throughout (default).

**Source:** [Define tools — Forcing tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools)

### Pitfall 8: ED-filter runs too late

**What goes wrong:** `validate_chat_response` currently runs on the full buffered text AFTER streaming — but Phase 6's chat may contain multiple text segments separated by tool calls. ED content in the first text segment streams to the user before the filter has the full buffer.

**Why it happens:** Current `coach_chat_stream` buffers the whole stream before filtering.

**How to avoid:** Run the filter on the final text before emitting the `final` frame. If we do per-turn text streaming (Option B), filter each text block before streaming it. Simpler: Option A (emit final-only) keeps current semantics.

### Pitfall 9: Chat mutations lose audit trail

**What goes wrong:** User says "change my Wednesday to recovery". 3 days later they ask "why was Wed recovery?" — no record of the chat-driven change.

**Why it happens:** PlannedWorkout updated in place, no audit.

**How to avoid:** Chat messages table stores the `tool_use` + `tool_result` blocks containing the full modification payload. Optional: add `planned_workout_history` table if we want per-field change tracking (out of scope for 6 — the chat log is enough).

---

## Analytical Q&A Design Decisions

### Pre-assembled snapshot vs tool-use

| Factor | Pre-assembled (today) | Tool-use (Phase 6) |
|--------|----------------------|---------------------|
| Latency | 1 round-trip | 2-4 round-trips typical |
| Token cost per turn | Large constant | Variable — often smaller (no irrelevant data) |
| Follow-up agility | Snapshot is fixed | Claude can fetch fresh data mid-turn |
| "Give me last 4 weeks" | Impossible — snapshot is 14d | Natural — fetch_pmc_window with dates |
| Prompt caching | System prompt cached; user message varies | Same + individual tool results can be cached |

**Recommendation:** Move to tool-use. Keep a lightweight seed snapshot (athlete FTP, today's date, timezone) in the system prompt so trivial questions ("what's my FTP?") don't require a round-trip.

### Structured cards vs streamed text

For "why am I tired?" — current `/coach/why` returns structured `causes[]` and frontend renders. Good pattern.

For "analyze my last 4 weeks" — LLM narrative is valuable, but so is a data viz (CTL trend, hours by zone).

**Recommendation:**
- Phase 6.0 (MVP): pure text streaming. No structured analytical cards.
- Phase 6.x (polish): add an optional `emit_chart` tool that returns a chart spec `{type: "pmc_sparkline", start, end}` which frontend renders inline. Keep the complexity out of MVP.

### Chart inlining

Chat drawer has `highlightData()` already (monospace pills for numbers). For Phase 6.0 this is enough — "CTL rose from 58 to 67" is data-rich without a chart.

If charts become a goal, reuse existing `PMCChart` component; mount it inline in chat bubbles when LLM emits a chart-tool result. Not MVP.

---

## Workout Modification UX Decisions

### Diff presentation

**Option A — Text-only narrative:**
LLM writes "Okay, I shortened tomorrow's sweet spot from 90min to 45min. Same intensity, half the volume." User sees text only; calendar auto-updates in background.

**Option B — Inline diff card:**
Chat message includes a structured `WorkoutDiffCard` rendered from the `workout_modified` SSE frame, showing before/after side-by-side + rails reason + "Undo" button.

**Recommendation: Option B.** It's the difference between "the coach said something and things changed" and "the coach shows me what changed". Direct observability.

### Undo / confirm

**Options:**
1. No confirmation, no undo — LLM's word is final.
2. Auto-apply, show "Undo" button in diff card for 30s.
3. Show "Apply" button, mutation doesn't persist until user clicks.

**Recommendation: Option 2.** Tennis-match "Apply?" prompts break conversational flow. Undo-on-card matches Gmail's model.

**Implementation:** `modify_workout()` persists immediately; undo = second mutation that reverses (backend tracks `previous_template_id` + `previous_duration` in a `pending_undo` JSONB col, or just re-mutates to "before" state from the chat frame).

### When modifications are declined

If rails downgrade ("you asked for VO2 but you're at TSB -25, switched to recovery"), the LLM must explain. The `modify_workout` tool returns `rails_applied: true, rails_reason: "..."` and the LLM weaves that into its reply.

Simple-mode rails reason must also be plain English. Extend `_safe_template_for_ceiling` with a language-aware reason renderer.

---

## Conversation Memory Decisions

### Persistence model

**Recommendation: Thread-per-session, not thread-per-user.** New thread when user reopens drawer after > N hours, or on explicit "New chat" button. Each thread persists all messages with full content blocks.

### Context window management

- Short threads (<20 turns): send all messages each turn. Prompt caching handles cost.
- Long threads (>20 turns): **summarize-then-trim.** Background job (or synchronous on thread open) runs a summarization call once thread exceeds threshold, replaces first N messages with a `[Summary: ...]` system-style message.
- For Phase 6.0 MVP: enforce thread-level max-turn cap (e.g., 30 turns). User must start new thread. Summarization is Phase 6.x polish.

### GDPR

Threads + messages are PII-adjacent (coach discussions about health signals). `coach_chat_threads` and `coach_chat_messages` tables need:
- FK cascade delete from users (already present in pattern)
- Retention policy configurable (default: indefinite; add `DELETE FROM coach_chat_threads WHERE last_message_at < now() - interval '1 year'` cron for self-hosted deployments if needed)

---

## Model Selection

| Task | Current model | Phase 6 recommendation |
|------|---------------|------------------------|
| Brief generation | `COACH_MODEL = "claude-opus-4-7"` | Keep Opus — deep analytical reasoning |
| Chat (single-turn today) | `COACH_CHAT_MODEL = "claude-sonnet-4-6"` | Keep Sonnet for chat — cost + latency |
| Tool-use analytical Q&A | — | **Sonnet.** Opus only if quality gap shows |
| Workout modification | — | **Sonnet.** Deterministic-enough given structured tool |

**Key consideration:** Tool schemas are included in every prompt-cache prefix. Switching between Opus and Sonnet within a thread invalidates cache. Stick to one model per thread.

**Config change:** No new env vars. Reuse `COACH_CHAT_MODEL` for both analytical and modification paths. If Opus quality needed for 4-week analysis, add `COACH_ANALYTICAL_MODEL` later.

---

## Safety & Guardrails

All Phase 5 rails apply identically to Phase 6:

| Rail | Phase 5 location | Phase 6 application |
|------|------------------|---------------------|
| `intensity_ceiling(RailContext)` | Brief generation | Every `modify_workout` call |
| `max_tss_for_day(ctl)` | Brief generation | Check `parametrize_template`'s `predicted_tss` vs cap before persisting |
| `_safe_template_for_ceiling(ceiling)` | Brief downgrade | Same; reason surfaced in tool_result |
| Injury flag → rest_day | Brief generation | `modify_workout` rejects all non-rest/recovery modifications when flag set |
| `validate_chat_response(text)` ED filter | Final chat buffer | Apply to final text frame (not per-tool-result) |
| `post_ride` present → no new prescription | Brief generation | `modify_workout` rejects modification for today if post_ride |

**New rail needed:** "You can't modify today's workout if you've already ridden today (post_ride present)." Mirrors `resolve_and_prescribe` behavior. Return `accepted: false, reason: "Already trained today — nothing to modify."`

---

## Frontend Changes Needed

### Cache invalidation map (per modification event)

Copy this list into the chat hook:

```typescript
// On receiving {type: 'workout_modified'} SSE frame:
qc.invalidateQueries({ queryKey: ['planned-workouts'] })
qc.invalidateQueries({ queryKey: ['coach', 'brief'] })   // brief mentions tomorrow's workout
qc.invalidateQueries({ queryKey: ['pmc'] })              // if TSS delta material
// Do NOT invalidate: activities, intraday, daily-metrics, garmin/status
```

Reference: existing keys in `frontend/src/hooks/useForceSync.ts:26-31`, `usePlannedWorkouts.ts:19`, `useCoachBrief.ts:22`.

### Chat drawer upgrades

| Change | Where |
|--------|-------|
| Render `tool_call` status frame → "Checking your last 4 weeks…" line | `useCoachChat.ts` streamer branch |
| Render `workout_modified` frame → inline `WorkoutDiffCard` | New component; reuses `PrescribedWorkoutCard` shape |
| Persist threads — switch from session state to server-backed | `useCoachChat.ts` + new `useCoachThread(threadId)` hook |
| Language toggle still works — thread's `language` is locked on creation | Existing `LanguageContext` |
| ED filter runs on `final` frame | Already handled server-side |
| Rate limiter still in-memory deque; raise to 40/min/user for deeper analyses | `backend/app/api/coach.py:50-51` |

### New endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/coach/threads` | List user's threads (paginated, last-msg-at desc) |
| `POST` | `/coach/threads` | Create new thread (optional title) |
| `GET` | `/coach/threads/{id}/messages` | Load message history for replay |
| `POST` | `/coach/threads/{id}/messages` | Send user turn; SSE streams reply (replaces current `/coach/chat`) |
| `DELETE` | `/coach/threads/{id}` | Delete thread + messages (cascade) |

**Backward compat:** keep `/coach/chat` as a shim that creates an ephemeral thread, runs one turn, doesn't persist. Or deprecate cleanly — Phase 6's coach chat IS thread-based.

---

## State of the Art

| Old Approach (Phase 5) | Current Approach (Phase 6) | Impact |
|-----------------------|---------------------------|--------|
| Pre-assembled snapshot JSON in every chat turn | Tool-use agentic loop — Claude fetches targeted data | Lower token cost, supports arbitrary time windows |
| Session-local chat state (React) | Persisted threads (DB) | Multi-turn follow-ups work; conversation history survives reloads |
| Brief is the only write path to prescription | `modify_planned_workout` tool writes to PlannedWorkout | Athletes can iteratively refine workouts conversationally |
| `coach_chat_stream` uses plain `messages.stream` | Stream-final-only after tool loop OR per-text-block streaming | More status feedback ("thinking…", "checking your data…") |
| `SYSTEM_PROMPT_SIMPLE` / `_TECHNICAL` only | Optional `DEEP_COACH_ADDENDUM` listing tools + when to call them | LLM needs guidance on when to call fetch_* vs answer from memory |

### Deprecated/outdated

- **Nothing in 5.x is deprecated by 6.** Phase 6 adds; existing paths keep working. `/coach/chat` can be shimmed.

---

## Open Questions

### 1. Should the brief path also use tool-use?

- **What we know:** Brief generation is structured — LLM picks a template + narrates. Current single-call model with `tool_choice: "tool"` forcing `brief_response` works well.
- **What's unclear:** Could the brief benefit from fetching its own data? E.g., LLM decides "I need zone distribution" and calls `fetch_zone_distribution` rather than reading it from the pre-assembled snapshot.
- **Recommendation:** **No change in Phase 6.** Brief generation is latency-sensitive (dashboard loads wait for it). Tool-use adds round-trips. Defer to future phase if needed.

### 2. How aggressive is "auto-apply" vs "confirm"?

- **What we know:** Undo-on-card is the cleanest UX (Gmail precedent).
- **What's unclear:** For destructive mutations (delete workout, move across weeks), maybe confirm is safer.
- **Recommendation:** Planning-time user decision. Default: auto-apply with undo card. Escalate to confirm for `move_to_date` spanning >7 days.

### 3. Do we need a separate "analytical" system prompt?

- **What we know:** `SYSTEM_PROMPT_SIMPLE` + `SYSTEM_PROMPT_TECHNICAL` are brief-focused ("HOW YOU RESPOND — THE PRESCRIPTION FLOW"). They mention prescribed_workout + alternates.
- **What's unclear:** Does deep chat need a separate prompt that emphasizes tools + when to call them + no tool schema for brief_response?
- **Recommendation:** Add a `DEEP_COACH_ADDENDUM` string appended at chat time to the language prompt. Explains the tool surface, when to call which tool, how to format final-turn narrative. Reuse existing brief prompts otherwise (same personality, vocabulary rules).

### 4. Rate limit — is 20/min/user still correct?

- **What we know:** Today's limit is 20 requests/min/user (in-memory deque).
- **What's unclear:** Tool-use turns = 1 request each (loop is server-internal). So "20/min" = 20 user messages, not 20 Claude calls. That's still reasonable.
- **Recommendation:** Keep 20 for MVP; raise to 30 if users hit it. Consider per-user daily Claude-call cap to bound cost (separate telemetry).

### 5. Cost ceiling for power users

- **What we know:** Opus 4.7 is expensive; a 4-week-analysis turn with 3 tool calls could be 10-15K tokens.
- **What's unclear:** No per-user spend monitoring exists today.
- **Recommendation:** Plan 04 (or a separate observability phase) adds `input_tokens` + `output_tokens` + `cache_hit_tokens` columns to `coach_chat_messages` (already in schema proposal). Analytics dashboard in a later phase. Don't gate on this.

### 6. Multi-day modifications ("rearrange my week")

- **What we know:** Current tool schema handles one-date mutations.
- **What's unclear:** "Move my hard days to Tue/Thu instead of Wed/Sat" = 4 correlated mutations.
- **Recommendation:** Out of scope for Phase 6 MVP. Document as Phase 7+ extension. LLM can chain 4 `modify_planned_workout` calls in one turn (parallel tool use supported), but each is rails-checked independently — tricky for weekly load balancing.

---

## Integration Points with Existing Code

### Reuse (don't duplicate)

| Existing | Reused by Phase 6 |
|----------|-------------------|
| `coach_service.build_snapshot()` | Called by `modify_workout` to get rails context |
| `coach_service._rails_from_snapshot()` | Same |
| `coach_service._SESSION_RANK` + `_CEILING_MAX_RANK` | Downgrade cascade in `modify_workout` |
| `coach_service._safe_template_for_ceiling()` | Downgrade target |
| `coach_service._rewrite_prescribed_workout()` | Watts rewrite after modification |
| `safety_rails.intensity_ceiling()` | Every modification |
| `safety_rails.max_tss_for_day()` | TSS cap check |
| `safety_rails.validate_chat_response()` | Final-text ED filter |
| `workout_templates.TEMPLATES` / `get_template()` / `parametrize_template()` | All modifications |
| `advanced_metrics.why_am_i_tired()` | `fetch_recovery_context_impl` |
| `advanced_metrics.hrv_trend`, `rhr_trend`, `sleep_debt`, `zone_distribution` | Tool impls |
| `pmc_service.compute_user_pmc()` | `fetch_pmc_window_impl` |
| `coach_prompt.system_prompt_for_language()` | Chat system prompt |
| `planned_workout_service` | Load/update PlannedWorkout |

### New code (net additions)

| File | Purpose | Est. LOC |
|------|---------|---------:|
| `backend/app/services/coach_tools.py` | Tool schemas + impls | ~400 |
| `backend/app/services/coach_chat_service.py` | Tool-use loop orchestrator | ~300 |
| `backend/app/services/workout_modification.py` | modify_workout + rails | ~300 |
| `backend/app/services/chat_thread_service.py` | Thread + message CRUD | ~150 |
| `backend/app/models/coach_chat_thread.py` | Thread model | ~30 |
| `backend/app/models/coach_chat_message.py` | Message model | ~30 |
| `backend/app/schemas/coach_chat.py` | Pydantic request/response | ~100 |
| `backend/app/api/coach.py` | Extend with /threads routes | ~+150 |
| Alembic migration | New tables | ~60 |
| `frontend/src/hooks/useCoachThread.ts` | Thread-aware chat state | ~200 |
| `frontend/src/components/dashboard/CoachChat.tsx` | Diff card, tool-call status, persistence | ~+300 |
| `frontend/src/components/dashboard/WorkoutDiffCard.tsx` | Before/after viz | ~200 |
| Tests | backend + frontend | ~1000 |

**Rough total:** ~3200 LOC net new. 4 PLAN.md files ≈ 800 LOC each feels right.

---

## Suggested Plan Breakdown (for the planner)

| Plan | Scope | Key deliverables |
|------|-------|------------------|
| **06.1** — Tool registry + analytical Q&A backend | Read-only tools; no modifications yet | `coach_tools.py`, `coach_chat_service.py` (read path), tests |
| **06.2** — Thread persistence | DB schema, CRUD, history replay | 2 models + Alembic + service + /threads endpoints |
| **06.3** — Workout modification backend | `modify_workout`, rails integration, `modify_planned_workout` tool | `workout_modification.py`, tool impl, `workout_modified` SSE frame |
| **06.4** — Frontend: chat drawer + diff card + invalidation | Thread UI, tool-call status frames, `WorkoutDiffCard`, cache invalidation | Hook + component changes |

Optional **06.5** polish: stream final text (Option B), inline charts, thread summarization.

---

## Sources

### Primary (HIGH confidence)

- [Anthropic — Handle tool calls](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls) — tool_use / tool_result protocol, formatting requirements
- [Anthropic — Define tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use) — tool schema, tool_choice, best practices
- [Anthropic — Tool Runner (SDK)](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-runner) — confirmed SDK >=0.68 requirement (we have 0.43.1)
- [Anthropic — Fine-grained tool streaming](https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming) — eager_input_streaming, deltas, accumulation
- [Anthropic — Streaming messages](https://platform.claude.com/docs/en/build-with-claude/streaming) — SSE events, final-message accumulation
- Local codebase inspection:
  - `backend/app/services/coach_service.py` (1591 lines) — brief generation, resolve_and_prescribe, streaming pattern
  - `backend/app/services/coach_prompt.py` (577 lines) — BRIEF_TOOL schema + language prompts
  - `backend/app/services/safety_rails.py` (228 lines) — rails cascade
  - `backend/app/services/workout_templates.py` (489 lines) — TEMPLATES + parametrize_template
  - `backend/app/services/advanced_metrics.py` — why_am_i_tired, hrv_trend, etc.
  - `backend/app/api/coach.py` — /coach/chat SSE, rate limiter
  - `backend/app/models/planned_workout.py` — PlannedWorkout schema
  - `frontend/src/api/coach.ts` + `hooks/useCoachChat.ts` + `components/dashboard/CoachChat.tsx`

### Secondary (MEDIUM confidence)

- [Anthropic SDK Python GitHub](https://github.com/anthropics/anthropic-sdk-python) — confirms tool_runner is beta
- Installed SDK: `anthropic==0.43.1` (pip show output)

### Tertiary (LOW confidence)

- WebSearch results summarizing tool-use best practices (verified against official docs above)

---

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|------|-------|--------|
| Tool-use SDK patterns | HIGH | Official docs, explicit code examples verified against installed SDK version |
| Conversation persistence schema | HIGH | Standard pattern, no ambiguity |
| Workout modification design | MEDIUM | New — design decisions (enum of mod types, downgrade cascade) are best-guess based on Phase 5.1 precedent; may need iteration |
| Rails re-application | HIGH | Direct reuse of existing Phase 5.1 code |
| Frontend cache invalidation | HIGH | Existing key patterns confirmed in codebase |
| Streaming strategy | MEDIUM | Multiple viable options; Option A vs B is a design call |
| Model selection (Sonnet vs Opus) | MEDIUM | Depends on empirical quality — starts with Sonnet, may need Opus upgrade for 4-week analyses |
| "Analyze X" pre-aggregation shape | MEDIUM | Tool response design depends on what Claude actually asks for in practice — needs iteration |

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (30 days — SDK and API patterns are stable; revisit if `tool_runner` GAs or model pricing shifts)
