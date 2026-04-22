/**
 * PlanTab — training calendar as the main surface.
 *
 * TrainingCalendar owns its own drag-drop + preview modal via portal
 * (per decision 04-04) — no interference here.
 *
 * Height criterion: TrainingCalendar has intentional internal scroll
 * (month view with sticky header, body scrolls). The PlanTab's outer
 * container fits within 820px at 1440×900 — the internal calendar scroll
 * is the documented acceptable exception (success criterion 2).
 */
import TrainingCalendar from '../TrainingCalendar'

export default function PlanTab() {
  return (
    // min-w-0 prevents grid blowout if PlanTab is placed inside a grid cell.
    // TrainingCalendar owns its own internal scroll — no additional wrapper.
    <div className="min-w-0">
      <TrainingCalendar />
    </div>
  )
}
