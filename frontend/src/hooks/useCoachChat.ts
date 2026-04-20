import { useCallback, useEffect, useRef, useState } from 'react'
import { streamCoachChat, type ChatMessage } from '../api/coach'
import { useLanguage } from '../contexts/LanguageContext'

export interface CoachChatState {
  messages: ChatMessage[]
  partial: string
  isStreaming: boolean
  error: string | null
  /** True when backend returned 503 — chat disabled until ANTHROPIC_API_KEY set */
  disabled: boolean
  sendMessage: (text: string) => Promise<void>
  reset: () => void
}

/**
 * Local-state chat store — messages live for the session only.
 * Persisting to the server would require an audit table we don't want yet;
 * the coach already persists briefs, chat is ephemeral by design.
 *
 * The chat stream is language-aware: the current language from
 * `<LanguageProvider>` is attached to every request body so the coach's
 * replies match whatever the user picked in the masthead toggle.
 */
export function useCoachChat(): CoachChatState {
  const { language } = useLanguage()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [partial, setPartial] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [disabled, setDisabled] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // Cleanup any in-flight request if the consumer unmounts
  useEffect(() => {
    return () => { abortRef.current?.abort() }
  }, [])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isStreaming) return

    const userMsg: ChatMessage = { role: 'user', content: trimmed }
    // Snapshot the history *before* we append the user turn so the request
    // body is built from the correct, pre-send list.
    const priorMessages = messages
    const nextMessages: ChatMessage[] = [...priorMessages, userMsg]
    setMessages(nextMessages)
    setPartial('')
    setError(null)
    setIsStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    let accumulated = ''

    try {
      for await (const chunk of streamCoachChat(nextMessages, language, controller.signal)) {
        if (chunk.type === 'delta' && chunk.text) {
          accumulated += chunk.text
          setPartial(accumulated)
        } else if (chunk.type === 'replace' && chunk.text) {
          accumulated = chunk.text
          setPartial(accumulated)
        } else if (chunk.type === 'error') {
          throw new Error(chunk.message || 'Coach chat stream errored')
        }
        // 'done' closes the generator naturally
      }

      // Finalize: commit the partial as a completed assistant message
      if (accumulated) {
        setMessages((prev) => [...prev, { role: 'assistant', content: accumulated }])
      }
      setPartial('')
    } catch (err) {
      const typed = err as Error & { status?: number; detail?: string }
      if (controller.signal.aborted) {
        setPartial('')
        return
      }
      if (typed.status === 503) {
        setDisabled(true)
        setError(typed.detail || 'AI chat unavailable. Set ANTHROPIC_API_KEY to enable.')
      } else if (typed.status === 429) {
        setError('Rate limited — 20 messages per minute per user.')
      } else {
        setError(typed.message || 'Something went wrong with the coach chat.')
      }
      // Roll the user's message back if the send failed completely so they can retry
      setMessages(priorMessages)
      setPartial('')
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }, [isStreaming, messages, language])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
    setPartial('')
    setError(null)
    setIsStreaming(false)
  }, [])

  return { messages, partial, isStreaming, error, disabled, sendMessage, reset }
}
