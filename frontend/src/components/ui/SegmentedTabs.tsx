import { useRef } from 'react'
import { motion } from 'motion/react'
import { springs } from '../../utils/motion'

interface Tab<T extends string> {
  id: T
  label: string
}

interface SegmentedTabsProps<T extends string> {
  tabs: readonly Tab<T>[]
  value: T
  onChange: (id: T) => void
  ariaLabel: string
  /**
   * Distinct motion layoutId for the sliding indicator. Required when more than
   * one SegmentedTabs renders on the same page (e.g. the primary nav and the
   * Analyze sub-control) — a shared id makes the indicator jump between them.
   */
  indicatorId?: string
  /**
   * Disables every tab: real `disabled` attribute (not just an `onChange`
   * guard), so the buttons drop out of the tab order and are announced as
   * unavailable — matching any other disabled control on the same screen
   * during an in-flight request.
   */
  disabled?: boolean
}

/**
 * Pill segmented control.
 *
 * - Active tab background slides via layoutId-backed motion.div using springs.snappy.
 * - Keyboard: ArrowLeft/ArrowRight cycle, Home/End jump, Enter activates, Tab exits.
 * - ARIA: tablist + tab roles with aria-selected on the active item.
 * - Generic over T extends string so callers get typed ids.
 */
export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
  indicatorId = 'segmented-indicator',
  disabled = false,
}: SegmentedTabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null)

  const activeIndex = tabs.findIndex((t) => t.id === value)

  const focusTab = (index: number) => {
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    buttons?.[index]?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault()
        next = (index + 1) % tabs.length
        onChange(tabs[next].id)
        focusTab(next)
        break
      case 'ArrowLeft':
        e.preventDefault()
        next = (index - 1 + tabs.length) % tabs.length
        onChange(tabs[next].id)
        focusTab(next)
        break
      case 'Home':
        e.preventDefault()
        onChange(tabs[0].id)
        focusTab(0)
        break
      case 'End':
        e.preventDefault()
        onChange(tabs[tabs.length - 1].id)
        focusTab(tabs.length - 1)
        break
      case 'Enter':
        e.preventDefault()
        onChange(tabs[index].id)
        break
      default:
        break
    }
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 'var(--radius-pill)',
        background: 'var(--color-paper)',
        border: '1px solid var(--color-rule)',
        padding: '4px',
        gap: 0,
        position: 'relative',
      }}
    >
      {tabs.map((tab, index) => {
        const isActive = tab.id === value
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px 14px',
              borderRadius: 'var(--radius-pill)',
              border: 'none',
              background: 'transparent',
              cursor: disabled ? 'default' : 'pointer',
              fontSize: 14,
              fontWeight: isActive ? 590 : 500,
              letterSpacing: '-0.01em',
              color: isActive ? 'var(--color-paper)' : 'var(--color-ink-2)',
              transition: `color var(--duration-micro)`,
              zIndex: 1,
              whiteSpace: 'nowrap',
            }}
          >
            {/* Sliding background indicator */}
            {isActive && (
              <motion.span
                layoutId={indicatorId}
                transition={springs.snappy}
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--color-ink)',
                  zIndex: -1,
                }}
              />
            )}
            {tab.label}
          </button>
        )
      })}
      {/* Invisible active index tracker so the indicator uses layoutId correctly
          when the active button is unmounted; not strictly needed here but keeps
          the layout engine stable across dynamic tab lists. */}
      <span
        aria-hidden
        data-active-index={activeIndex}
        style={{ display: 'none' }}
      />
    </div>
  )
}
