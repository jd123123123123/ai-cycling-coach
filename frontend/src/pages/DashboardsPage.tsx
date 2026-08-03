import DashboardsWorkspace from '../components/dashboard/DashboardsWorkspace'
import AppShell from '../components/shell/AppShell'
import { useLocale } from '../contexts/LocaleContext'

/**
 * DashboardsPage — standalone page wrapper for the analytics workspace.
 *
 * The workspace itself now lives in DashboardsWorkspace so it can also render
 * inside the Analyze hub's "Workspace" sub-tab. This route stays as a
 * full-width home + alias for deep links / bookmarks.
 *
 * On AppShell like every other page: this is reachable by bookmark, and a
 * bookmarked deep link used to land the athlete on a page with no navigation
 * at all. The workspace lays out from its container rather than the viewport,
 * so it reflows into the shell column without changes.
 */
export default function DashboardsPage() {
  const { locale } = useLocale()
  const de = locale === 'de'

  return (
    <AppShell title={de ? 'Auswertungen' : 'Dashboards'}>
      <DashboardsWorkspace />
    </AppShell>
  )
}
