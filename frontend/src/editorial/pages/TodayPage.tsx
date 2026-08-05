import EditorialRoot from '../EditorialRoot'
import { useDayState } from '../state/useDayState'

/**
 * The spine every Today state shares:
 *   StatusBar → Hero → Day Rail → Insight Strip → numbered sections
 *   → Tomorrow Band → TabBar
 * Sections are filled in per state by Tasks 8–13.
 */
export default function TodayPage() {
  const { state } = useDayState()
  return (
    <EditorialRoot state={state}>
      <main data-day-state={state} />
    </EditorialRoot>
  )
}
