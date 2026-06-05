import DashboardsWorkspace from '../components/dashboard/DashboardsWorkspace'

/**
 * DashboardsPage — standalone page wrapper for the analytics workspace.
 *
 * The workspace itself now lives in DashboardsWorkspace so it can also render
 * inside the Analyze hub's "Workspace" sub-tab. This route stays as a
 * full-width home + alias for deep links / bookmarks.
 */
export default function DashboardsPage() {
  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: 'var(--color-paper)', color: 'var(--color-ink)' }}
    >
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-6 sm:py-9">
        <DashboardsWorkspace />
      </div>
    </div>
  )
}
