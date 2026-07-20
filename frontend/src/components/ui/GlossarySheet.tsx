/**
 * GlossarySheet — the tap-to-explain bottom sheet that turns jargon into an
 * invitation (usability audit P1: Coach-Stil 'Einfach' governs the whole UI).
 *
 * Explains exactly ONE metric: a plain sentence + today's reading + what to
 * do. Content is prop-driven ({title, eyebrow, reading, explanation, action})
 * so any surface can feed it; the convenience hook `useGlossary()` builds
 * that content from the bilingual copy bank in utils/metricLabel.ts and
 * returns an `open(key, reading)` you can wire straight onto a metric chip.
 *
 * Accessibility: role=dialog + aria-modal, Escape closes, backdrop click
 * closes, close button is 44×44, and the slide-up animation collapses to a
 * plain fade under prefers-reduced-motion.
 */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import { springs, prefersReducedMotion } from '../../utils/motion'
import { useLanguage } from '../../contexts/LanguageContext'
import { useLocale } from '../../contexts/LocaleContext'
import {
  buildGlossaryContent,
  type GlossaryContent,
  type GlossaryKey,
} from '../../utils/metricLabel'

interface GlossarySheetProps {
  open: boolean
  onClose: () => void
  /** What to explain. Nullable so the sheet can animate out after close. */
  content: GlossaryContent | null
}

export default function GlossarySheet({ open, onClose, content }: GlossarySheetProps) {
  const { locale } = useLocale()
  const de = locale === 'de'
  const titleId = useRef(`glossary-sheet-${Math.random().toString(36).slice(2)}`)
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
            key="glossary-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.22 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.45)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              zIndex: 500,
            }}
          />
          <motion.div
            key="glossary-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId.current}
            initial={reduced ? { opacity: 0 } : { y: '100%' }}
            animate={reduced ? { opacity: 1 } : { y: 0 }}
            exit={reduced ? { opacity: 0 } : { y: '100%' }}
            transition={reduced ? { duration: 0 } : springs.smooth}
            onClick={(e) => e.stopPropagation()}
            style={{
              // Centre with auto margins (NOT translateX) — motion owns
              // `transform` for the y-slide (same invariant as BottomSheet).
              position: 'fixed',
              left: 0,
              right: 0,
              marginLeft: 'auto',
              marginRight: 'auto',
              bottom: 0,
              zIndex: 501,
              width: '100%',
              maxWidth: 480,
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--color-paper)',
              borderTop: '1px solid var(--color-rule)',
              borderTopLeftRadius: 26,
              borderTopRightRadius: 26,
              boxShadow: '0 -8px 40px rgba(0,0,0,0.45)',
            }}
          >
            {/* Grab handle */}
            <div className="flex justify-center" style={{ paddingTop: 10 }}>
              <div style={{ width: 40, height: 5, borderRadius: 3, background: 'var(--color-surface-3)' }} />
            </div>

            {/* Header */}
            <div className="flex items-start justify-between" style={{ padding: '12px 20px 4px', gap: 12 }}>
              <div className="flex flex-col" style={{ gap: 2, minWidth: 0 }}>
                <span className="eyebrow" style={{ fontSize: 10.5, letterSpacing: '0.14em', color: 'var(--color-muted)' }}>
                  {content.eyebrow}
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
                gap: 16,
                overflowY: 'auto',
                padding: '8px 20px calc(24px + env(safe-area-inset-bottom, 0px))',
              }}
            >
              {/* Today's reading — neutral ink, never red (no-guilt rule). */}
              {content.reading && (
                <div
                  className="flex items-baseline"
                  style={{
                    gap: 10,
                    padding: '14px 16px',
                    borderRadius: 16,
                    background: 'var(--color-paper-2)',
                    border: '1px solid var(--color-rule)',
                  }}
                >
                  <span className="num-display" style={{ fontSize: 32, color: 'var(--color-ink)' }}>
                    {content.reading}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>
                    {de ? 'dein Wert' : 'your number'}
                  </span>
                </div>
              )}

              <p style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--color-ink)', margin: 0 }}>
                {content.explanation}
              </p>

              <div className="flex flex-col" style={{ gap: 4 }}>
                <span className="eyebrow" style={{ fontSize: 10.5, letterSpacing: '0.14em', color: 'var(--color-stand)' }}>
                  {de ? 'WAS TUN?' : 'WHAT TO DO'}
                </span>
                <p style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--color-ink-2)', margin: 0 }}>
                  {content.action}
                </p>
              </div>
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

export interface GlossaryHandle {
  /** Open the sheet for one metric; `reading` is the pre-formatted value. */
  open: (key: GlossaryKey, reading?: string | null) => void
  close: () => void
  /** Render this once near the end of your page/component tree. */
  sheet: ReactNode
}

/**
 * useGlossary — page-level helper. Reads the coach voice + locale itself,
 * builds content from the copy bank, and hands back `open(key, reading)`
 * plus the ready-to-render sheet element.
 */
export function useGlossary(): GlossaryHandle {
  const { language } = useLanguage()
  const { locale } = useLocale()
  const [entry, setEntry] = useState<{ key: GlossaryKey; reading: string | null } | null>(null)
  // Keep the last content alive while the exit animation runs.
  const lastContent = useRef<GlossaryContent | null>(null)

  const open = useCallback((key: GlossaryKey, reading?: string | null) => {
    setEntry({ key, reading: reading ?? null })
  }, [])
  const close = useCallback(() => setEntry(null), [])

  const content = useMemo(() => {
    if (!entry) return lastContent.current
    const built = buildGlossaryContent(entry.key, language, locale, entry.reading)
    lastContent.current = built
    return built
  }, [entry, language, locale])

  const sheet = (
    <GlossarySheet open={entry != null} onClose={close} content={content} />
  )

  return { open, close, sheet }
}
