import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MessageSquare, X, Sparkles } from 'lucide-react'
import { useCoachChat } from '../../hooks/useCoachChat'
import type { ChatMessage } from '../../api/coach'
import { useLanguage } from '../../contexts/LanguageContext'

// ─── Inline-data mono wrapping ───────────────────────────────────────────────

/**
 * Wrap numeric-data tokens in a mono span so the coach's citations read like
 * inline data rather than prose. Matches values like "46ms", "220W", "84 TSS",
 * "7.8h", "+12%", "-8%".
 */
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

// ─── Message bubbles ─────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[85%] px-3.5 py-2.5 rounded-[14px] rounded-br-[4px] text-[14px] leading-relaxed dashboard-break-words"
          style={{
            backgroundColor: 'var(--color-ink)',
            color: 'var(--color-paper)',
          }}
        >
          {msg.content}
        </div>
      </div>
    )
  }
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
        {highlightData(msg.content)}
      </div>
    </div>
  )
}

function StreamingBubble({ text }: { text: string }) {
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
        {text ? highlightData(text) : <span className="opacity-60">Thinking…</span>}
        <span className="streaming-caret" aria-hidden />
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
          @keyframes blink { 0%,100% { opacity: 1 } 50% { opacity: 0 } }
        `}</style>
      </div>
    </div>
  )
}

// ─── Suggestions (empty state) ───────────────────────────────────────────────
// Two sets — simple mode drops the VO2 jargon in favour of "hard intervals".

const SUGGESTIONS_SIMPLE: string[] = [
  'Why am I tired this week?',
  'Am I ready for hard intervals?',
  'Review my last 2 weeks',
  'Should I push or rest tomorrow?',
]

const SUGGESTIONS_TECHNICAL: string[] = [
  'Why am I tired this week?',
  'Am I ready for a VO2 set?',
  'Review my last 2 weeks',
  'Should I push or rest tomorrow?',
]

// ─── Drawer ──────────────────────────────────────────────────────────────────

interface CoachChatProps {
  open: boolean
  onClose: () => void
}

export default function CoachChat({ open, onClose }: CoachChatProps) {
  const { messages, partial, isStreaming, error, disabled, sendMessage, reset } = useCoachChat()
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const { language } = useLanguage()
  const simpleMode = language === 'simple'
  const suggestions = simpleMode ? SUGGESTIONS_SIMPLE : SUGGESTIONS_TECHNICAL

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
  }, [messages, partial])

  // Focus the input when drawer opens
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => textareaRef.current?.focus(), 180)
      return () => clearTimeout(t)
    }
  }, [open])

  const handleSubmit = async () => {
    if (!input.trim() || isStreaming || disabled) return
    const payload = input
    setInput('')
    await sendMessage(payload)
  }

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void handleSubmit()
    }
  }

  if (!open) return null

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
                    ? "The coach looks at how you've been sleeping, how your body's recovering, and what you've been riding — and will tell you when it doesn't have enough data."
                    : "The coach can cite your HRV, TSB, recent rides, sleep debt, and zone mix — and will tell you when it doesn't have enough data."}
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
                      // Immediately dispatch so the user sees responsiveness
                      void sendMessage(s)
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

          {messages.map((m, i) => (
            <MessageBubble key={i} msg={m} />
          ))}
          {isStreaming && <StreamingBubble text={partial} />}

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
