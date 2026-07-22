/**
 * MethodsDrawer — the "Wie wird das berechnet?" bottom sheet (backlog 02·K3,
 * model transparency). The deep sibling of GlossarySheet: where the glossary
 * gives a skeptic ONE plain sentence, this gives them the whole inspectable
 * model — plain-language purpose, the exact formula + constants, the REAL data
 * it consumed, the honest uncertainty, and a citation where one exists.
 *
 * Content is fully prop-driven (a MethodContent built by methodsContent.ts) so
 * any surface can feed it. The convenience hook `useMethods()` hands back an
 * `open(content)` plus the ready-to-render sheet.
 *
 * Structure & a11y mirror GlossarySheet exactly (role=dialog + aria-modal,
 * Escape / backdrop close, 44×44 close button, slide-up that collapses to a
 * fade under prefers-reduced-motion) so the two drawers feel like one system.
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { X, FlaskConical } from 'lucide-react'
import { springs, prefersReducedMotion } from '../../utils/motion'
import { useLocale } from '../../contexts/LocaleContext'
import type { MethodContent, MethodRow } from '../../utils/methodsContent'

interface MethodsDrawerProps {
  open: boolean
  onClose: () => void
  /** Nullable so the sheet can animate out after close. */
  content: MethodContent | null
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span
      className="eyebrow"
      style={{ fontSize: 10, letterSpacing: '0.16em', color: 'var(--color-muted)', fontWeight: 700 }}
    >
      {children}
    </span>
  )
}

function RowList({ rows }: { rows: MethodRow[] }) {
  return (
    <div className="flex flex-col" style={{ gap: 1, borderRadius: 14, overflow: 'hidden', border: '1px solid var(--color-rule)' }}>
      {rows.map((r, i) => (
        <div
          key={i}
          className="flex items-center justify-between"
          style={{ gap: 12, padding: '11px 14px', background: 'var(--color-paper-2)' }}
        >
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-ink-2)', minWidth: 0 }}>{r.label}</span>
          <span className="flex items-baseline" style={{ gap: 6, flexShrink: 0 }}>
            <span className="num-display" style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>
              {r.value}
            </span>
            {r.note && <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-muted)' }}>{r.note}</span>}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function MethodsDrawer({ open, onClose, content }: MethodsDrawerProps) {
  const { locale } = useLocale()
  const de = locale === 'de'
  const titleId = useRef(`methods-drawer-${Math.random().toString(36).slice(2)}`)
  const reduced = prefersReducedMotion()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  const sheet = (
    <AnimatePresence>
      {open && content && (
        <>
          <motion.div
            key="methods-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.22 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              zIndex: 500,
            }}
          />
          <motion.div
            key="methods-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId.current}
            initial={reduced ? { opacity: 0 } : { y: '100%' }}
            animate={reduced ? { opacity: 1 } : { y: 0 }}
            exit={reduced ? { opacity: 0 } : { y: '100%' }}
            transition={reduced ? { duration: 0 } : springs.smooth}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              left: 0,
              right: 0,
              marginLeft: 'auto',
              marginRight: 'auto',
              bottom: 0,
              zIndex: 501,
              width: '100%',
              maxWidth: 480,
              maxHeight: '88vh',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--color-paper)',
              borderTop: '1px solid var(--color-rule)',
              borderTopLeftRadius: 26,
              borderTopRightRadius: 26,
              boxShadow: '0 -8px 40px rgba(0,0,0,0.55)',
            }}
          >
            {/* Grab handle */}
            <div className="flex justify-center" style={{ paddingTop: 10 }}>
              <div style={{ width: 40, height: 5, borderRadius: 3, background: 'var(--color-surface-3)' }} />
            </div>

            {/* Header */}
            <div className="flex items-start justify-between" style={{ padding: '12px 20px 8px', gap: 12 }}>
              <div className="flex flex-col" style={{ gap: 3, minWidth: 0 }}>
                <span className="inline-flex items-center" style={{ gap: 6 }}>
                  <FlaskConical size={12} style={{ color: 'var(--color-accent)' }} />
                  <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.14em', color: 'var(--color-accent)', fontWeight: 700 }}>
                    {content.eyebrow}
                  </span>
                </span>
                <span
                  id={titleId.current}
                  className="num-display"
                  style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-ink)', lineHeight: 1.2 }}
                >
                  {content.title}
                </span>
              </div>
              <button
                type="button"
                aria-label={de ? 'Schließen' : 'Close'}
                onClick={onClose}
                className="flex items-center justify-center"
                style={{
                  flexShrink: 0,
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  border: '1px solid var(--color-rule)',
                  background: 'transparent',
                  color: 'var(--color-muted)',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div
              className="flex flex-col"
              style={{
                gap: 20,
                overflowY: 'auto',
                padding: '8px 20px calc(24px + env(safe-area-inset-bottom, 0px))',
              }}
            >
              {/* What it is */}
              <p style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--color-ink)', margin: 0 }}>
                {content.whatItIs}
              </p>

              {/* Formula + constants */}
              <div className="flex flex-col" style={{ gap: 8 }}>
                <SectionLabel>{de ? 'FORMEL & KONSTANTEN' : 'FORMULA & CONSTANTS'}</SectionLabel>
                <div
                  className="num-mono"
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: 'var(--color-ink)',
                    padding: '12px 14px',
                    borderRadius: 14,
                    background: 'color-mix(in srgb, var(--color-accent) 9%, var(--color-paper-2))',
                    border: '1px solid color-mix(in srgb, var(--color-accent) 28%, transparent)',
                    letterSpacing: '0.01em',
                  }}
                >
                  {content.formula}
                </div>
                {content.constants.length > 0 && <RowList rows={content.constants} />}
              </div>

              {/* Consumed data */}
              <div className="flex flex-col" style={{ gap: 8 }}>
                <SectionLabel>{de ? 'DEINE DATEN' : 'YOUR DATA'}</SectionLabel>
                <RowList rows={content.inputs} />
              </div>

              {/* Uncertainty */}
              <div className="flex flex-col" style={{ gap: 6 }}>
                <SectionLabel>{de ? 'UNSICHERHEIT' : 'UNCERTAINTY'}</SectionLabel>
                <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--color-ink-2)', margin: 0 }}>
                  {content.uncertainty}
                </p>
              </div>

              {/* Citation — only when one genuinely exists. */}
              {content.citation && (
                <div className="flex flex-col" style={{ gap: 6 }}>
                  <SectionLabel>{de ? 'QUELLE' : 'SOURCE'}</SectionLabel>
                  <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--color-muted)', margin: 0, fontStyle: 'italic' }}>
                    {content.citation}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  if (typeof document === 'undefined') return null
  return createPortal(sheet, document.body)
}

// ─── Convenience hook ─────────────────────────────────────────────────────

export interface MethodsHandle {
  /** Open the drawer for one fully-built method content object. */
  open: (content: MethodContent) => void
  close: () => void
  /** Render this once near the end of your page/component tree. */
  sheet: ReactNode
}

/**
 * useMethods — page-level helper. Hands back `open(content)` plus the
 * ready-to-render sheet. Callers build content via methodsContent.ts
 * (buildReadinessMethod / buildCpMethod) so the copy stays unit-pinnable.
 */
export function useMethods(): MethodsHandle {
  const [content, setContent] = useState<MethodContent | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  // Keep the last content alive while the exit animation runs.
  const lastContent = useRef<MethodContent | null>(null)

  const open = useCallback((c: MethodContent) => {
    lastContent.current = c
    setContent(c)
    setIsOpen(true)
  }, [])
  const close = useCallback(() => setIsOpen(false), [])

  const sheet = (
    <MethodsDrawer open={isOpen} onClose={close} content={content ?? lastContent.current} />
  )

  return { open, close, sheet }
}
