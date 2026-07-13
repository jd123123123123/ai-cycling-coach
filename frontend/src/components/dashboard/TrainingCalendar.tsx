import { Calendar, dateFnsLocalizer, Views, type Event as RbcEvent, type EventProps, type DateCellWrapperProps, type Formats } from 'react-big-calendar'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { format, parse, startOfWeek, getDay, addDays, startOfMonth, parseISO, addMinutes } from 'date-fns'
import { enUS, de } from 'date-fns/locale'
import { useLocale } from '../../contexts/LocaleContext'
import {
  DndContext,
  useDraggable,
  useDroppable,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useMemo, useState } from 'react'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { usePlannedWorkouts, useUpdatePlannedWorkout } from '../../hooks/usePlannedWorkouts'
import type { PlannedWorkout } from '../../api/dashboard'
import type { ActivityRead } from '../../api/dashboard'
import WorkoutPreviewModal from './WorkoutPreviewModal'

// ─── Localizer (REQUIRED — without it react-big-calendar renders nothing) ────
// Register both cultures so the calendar can render German weekday/month names
// and, crucially, a 24h time gutter (no English AM/PM in a German UI).
const locales = { 'en-US': enUS, de: de }
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales })

// Force 24h time formats regardless of culture (defensive — the German UI must
// never show AM/PM).
const rangeTo24h = (
  range: { start: Date; end: Date },
  _culture: string | undefined,
  loc?: { format: (d: Date, f: string, c?: string) => string },
) => loc ? `${loc.format(range.start, 'HH:mm')} – ${loc.format(range.end, 'HH:mm')}` : ''

const calendarFormats: Formats = {
  timeGutterFormat: 'HH:mm',
  eventTimeRangeFormat: rangeTo24h,
  agendaTimeRangeFormat: rangeTo24h,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

type CalEvent = RbcEvent & {
  resource: {
    type: 'completed' | 'planned'
    id: number
    sport: string
    pw?: PlannedWorkout
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DraggableEvent({ event, children }: { event: CalEvent; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pw-${event.resource.id}`,
  })
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ opacity: isDragging ? 0.5 : 1, cursor: 'grab', height: '100%' }}
    >
      {children}
    </div>
  )
}

function EventRenderer({ event }: EventProps<CalEvent>) {
  const label = <span className="text-xs font-medium leading-tight">{event.title as string}</span>
  if (event.resource.type === 'planned') {
    return <DraggableEvent event={event}>{label}</DraggableEvent>
  }
  return label
}

function DroppableDateCell({ value, children }: DateCellWrapperProps) {
  const isoDate = toIsoDate(value)
  const { setNodeRef, isOver } = useDroppable({ id: isoDate })
  return (
    <div
      ref={setNodeRef}
      style={{
        flex: 1,
        background: isOver ? 'rgba(37, 99, 235, 0.08)' : undefined,
        transition: 'background 0.15s',
        minHeight: '100%',
      }}
    >
      {children}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TrainingCalendar() {
  const { locale } = useLocale()
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
  const [view, setView] = useState<'week' | 'month'>(isMobile ? 'week' : 'month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedPlanned, setSelectedPlanned] = useState<PlannedWorkout | null>(null)

  // Compute padded visible range for API queries
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (view === 'month') {
      const start = startOfWeek(startOfMonth(currentDate))
      return { rangeStart: start, rangeEnd: addDays(start, 42) }
    } else {
      const start = startOfWeek(currentDate)
      return { rangeStart: start, rangeEnd: addDays(start, 7) }
    }
  }, [view, currentDate])

  const activitiesQuery = useActivitiesRange(rangeStart, rangeEnd)
  const plannedQuery = usePlannedWorkouts(rangeStart, rangeEnd)
  const updateMutation = useUpdatePlannedWorkout()

  // Sensors — activationConstraint prevents nav button clicks from triggering drag
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  )

  // Merge completed activities + planned workouts into calendar events
  const events: CalEvent[] = useMemo(() => {
    const completed: CalEvent[] = (activitiesQuery.data?.activities ?? []).map((a: ActivityRead) => {
      const start = new Date(a.started_at)
      const end = new Date(start.getTime() + (a.duration_seconds ?? 3600) * 1000)
      return {
        title: a.title ?? (locale === 'de' ? `${a.sport}-Aktivität` : `${a.sport} activity`),
        start,
        end,
        resource: { type: 'completed', id: a.id, sport: a.sport },
      }
    })
    const planned: CalEvent[] = (plannedQuery.data?.planned_workouts ?? []).map((pw: PlannedWorkout) => {
      const start = parseISO(pw.date)
      const durationMin = Math.floor((pw.duration_seconds_target ?? 3600) / 60)
      const end = addMinutes(start, durationMin)
      return {
        title: pw.title,
        start,
        end,
        resource: { type: 'planned', id: pw.id, sport: pw.sport, pw },
      }
    })
    return [...completed, ...planned]
  }, [activitiesQuery.data, plannedQuery.data, locale])

  // Drag-drop handler
  function handleDragEnd(dragEvent: DragEndEvent) {
    const activeId = dragEvent.active.id as string
    const overId = dragEvent.over?.id as string | undefined
    if (!activeId.startsWith('pw-') || !overId) return
    const pwId = parseInt(activeId.replace('pw-', ''), 10)
    // Find current date of the planned workout
    const pw = plannedQuery.data?.planned_workouts.find((p) => p.id === pwId)
    if (!pw || pw.date === overId) return
    updateMutation.mutate({ id: pwId, body: { date: overId } })
  }

  // Navigation helpers
  function navigate(direction: 'prev' | 'next' | 'today') {
    setCurrentDate((prev) => {
      if (direction === 'today') return new Date()
      const delta = view === 'month' ? 30 : 7
      const d = new Date(prev)
      d.setDate(d.getDate() + (direction === 'next' ? delta : -delta))
      return d
    })
  }

  // Format header title
  const dfOpts = locale === 'de' ? { locale: de } : undefined
  const headerTitle = view === 'month'
    ? format(currentDate, 'MMMM yyyy', dfOpts)
    : locale === 'de'
      ? `${format(rangeStart, 'd. MMM', dfOpts)} – ${format(addDays(rangeStart, 6), 'd. MMM yyyy', dfOpts)}`
      : `${format(rangeStart, 'MMM d', dfOpts)} – ${format(addDays(rangeStart, 6), 'MMM d, yyyy', dfOpts)}`

  const isLoading = activitiesQuery.isLoading || plannedQuery.isLoading
  const isError = activitiesQuery.isError || plannedQuery.isError

  return (
    <div
      className="paper-grain rounded-[20px] p-5 sm:p-6 min-w-0"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
      }}
    >
      {/* Custom toolbar */}
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <span className="eyebrow" style={{ color: 'var(--color-amber)' }}>
            {locale === 'de' ? 'Logbuch' : 'Logbook'}
          </span>
          <h2
            className="num-display mt-1 leading-none"
            style={{
              fontSize: 'clamp(22px, 3vw, 28px)',
              color: 'var(--color-ink)',
            }}
          >
            {locale === 'de' ? 'Kalender' : 'Calendar'}
          </h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Prev / Today / Next */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => navigate('prev')}
              className="py-2 px-3 text-sm text-gray-700 hover:bg-gray-50 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label={locale === 'de' ? 'Zurück' : 'Previous'}
            >
              ‹
            </button>
            <button
              onClick={() => navigate('today')}
              className="py-2 px-3 text-sm text-gray-700 hover:bg-gray-50 border-x border-gray-200 min-h-[44px]"
            >
              {locale === 'de' ? 'Heute' : 'Today'}
            </button>
            <button
              onClick={() => navigate('next')}
              className="py-2 px-3 text-sm text-gray-700 hover:bg-gray-50 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label={locale === 'de' ? 'Weiter' : 'Next'}
            >
              ›
            </button>
          </div>
          <span className="text-sm font-medium text-gray-700 px-1">{headerTitle}</span>
          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setView('week')}
              className={`py-2 px-3 text-sm min-h-[44px] transition-colors ${
                view === 'week' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {locale === 'de' ? 'Woche' : 'Week'}
            </button>
            <button
              onClick={() => setView('month')}
              className={`py-2 px-3 text-sm min-h-[44px] border-l border-gray-200 transition-colors ${
                view === 'month' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {locale === 'de' ? 'Monat' : 'Month'}
            </button>
          </div>
        </div>
      </div>

      {/* Calendar body */}
      {isLoading ? (
        <div className="h-[520px] sm:h-[640px] rounded-xl bg-gray-100 animate-pulse" />
      ) : isError ? (
        <div className="h-[520px] sm:h-[640px] flex flex-col items-center justify-center gap-3 text-gray-500">
          <p className="text-sm">{locale === 'de' ? 'Kalender konnte nicht geladen werden' : "Couldn't load calendar"}</p>
          <button
            onClick={() => { activitiesQuery.refetch(); plannedQuery.refetch() }}
            className="py-2 px-4 text-sm rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            {locale === 'de' ? 'Erneut versuchen' : 'Retry'}
          </button>
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="h-[520px] sm:h-[640px]">
            <Calendar
              localizer={localizer}
              culture={locale === 'de' ? 'de' : 'en-US'}
              formats={calendarFormats}
              events={events}
              view={view}
              onView={(v) => setView(v as 'week' | 'month')}
              date={currentDate}
              onNavigate={setCurrentDate}
              views={[Views.WEEK, Views.MONTH]}
              toolbar={false}
              startAccessor="start"
              endAccessor="end"
              eventPropGetter={(event) => ({
                style: {
                  background: (event as CalEvent).resource.type === 'planned' ? '#2563eb' : '#9ca3af',
                  borderColor: (event as CalEvent).resource.type === 'planned' ? '#1d4ed8' : '#6b7280',
                  color: 'white',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                },
              })}
              components={{
                event: EventRenderer as React.ComponentType<EventProps<RbcEvent>>,
                dateCellWrapper: DroppableDateCell,
              }}
              onSelectEvent={(e) => {
                if ((e as CalEvent).resource?.type === 'planned' && (e as CalEvent).resource.pw) {
                  setSelectedPlanned((e as CalEvent).resource.pw!)
                }
              }}
              style={{ height: '100%' }}
            />
          </div>
        </DndContext>
      )}

      <WorkoutPreviewModal
        open={selectedPlanned !== null}
        onClose={() => setSelectedPlanned(null)}
        planned={selectedPlanned}
      />
    </div>
  )
}
