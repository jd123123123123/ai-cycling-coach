/**
 * CalendarPage — route shell for /calendar.
 *
 * Full-bleed TrainingCalendar surface within the DashboardShell.
 * Shares the same masthead, IconRail, and chat drawer as the dashboard.
 * No SegmentedTabs (tabs only appear on the dashboard).
 *
 * TODO(06.1 Wave 3): Add a calendar-specific toolbar (month/week/list view toggle).
 */
import DashboardShell from '../components/dashboard/DashboardShell'
import TrainingCalendar from '../components/dashboard/TrainingCalendar'

export default function CalendarPage() {
  return (
    <DashboardShell>
      <TrainingCalendar />
    </DashboardShell>
  )
}
