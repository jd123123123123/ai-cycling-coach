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
 *
 * Now user-reorderable: single-card registry so the Customize button
 * still appears (per product decision).
 */
import TrainingCalendar from '../TrainingCalendar'
import ReorderableTab from '../ReorderableTab'
import { useT } from '../../../contexts/LocaleContext'
import type { CardDef } from '../cardRegistry'

export default function PlanTab() {
  const t = useT()
  const cards: CardDef[] = [
    // min-w-0 from the former outer div is preserved inside the card wrapper
    // by ReorderableTab's own <div key={c.id}> container.
    { id: 'training-calendar', label: t('card_calendar'), render: () => <TrainingCalendar /> },
  ]
  return <ReorderableTab tabId="plan" cards={cards} />
}
