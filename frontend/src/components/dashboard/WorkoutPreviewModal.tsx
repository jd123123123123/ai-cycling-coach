import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { format, parseISO } from 'date-fns'
import type { PlannedWorkout } from '../../api/dashboard'
import WorkoutPreview from './WorkoutPreview'

interface WorkoutPreviewModalProps {
  open: boolean
  onClose: () => void
  planned: PlannedWorkout | null
}

function formatDurationTarget(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

export default function WorkoutPreviewModal({ open, onClose, planned }: WorkoutPreviewModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<Element | null>(null)

  // Focus management: capture current focus on open, restore on close
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement
      // Focus the close button after portal mounts
      const timer = setTimeout(() => {
        closeButtonRef.current?.focus()
      }, 0)
      return () => clearTimeout(timer)
    } else {
      // Restore focus when modal closes
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus()
      }
    }
  }, [open])

  // Escape key handler
  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // Body scroll lock
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = ''
      }
    }
  }, [open])

  if (!open || !planned) return null

  const hasIntervals = (planned.interval_structure?.intervals?.length ?? 0) > 0
  const sportLabel = planned.sport.charAt(0).toUpperCase() + planned.sport.slice(1)
  const dateLabel = format(parseISO(planned.date), 'EEE, MMM d')

  const modal = (
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center z-50 bg-black/50 backdrop-blur-[1px]"
      onClick={onClose}
      aria-hidden="false"
    >
      <div
        className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workout-preview-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2
            id="workout-preview-title"
            className="text-base font-semibold text-gray-900 dashboard-break-words min-w-0"
          >
            {planned.title}
          </h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close"
            className="flex-shrink-0 flex items-center justify-center min-w-[44px] min-h-[44px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Metadata row */}
        <div className="flex flex-wrap gap-3 text-sm text-gray-500 mb-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="font-medium text-gray-700">{sportLabel}</span>
          </span>
          <span>·</span>
          <span>{dateLabel}</span>
          {planned.duration_seconds_target !== null && planned.duration_seconds_target !== undefined && (
            <>
              <span>·</span>
              <span>{formatDurationTarget(planned.duration_seconds_target)}</span>
            </>
          )}
        </div>

        {/* Interval preview */}
        {hasIntervals ? (
          <WorkoutPreview intervals={planned.interval_structure!.intervals} />
        ) : (
          <p className="text-sm text-gray-400 italic py-3 text-center border border-dashed border-gray-200 rounded-xl">
            No interval structure defined yet
          </p>
        )}

        {/* Description */}
        {planned.description && (
          <p className="text-sm text-gray-600 mt-3 whitespace-pre-wrap">
            {planned.description}
          </p>
        )}
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
