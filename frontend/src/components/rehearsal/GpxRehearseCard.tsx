import { useRef, useState } from 'react'
import { MapPin, Route, Upload } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateProfile } from '../../api/athletes'
import type { AthleteProfile } from '../../types/athlete'
import { useRehearseRoute } from '../../hooks/useRehearseRoute'

/**
 * GpxRehearseCard — the fourth route source, and the only writer for the
 * target-event course.
 *
 * Route Rehearsal was specified with four entry points; two of them (a crew
 * event, a past ride) had buttons and two did not. An uploaded GPX had no way
 * in at all, and `athlete_profiles.target_event_gpx` had a reader but no
 * writer, so the `target_event` source could only ever 404. This card closes
 * both: pick a file, and it is rehearsed immediately — optionally saved as the
 * course of the target event on the way past, which is what makes the
 * countdown able to project a time on the ACTUAL road rather than one that
 * merely resembles it.
 *
 * It lives on Plan next to the goal because that is where a target event is
 * set. The file never leaves the browser except as the body of the POST: it is
 * read here, parsed server-side, and the upload itself is not kept.
 */

/** Same 10 MB ceiling the API enforces — refused here so a 20 MB pick fails
 *  instantly and locally instead of after a long upload. */
const MAX_GPX_BYTES = 10 * 1024 * 1024

export default function GpxRehearseCard({
  profile,
  de,
}: {
  profile?: AthleteProfile
  de: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()
  const { rehearse, pendingRef, failed, error } = useRehearseRoute()
  const [asTargetEvent, setAsTargetEvent] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const saveCourse = useMutation({
    mutationFn: (gpx: string) => updateProfile({ target_event_gpx: gpx }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['athlete', 'me'] })
    },
  })

  const busy = pendingRef !== null || saveCourse.isPending
  const hasStoredCourse = profile?.has_target_event_route === true

  const onPick = async (file: File | undefined) => {
    if (!file || busy) return
    setLocalError(null)
    if (file.size > MAX_GPX_BYTES) {
      setLocalError(
        de
          ? 'Diese Datei ist zu groß — bis 10 MB können wir lesen.'
          : 'That file is too large — we can read up to 10 MB.',
      )
      return
    }
    let gpx: string
    try {
      gpx = await file.text()
    } catch {
      setLocalError(
        de ? 'Die Datei konnte nicht gelesen werden.' : 'That file could not be read.',
      )
      return
    }
    // The course is stored FIRST and awaited: if it fails we say so instead of
    // navigating away to a rehearsal that silently did not save the event.
    if (asTargetEvent) {
      try {
        await saveCourse.mutateAsync(gpx)
      } catch {
        setLocalError(
          de
            ? 'Die Strecke konnte nicht als Ziel-Event-Strecke gespeichert werden.'
            : 'That route could not be saved as your target-event course.',
        )
        return
      }
    }
    // Name from the file, minus the extension — the athlete recognises their
    // own filename, and a GPX often carries no <name> at all.
    const name = file.name.replace(/\.gpx$/i, '').slice(0, 160) || undefined
    await rehearse('gpx', undefined, name, { gpx })
  }

  const message = localError ?? (failed ? error ?? (de ? 'Diese Strecke konnte gerade nicht geprobt werden.' : "Couldn't rehearse that route just now.") : null)

  return (
    <section
      className="rounded-[24px] p-5 flex flex-col"
      style={{
        gap: 12,
        background: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
      }}
    >
      <div className="flex items-center gap-2">
        <Route size={14} style={{ color: 'var(--color-muted)' }} />
        <span
          className="eyebrow"
          style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--color-muted)' }}
        >
          {de ? 'STRECKE PROBEN' : 'REHEARSE A ROUTE'}
        </span>
      </div>

      <p style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--color-ink-2)', margin: 0 }}>
        {de
          ? 'Lade die GPX-Datei deiner Strecke hoch — wir fahren sie gegen deine eigene Physiologie ab: Zeitspanne, Watt pro Anstieg und der Punkt, an dem es eng wird.'
          : 'Upload your route as a GPX — we ride it against your own physiology: a time range, watts per climb, and the point where it gets ugly.'}
      </p>

      <input
        ref={inputRef}
        type="file"
        accept=".gpx,application/gpx+xml,application/xml,text/xml"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          // Reset so picking the SAME file again still fires a change event.
          e.target.value = ''
          void onPick(file)
        }}
      />

      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center justify-center rounded-full"
        style={{
          gap: 7,
          padding: '11px 0',
          minHeight: 44,
          background: 'var(--color-surface-2)',
          border: '1px solid var(--color-rule)',
          opacity: busy ? 0.6 : 1,
          cursor: busy ? 'default' : 'pointer',
        }}
      >
        <Upload size={15} strokeWidth={2.3} style={{ color: 'var(--color-accent)' }} />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--color-ink)' }}>
          {busy
            ? de
              ? 'Wird geprobt …'
              : 'Rehearsing…'
            : de
              ? 'GPX auswählen'
              : 'Choose a GPX file'}
        </span>
      </button>

      <label
        className="flex items-center"
        style={{ gap: 9, fontSize: 12.5, color: 'var(--color-ink-2)', cursor: busy ? 'default' : 'pointer' }}
      >
        <input
          type="checkbox"
          checked={asTargetEvent}
          disabled={busy}
          onChange={(e) => setAsTargetEvent(e.target.checked)}
          style={{ width: 16, height: 16, accentColor: 'var(--color-accent)', flexShrink: 0 }}
        />
        <span>
          {de
            ? 'Auch als offizielle Strecke meines Ziel-Events speichern'
            : 'Also save this as my target event’s official course'}
        </span>
      </label>

      {hasStoredCourse && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setLocalError(null)
            void rehearse('target_event')
          }}
          className="inline-flex items-center justify-center rounded-full"
          style={{
            gap: 7,
            padding: '10px 0',
            minHeight: 44,
            background: 'transparent',
            border: '1px solid var(--color-rule)',
            opacity: busy ? 0.6 : 1,
            cursor: busy ? 'default' : 'pointer',
          }}
        >
          <MapPin size={15} strokeWidth={2.3} style={{ color: 'var(--color-accent)' }} />
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--color-ink)' }}>
            {de ? 'Ziel-Event-Strecke proben' : 'Rehearse my target-event course'}
          </span>
        </button>
      )}

      {message && (
        <span role="alert" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-amber)', lineHeight: 1.4 }}>
          {message}
        </span>
      )}
    </section>
  )
}
