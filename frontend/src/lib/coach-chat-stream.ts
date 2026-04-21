/**
 * SSE parser for /coach/chat (Phase 6 Wave 3).
 *
 * The /coach/chat endpoint streams Server-Sent Events. There are TWO kinds of
 * frames, and the parser normalises them into a single `ChatStreamEvent`
 * union so callers don't have to care which wire shape produced which event.
 *
 *   1. `event: tool_use_start` / `event: tool_use_result`
 *      Emitted during the Claude tool-use loop so the UI can render
 *      "Analyzing your training data..." intermediate state BEFORE the
 *      final text streams in. The `data:` JSON omits the `type` field
 *      (the SSE `event:` line carries the type instead).
 *
 *   2. Bare `data: {"type": "delta" | "replace" | "done" | "error", ...}`
 *      Phase 05-02 style frames — the assembled text streams back chunk by
 *      chunk as `delta`, the ED-keyword filter emits `replace`, the loop
 *      terminates with `done`, and any wrapper-level exception surfaces as
 *      `error`.
 *
 * The parser handles partial-frame chunks (SSE frames may be split across
 * `ReadableStream` reads) and tolerates unknown event types gracefully.
 *
 * No tests file for this module — it's a thin generator wrapped by
 * `useChatStream`; the hook-level behaviour is covered by the integration
 * surface in `CoachChat.tsx`.
 */

export type ChatStreamEvent =
  | { type: 'content'; delta: string }
  | { type: 'replace'; text: string; reason?: string }
  | {
      type: 'tool_use_start'
      name: string
      input: Record<string, unknown>
    }
  | {
      type: 'tool_use_result'
      name: string
      result: Record<string, unknown> | string
      isError: boolean
    }
  | { type: 'done' }
  | { type: 'error'; message: string }

export async function* parseCoachStream(
  response: Response,
): AsyncGenerator<ChatStreamEvent, void, unknown> {
  if (!response.body) {
    yield { type: 'error', message: 'No response body' }
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        // Flush any remaining buffer content as a final frame (edge case:
        // server closes the stream without a trailing blank line). In the
        // normal path the backend emits a `done` frame before closing.
        if (buffer.trim().length > 0) {
          const evt = parseFrame(buffer)
          if (evt) yield evt
          buffer = ''
        }
        yield { type: 'done' }
        return
      }

      buffer += decoder.decode(value, { stream: true })

      // SSE frames are separated by a blank line ("\n\n").
      let idx: number
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        const evt = parseFrame(frame)
        if (evt) yield evt
      }
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      /* noop */
    }
  }
}

/**
 * Parse one SSE frame (already stripped of the trailing blank line).
 *
 * A frame has up to one `event: ...` line and one-or-more `data: ...`
 * lines. `data:` lines concatenated with newlines per the SSE spec.
 */
function parseFrame(frame: string): ChatStreamEvent | null {
  const lines = frame.split('\n')
  let eventType = ''
  const dataChunks: string[] = []

  for (const raw of lines) {
    if (raw.startsWith('event:')) {
      eventType = raw.slice(6).trim()
    } else if (raw.startsWith('data:')) {
      dataChunks.push(raw.slice(5).trimStart())
    }
    // ignore `:comment` and other SSE directives
  }

  if (dataChunks.length === 0) return null
  const dataStr = dataChunks.join('\n')

  let payload: unknown
  try {
    payload = JSON.parse(dataStr)
  } catch {
    // Malformed JSON — surface as an error frame rather than silently
    // dropping data. Truncate the sample so we don't flood console.
    return {
      type: 'error',
      message: `Malformed SSE frame: ${dataStr.slice(0, 120)}`,
    }
  }

  // Tool-use lifecycle frames — type comes from `event:` line.
  if (eventType === 'tool_use_start') {
    const d = payload as { name?: string; input?: Record<string, unknown> }
    return {
      type: 'tool_use_start',
      name: d.name ?? 'unknown',
      input: d.input ?? {},
    }
  }
  if (eventType === 'tool_use_result') {
    const d = payload as {
      name?: string
      result?: Record<string, unknown> | string
      is_error?: boolean
    }
    return {
      type: 'tool_use_result',
      name: d.name ?? 'unknown',
      result: d.result ?? {},
      isError: Boolean(d.is_error),
    }
  }

  // Legacy bare-data frames — type comes from JSON payload.
  const p = payload as {
    type?: string
    text?: string
    delta?: string
    message?: string
    reason?: string
  }
  switch (p.type) {
    case 'delta':
      return { type: 'content', delta: p.text ?? p.delta ?? '' }
    case 'replace':
      return { type: 'replace', text: p.text ?? '', reason: p.reason }
    case 'done':
      return { type: 'done' }
    case 'error':
      return { type: 'error', message: p.message ?? 'Unknown error' }
    default:
      // Unknown event/type combo — return null so the consumer skips it
      // gracefully. Avoids breaking on future protocol additions.
      return null
  }
}
