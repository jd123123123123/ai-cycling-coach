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
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Sparkles, Send, Bot, Check, RotateCcw } from 'lucide-react'
import DashboardShell from '../components/dashboard/DashboardShell'
import ProposalCard from '../components/coach/ProposalCard'
import { useChatStream, type ChatMessage } from '../hooks/useChatStream'
import { useCoachBrief, COACH_BRIEF_KEY_ROOT } from '../hooks/useCoachBrief'
import { useDailyDecision } from '../hooks/useDailyDecision'
import { usePMC } from '../hooks/usePMC'
import { useLocale } from '../contexts/LocaleContext'
import { previewPlan, previewPlanText, applyPlan, type PlanProposal, type PlanChangeRequest } from '../api/coach'

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
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState('')
  const threadEndRef = useRef<HTMLDivElement>(null)
  const askInputRef = useRef<HTMLInputElement>(null)

  // ── Propose-before-apply: a plan-change request PROPOSES first (concrete +
  // visualised), and only persists on Accept. Driven directly by the chips so
  // it works today without the LLM; the chat tool-use loop can call the same
  // endpoints when credits return.
  const [proposal, setProposal] = useState<PlanProposal | null>(null)
  const [proposalReq, setProposalReq] = useState<PlanChangeRequest | null>(null)
  const [proposalLoading, setProposalLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)
  // The user's typed request, echoed as a chat bubble above a proposal that
  // came from the Ask bar (chips don't set this — they have no typed text).
  const [proposalUserText, setProposalUserText] = useState<string | null>(null)

  const openProposal = async (req: PlanChangeRequest) => {
    setApplied(false)
    setProposalUserText(null)
    setProposalReq(req)
    setProposalLoading(true)
    setProposal(null)
    try {
      const p = await previewPlan(req)
      setProposal(p)
    } catch {
      setProposal(null)
      setProposalReq(null)
    } finally {
      setProposalLoading(false)
    }
  }

  const acceptProposal = async () => {
    if (!proposalReq || applying) return
    setApplying(true)
    try {
      await applyPlan(proposalReq)
      setApplied(true)
      queryClient.invalidateQueries({ queryKey: ['planned-workouts'] })
      queryClient.invalidateQueries({ queryKey: ['weeks'] })
      queryClient.invalidateQueries({ queryKey: COACH_BRIEF_KEY_ROOT })
    } catch {
      /* leave the card open so the user can retry */
    } finally {
      setApplying(false)
    }
  }

  const tweakProposal = () => {
    setProposal(null)
    setProposalReq(null)
    setProposalUserText(null)
    setApplied(false)
    askInputRef.current?.focus()
  }

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

  // Chips wired to real actions. "Adjust plan" / "Easier week" open a visual
  // PROPOSAL (preview endpoint); "Why?" asks the coach to explain today.
  const chips: Array<{ label: string; onClick: () => void }> = [
    {
      label: de ? 'Plan anpassen' : 'Adjust plan',
      onClick: () => void openProposal({ modification_type: 'shorten', params: { duration_min: 45 }, scope: 'day' }),
    },
    {
      label: de ? 'Warum?' : 'Why?',
      onClick: () => void chat.send(de ? 'Warum genau diese Einheit heute?' : 'Why exactly this session today?'),
    },
    {
      label: de ? 'Lockerere Woche' : 'Easier week',
      onClick: () => void openProposal({ modification_type: 'easier', scope: 'week' }),
    },
  ]

  // The Ask bar tries the rule-based text→proposal fast-path FIRST (works
  // without the LLM). If the typed request resolves to a concrete plan change,
  // render the Proposal Card inline; otherwise fall back to the chat stream
  // (which honestly reports the coach is unavailable while credits are out).
  // The user's message shows as a bubble either way.
  const sendDraft = async () => {
    const text = draft.trim()
    if (!text || chat.isStreaming || proposalLoading) return
    setDraft('')
    setApplied(false)
    setProposal(null)
    setProposalReq(null)
    setProposalUserText(text)
    setProposalLoading(true)
    try {
      const res = await previewPlanText(text, locale)
      if (res.actionable && res.proposal && res.intent) {
        setProposal(res.proposal)
        setProposalReq({
          modification_type: res.intent.modification_type,
          params: res.intent.params,
          scope: res.intent.scope,
          date: res.proposal.target_date,
        })
        return
      }
      // Not an actionable plan change → hand off to plain chat.
      setProposalUserText(null)
      void chat.send(text)
    } catch {
      // Fast-path errored (offline / server) → let chat handle it honestly.
      setProposalUserText(null)
      void chat.send(text)
    } finally {
      setProposalLoading(false)
    }
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
              <span className="num-display" style={{ fontSize: 18, color: 'var(--color-ink)' }}>Coach Nova</span>
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
            {chat.error && (
              <p style={{ fontSize: 12.5, color: 'var(--color-muted)' }}>{friendlyChatError(chat.error, de)}</p>
            )}
            <div ref={threadEndRef} />
          </div>

          {/* ── Suggestion chips (.pen oFirb) ── */}
          {!chat.isStreaming && (
            <div className="flex items-center gap-2 flex-wrap">
              {chips.map((c) => (
                <button key={c.label} type="button" onClick={c.onClick}
                  className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2"
                  style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)', fontSize: 12.5, fontWeight: 600, color: 'var(--color-ink-2)' }}>
                  <Sparkles size={13} style={{ color: 'var(--color-accent)' }} /> {c.label}
                </button>
              ))}
            </div>
          )}

          {/* ── Typed request echoed as a user bubble (Ask-bar proposal path) ── */}
          {proposalUserText && (
            <Bubble m={{ role: 'user', content: proposalUserText }} de={de} onUndo={() => {}} />
          )}

          {/* ── Proposal Card (.pen pyy3V) — propose-before-apply centerpiece ── */}
          {proposalLoading && (
            <div className="flex items-center gap-2 p-4 rounded-[24px]" style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
              <Sparkles size={15} style={{ color: 'var(--color-accent)' }} />
              <span style={{ fontSize: 13, color: 'var(--color-ink-2)' }}>{de ? 'Coach rechnet die Auswirkung…' : 'Coach is computing the impact…'}</span>
            </div>
          )}
          {proposal && !proposalLoading && (
            <ProposalCard
              proposal={proposal}
              de={de}
              applying={applying}
              applied={applied}
              onAccept={() => void acceptProposal()}
              onTweak={tweakProposal}
            />
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
              onSubmit={(e) => { e.preventDefault(); void sendDraft() }}
              className="flex items-center gap-2.5 rounded-full pl-4 pr-2 py-2"
              style={{ background: 'color-mix(in srgb, var(--color-surface-2) 92%, transparent)', border: '1px solid var(--color-rule)', pointerEvents: 'auto', backdropFilter: 'blur(12px)' }}
            >
              <Sparkles size={17} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
              <input
                ref={askInputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={de ? 'Frag Coach Nova…' : 'Ask Coach Nova anything…'}
                className="flex-1 bg-transparent outline-none"
                style={{ fontSize: 15, color: 'var(--color-ink)' }}
              />
              <button type="submit" aria-label={de ? 'Senden' : 'Send'} disabled={chat.isStreaming || proposalLoading || !draft.trim()} className="grid place-items-center rounded-full shrink-0"
                style={{ width: 40, height: 40, background: 'var(--color-accent)', opacity: chat.isStreaming || proposalLoading || !draft.trim() ? 0.5 : 1 }}>
                <Send size={17} style={{ color: '#0A0C0F' }} />
              </button>
            </form>
          </div>
        </div>
      </div>
    </DashboardShell>
  )
}

/**
 * Keep the chat-error line honest but human. The free-text plan-change
 * fast-path never needs the LLM, so a chat error here means the coach's
 * conversational brain is offline (credits out / no API key) — say that
 * plainly instead of dumping a raw provider error. Unknown errors pass
 * through so real bugs stay visible.
 */
function friendlyChatError(error: string, de: boolean): string {
  const e = error.toLowerCase()
  const llmDown =
    e.includes('credit') ||
    e.includes('billing') ||
    e.includes('anthropic') ||
    e.includes('api key') ||
    e.includes('invalid_request_error') ||
    e.includes('unavailable') ||
    e.includes('503')
  if (llmDown) {
    return de
      ? 'Coach Nova kann gerade nicht frei chatten (KI offline) — konkrete Planwünsche wie „nur 45 min heute“ oder „mach die Woche leichter“ funktionieren aber weiterhin.'
      : 'Coach Nova can’t free-chat right now (AI offline) — but concrete plan requests like “only 45 min today” or “make the week easier” still work.'
  }
  return error
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
