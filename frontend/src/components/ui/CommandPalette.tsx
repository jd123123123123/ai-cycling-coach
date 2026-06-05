/**
 * CommandPalette — Cmd+K (or Ctrl+K) global palette via cmdk.
 *
 * Contract: open/close is owned by DashboardShell, not this component.
 * This component does NOT self-bind Cmd+K — that binding lives in the shell
 * so the palette can be cleanly closed from outside.
 *
 * Sections:
 *   1. Navigate — tab shortcuts + route links (≤ 2 keystrokes after open)
 *   2. Ask coach — pre-filled questions routed through CoachChat initialDraft
 *
 * 2-keystroke guarantee: cmdk's fuzzy filter means the first non-ambiguous
 * letter + Enter lands on the right item. Label prefixes are chosen to avoid
 * collisions (leading "→ " on coach items so "A" resolves to "Activities",
 * "?" resolves to coach questions).
 *
 * Language-aware: headings and action labels adapt via useLanguage().
 */
import { useEffect, useRef } from 'react'
import { Command } from 'cmdk'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'
import { prefersReducedMotion } from '../../utils/motion'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  /** Called when the user selects a coach question — shell seeds CoachChat initialDraft. */
  onAskCoach?: (question: string) => void
}

export default function CommandPalette({ open, onClose, onAskCoach }: CommandPaletteProps) {
  const navigate = useNavigate()
  const [, setSearchParams] = useSearchParams()
  const { language } = useLanguage()
  const simple = language === 'simple'
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when opened
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [open])

  // Close on Escape (cmdk handles this, but belt-and-suspenders)
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const handleNavigate = (path: string, params?: Record<string, string>) => {
    onClose()
    if (params) {
      setSearchParams(params)
    } else {
      navigate(path)
    }
  }

  const handleAskCoach = (question: string) => {
    onClose()
    onAskCoach?.(question)
  }

  // Label collision notes:
  // "T" → "Today" wins over "Trends" (Trends comes second in list, filter narrows)
  // "A" → "Activities" wins over "→ Ask coach" (prefix "→ " makes coach items filter away on "A")
  // "?" → prefix used on coach items so typing "?" surfaces them
  const navigateHeading = simple ? 'Go to' : 'Navigate'
  const coachHeading = simple ? 'Ask coach' : 'Coach questions'

  const NAVIGATE_ITEMS: Array<{ id: string; label: string; action: () => void }> = [
    {
      id: 'today',
      label: 'Today',
      action: () => handleNavigate('/dashboard', { tab: 'today' }),
    },
    {
      id: 'week',
      label: simple ? 'This week' : 'Week',
      action: () => handleNavigate('/dashboard', { tab: 'week' }),
    },
    {
      id: 'analyze',
      label: simple ? 'Trends' : 'Analyze',
      action: () => handleNavigate('/dashboard', { tab: 'analyze', sub: 'overview' }),
    },
    {
      id: 'report',
      label: 'Report',
      action: () => handleNavigate('/dashboard', { tab: 'analyze', sub: 'report' }),
    },
    {
      id: 'workspace',
      label: simple ? 'Charts' : 'Workspace',
      action: () => handleNavigate('/dashboard', { tab: 'analyze', sub: 'workspace' }),
    },
    {
      id: 'plan',
      label: simple ? 'Plan' : 'Calendar',
      action: () => handleNavigate('/dashboard', { tab: 'plan' }),
    },
    {
      id: 'activities',
      label: 'Activities',
      action: () => handleNavigate('/activities'),
    },
    {
      id: 'settings',
      label: 'Settings',
      action: () => handleNavigate('/settings'),
    },
    {
      id: 'garmin',
      label: 'Garmin connection',
      action: () => handleNavigate('/garmin/connect'),
    },
  ]

  // Prefix "→ " so these items don't collide with "Activities" on "A"
  // and can be surfaced with "?" prefix typing
  const COACH_QUESTIONS: Array<{ id: string; label: string; question: string }> = [
    {
      id: 'why-tired',
      label: '→ Why am I tired?',
      question: 'Why am I tired?',
    },
    {
      id: 'what-today',
      label: '→ What should I do today?',
      question: 'What should I do today?',
    },
    {
      id: 'last-4-weeks',
      label: '→ Analyze my last 4 weeks',
      question: 'Analyze my last 4 weeks',
    },
    {
      id: 'easier',
      label: '→ Make today\'s workout easier',
      question: "Make today's workout easier",
    },
  ]

  const shouldAnimate = !prefersReducedMotion()

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose()
      }}
      label="Command palette"
      loop
      style={{
        // Position: fixed centered overlay
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '14vh',
        backgroundColor: 'rgba(20, 24, 17, 0.4)',
        backdropFilter: 'blur(var(--blur-regular))',
        WebkitBackdropFilter: 'blur(var(--blur-regular))',
        // Subtle fade-in on backdrop
        ...(shouldAnimate
          ? { animation: 'cmdk-backdrop-in 150ms var(--ease-apple-decel) both' }
          : {}),
      }}
      onClick={(e) => {
        // Close on backdrop click
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          width: 'min(640px, 92vw)',
          backgroundColor: 'var(--color-paper-2)',
          border: '1px solid var(--color-rule)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-4)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '60vh',
          ...(shouldAnimate
            ? { animation: 'cmdk-dialog-in 200ms var(--ease-apple-decel) both' }
            : {}),
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div
          style={{
            backgroundColor: 'var(--color-paper)',
            borderRadius: 'var(--radius-md)',
            margin: 10,
            marginBottom: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 14px',
            border: '1px solid var(--color-rule)',
            height: 48,
            flexShrink: 0,
          }}
        >
          {/* Search icon */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
            style={{ color: 'var(--color-muted)', flexShrink: 0 }}
          >
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
            <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <Command.Input
            ref={inputRef}
            placeholder={simple ? 'Where to? Ask the coach…' : 'Navigate or ask coach…'}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 17,
              color: 'var(--color-ink)',
              fontFamily: 'inherit',
            }}
          />
          {/* Esc badge */}
          <kbd
            style={{
              flexShrink: 0,
              fontSize: 11,
              color: 'var(--color-muted)',
              border: '1px solid var(--color-rule)',
              borderRadius: 6,
              padding: '2px 6px',
              fontFamily: 'inherit',
            }}
          >
            esc
          </kbd>
        </div>

        {/* Results list */}
        <Command.List
          style={{
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            padding: '0 6px 10px',
            flex: 1,
          }}
        >
          <Command.Empty
            style={{
              padding: '20px 12px',
              textAlign: 'center',
              fontSize: 14,
              color: 'var(--color-muted)',
              fontFamily: 'inherit',
            }}
          >
            {simple ? 'Nothing found' : 'No results'}
          </Command.Empty>

          {/* Navigate group */}
          <Command.Group
            heading={navigateHeading}
            style={{ paddingTop: 4 }}
          >
            {NAVIGATE_ITEMS.map((item) => (
              <Command.Item
                key={item.id}
                value={item.label}
                onSelect={item.action}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 10px',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  fontSize: 14,
                  color: 'var(--color-ink)',
                  fontFamily: 'inherit',
                }}
                data-cmdk-item=""
              >
                {item.label}
              </Command.Item>
            ))}
          </Command.Group>

          {/* Coach questions group */}
          <Command.Group
            heading={coachHeading}
            style={{ paddingTop: 4 }}
          >
            {COACH_QUESTIONS.map((q) => (
              <Command.Item
                key={q.id}
                value={q.label}
                onSelect={() => handleAskCoach(q.question)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 10px',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  fontSize: 14,
                  color: 'var(--color-ink)',
                  fontFamily: 'inherit',
                }}
                data-cmdk-item=""
              >
                {q.label}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </div>

      <style>{`
        [cmdk-group-heading] {
          font-size: 10px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--color-muted);
          padding: 8px 10px 4px;
          font-family: inherit;
        }
        [cmdk-item][aria-selected="true"] {
          background-color: rgba(20, 24, 17, 0.05);
          outline: none;
        }
        [cmdk-item]:hover {
          background-color: rgba(20, 24, 17, 0.04);
        }
        @keyframes cmdk-backdrop-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes cmdk-dialog-in {
          from { opacity: 0; transform: translateY(-8px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </Command.Dialog>
  )
}
