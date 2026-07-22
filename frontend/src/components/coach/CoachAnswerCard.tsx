/**
 * CoachAnswerCard — the coach's structured final answer.
 *
 * Rendered inline in the chat stream when the coach ends its turn by calling
 * the terminal `present_answer` tool (see backend coach_tools.present_answer).
 * Instead of a long prose paragraph, the answer arrives as a compact row of
 * grounded fact chips + a 1-2 sentence verdict.
 *
 * Reuses AnalyticalAnswerCard's visual language: `num-mono` numerals, `eyebrow`
 * labels, the tone → colour mapping (good / caution / neutral), and the paper
 * card frame. Chips are honest — the backend only ships values the coach
 * actually retrieved via data tools, and facts is [] when there is no data.
 *
 * Progressive enhancement only: rule-based / OpenAI providers that don't call
 * tools still answer as plain text via AssistantBubble.
 */
import { useLocale } from '../../contexts/LocaleContext'
import type { AnswerFact, PresentAnswerResult } from '../../hooks/useChatStream'
import { formatFactValue, normalizeFacts, toneChipStyle } from '../../lib/coachAnswer'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  /** Normalized present_answer payload from the backend. */
  result: Partial<PresentAnswerResult>
}

// ─── Chip ──────────────────────────────────────────────────────────────────────

function Chip({ fact }: { fact: AnswerFact }) {
  const value = formatFactValue(fact.value)
  return (
    <div
      className="inline-flex flex-col gap-0.5 px-2.5 py-1.5 rounded-[10px] min-w-0"
      style={toneChipStyle(fact.tone)}
    >
      <span
        className="eyebrow leading-none truncate"
        style={{ color: 'var(--color-muted)' }}
      >
        {fact.label}
      </span>
      <span className="num-mono text-[15px] leading-tight whitespace-nowrap">
        {value}
        {fact.unit && (
          <span
            className="text-[10px] ml-0.5"
            style={{ color: 'var(--color-muted)' }}
          >
            {fact.unit}
          </span>
        )}
      </span>
    </div>
  )
}

// ─── Component ──────────────────────────────────────────────────────────────────

export default function CoachAnswerCard({ result }: Props) {
  const { locale } = useLocale()
  const facts = normalizeFacts(result.facts)
  const summary = (result.summary ?? '').trim()

  return (
    <section
      className="rounded-[14px] px-3.5 py-3 flex flex-col gap-2.5 coach-answer-reveal"
      style={{
        border: '1px solid var(--color-rule)',
        backgroundColor: 'var(--color-paper)',
      }}
      aria-label={locale === 'de' ? 'Coach-Antwort' : 'Coach answer'}
    >
      {facts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {facts.map((fact, i) => (
            <Chip key={`${fact.label ?? 'chip'}-${i}`} fact={fact} />
          ))}
        </div>
      )}
      {summary && (
        <p
          className="text-[14px] leading-snug dashboard-break-words"
          style={{ color: 'var(--color-ink)' }}
        >
          {summary}
        </p>
      )}
      <style>{`
        @keyframes coachAnswerReveal {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .coach-answer-reveal {
          animation: coachAnswerReveal 260ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        @media (prefers-reduced-motion: reduce) {
          .coach-answer-reveal { animation: none; }
        }
      `}</style>
    </section>
  )
}
