import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import { springs } from '../../utils/motion'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title: string
  eyebrow?: string
  /** Sticky footer action row (e.g. Save button). Stays pinned above the fold. */
  footer?: React.ReactNode
  children: React.ReactNode
}

/**
 * Mobile-first bottom sheet — slides up from the bottom, thumb-reachable, with
 * a sticky footer for the primary action (one-handed logging). On wider screens
 * it centres as a capped-width card. Portals into <body> so it beats the nav.
 */
export function BottomSheet({ open, onClose, title, eyebrow, footer, children }: BottomSheetProps) {
  const titleId = useRef(`bottom-sheet-${Math.random().toString(36).slice(2)}`)

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
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
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
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId.current}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={springs.smooth}
            onClick={(e) => e.stopPropagation()}
            style={{
              // Centre with auto margins (NOT translateX) — motion owns `transform`
              // for the y-slide, so a CSS translateX(-50%) gets clobbered mid-animation
              // and the sheet drifts off the right edge.
              position: 'fixed',
              left: 0,
              right: 0,
              marginLeft: 'auto',
              marginRight: 'auto',
              bottom: 0,
              zIndex: 501,
              width: '100%',
              maxWidth: 480,
              maxHeight: '92vh',
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
            <div
              className="flex items-start justify-between"
              style={{ padding: '12px 20px 14px', gap: 12 }}
            >
              <div className="flex flex-col" style={{ gap: 2, minWidth: 0 }}>
                {eyebrow && (
                  <span className="eyebrow" style={{ fontSize: 10, letterSpacing: 1, color: 'var(--color-accent)' }}>
                    {eyebrow}
                  </span>
                )}
                <span
                  id={titleId.current}
                  className="num-display"
                  style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-ink)', lineHeight: 1.2 }}
                >
                  {title}
                </span>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="flex items-center justify-center"
                style={{
                  flexShrink: 0,
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  border: '1px solid var(--color-rule)',
                  background: 'transparent',
                  color: 'var(--color-muted)',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>{children}</div>

            {/* Sticky footer */}
            {footer && (
              <div
                style={{
                  flexShrink: 0,
                  padding: '12px 16px calc(16px + env(safe-area-inset-bottom, 0px))',
                  borderTop: '1px solid var(--color-rule)',
                  background: 'var(--color-paper)',
                }}
              >
                {footer}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  if (typeof document === 'undefined') return null
  return createPortal(sheet, document.body)
}
