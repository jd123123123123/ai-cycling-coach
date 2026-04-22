/**
 * ActivitiesPage — route shell for /activities.
 *
 * Full activity log (limit=50) within the DashboardShell.
 * Row clicks open SideSheet detail (same behavior as dashboard's RecentActivities).
 * No SegmentedTabs.
 *
 * TODO(06.1 Wave 3): Add filters (sport, date range, search).
 */
import DashboardShell from '../components/dashboard/DashboardShell'
import RecentActivities from '../components/dashboard/RecentActivities'

export default function ActivitiesPage() {
  return (
    <DashboardShell>
      <RecentActivities limit={50} />
    </DashboardShell>
  )
}
