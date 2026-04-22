/**
 * IconRail — fixed 56px left sidebar for primary navigation.
 *
 * Visible only on desktop (lg breakpoint ≥ 1024px).
 * 5 destinations: Today, Calendar, Activities, Coach, Settings.
 * Active route: forest accent bar + paper-2 background.
 * Inactive: muted icon, transparent background.
 *
 * Tooltip via native `title` attribute (no tooltip library needed).
 */
import { Home, Calendar, Activity, MessageCircle, Settings } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'

interface NavItem {
  path: string
  icon: React.ReactNode
  label: string
}

const NAV_ITEMS: NavItem[] = [
  {
    path: '/dashboard',
    icon: <Home size={20} strokeWidth={1.6} />,
    label: 'Today',
  },
  {
    path: '/calendar',
    icon: <Calendar size={20} strokeWidth={1.6} />,
    label: 'Calendar',
  },
  {
    path: '/activities',
    icon: <Activity size={20} strokeWidth={1.6} />,
    label: 'Activities',
  },
  {
    path: '/coach',
    icon: <MessageCircle size={20} strokeWidth={1.6} />,
    label: 'Coach',
  },
  {
    path: '/settings',
    icon: <Settings size={20} strokeWidth={1.6} />,
    label: 'Settings',
  },
]

export default function IconRail() {
  useLanguage() // keep context subscription so language toggle re-renders nav
  const location = useLocation()

  return (
    // Hidden below lg breakpoint — masthead navigation handles mobile.
    <nav
      aria-label="Main navigation"
      className="hidden lg:flex flex-col"
      style={{
        position: 'fixed',
        left: 0,
        top: 64, // masthead height
        bottom: 0,
        width: 56,
        zIndex: 30,
        backgroundColor: 'var(--color-paper)',
        borderRight: '1px solid var(--color-rule)',
      }}
    >
      <ul
        role="list"
        className="flex flex-col items-center py-4 gap-1"
        style={{ listStyle: 'none', margin: 0, padding: '16px 0', gap: 4 }}
      >
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.path
          const label = item.label
          return (
            <li key={item.path} style={{ width: '100%' }}>
              <Link
                to={item.path}
                title={label}
                aria-label={label}
                aria-current={isActive ? 'page' : undefined}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  width: '100%',
                  height: 48,
                  textDecoration: 'none',
                  borderRadius: 0,
                  backgroundColor: isActive ? 'var(--color-paper-2)' : 'transparent',
                  color: isActive ? 'var(--color-forest)' : 'var(--color-muted)',
                  transition: 'background-color 150ms ease, color 150ms ease',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'var(--color-paper-2)'
                    e.currentTarget.style.color = 'var(--color-ink-2)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent'
                    e.currentTarget.style.color = 'var(--color-muted)'
                  }
                }}
              >
                {/* Active accent bar on the left edge */}
                {isActive && (
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 2,
                      height: 24,
                      borderRadius: '0 2px 2px 0',
                      backgroundColor: 'var(--color-amber)',
                    }}
                  />
                )}
                {item.icon}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
