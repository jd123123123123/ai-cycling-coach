/**
 * CoachPage — full inline coach surface, built against pencil-new.pen
 * "V2 · AI Coach" (wQf0h): Coach header → Weekly Briefing card (accent
 * gradient, brief narrative + 7-day load bars) → live chat thread →
 * suggestion chips → modification/proposal cards → tomorrow-in-plain-words →
 * pinned Ask bar. All real: brief + PMC + the existing streaming chat with
 * rails-safe tool use (modify/undo flow unchanged).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { de as deLocale } from 'date-fns/locale'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Sparkles, Send, Bot, Check, RotateCcw } from 'lucide-react'
import DashboardShell from '../components/dashboard/DashboardShell'
import { useChatStream, type ChatMessage } from '../hooks/useChatStream'
import { useCoachBrief } from '../hooks/useCoachBrief'
import { useDailyDecision } from '../hooks/useDailyDecision'
import { usePMC } from '../hooks/usePMC'
import { useLocale } from '../contexts/LocaleContext'

const CARD = { background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)', borderRadius: 24 } as const

export default function CoachPage() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const navigate = useNavigate()
  const { data: brief } = useCoachBrief()
  // ONE Daily Decision (audit P0-3) — same object the Today tab renders, read
  // off the same brief query. Its verdict leads the briefing so chat and Today
  // can never disagree about what today is.
  const { decision } = useDailyDecision()
  const { data: pmc } = usePMC(14)
  const chat = useChatStream()
  const [draft, setDraft] = useState('')
  const threadEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (chat.messages.length > 0 || chat.partial) {
      threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [chat.messages.length, chat.partial])

  // Weekly briefing — the last 7 days of real load as bars.
  const weekBars = useMemo(() => {
    const rows = (pmc?.entries ?? []).slice(-7)
    const max = Math.max(1, ...rows.map((r) => r.tss ?? r.daily_tss ?? 0))
    return rows.map((r) => ({
      date: String(r.date),
      tss: Math.round(r.tss ?? r.daily_tss ?? 0),
      h: Math.max(3, Math.round(((r.tss ?? r.daily_tss ?? 0) / max) * 56)),
    }))
  }, [pmc])

  const chips = [
    { label: de ? 'Plan anpassen' : 'Adjust plan', msg: de ? 'Passe meinen heutigen Plan an — ich habe weniger Zeit.' : 'Adjust today’s plan — I have less time.' },
    { label: de ? 'Warum?' : 'Why?', msg: de ? 'Warum genau diese Einheit heute?' : 'Why exactly this session today?' },
    { label: de ? 'Lockerere Woche' : 'Easier week', msg: de ? 'Mach mir diese Woche lockerer.' : 'Make this week easier.' },
  ]

  const sendDraft = () => {
    const text = draft.trim()
    if (!text || chat.isStreaming) return
    setDraft('')
    void chat.send(text)
  }

  const tomorrow = brief?.tomorrow_plan?.description ?? null

  return (
    <DashboardShell>
      <div className="mx-auto flex flex-col" style={{ maxWidth: 640, minHeight: '100dvh' }}>
        {/* ── Coach header (.pen ZJpOZ) ── */}
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate(-1)} aria-label={de ? 'Zurück' : 'Back'} className="grid place-items-center rounded-full" style={{ width: 40, height: 40, background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' }}>
              <ArrowLeft size={18} style={{ color: 'var(--color-ink-2)' }} />
            </button>
            <span className="grid place-items-center rounded-full" style={{ width: 40, height: 40, background: 'color-mix(in srgb, var(--color-accent) 18%, transparent)' }}>
              <Bot size={20} style={{ color: 'var(--color-accent)' }} />
            </span>
            <div className="flex flex-col">
              <span className="num-display" style={{ fontSize: 18, color: 'var(--color-ink)' }}>Coach</span>
              <span style={{ fontSize: 11.5, color: 'var(--color-recovery)', fontWeight: 600 }}>
                {chat.isStreaming ? (de ? 'schreibt…' : 'typing…') : (de ? 'kennt deine echten Daten' : 'knows your real data')}
              </span>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-5 px-4 pb-44 pt-2">
          {/* ── Weekly briefing (accent-gradient card, .pen f4kujl) ── */}
          {brief?.rationale && (
            <div className="flex flex-col gap-3.5 p-5" style={{
              borderRadius: 24,
              border: '1px solid var(--color-accent)',
              background: 'linear-gradient(125deg, color-mix(in srgb, var(--color-accent) 14%, var(--color-paper-2)), var(--color-paper-2) 70%)',
            }}>
              <div className="flex items-center justify-between">
                <span className="eyebrow" style={{ fontSize: 11, letterSpacing: '0.16em', fontWeight: 700, color: 'var(--color-accent)' }}>
                  {de ? 'DEIN BRIEFING' : 'YOUR BRIEFING'}
                </span>
              </div>
              {/* The decision verdict leads — the rationale is flavor below it. */}
              {decision && (
                <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)', lineHeight: 1.45 }}>{decision.verdict}</p>
              )}
              <p style={{ fontSize: 14.5, fontWeight: 500, color: 'var(--color-ink)', lineHeight: 1.5 }}>{brief.rationale}</p>
              {weekBars.length >= 2 && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-end gap-1.5" style={{ height: 60 }}>
                    {weekBars.map((b) => (
                      <div key={b.date} className="flex-1 flex flex-col items-center justify-end" title={`${b.tss} TSS`}>
                        <div className="w-full rounded-[4px]" style={{ height: b.h, background: b.tss > 0 ? 'var(--color-accent)' : 'var(--color-surface-2)', opacity: b.tss > 0 ? 0.9 : 1 }} />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    {weekBars.map((b) => (
                      <span key={b.date} className="flex-1 text-center eyebrow" style={{ fontSize: 9.5, color: 'var(--color-muted)' }}>
                        {format(parseISO(b.date), 'EEEEE', { locale: de ? deLocale : undefined })}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Chat thread ── */}
          <div className="flex flex-col gap-3.5">
            {chat.messages.map((m, i) => (
              <Bubble key={i} m={m} de={de} onUndo={() => void chat.undoLastModification()} />
            ))}
            {chat.partial && (
              <div className="flex items-end gap-2" style={{ paddingRight: 44 }}>
                <CoachAvatar />
                <div className="px-4 py-3" style={{ background: 'var(--color-surface-2)', borderRadius: '18px 18px 18px 6px', maxWidth: '85%' }}>
                  <p style={{ fontSize: 14, color: 'var(--color-ink)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{chat.partial}</p>
                </div>
              </div>
            )}
            {chat.disabled && (
              <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                {de ? 'Chat braucht einen Anthropic-API-Key auf dem Server.' : 'Chat needs an Anthropic API key on the server.'}
              </p>
            )}
            {chat.error && <p style={{ fontSize: 12.5, color: 'var(--color-strain)' }}>{chat.error}</p>}
            <div ref={threadEndRef} />
          </div>

          {/* ── Suggestion chips (.pen oFirb) ── */}
          {!chat.isStreaming && !chat.disabled && (
            <div className="flex items-center gap-2 flex-wrap">
              {chips.map((c) => (
                <button key={c.label} type="button" onClick={() => void chat.send(c.msg)}
                  className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2"
                  style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)', fontSize: 12.5, fontWeight: 600, color: 'var(--color-ink-2)' }}>
                  <Sparkles size={13} style={{ color: 'var(--color-accent)' }} /> {c.label}
                </button>
              ))}
            </div>
          )}

          {/* ── Tomorrow in plain words (.pen y00Za analogue — real prose only) ── */}
          {tomorrow && (
            <div className="flex flex-col gap-2.5">
              <span className="eyebrow" style={{ fontSize: 11, letterSpacing: '0.16em', fontWeight: 700, color: 'var(--color-muted)' }}>
                {de ? 'MORGEN, IN EINFACHEN WORTEN' : 'TOMORROW, IN PLAIN WORDS'}
              </span>
              <div className="flex gap-3.5">
                <span className="shrink-0 rounded-full" style={{ width: 3, background: 'var(--color-accent)' }} />
                <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-ink-2)', lineHeight: 1.55 }}>{tomorrow}</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Pinned ask bar (.pen JNx2U) ── */}
        <div className="fixed left-0 right-0" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 96px)', pointerEvents: 'none', zIndex: 30 }}>
          <div className="mx-auto px-4" style={{ maxWidth: 640 }}>
            <form
              onSubmit={(e) => { e.preventDefault(); sendDraft() }}
              className="flex items-center gap-2.5 rounded-full pl-4 pr-2 py-2"
              style={{ background: 'color-mix(in srgb, var(--color-surface-2) 92%, transparent)', border: '1px solid var(--color-rule)', pointerEvents: 'auto', backdropFilter: 'blur(12px)' }}
            >
              <Sparkles size={17} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={de ? 'Frag deinen Coach…' : 'Ask your coach anything…'}
                disabled={chat.disabled}
                className="flex-1 bg-transparent outline-none"
                style={{ fontSize: 15, color: 'var(--color-ink)' }}
              />
              <button type="submit" aria-label={de ? 'Senden' : 'Send'} disabled={chat.isStreaming || !draft.trim()} className="grid place-items-center rounded-full shrink-0"
                style={{ width: 40, height: 40, background: 'var(--color-accent)', opacity: chat.isStreaming || !draft.trim() ? 0.5 : 1 }}>
                <Send size={17} style={{ color: '#0A0C0F' }} />
              </button>
            </form>
          </div>
        </div>
      </div>
    </DashboardShell>
  )
}

function CoachAvatar() {
  return (
    <span className="grid place-items-center rounded-full shrink-0" style={{ width: 30, height: 30, background: 'color-mix(in srgb, var(--color-accent) 18%, transparent)' }}>
      <Bot size={15} style={{ color: 'var(--color-accent)' }} />
    </span>
  )
}

/** Chat bubble — coach left (avatar), user right (accent), tool = proposal card. */
function Bubble({ m, de, onUndo }: { m: ChatMessage; de: boolean; onUndo: () => void }) {
  if (m.role === 'tool') {
    const r = m.result as { rails_downgraded?: boolean; title?: string; template_id?: string; reason?: string }
    if (m.toolName !== 'modify_planned_workout' || m.isError) return null
    return (
      <div className="flex flex-col gap-2.5 p-4" style={{ ...CARD, borderColor: r.rails_downgraded ? 'var(--color-amber)' : 'var(--color-recovery)' }}>
        <div className="flex items-center justify-between">
          <span className="eyebrow" style={{ fontSize: 10.5, letterSpacing: '0.14em', fontWeight: 700, color: r.rails_downgraded ? 'var(--color-amber)' : 'var(--color-recovery)' }}>
            {de ? 'PLAN GEÄNDERT' : 'PLAN UPDATED'}
          </span>
          <Check size={15} style={{ color: 'var(--color-recovery)' }} />
        </div>
        {(r.title || r.template_id) && (
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink)' }}>{r.title ?? r.template_id}</span>
        )}
        {r.reason && <p style={{ fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.45 }}>{r.reason}</p>}
        <button type="button" onClick={onUndo} className="inline-flex items-center gap-1.5 self-start" style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-accent)' }}>
          <RotateCcw size={13} /> {de ? 'Rückgängig' : 'Undo'}
        </button>
      </div>
    )
  }
  const isUser = m.role === 'user'
  return (
    <div className={`flex items-end gap-2 ${isUser ? 'justify-end' : ''}`} style={isUser ? { paddingLeft: 52 } : { paddingRight: 44 }}>
      {!isUser && <CoachAvatar />}
      <div className="px-4 py-3" style={{
        background: isUser ? 'var(--color-accent)' : 'var(--color-surface-2)',
        borderRadius: isUser ? '18px 18px 6px 18px' : '18px 18px 18px 6px',
        maxWidth: '85%',
      }}>
        <p style={{ fontSize: 14, color: isUser ? '#0A0C0F' : 'var(--color-ink)', lineHeight: 1.5, whiteSpace: 'pre-wrap', fontWeight: isUser ? 600 : 400 }}>{m.content}</p>
      </div>
    </div>
  )
}
