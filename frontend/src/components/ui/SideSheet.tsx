import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import { springs } from '../../utils/motion'

interface SideSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  /**
   * Desktop width in px. Default 600. Range 540–640 per REDESIGN-BRIEF §3.
   */
  width?: number
  /**
   * Optional eyebrow label above the title, e.g. "Why this?"
   */
  eyebrow?: string
  children: React.ReactNode
}

/**
 * Right-drawer primitive.
 *
 * Desktop (≥768px): slides in from the right, fixed right edge, full viewport
 * height, width = props.width ?? 600. Left edge rounded via --radius-xl.
 * Mobile (<768px): full-screen, width 100vw, no radius.
 *
 * Focus trap: captures activeElement on open, restores on close.
 * Portal: renders into document.body so z-index beats the masthead.
 * Esc key: closes the sheet.
 */
export function SideSheet({
  open,
  onClose,
  title,
  width = 600,
  eyebrow,
  children,
}: SideSheetProps) {
  const sheetRef = useRef<HTMLElement>(null)
  const previouslyFocusedRef = useRef<Element | null>(null)
  const titleId = useRef(`side-sheet-title-${Math.random().toString(36).slice(2)}`)

  // Capture previously-focused element and move focus into the sheet on open.
  useEffect(() => {
    if (open) {
      previouslyFocusedRef.current = document.activeElement
      // Defer one tick so AnimatePresence has rendered the element.
      const id = setTimeout(() => {
        sheetRef.current?.focus()
      }, 16)
      return () => clearTimeout(id)
    } else {
      // Restore focus on close.
      const el = previouslyFocusedRef.current
      if (el instanceof HTMLElement) {
        el.focus()
      }
    }
  }, [open])

  // Escape key listener.
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // Lock body scroll while sheet is open.
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  const drawer = (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            data-testid="sidesheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.30)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              zIndex: 400,
            }}
          />

          {/* Sheet */}
          <motion.aside
            key="sheet"
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId.current : undefined}
            tabIndex={-1}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={springs.smooth}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              zIndex: 401,
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--color-paper-2)',
              borderLeft: '1px solid var(--color-rule)',
              boxShadow: 'var(--shadow-4)',
              outline: 'none',
              // Desktop: constrained width + rounded left edge
              // Mobile (<768px): full-width, no radius (via inline media logic below)
              width: `min(${width}px, 100vw)`,
              borderTopLeftRadius: `clamp(0px, calc((100vw - 767px) * 9999), var(--radius-xl))`,
              borderBottomLeftRadius: `clamp(0px, calc((100vw - 767px) * 9999), var(--radius-xl))`,
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                padding: '20px 20px 16px',
                borderBottom: '1px solid var(--color-rule)',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                  {eyebrow && (
                    <span className="eyebrow" style={{ display: 'block' }}>
                      {eyebrow}
                    </span>
                  )}
                  {title && (
                    <h2
                      id={titleId.current}
                      style={{
                        margin: 0,
                        fontSize: 20,
                        fontWeight: 600,
                        letterSpacing: '-0.02em',
                        color: 'var(--color-ink)',
                        lineHeight: 1.25,
                      }}
                    >
                      {title}
                    </h2>
                  )}
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={onClose}
                  style={{
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 32,
                    height: 32,
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-rule)',
                    background: 'transparent',
                    color: 'var(--color-muted)',
                    cursor: 'pointer',
                    padding: 0,
                    transition: 'background var(--duration-micro)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--color-paper)'
                    e.currentTarget.style.color = 'var(--color-ink)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = 'var(--color-muted)'
                  }}
                >
                  <X size={20} strokeWidth={1.75} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '20px',
              }}
            >
              {children}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )

  if (typeof document === 'undefined') return null
  return createPortal(drawer, document.body)
}
