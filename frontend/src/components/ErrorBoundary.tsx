import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  /** Kept so the screen can NAME what broke. A boundary that only says
   *  "something went wrong" turns every crash into the same bug report. */
  message: string | null
}

/**
 * Top-level error boundary around the routed app. A render error (or a
 * genuinely unrecoverable lazy-chunk failure) shows a friendly "reload" screen
 * on the app background instead of leaving the user on a blank white page.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message ?? null }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface for debugging; no external logging dependency.
    console.error('App crashed:', error, info)
    // AND LEAVE IT WHERE THE NEXT LOAD CAN FIND IT. A boot crash that only
    // logs to the console is invisible on a phone, and reloading — which is
    // what this screen tells you to do — clears the console with it. This is
    // the one breadcrumb that survives the reload that hides the bug.
    try {
      localStorage.setItem('ridr.lastCrash', JSON.stringify({
        at: new Date().toISOString(),
        message: error?.message ?? String(error),
        component: (info?.componentStack ?? '').split('\n').slice(0, 6).join('\n'),
      }))
    } catch { /* private mode; the console log still stands */ }
  }

  private handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="min-h-screen flex items-center justify-center px-6"
          style={{ background: 'var(--color-paper)' }}
        >
          <div className="flex flex-col items-center gap-4 text-center">
            <p
              className="text-[17px]"
              style={{ color: 'var(--color-ink)', fontFamily: 'var(--font-serif)' }}
            >
              Something went wrong
            </p>
            <p className="text-[13px]" style={{ color: 'var(--color-muted)' }}>
              The app hit an unexpected error. Reloading usually fixes it.
            </p>
            {/* The actual reason, small and quiet. "Something went wrong" with
                no detail is what makes a crash unreportable. */}
            {this.state.message && (
              <p className="text-[11px] max-w-[280px] break-words" style={{ color: 'var(--color-muted)', opacity: 0.7 }}>
                {this.state.message}
              </p>
            )}
            <button
              onClick={this.handleReload}
              className="mt-2 px-5 py-2.5 rounded-full text-[14px] font-medium transition-opacity hover:opacity-90"
              style={{ background: 'var(--color-accent)', color: '#0A0C0F' }}
            >
              Reload
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
