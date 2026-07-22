# Design — Structured coach answers (fact-chips + terse verdict)

**Date:** 2026-07-22
**Status:** Approved (design), pending spec review
**Author:** Claude + Jannis

## Problem

The AI coach's chat answers render as one long markdown paragraph (with literal
`**bold**` showing raw). Example: a "bin ich heute bereit?" reply is ~8 sentences of
prose that buries the key numbers (RHR ~48 bpm, sleep 7.8 h, body-battery 33/100) and
the actual verdict inside text.

The user wants answers rendered as **fact chips + a short verdict**, not a text blob.

## Current architecture (verified)

- `/coach/chat` (`backend/app/api/coach.py`) SSE-streams via
  `coach_service.generate_analytical_chat_stream` — a Claude **tool-use loop**.
- SSE event types today: `content` (text delta), `tool_use_start`, `tool_use_result`.
- Tool *results* already render as inline cards in `CoachChat.tsx`:
  `WorkoutModifiedCard`, `AnalyticalAnswerCard`, else a compact "retrieved data" pill.
- The coach's actual answer is streamed as `content` and rendered by `AssistantBubble`
  as plain text — this is the blob being complained about.
- Providers: Claude → OpenAI → rule-based fallback (commit `71b7598`). Fallback providers
  may not support tool calls.

## Chosen shape (user-selected)

**Fact-chip row + short summary.** Compact row of grounded stat chips, then a 1–2
sentence verdict. **Terse by default; detailed reasoning only when the user asks**
(e.g. "warum?"), returned as normal streamed prose.

## Approach

Reuse the existing tool-card path via a new **terminal `present_answer` tool**, rather
than adding a new SSE event stream. The model finishes its turn by calling
`present_answer` instead of writing prose; the result renders as a card.

Rejected alternative: a dedicated SSE `answer` event carrying `{facts, summary}`. It
would preserve token-streaming of the summary but adds a parallel streaming/parsing path.
Not worth it for a 1–2 sentence summary. (Trade-off accepted: the summary arrives
complete, not token-streamed; a light client reveal covers the feel.)

## Contract

```jsonc
present_answer({
  "facts": [                     // 0–4 grounded chips; [] when no data
    { "label": "Ruhepuls", "value": 48, "unit": "bpm", "tone": "good" },
    { "label": "Schlaf",   "value": 7.8, "unit": "h",  "tone": "good" },
    { "label": "Körperakku","value": 33, "unit": "/100","tone": "caution" }
  ],
  "summary": "Intervalle möglich, aber halt dich anfangs zurück."  // 1–2 sentences
})
```
- `tone` ∈ `good | caution | neutral` → drives chip color (reuse existing tokens).
- `value` may be string or number; `unit` optional.

## Components

### Backend
1. **`coach_tools`** — register `present_answer` (schema above). Handler is a pure
   pass-through: it validates/normalizes and returns the structured payload as the tool
   result (no DB writes). Caps `facts` at 4, coerces types, trims `summary`.
2. **`coach_service.generate_analytical_chat_stream`** — treat `present_answer` as a
   **loop-terminating** tool: when the model calls it, emit its payload as a
   `tool_use_result` (name `present_answer`) and end the turn. `summary` passes through
   `validate_chat_response` (ED-adjacent safety) exactly like assembled text does today.
3. **`coach_prompt`** — instruct the coach to answer by calling `present_answer` with:
   - only numbers it actually retrieved via data tools (no invented values);
   - 2–4 chips max, chosen for this question;
   - a 1–2 sentence `summary`;
   - fuller reasoning ONLY when the user explicitly asks why → then answer as normal
     streamed prose (do not call `present_answer`).
   - When no data is available, emit `facts: []` + an honest summary (keep "—" ethic).

### Frontend
4. **`CoachAnswerCard`** (new, `components/coach/`) — renders the chip row + summary,
   reusing `AnalyticalAnswerCard`'s chip/`num-mono` visual language and tone colors.
5. **`CoachChat.tsx`** — add a dispatch case: `toolName === 'present_answer'` →
   `CoachAnswerCard`. Suppress the empty `AssistantBubble` when the turn ended via
   `present_answer`.
6. **`useChatStream.ts` / `lib/coach-chat-stream.ts`** — add `'present_answer'` to
   `ToolName` and the result-shape types.

### Fallback / degradation
- Rule-based / OpenAI providers that don't call tools → the coach answers as plain
  `content` text → existing `AssistantBubble` path renders it unchanged. Structured
  chips are a progressive enhancement, never a hard dependency.

## Testing (TDD)
- Backend: `present_answer` handler normalizes/caps facts, trims summary, runs the safety
  validator on `summary`; loop terminates on the call; no-data path returns `facts: []`.
- Frontend: `CoachAnswerCard` renders chips with correct tone classes + summary; the
  `present_answer` dispatch case fires; plain-text fallback still renders via
  `AssistantBubble`.
- Regression: existing coach-chat tool cards + streaming still pass.

## Out of scope
- Token-streaming the summary (rejected alternative above).
- Restructuring the existing `AnalyticalAnswerCard` / tool cards.
- Markdown rendering of long prose replies (the "warum?" detail path stays plain text;
  if raw `**bold**` there is still undesirable, handle as a separate small follow-up).

## Risks
- Model ignores the tool and writes prose anyway → prompt-adherence risk. Mitigated by a
  firm prompt rule + the graceful text fallback (no breakage, just no chips that turn).
- Hallucinated chip values → mitigated by the grounding rule; consider (follow-up) a
  backend cross-check of chip values against retrieved tool data before emitting.
