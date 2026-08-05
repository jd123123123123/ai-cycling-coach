import { useTodayModel } from '../data/useTodayModel'
import TodayView from './TodayView'

/** Today, wired to live data. The layout itself lives in TodayView. */
export default function TodayPage() {
  return <TodayView model={useTodayModel()} />
}
