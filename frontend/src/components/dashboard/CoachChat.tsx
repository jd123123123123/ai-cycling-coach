/**
 * CoachChat — Phase 6 Wave 3 upgrade.
 *
 * Migrated from the 05-02 ad-hoc fetch loop (useCoachChat) to the new
 * useChatStream hook that exposes tool-use lifecycle state. Key additions
 * vs the prior version:
 *   - "Analyzing your training data..." intermediate indicator while the
 *     Claude tool-use loop dispatches reads (fetch_pmc_window etc.)
 *   - Inline rendering of tool_use_result as cards:
 *       modify_planned_workout → WorkoutModifiedCard (before/after + rails)
 *       fetch_pmc_window / fetch_recovery_trend → AnalyticalAnswerCard
 *       anything else → a compact "Retrieved data" pill
 *   - Passes toolUseLog down to TransparencyDrawer (via a lifted context
 *     approach: we expose the log through a window-scoped singleton the
 *     drawer reads on open). Keeps this drawer self-contained while still
 *     letting the transparency drawer access the session's tool calls.
 *
 * Session-local invariant: when the drawer closes we call reset() so the
 * next open starts with a clean messages[] + toolUseLog[].
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { MessageSquare, X, Sparkles, CheckCircle2 } from 'lucide-react'
import { useChatStream, type ChatMessage, type ToolName } from '../../hooks/useChatStream'
import { setToolUseLogSnapshot } from '../../lib/chatToolUseLog'
import { useLanguage } from '../../contexts/LanguageContext'
import WorkoutModifiedCard from '../coach/WorkoutModifiedCard'
import AnalyticalAnswerCard from '../coach/AnalyticalAnswerCard'

// ─── Inline-data mono wrapping (unchanged from 05-02) ────────────────────────

function highlightData(text: string): React.ReactNode[] {
  const pattern = /([+-]?\d+(?:\.\d+)?(?:ms|bpm|TSS|\s?TSS|W|%|h|kg|mi|km|min))/g
  const nodes: React.ReactNode[] = []
  let lastIdx = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIdx) nodes.push(text.slice(lastIdx, match.index))
    nodes.push(
      <span
        key={`d${key++}`}
        className="num-mono text-[12.5px] px-1 rounded-sm"
        style={{ backgroundColor: 'rgba(20,24,17,0.05)', color: 'var(--color-ink)' }}
      >
        {match[0]}
      </span>,
    )
    lastIdx = match.index + match[0].length
  }
  if (lastIdx < text.length) nodes.push(text.slice(lastIdx))
  return nodes
}

// ─── Tool-use indicator copy ─────────────────────────────────────────────────
// Per-tool copy for the "Analyzing your..." intermediate state. Keeping
// these as a flat map makes future i18n cheap.
const TOOL_INDICATOR_COPY: Record<
  ToolName,
  { simple: string; technical: string }
> = {
  fetch_pmc_window: {
    simple: 'Checking your fitness history',
    technical: 'Analyzing your training load',
  },
  fetch_recovery_trend: {
    simple: 'Looking at your recovery',
    technical: 'Checking recovery patterns',
  },
  fetch_recent_activities: {
    simple: 'Reading your recent rides',
    technical: 'Pulling recent activities',
  },
  fetch_ftp_history: {
    simple: 'Checking your fitness test history',
    technical: 'Loading FTP history',
  },
  fetch_planned_workout: {
    simple: 'Reading your upcoming workout',
    technical: 'Fetching planned workout',
  },
  modify_planned_workout: {
    simple: 'Updating your workout',
    technical: 'Modifying planned workout',
  },
}

function toolIndicatorCopy(
  name: ToolName,
  language: 'simple' | 'technical',
): string {
  const pair = TOOL_INDICATOR_COPY[name]
  if (pair) return language === 'simple' ? pair.simple : pair.technical
  return language === 'simple'
    ? 'Analyzing your training data'
    : `Running ${name}`
}

// ─── Message bubbles ─────────────────────────────────────────────────────────

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div
        className="max-w-[85%] px-3.5 py-2.5 rounded-[14px] rounded-br-[4px] text-[14px] leading-relaxed dashboard-break-words"
        style={{
          backgroundColor: 'var(--color-ink)',
          color: 'var(--color-paper)',
        }}
      >
        {text}
      </div>
    </div>
  )
}

function AssistantBubble({ text }: { text: string }) {
  return (
    <div className="flex gap-2.5 items-start">
      <div
        className="w-7 h-7 flex-shrink-0 rounded-full flex items-center justify-center mt-0.5"
        style={{
          backgroundColor: 'rgba(176, 74, 12, 0.12)',
          border: '1px solid rgba(176, 74, 12, 0.25)',
        }}
        aria-hidden
      >
        <Sparkles size={12} strokeWidth={1.8} style={{ color: 'var(--color-amber)' }} />
      </div>
      <div
        className="flex-1 min-w-0 px-3.5 py-2.5 rounded-[14px] rounded-tl-[4px] text-[14px] leading-relaxed dashboard-break-words"
        style={{
          backgroundColor: 'var(--color-paper)',
          border: '1px solid var(--color-rule)',
          color: 'var(--color-ink)',
        }}
      >
        {highlightData(text)}
      </div>
    </div>
  )
}

function StreamingBubble({
  text,
  indicatorCopy,
}: {
  text: string
  indicatorCopy: string | null
}) {
  return (
    <div className="flex gap-2.5 items-start">
      <div
        className="w-7 h-7 flex-shrink-0 rounded-full flex items-center justify-center mt-0.5"
        style={{
          backgroundColor: 'rgba(176, 74, 12, 0.12)',
          border: '1px solid rgba(176, 74, 12, 0.25)',
        }}
        aria-hidden
      >
        <Sparkles size={12} strokeWidth={1.8} style={{ color: 'var(--color-amber)' }} />
      </div>
      <div
        className="flex-1 min-w-0 px-3.5 py-2.5 rounded-[14px] rounded-tl-[4px] text-[14px] leading-relaxed dashboard-break-words"
        style={{
          backgroundColor: 'var(--color-paper)',
          border: '1px solid var(--color-rule)',
          color: 'var(--color-ink)',
        }}
      >
        {indicatorCopy ? (
          <span
            className="text-[13px] italic inline-flex items-center gap-1"
            style={{ color: 'var(--color-ink-2)' }}
          >
            {indicatorCopy}
            <span className="thinking-dots" aria-hidden />
          </span>
        ) : text ? (
          highlightData(text)
        ) : (
          <span className="opacity-60">Thinking…</span>
        )}
        {!indicatorCopy && <span className="streaming-caret" aria-hidden />}
        <style>{`
          .streaming-caret {
            display: inline-block;
            width: 0.5em;
            height: 1em;
            margin-left: 2px;
            background: var(--color-ink);
            vertical-align: -2px;
            animation: blink 1.05s steps(2) infinite;
          }
          .thinking-dots::after {
            content: '…';
            animation: pulse 1.4s ease-in-out infinite;
          }
          @keyframes blink { 0%,100% { opacity: 1 } 50% { opacity: 0 } }
          @keyframes pulse { 0%,100% { opacity: 0.4 } 50% { opacity: 1 } }
        `}</style>
      </div>
    </div>
  )
}

/**
 * Inline tool card — dispatches on toolName to the right component.
 * Write tools (modify_planned_workout) → WorkoutModifiedCard.
 * Read analytical tools (pmc / recovery) → AnalyticalAnswerCard.
 * Everything else → compact "retrieved data" pill.
 */
function ToolBubble({
  toolName,
  result,
  isError,
  isLatestModification,
  onUndo,
  undoDisabled,
}: {
  toolName: ToolName
  result: Record<string, unknown>
  isError: boolean
  /** True when this is the most-recent successful modify_planned_workout
      card in the session (drives the Undo button on WorkoutModifiedCard). */
  isLatestModification: boolean
  onUndo: () => void | Promise<void>
  undoDisabled: boolean
}) {
  if (isError) {
    return (
      <div
        className="rounded-[10px] px-3 py-2 text-[12px] leading-snug"
        style={{
          color: 'var(--color-alert)',
          backgroundColor: 'rgba(138, 29, 29, 0.06)',
          border: '1px solid rgba(138, 29, 29, 0.25)',
        }}
      >
        <span className="eyebrow">Tool error</span> · {toolName} ·{' '}
        {typeof result?.error === 'string' ? result.error : 'see transparency drawer'}
      </div>
    )
  }
  if (
    toolName === 'modify_planned_workout' &&
    (result as { success?: boolean }).success
  ) {
    return (
      <WorkoutModifiedCard
        result={result as unknown as Parameters<typeof WorkoutModifiedCard>[0]['result']}
        isLatest={isLatestModification}
        onUndo={onUndo}
        undoDisabled={undoDisabled}
      />
    )
  }
  if (
    toolName === 'modify_planned_workout' &&
    (result as { success?: boolean }).success === false
  ) {
    // Already-trained-today / guard-rejected modification → friendly ack
    const reason =
      (result as { reason?: string }).reason ||
      'Workout could not be modified.'
    return (
      <div
        className="rounded-[12px] px-3 py-2.5 text-[13px] leading-snug flex items-start gap-2"
        style={{
          backgroundColor: 'var(--color-paper)',
          border: '1px solid var(--color-rule)',
          color: 'var(--color-ink-2)',
        }}
      >
        <CheckCircle2
          size={13}
          strokeWidth={1.8}
          style={{ color: 'var(--color-muted)', flexShrink: 0, marginTop: 2 }}
          aria-hidden
        />
        <span>{reason}</span>
      </div>
    )
  }
  if (
    toolName === 'fetch_pmc_window' ||
    toolName === 'fetch_recovery_trend'
  ) {
    return <AnalyticalAnswerCard toolName={toolName} result={result} />
  }
  // Generic compact pill for other read tools (FTP, activities, planned workout)
  return (
    <div
      className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-sm"
      style={{
        color: 'var(--color-ink-2)',
        backgroundColor: 'var(--color-paper)',
        border: '1px solid var(--color-rule)',
      }}
    >
      <CheckCircle2 size={10} strokeWidth={1.8} style={{ color: 'var(--color-forest-2)' }} />
      <span className="eyebrow">Retrieved</span>
      <span className="num-mono">{toolName}</span>
    </div>
  )
}

function renderMessage(
  m: ChatMessage,
  key: number,
  ctx: {
    isLatestModificationIndex: number | null
    onUndo: () => void | Promise<void>
    undoDisabled: boolean
  },
): React.ReactNode {
  if (m.role === 'user') return <UserBubble key={key} text={m.content} />
  if (m.role === 'assistant')
    return <AssistantBubble key={key} text={m.content} />
  // tool
  const isLatestModification =
    ctx.isLatestModificationIndex !== null && key === ctx.isLatestModificationIndex
  return (
    <ToolBubble
      key={key}
      toolName={m.toolName}
      result={m.result}
      isError={m.isError}
      isLatestModification={isLatestModification}
      onUndo={ctx.onUndo}
      undoDisabled={ctx.undoDisabled}
    />
  )
}

// ─── Suggestions (empty state) ───────────────────────────────────────────────

const SUGGESTIONS_SIMPLE: string[] = [
  'Why am I tired this week?',
  'Am I ready for hard intervals?',
  'I only have 45 minutes tomorrow',
  'Review my last 2 weeks',
]

const SUGGESTIONS_TECHNICAL: string[] = [
  'Why am I tired this week?',
  'Am I ready for a VO2 set?',
  'Shorten tomorrow to 45 minutes',
  'Review my last 2 weeks',
]

// ─── Drawer ──────────────────────────────────────────────────────────────────

interface CoachChatProps {
  open: boolean
  onClose: () => void
}

export default function CoachChat({ open, onClose }: CoachChatProps) {
  const {
    messages,
    partial,
    isStreaming,
    currentToolUse,
    toolUseLog,
    error,
    disabled,
    send,
    undoLastModification,
    reset,
  } = useChatStream({
    onModification: () => {
      // Transient "Workout updated" acknowledgement — kept inline rather
      // than a toast library to avoid pulling a new dependency.
      setFlash('Workout updated')
    },
  })
  const [input, setInput] = useState('')
  const [flash, setFlash] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const { language } = useLanguage()
  const simpleMode = language === 'simple'
  const suggestions = simpleMode ? SUGGESTIONS_SIMPLE : SUGGESTIONS_TECHNICAL

  // Mirror the tool-use log into the window-scoped snapshot so the
  // TransparencyDrawer (a sibling modal) can read it on open without us
  // having to lift chat state to the shell.
  useEffect(() => {
    setToolUseLogSnapshot(toolUseLog)
  }, [toolUseLog])

  // Body scroll lock + escape key
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  // Session reset on close — per 05-02's ephemeral-chat invariant the
  // tool-use log must not leak across sessions.
  useEffect(() => {
    if (!open) {
      // Delay the reset until the drawer is no longer rendered so in-flight
      // animations don't jank.
      const t = setTimeout(() => {
        reset()
        setToolUseLogSnapshot([])
      }, 240)
      return () => clearTimeout(t)
    }
  }, [open, reset])

  // Auto-resize textarea
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [input])

  // Auto-scroll to bottom on each token / new message
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, partial, currentToolUse])

  // Focus the input when drawer opens
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => textareaRef.current?.focus(), 180)
      return () => clearTimeout(t)
    }
  }, [open])

  // Auto-clear flash after a couple seconds
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 2400)
    return () => clearTimeout(t)
  }, [flash])

  const handleSubmit = async () => {
    if (!input.trim() || isStreaming || disabled) return
    const payload = input
    setInput('')
    await send(payload)
  }

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void handleSubmit()
    }
  }

  if (!open) return null

  const indicatorCopy = currentToolUse
    ? toolIndicatorCopy(currentToolUse.name, language)
    : null

  const content = (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ backgroundColor: 'rgba(20,24,17,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="coach-chat-title"
    >
      <div
        className="paper-grain flex flex-col w-full md:w-[480px] h-full shadow-2xl animate-slide-in"
        style={{
          backgroundColor: 'var(--color-paper-2)',
          borderLeft: '1px solid var(--color-rule)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between gap-3 px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--color-rule)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare size={14} strokeWidth={1.8} style={{ color: 'var(--color-amber)' }} />
            <span
              id="coach-chat-title"
              className="eyebrow"
              style={{ color: 'var(--color-amber)' }}
            >
              Coach · chat
            </span>
            {messages.length > 0 && !disabled && (
              <button
                onClick={reset}
                className="eyebrow opacity-60 hover:opacity-100 transition-opacity ml-1"
                aria-label="Clear conversation"
              >
                clear
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-full min-w-[40px] min-h-[40px] flex items-center justify-center transition-colors"
            style={{
              color: 'var(--color-ink-2)',
              border: '1px solid var(--color-rule)',
              backgroundColor: 'var(--color-paper)',
            }}
            aria-label="Close coach chat"
          >
            <X size={15} strokeWidth={2} />
          </button>
        </div>

        {/* Transient flash — "Workout updated" etc. Soft, non-blocking. */}
        {flash && (
          <div
            className="px-5 py-2 text-[12px] flex items-center gap-2"
            style={{
              backgroundColor: 'rgba(124, 158, 126, 0.12)',
              borderBottom: '1px solid rgba(124, 158, 126, 0.3)',
              color: 'var(--color-forest-2)',
            }}
          >
            <CheckCircle2 size={12} strokeWidth={1.8} />
            {flash}
          </div>
        )}

        {/* Body — messages + empty state */}
        <div
          ref={scrollerRef}
          className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 flex flex-col gap-4 min-w-0"
        >
          {messages.length === 0 && !isStreaming && (
            <div className="flex flex-col gap-5 mt-4">
              <div>
                <h3
                  className="num-display leading-tight"
                  style={{
                    fontSize: 24,
                    color: 'var(--color-ink)',
                    fontStyle: 'italic',
                  }}
                >
                  Ask about your training, recovery, or what to do today.
                </h3>
                <p
                  className="mt-3 text-[13px] leading-relaxed"
                  style={{ color: 'var(--color-ink-2)' }}
                >
                  {simpleMode
                    ? "The coach reads your recent rides, recovery, and planned workouts — and can even update tomorrow's workout if life changes your plans."
                    : "The coach can cite your HRV, TSB, recent rides, sleep debt, and zone mix — and can modify tomorrow's planned workout in-chat (shorten, harder, easier, indoor)."}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <span className="eyebrow">Try</span>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    disabled={disabled}
                    onClick={() => {
                      setInput(s)
                      void send(s)
                      setInput('')
                    }}
                    className="text-left text-[13px] leading-snug px-3 py-2 rounded-[10px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      color: 'var(--color-ink-2)',
                      backgroundColor: 'var(--color-paper)',
                      border: '1px solid var(--color-rule)',
                    }}
                  >
                    &ldquo;{s}&rdquo;
                  </button>
                ))}
              </div>
            </div>
          )}

          {(() => {
            // Find the index of the LATEST successful modify_planned_workout
            // tool card — Undo button only renders on that one. Undoing an
            // earlier modification is out of scope for the session-local
            // invariant (the backend 60-min window further enforces this).
            let latestModIdx: number | null = null
            for (let i = messages.length - 1; i >= 0; i -= 1) {
              const m = messages[i]
              if (
                m.role === 'tool' &&
                m.toolName === 'modify_planned_workout' &&
                !m.isError &&
                (m.result as { success?: boolean }).success === true
              ) {
                latestModIdx = i
                break
              }
            }
            const ctx = {
              isLatestModificationIndex: latestModIdx,
              onUndo: undoLastModification,
              undoDisabled: isStreaming || disabled,
            }
            return messages.map((m, i) => renderMessage(m, i, ctx))
          })()}
          {isStreaming && (
            <StreamingBubble text={partial} indicatorCopy={indicatorCopy} />
          )}

          {error && (
            <div
              className="rounded-[10px] px-3 py-2 text-[12px] leading-snug"
              style={{
                color: 'var(--color-alert)',
                backgroundColor: 'rgba(138, 29, 29, 0.06)',
                border: '1px solid rgba(138, 29, 29, 0.25)',
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Composer */}
        <div
          className="flex-shrink-0 p-4"
          style={{ borderTop: '1px solid var(--color-rule)' }}
        >
          <div
            className="flex items-end gap-2 rounded-[14px] px-3 py-2"
            style={{
              backgroundColor: 'var(--color-paper)',
              border: '1px solid var(--color-rule)',
              opacity: disabled ? 0.55 : 1,
            }}
            title={disabled ? 'Set ANTHROPIC_API_KEY in backend/.env to enable chat' : undefined}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={disabled || isStreaming}
              placeholder={
                disabled
                  ? 'Chat disabled — set ANTHROPIC_API_KEY in backend/.env'
                  : 'Ask the coach… ⌘/Ctrl+Enter to send'
              }
              rows={1}
              className="flex-1 bg-transparent outline-none resize-none text-[14px] leading-relaxed min-w-0 disabled:cursor-not-allowed"
              style={{
                color: 'var(--color-ink)',
                minHeight: 24,
                maxHeight: 200,
              }}
            />
            <button
              onClick={() => void handleSubmit()}
              disabled={disabled || isStreaming || !input.trim()}
              className="flex-shrink-0 rounded-full min-w-[36px] min-h-[36px] flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'var(--color-ink)',
                color: 'var(--color-paper)',
              }}
              aria-label="Send"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          {disabled && (
            <p
              className="mt-2 num-mono text-[11px] leading-relaxed"
              style={{ color: 'var(--color-muted)' }}
            >
              AI chat requires an Anthropic API key. The rule-based brief above still works.
            </p>
          )}
        </div>

        <style>{`
          @keyframes slideIn {
            from { transform: translateX(100%) }
            to   { transform: translateX(0) }
          }
          .animate-slide-in { animation: slideIn 220ms cubic-bezier(0.22, 1, 0.36, 1) }
        `}</style>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
