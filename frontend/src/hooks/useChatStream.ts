/**
 * useChatStream — Phase 6 Wave 3 chat hook.
 *
 * Extends the 05-02 `useCoachChat` pattern with:
 *   - Inline tool-use lifecycle tracking (`currentToolUse` / `toolUseLog`)
 *     so the UI can render "Analyzing your training data..." and a
 *     "Tools Used" transparency section.
 *   - Inline tool-result cards injected into the message stream (role='tool'
 *     synthetic messages) so modification cards render in chronological
 *     context next to the assistant narration.
 *   - React Query cache invalidation on successful `modify_planned_workout`
 *     tool results — planned-workouts + coach-brief keys are invalidated
 *     without a full page refresh.
 *
 * Session-local invariant: `toolUseLog` resets with `reset()`; consumer
 * (CoachChat) calls reset() on drawer-close per 05-02's ephemeral-chat
 * decision.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getAccessToken } from '../api/client'
import { useLanguage } from '../contexts/LanguageContext'
import { parseCoachStream, type ChatStreamEvent } from '../lib/coach-chat-stream'
import { COACH_BRIEF_KEY_ROOT } from './useCoachBrief'

// ─── Types ────────────────────────────────────────────────────────────────────

const BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8000'

export type ToolName =
  | 'fetch_pmc_window'
  | 'fetch_recovery_trend'
  | 'fetch_recent_activities'
  | 'fetch_ftp_history'
  | 'fetch_planned_workout'
  | 'modify_planned_workout'
  | string

export interface WorkoutModificationResult {
  success?: boolean
  date?: string
  modification_type?: string
  template_id?: string
  duration_min?: number
  indoor?: boolean
  rails_downgraded?: boolean
  reason?: string
  before?: { template_id: string; duration_min: number }
  predicted_tss?: number
  title?: string
  framework_cited?: string
}

export interface ChatMessageUser {
  role: 'user'
  content: string
}

export interface ChatMessageAssistant {
  role: 'assistant'
  content: string
}

export interface ChatMessageTool {
  role: 'tool'
  toolName: ToolName
  result: Record<string, unknown>
  isError: boolean
}

export type ChatMessage =
  | ChatMessageUser
  | ChatMessageAssistant
  | ChatMessageTool

export interface ToolUseLogEntry {
  name: ToolName
  input: Record<string, unknown>
  result?: Record<string, unknown>
  isError?: boolean
  startedAt: number
  completedAt?: number
}

export interface ChatStreamOptions {
  /** Called when a `modify_planned_workout` tool result with success=true arrives. */
  onModification?: (result: WorkoutModificationResult) => void
}

export interface ChatStreamState {
  messages: ChatMessage[]
  partial: string
  isStreaming: boolean
  currentToolUse: { name: ToolName; input: Record<string, unknown> } | null
  toolUseLog: ToolUseLogEntry[]
  error: string | null
  /** True when backend returned 503 — chat disabled until ANTHROPIC_API_KEY set */
  disabled: boolean
  send: (text: string) => Promise<void>
  reset: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Filter a ChatMessage[] down to the wire-format the backend accepts —
 * user/assistant only, plain string content. Tool cards are UI artefacts
 * and must not round-trip to /coach/chat.
 */
function toBackendHistory(
  messages: ChatMessage[],
  appendedUser: string,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const wire: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const m of messages) {
    if (m.role === 'user' || m.role === 'assistant') {
      wire.push({ role: m.role, content: m.content })
    }
  }
  wire.push({ role: 'user', content: appendedUser })
  return wire
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

const INITIAL: Omit<ChatStreamState, 'send' | 'reset'> = {
  messages: [],
  partial: '',
  isStreaming: false,
  currentToolUse: null,
  toolUseLog: [],
  error: null,
  disabled: false,
}

export function useChatStream(opts: ChatStreamOptions = {}): ChatStreamState {
  const { language } = useLanguage()
  const queryClient = useQueryClient()
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL.messages)
  const [partial, setPartial] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [currentToolUse, setCurrentToolUse] = useState<
    ChatStreamState['currentToolUse']
  >(null)
  const [toolUseLog, setToolUseLog] = useState<ToolUseLogEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [disabled, setDisabled] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  // Keep a ref to `onModification` so we don't re-create `send` on every render.
  const onModificationRef = useRef(opts.onModification)
  useEffect(() => {
    onModificationRef.current = opts.onModification
  }, [opts.onModification])

  // Abort any in-flight stream on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || isStreaming) return

      const wireHistory = toBackendHistory(messages, trimmed)
      const userMsg: ChatMessageUser = { role: 'user', content: trimmed }
      setMessages((prev) => [...prev, userMsg])
      setPartial('')
      setError(null)
      setIsStreaming(true)
      setCurrentToolUse(null)

      const controller = new AbortController()
      abortRef.current = controller

      let accumulated = ''
      let gotError = false

      try {
        const token = getAccessToken()
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        }
        if (token) headers.Authorization = `Bearer ${token}`

        const response = await fetch(`${BASE_URL}/coach/chat`, {
          method: 'POST',
          credentials: 'include',
          headers,
          body: JSON.stringify({ messages: wireHistory, language }),
          signal: controller.signal,
        })

        if (response.status === 503) {
          setDisabled(true)
          setError(
            'AI chat unavailable. Set ANTHROPIC_API_KEY to enable.',
          )
          // Roll the user message back on total send failure.
          setMessages((prev) => prev.slice(0, -1))
          return
        }
        if (response.status === 429) {
          setError('Rate limited — 20 messages per minute per user.')
          setMessages((prev) => prev.slice(0, -1))
          return
        }
        if (!response.ok) {
          setError(`Coach chat failed with HTTP ${response.status}`)
          setMessages((prev) => prev.slice(0, -1))
          return
        }

        for await (const evt of parseCoachStream(response)) {
          handleEvent(evt)
        }
      } catch (err) {
        if (controller.signal.aborted) {
          // Graceful abort — don't surface as error
          return
        }
        gotError = true
        setError((err as Error)?.message || 'Chat stream errored')
      } finally {
        if (!gotError) {
          // Commit the final accumulated assistant text as a completed message.
          if (accumulated.trim().length > 0) {
            setMessages((prev) => [
              ...prev,
              { role: 'assistant', content: accumulated },
            ])
          }
        }
        setPartial('')
        setIsStreaming(false)
        setCurrentToolUse(null)
        abortRef.current = null
      }

      function handleEvent(evt: ChatStreamEvent): void {
        switch (evt.type) {
          case 'content': {
            accumulated += evt.delta
            setPartial(accumulated)
            return
          }
          case 'replace': {
            accumulated = evt.text
            setPartial(accumulated)
            return
          }
          case 'tool_use_start': {
            setCurrentToolUse({ name: evt.name, input: evt.input })
            setToolUseLog((prev) => [
              ...prev,
              {
                name: evt.name,
                input: evt.input,
                startedAt: Date.now(),
              },
            ])
            return
          }
          case 'tool_use_result': {
            setCurrentToolUse(null)
            const resultObj =
              typeof evt.result === 'string'
                ? { raw: evt.result }
                : evt.result
            setToolUseLog((prev) => {
              // Mark the most-recent entry for this tool name as completed.
              const next = [...prev]
              for (let i = next.length - 1; i >= 0; i -= 1) {
                if (next[i].name === evt.name && next[i].completedAt === undefined) {
                  next[i] = {
                    ...next[i],
                    result: resultObj,
                    isError: evt.isError,
                    completedAt: Date.now(),
                  }
                  break
                }
              }
              return next
            })
            // Inject a tool-card into the message stream so it renders inline.
            const toolMsg: ChatMessageTool = {
              role: 'tool',
              toolName: evt.name,
              result: resultObj,
              isError: evt.isError,
            }
            setMessages((prev) => [...prev, toolMsg])

            // Invalidate React Query caches on successful write-tool results.
            if (
              evt.name === 'modify_planned_workout' &&
              !evt.isError &&
              (resultObj as { success?: boolean }).success === true
            ) {
              queryClient.invalidateQueries({ queryKey: ['planned-workouts'] })
              queryClient.invalidateQueries({ queryKey: COACH_BRIEF_KEY_ROOT })
              onModificationRef.current?.(
                resultObj as unknown as WorkoutModificationResult,
              )
            }
            return
          }
          case 'error': {
            gotError = true
            setError(evt.message)
            return
          }
          case 'done': {
            // Handled in the `finally` block; nothing to do here.
            return
          }
          default:
            return
        }
      }
    },
    [isStreaming, messages, language, queryClient],
  )

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
    setPartial('')
    setError(null)
    setIsStreaming(false)
    setCurrentToolUse(null)
    setToolUseLog([])
  }, [])

  return {
    messages,
    partial,
    isStreaming,
    currentToolUse,
    toolUseLog,
    error,
    disabled,
    send,
    reset,
  }
}
