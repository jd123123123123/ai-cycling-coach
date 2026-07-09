import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

interface DashboardSectionProps {
  id: string                    // localStorage key suffix
  title: string
  subtitle?: string
  defaultExpanded?: boolean
  children: ReactNode
}

// v2: prior versions eagerly persisted the default on mount, which pinned every
// section to whatever its default was at first load and made later changes to
// `defaultExpanded` inert. v2 only writes on an explicit user toggle; bumping
// the prefix lets the corrected defaults take effect once.
const STORAGE_PREFIX = 'dashboard-section:v2:'

/**
 * A collapsible section for fold-4 of the dashboard hierarchy.
 *
 * Persists expand/collapse state in localStorage per-section id so returning
 * users see their own preference. Uses a chevron rotation and a height
 * transition for the smoothest cognitive reveal.
 *
 * Accessibility: the header is a button (role=button, aria-expanded) and the
 * content region has role="region" with aria-hidden when collapsed.
 */
export default function DashboardSection({
  id,
  title,
  subtitle,
  defaultExpanded = false,
  children,
}: DashboardSectionProps) {
  const storageKey = `${STORAGE_PREFIX}${id}`
  const [expanded, setExpanded] = useState<boolean>(() => {
    if (typeof window === 'undefined') return defaultExpanded
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw === null) return defaultExpanded
      return raw === 'true'
    } catch {
      return defaultExpanded
    }
  })

  // Persist only on an explicit user toggle — never on mount — so `defaultExpanded`
  // stays authoritative until the user actually expresses a preference.
  const toggle = () => {
    setExpanded((e) => {
      const next = !e
      try {
        window.localStorage.setItem(storageKey, String(next))
      } catch {
        // localStorage disabled — soft fail, state stays session-local
      }
      return next
    })
  }

  return (
    <section
      className="flex flex-col min-w-0"
      style={{ borderTop: '1px solid var(--color-rule)' }}
      data-testid={`dashboard-section-${id}`}
    >
      <button
        type="button"
        onClick={toggle}
        className="flex items-center justify-between gap-3 py-4 w-full text-left min-h-[44px]"
        aria-expanded={expanded}
        aria-controls={`section-${id}-content`}
      >
        <div className="flex flex-col gap-0.5 min-w-0">
          <span
            className="text-[18px] sm:text-[20px] leading-tight dashboard-break-words font-medium"
            style={{ color: 'var(--color-ink)' }}
          >
            {title}
          </span>
          {subtitle && (
            <span className="eyebrow" style={{ color: 'var(--color-muted)' }}>
              {subtitle}
            </span>
          )}
        </div>
        <ChevronDown
          size={18}
          strokeWidth={1.8}
          style={{
            color: 'var(--color-ink-2)',
            transform: expanded ? 'rotate(-180deg)' : 'rotate(0deg)',
            transition: 'transform 200ms ease',
            flexShrink: 0,
          }}
        />
      </button>

      <div
        id={`section-${id}-content`}
        role="region"
        aria-hidden={!expanded}
        className="overflow-hidden"
        style={{
          maxHeight: expanded ? '4000px' : '0px',
          transition: 'max-height 400ms ease',
          opacity: expanded ? 1 : 0,
        }}
      >
        <div className="pb-6 pt-1">{children}</div>
      </div>
    </section>
  )
}
