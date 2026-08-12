import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { Sparkles, X, ArrowUp, Loader2, Wrench, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useChatStream, type ChatMessage } from '../../hooks/useChatStream'
import type { PresentAnswerResult, AnswerFact } from '../../hooks/useChatStream'
import { T, FONT } from './w3tokens'

/**
 * W3 · Coach — the AI training assistant in W3 dress. Same real backend as the
 * live app's coach chat (POST /coach/chat, `useChatStream`): a streaming,
 * tool-using coach that reads the athlete's own PMC / recovery / activities and
 * can adjust the plan. This is the presentation only; all intelligence, tools,
 * and safety rails are the server's. Honest 503 handling when no LLM key is set.
 */

const SUGGESTIONS = [
  'Should I push hard today or take it easy?',
  'Why am I tired?',
  'Make today easier',
  "How's my form trending?",
]

const FACT_TONE: Record<AnswerFact['tone'], { c: string; Icon: typeof TrendingUp }> = {
  good: { c: T.training, Icon: TrendingUp },
  caution: { c: T.warn, Icon: TrendingDown },
  neutral: { c: T.mid, Icon: Minus },
}

function FactChips({ result }: { result: PresentAnswerResult }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {result.facts?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {result.facts.map((f, i) => {
            const { c, Icon } = FACT_TONE[f.tone] ?? FACT_TONE.neutral
            return (
              <span key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '6px 11px', borderRadius: 100, background: `${c}1F`, fontSize: 11.5, fontWeight: 700, color: c }}>
                <Icon size={12} />{f.label} {f.value}{f.unit ?? ''}
              </span>
            )
          })}
        </div>
      )}
      {result.summary && <span style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.5, color: T.ink }}>{result.summary}</span>}
    </div>
  )
}

function Bubble({ m }: { m: ChatMessage }) {
  if (m.role === 'user') {
    return (
      <div style={{ alignSelf: 'flex-end', maxWidth: '82%', padding: '11px 15px', borderRadius: '18px 18px 4px 18px', background: T.acid, color: T.bg, fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>{m.content}</div>
    )
  }
  if (m.role === 'assistant') {
    return (
      <div style={{ alignSelf: 'flex-start', maxWidth: '88%', padding: '12px 16px', borderRadius: '18px 18px 18px 4px', background: T.surface, color: T.ink, fontSize: 14, fontWeight: 500, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{m.content}</div>
    )
  }
  // tool card — present_answer renders grounded facts; others a compact chip.
  if (m.toolName === 'present_answer') {
    return (
      <div style={{ alignSelf: 'flex-start', maxWidth: '92%', padding: 16, borderRadius: 18, background: T.surface, border: `1px solid ${T.acid}33` }}>
        <FactChips result={m.result as unknown as PresentAnswerResult} />
      </div>
    )
  }
  const r = m.result as { reason?: string; title?: string; predicted_tss?: number }
  return (
    <div style={{ alignSelf: 'flex-start', display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', borderRadius: 14, background: T.surface2 }}>
      <Wrench size={13} color={T.acid} />
      <span style={{ fontSize: 12.5, fontWeight: 600, color: T.mid }}>{r.title || r.reason || 'Plan updated'}{r.predicted_tss ? ` · ${Math.round(r.predicted_tss)} TSS` : ''}</span>
    </div>
  )
}

export default function W3CoachChat({ onClose }: { onClose: () => void }) {
  const reduce = useReducedMotion()
  const chat = useChatStream()
  const [text, setText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [chat.messages, chat.partial, chat.currentToolUse])

  const submit = () => { const t = text.trim(); if (!t) return; setText(''); void chat.send(t) }
  const empty = chat.messages.length === 0 && !chat.isStreaming

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#000000B0', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }}
      onClick={onClose}>
      <motion.div
        initial={reduce ? false : { y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 34 }}
        onClick={(e) => e.stopPropagation()}
        style={{ width: 390, maxWidth: '100%', height: '90dvh', background: T.bg, borderRadius: '28px 28px 0 0', border: `1px solid ${T.rule}`, borderBottom: 0, fontFamily: FONT, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${T.rule}` }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ width: 34, height: 34, borderRadius: 100, background: T.acidDim, display: 'grid', placeItems: 'center' }}><Sparkles size={17} color={T.acid} /></span>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>Coach</span>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet }}>Reads your real training</span>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ width: 38, height: 38, borderRadius: 100, background: T.surface, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={18} color={T.mid} /></button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '18px 18px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {empty && (
            <div style={{ margin: 'auto 0', display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', padding: '20px 8px' }}>
              <span style={{ width: 56, height: 56, borderRadius: 100, background: T.acidDim, display: 'grid', placeItems: 'center' }}><Sparkles size={26} color={T.acid} /></span>
              <span style={{ fontSize: 17, fontWeight: 700, color: T.ink, textAlign: 'center' }}>Ask your coach anything</span>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: T.quiet, textAlign: 'center', lineHeight: 1.5, maxWidth: 260 }}>It reads your HRV, form and recent rides — and can adjust today's session.</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', marginTop: 6 }}>
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => { setText(''); void chat.send(s) }}
                    style={{ padding: '13px 16px', borderRadius: 14, background: T.surface, border: `1px solid ${T.rule}`, color: T.ink, fontFamily: FONT, fontSize: 13.5, fontWeight: 600, textAlign: 'left', cursor: 'pointer' }}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {chat.messages.map((m, i) => <Bubble key={i} m={m} />)}

          {chat.partial && (
            <div style={{ alignSelf: 'flex-start', maxWidth: '88%', padding: '12px 16px', borderRadius: '18px 18px 18px 4px', background: T.surface, color: T.ink, fontSize: 14, fontWeight: 500, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{chat.partial}</div>
          )}
          {chat.currentToolUse && (
            <div style={{ alignSelf: 'flex-start', display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', borderRadius: 14, background: T.surface2 }}>
              <Loader2 size={13} color={T.acid} className="w3-spin" />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: T.mid }}>Reading your training data…</span>
            </div>
          )}
          {chat.error && (
            <div style={{ alignSelf: 'center', padding: '10px 14px', borderRadius: 12, background: `${T.bad}1F`, color: T.bad, fontSize: 12.5, fontWeight: 600, textAlign: 'center' }}>{chat.error}</div>
          )}
        </div>

        {/* Input */}
        <div style={{ padding: '10px 16px calc(16px + env(safe-area-inset-bottom))', borderTop: `1px solid ${T.rule}`, display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <textarea
            value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
            placeholder="Ask your coach…" rows={1}
            style={{ flex: 1, resize: 'none', maxHeight: 120, padding: '13px 16px', borderRadius: 20, background: T.surface, border: `1px solid ${T.rule}`, color: T.ink, fontFamily: FONT, fontSize: 14, outline: 'none' }} />
          <button onClick={submit} disabled={!text.trim() || chat.isStreaming} aria-label="Send"
            style={{ width: 46, height: 46, borderRadius: 100, border: 0, flex: 'none', background: text.trim() && !chat.isStreaming ? T.acid : T.surface2, display: 'grid', placeItems: 'center', cursor: text.trim() ? 'pointer' : 'default' }}>
            {chat.isStreaming ? <Loader2 size={19} color={T.bg} className="w3-spin" /> : <ArrowUp size={20} color={text.trim() ? T.bg : T.quiet} />}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

/** Floating "Ask coach" button — mount once per W3 tab screen, above the nav. */
export function W3CoachFab() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Ask coach"
        style={{ position: 'fixed', right: 'max(16px, calc(50vw - 179px))', bottom: 'calc(104px + env(safe-area-inset-bottom))', zIndex: 60, width: 56, height: 56, borderRadius: 100, border: 0, background: T.acid, boxShadow: `0 6px 24px ${T.acid}55`, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
        <Sparkles size={24} color={T.bg} />
      </button>
      <AnimatePresence>{open && <W3CoachChat onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  )
}
