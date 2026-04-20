import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronDown, ChevronRight, Copy, Check, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import { useTransparency } from '../../hooks/useWhyTired'
import { useCoachBrief } from '../../hooks/useCoachBrief'
import type { BriefOption } from '../../api/coach'

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
}

// ─── JSON pretty renderer — minimal token colouring, no external lib ─────────

function renderJsonValue(value: unknown, indent = 0, key?: string): React.ReactNode {
  const pad = '  '.repeat(indent)
  const nextPad = '  '.repeat(indent + 1)

  if (value === null) {
    return (
      <span>
        {key !== undefined && <KeyLabel name={key} />}
        <span style={{ color: 'var(--color-muted)' }}>null</span>
      </span>
    )
  }
  if (typeof value === 'boolean') {
    return (
      <span>
        {key !== undefined && <KeyLabel name={key} />}
        <span style={{ color: 'var(--color-ink-blue)' }}>{String(value)}</span>
      </span>
    )
  }
  if (typeof value === 'number') {
    return (
      <span>
        {key !== undefined && <KeyLabel name={key} />}
        <span style={{ color: 'var(--color-amber)' }}>
          {Number.isFinite(value) ? value : String(value)}
        </span>
      </span>
    )
  }
  if (typeof value === 'string') {
    return (
      <span>
        {key !== undefined && <KeyLabel name={key} />}
        <span style={{ color: 'var(--color-forest-2)' }}>&ldquo;{value}&rdquo;</span>
      </span>
    )
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <span>
          {key !== undefined && <KeyLabel name={key} />}
          <span style={{ color: 'var(--color-ink-2)' }}>[]</span>
        </span>
      )
    }
    return (
      <span>
        {key !== undefined && <KeyLabel name={key} />}
        <span style={{ color: 'var(--color-ink-2)' }}>[</span>
        {value.map((v, i) => (
          <span key={i} style={{ display: 'block' }}>
            {nextPad}
            {renderJsonValue(v, indent + 1)}
            {i < value.length - 1 && <span style={{ color: 'var(--color-ink-2)' }}>,</span>}
          </span>
        ))}
        <span style={{ display: 'block' }}>
          {pad}
          <span style={{ color: 'var(--color-ink-2)' }}>]</span>
        </span>
      </span>
    )
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj)
    if (keys.length === 0) {
      return (
        <span>
          {key !== undefined && <KeyLabel name={key} />}
          <span style={{ color: 'var(--color-ink-2)' }}>{'{}'}</span>
        </span>
      )
    }
    return (
      <span>
        {key !== undefined && <KeyLabel name={key} />}
        <span style={{ color: 'var(--color-ink-2)' }}>{'{'}</span>
        {keys.map((k, i) => (
          <span key={k} style={{ display: 'block' }}>
            {nextPad}
            {renderJsonValue(obj[k], indent + 1, k)}
            {i < keys.length - 1 && <span style={{ color: 'var(--color-ink-2)' }}>,</span>}
          </span>
        ))}
        <span style={{ display: 'block' }}>
          {pad}
          <span style={{ color: 'var(--color-ink-2)' }}>{'}'}</span>
        </span>
      </span>
    )
  }
  return <span>{String(value)}</span>
}

function KeyLabel({ name }: { name: string }) {
  return (
    <>
      <span style={{ color: 'var(--color-ink)', fontWeight: 500 }}>&ldquo;{name}&rdquo;</span>
      <span style={{ color: 'var(--color-ink-2)' }}>: </span>
    </>
  )
}

// ─── Collapsible section ─────────────────────────────────────────────────────

function Section({
  title, eyebrow, defaultOpen = false, children, meta,
}: {
  title: string
  eyebrow?: string
  defaultOpen?: boolean
  children: React.ReactNode
  meta?: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section
      className="rounded-[12px] overflow-hidden"
      style={{ border: '1px solid var(--color-rule)', backgroundColor: 'var(--color-paper)' }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 transition-colors"
        style={{ backgroundColor: open ? 'rgba(20,24,17,0.03)' : 'transparent' }}
        aria-expanded={open}
      >
        <div className="flex flex-col gap-0.5 items-start min-w-0">
          {eyebrow && (
            <span className="eyebrow" style={{ color: 'var(--color-amber)' }}>
              {eyebrow}
            </span>
          )}
          <span
            className="serif-caps text-[15px]"
            style={{ color: 'var(--color-ink)' }}
          >
            {title}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {meta}
          {open ? (
            <ChevronDown size={14} strokeWidth={2} style={{ color: 'var(--color-ink-2)' }} />
          ) : (
            <ChevronRight size={14} strokeWidth={2} style={{ color: 'var(--color-ink-2)' }} />
          )}
        </div>
      </button>
      {open && (
        <div
          className="px-4 pb-4 pt-1"
          style={{ borderTop: '1px solid var(--color-rule)' }}
        >
          {children}
        </div>
      )}
    </section>
  )
}

// ─── Copy button ─────────────────────────────────────────────────────────────

function CopyButton({ payload }: { payload: string }) {
  const [copied, setCopied] = useState(false)
  const handle = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(payload)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* noop */ }
  }
  return (
    <button
      onClick={handle}
      className="num-mono text-[10px] px-1.5 py-1 rounded-sm inline-flex items-center gap-1"
      style={{
        color: 'var(--color-ink-2)',
        border: '1px solid var(--color-rule)',
        backgroundColor: 'var(--color-paper)',
      }}
      aria-label={copied ? 'Copied' : 'Copy'}
    >
      {copied ? <Check size={10} strokeWidth={2} /> : <Copy size={10} strokeWidth={2} />}
      {copied ? 'copied' : 'copy'}
    </button>
  )
}

// ─── Main drawer ─────────────────────────────────────────────────────────────

export default function TransparencyDrawer({ open, onClose }: Props) {
  const { data, isLoading, isError, refetch } = useTransparency(open)
  const { data: brief } = useCoachBrief()

  // Body scroll lock + escape
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  const snapshotJson = useMemo(
    () => (data?.snapshot ? JSON.stringify(data.snapshot, null, 2) : ''),
    [data],
  )

  const blockedOptions: BriefOption[] = useMemo(
    () => (brief?.options ?? []).filter((o) => o.blocked),
    [brief],
  )

  if (!open) return null

  const content = (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ backgroundColor: 'rgba(20,24,17,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="transparency-title"
    >
      <div
        className="paper-grain flex flex-col w-full md:w-[560px] h-full shadow-2xl animate-transparency-slide"
        style={{
          backgroundColor: 'var(--color-paper-2)',
          borderLeft: '1px solid var(--color-rule)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--color-rule)' }}
        >
          <div className="min-w-0">
            <span className="eyebrow" style={{ color: 'var(--color-amber)' }}>
              Transparency · no black boxes
            </span>
            <h2
              id="transparency-title"
              className="num-display mt-1 leading-tight"
              style={{
                fontSize: 'clamp(22px, 3vw, 28px)',
                color: 'var(--color-ink)',
                fontStyle: 'italic',
              }}
            >
              What did the AI see?
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 rounded-full min-w-[40px] min-h-[40px] flex items-center justify-center"
            style={{
              color: 'var(--color-ink-2)',
              border: '1px solid var(--color-rule)',
              backgroundColor: 'var(--color-paper)',
            }}
            aria-label="Close"
          >
            <X size={15} strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 flex flex-col gap-4 min-w-0">
          {isLoading ? (
            <>
              {[0,1,2].map((i) => (
                <div key={i} className="h-24 rounded-[12px] animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
              ))}
            </>
          ) : isError || !data ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} strokeWidth={1.8} style={{ color: 'var(--color-alert)' }} />
                <span className="text-[13px]" style={{ color: 'var(--color-alert)' }}>
                  Couldn&apos;t load the transparency payload.
                </span>
              </div>
              <button
                onClick={() => void refetch()}
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-medium"
                style={{ backgroundColor: 'var(--color-ink)', color: 'var(--color-paper)' }}
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              {/* Meta intro */}
              <div className="flex flex-col gap-2 pb-1">
                <p
                  className="text-[13px] leading-relaxed dashboard-break-words"
                  style={{ color: 'var(--color-ink-2)' }}
                >
                  Every recommendation above is grounded in the data below. This is the
                  exact snapshot and system prompt the coach used — you can audit it,
                  copy it, or use it to challenge a recommendation.
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <MetaPill label="Model" value={data.model} mono />
                  {data.last_generated_at && (
                    <MetaPill
                      label="Generated"
                      value={format(new Date(data.last_generated_at), 'd MMM · HH:mm')}
                      mono
                    />
                  )}
                  {data.last_brief_id && (
                    <MetaPill label="Brief" value={`#${data.last_brief_id}`} mono />
                  )}
                </div>
              </div>

              {/* Safety rails that fired */}
              <Section
                title="Safety rails that fired"
                eyebrow="Filters applied after the LLM"
                defaultOpen={blockedOptions.length > 0}
                meta={
                  <span
                    className="num-mono text-[10px] px-1.5 py-0.5 rounded-sm"
                    style={{
                      color: blockedOptions.length > 0 ? 'var(--color-alert)' : 'var(--color-muted)',
                      backgroundColor: blockedOptions.length > 0 ? 'rgba(138,29,29,0.06)' : 'transparent',
                      border: '1px solid var(--color-rule)',
                    }}
                  >
                    {blockedOptions.length} blocked
                  </span>
                }
              >
                {blockedOptions.length === 0 ? (
                  <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-ink-2)' }}>
                    None — nothing was blocked on the latest brief. Rails still evaluated
                    every option (TSS cap 1.3×CTL, intensity ceiling cascade, ED-keyword
                    filter) — they just didn&apos;t need to intervene.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {blockedOptions.map((o) => (
                      <li
                        key={o.intensity}
                        className="flex items-start gap-2 p-2.5 rounded-[10px]"
                        style={{
                          backgroundColor: 'rgba(138,29,29,0.05)',
                          border: '1px solid rgba(138,29,29,0.2)',
                        }}
                      >
                        <AlertTriangle
                          size={13} strokeWidth={1.8}
                          style={{ color: 'var(--color-alert)', flexShrink: 0, marginTop: 2 }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span
                              className="eyebrow"
                              style={{ color: 'var(--color-alert)', letterSpacing: '0.22em' }}
                            >
                              {o.intensity}
                            </span>
                            <span
                              className="serif-caps text-[13px]"
                              style={{ color: 'var(--color-ink)', textDecoration: 'line-through' }}
                            >
                              {o.title}
                            </span>
                          </div>
                          {o.block_reason && (
                            <p
                              className="mt-1 text-[12px] leading-snug"
                              style={{ color: 'var(--color-ink-2)' }}
                            >
                              {o.block_reason}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              {/* Snapshot */}
              <Section
                title="Snapshot"
                eyebrow="The data the coach saw"
                defaultOpen
                meta={<CopyButton payload={snapshotJson} />}
              >
                <div
                  className="num-mono text-[11px] leading-[1.6] rounded-[10px] overflow-x-auto max-h-[480px] overflow-y-auto"
                  style={{
                    backgroundColor: 'var(--color-paper-2)',
                    border: '1px solid var(--color-rule)',
                    padding: '12px 14px',
                  }}
                >
                  <pre
                    style={{
                      margin: 0,
                      whiteSpace: 'pre',
                      fontFamily: 'inherit',
                      color: 'var(--color-ink)',
                    }}
                  >
                    {renderJsonValue(data.snapshot)}
                  </pre>
                </div>
              </Section>

              {/* System prompt */}
              <Section
                title="System prompt"
                eyebrow="The coach's persona instructions"
                meta={<CopyButton payload={data.system_prompt} />}
              >
                <div
                  className="num-mono text-[11px] leading-[1.7] rounded-[10px] p-3 overflow-x-auto max-h-[480px] overflow-y-auto dashboard-break-words"
                  style={{
                    backgroundColor: 'var(--color-paper-2)',
                    border: '1px solid var(--color-rule)',
                    color: 'var(--color-ink-2)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {data.system_prompt}
                </div>
              </Section>

              {/* Footer affordance */}
              <p
                className="num-mono text-[10px] leading-relaxed mt-1"
                style={{ color: 'var(--color-muted)' }}
              >
                Direct response to &ldquo;made-up scores&rdquo; critiques. No composite numbers,
                no hidden tuning — just your data, the prompt, and any rails that fired.
              </p>
            </>
          )}
        </div>

        <style>{`
          @keyframes transparencySlide {
            from { transform: translateX(100%) }
            to   { transform: translateX(0) }
          }
          .animate-transparency-slide { animation: transparencySlide 220ms cubic-bezier(0.22, 1, 0.36, 1) }
        `}</style>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}

// ─── Meta pill ───────────────────────────────────────────────────────────────

function MetaPill({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <span
      className={`text-[11px] px-2 py-1 rounded-sm inline-flex items-center gap-1.5 ${mono ? 'num-mono' : ''}`}
      style={{
        backgroundColor: 'var(--color-paper)',
        border: '1px solid var(--color-rule)',
        color: 'var(--color-ink-2)',
      }}
    >
      <span className="eyebrow" style={{ letterSpacing: '0.16em' }}>
        {label}
      </span>
      <span style={{ color: 'var(--color-ink)' }}>{value}</span>
    </span>
  )
}
