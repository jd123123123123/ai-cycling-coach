import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Camera, Check, X } from 'lucide-react'
import { T, FONT, EASE, HIDDEN_FILE_INPUT } from './w3tokens'
import { lux, TNUM } from './w3surfaces'
import {
  deleteRidePhoto, fetchRideDetails, saveRideDetails, uploadRidePhoto,
  type RidePhoto,
} from '../../api/rideDetails'

/**
 * W3 · ADD A PHOTO AND A SENTENCE — the Strava moment, after a ride syncs.
 *
 * ── WHY THIS IS A PROMPT AND NOT A SETTING ───────────────────────────────
 *
 * A ride lands from Garmin with a device-written title and a pile of numbers.
 * Nobody goes looking for an edit screen to improve that; they would have to
 * already care, and the whole point is that the app asks while the ride is
 * still the thing they just did. Strava's entire feed is built on asking at
 * exactly this moment, and the ask has to be cheap enough to say no to.
 *
 * ── EVERY WRITE IS ITS OWN, AND THAT IS DELIBERATE ───────────────────────
 *
 * A photo uploads the moment it is chosen and the sentence saves when the
 * rider is done typing. There is no "save" that commits a batch, because the
 * failure mode of a batch is losing all of it: a rider who picks three photos,
 * writes a paragraph, and hits a dead network should not lose the photos too.
 * What landed, landed.
 *
 * ── AND A FAILED PHOTO IS NAMED ──────────────────────────────────────────
 *
 * The server refuses a file that is not a readable image, one over the size
 * cap, and the seventh photo on a ride. Each comes back with a reason and the
 * sheet prints it, because "something went wrong" on an upload a rider watched
 * fail is the least useful sentence in software.
 */

export interface W3RideDetailsSheetProps {
  activityId: number
  open: boolean
  onClose: () => void
  /** Told when anything actually landed, so a feed behind this can refetch. */
  onSaved?: () => void
}

const MAX_CHARS = 2000

export default function W3RideDetailsSheet({
  activityId, open, onClose, onSaved,
}: W3RideDetailsSheetProps) {
  const reduce = useReducedMotion()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [photos, setPhotos] = useState<RidePhoto[]>([])
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const touched = useRef(false)

  useEffect(() => {
    if (!open) return
    let alive = true
    setError(null)
    fetchRideDetails(activityId)
      .then((d) => {
        if (!alive) return
        setPhotos(d.photos)
        setTitle(d.title ?? '')
        setText(d.description ?? '')
      })
      .catch(() => { if (alive) setError('Die Fahrt lässt sich gerade nicht laden.') })
    return () => { alive = false }
  }, [activityId, open])

  const pick = useCallback(async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true); setError(null)
    // Sequential, not Promise.all: the server caps photos per ride, and six
    // parallel uploads would each read a count that was true when it started.
    for (const file of Array.from(files)) {
      try {
        const p = await uploadRidePhoto(activityId, file)
        setPhotos((cur) => [...cur, p])
        touched.current = true
      } catch (e) {
        const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        setError(detail || 'Das Foto konnte nicht hochgeladen werden.')
        break
      }
    }
    setBusy(false)
    if (fileRef.current) fileRef.current.value = ''
  }, [activityId])

  const drop = useCallback(async (photoId: number) => {
    // Optimistic: the tile goes now and comes back if the server disagrees.
    const before = photos
    setPhotos((cur) => cur.filter((p) => p.id !== photoId))
    try {
      await deleteRidePhoto(activityId, photoId)
      touched.current = true
    } catch {
      setPhotos(before)
      setError('Das Foto konnte nicht gelöscht werden.')
    }
  }, [activityId, photos])

  const commitText = useCallback(async () => {
    if (!dirty) return
    setBusy(true); setError(null)
    try {
      await saveRideDetails(activityId, { title, description: text })
      setDirty(false)
      touched.current = true
    } catch {
      setError('Der Text konnte nicht gespeichert werden.')
    }
    setBusy(false)
  }, [activityId, dirty, title, text])

  const finish = useCallback(async () => {
    await commitText()
    if (touched.current) onSaved?.()
    onClose()
  }, [commitText, onSaved, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduce ? undefined : { opacity: 0 }}
          transition={{ duration: 0.18 }}
          role="dialog" aria-modal="true" aria-label="Fahrt ergänzen"
          style={{
            position: 'fixed', inset: 0, zIndex: 90, background: `${T.bg}E6`,
            backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'flex-end',
            fontFamily: FONT,
          }}
          onClick={onClose}
        >
          <motion.div
            initial={reduce ? false : { y: 40 }}
            animate={{ y: 0 }}
            exit={reduce ? undefined : { y: 40 }}
            transition={{ duration: 0.26, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
            style={{
              ...lux(28), width: '100%', maxHeight: '88dvh', overflowY: 'auto',
              padding: '18px 18px 26px', gap: 16,
              borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
              <span style={{ flex: 1, fontSize: 17, fontWeight: 700, letterSpacing: -0.4, color: T.ink }}>
                Erzähl von der Fahrt
              </span>
              <button type="button" onClick={onClose} aria-label="Schließen"
                style={{
                  border: 0, background: T.surface2, borderRadius: 100, width: 32, height: 32,
                  display: 'grid', placeItems: 'center', cursor: 'pointer',
                }}>
                <X size={15} color={T.mid} />
              </button>
            </div>

            <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.45, color: T.mid }}>
              Ein Foto und ein Satz machen aus Zahlen eine Fahrt, die deine Crew ansieht.
            </span>

            {/* ── the photos ── */}
            <div style={{ display: 'flex', gap: 8, width: '100%', overflowX: 'auto', paddingBottom: 2 }}>
              <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
                aria-label="Foto hinzufügen"
                style={{
                  flex: 'none', width: 86, height: 86, borderRadius: 18, border: 0,
                  background: T.surface2, display: 'grid', placeItems: 'center',
                  cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1,
                }}>
                <Camera size={22} color={T.acid} strokeWidth={1.8} />
              </button>
              {photos.map((p) => (
                <button key={p.id} type="button" onClick={() => drop(p.id)}
                  aria-label="Foto entfernen"
                  style={{
                    position: 'relative', flex: 'none', width: 86, height: 86, borderRadius: 18,
                    border: 0, padding: 0, overflow: 'hidden', cursor: 'pointer',
                    background: T.surface2,
                  }}>
                  <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <span style={{
                    position: 'absolute', top: 5, right: 5, width: 20, height: 20, borderRadius: 100,
                    background: `${T.bg}CC`, display: 'grid', placeItems: 'center',
                  }}>
                    <X size={11} color={T.ink} />
                  </span>
                </button>
              ))}
            </div>
            <input
              ref={fileRef} type="file" accept="image/*" multiple
              onChange={(e) => void pick(e.target.files)}
              style={HIDDEN_FILE_INPUT}
            />

            {/* ── the words ── */}
            <input
              value={title}
              onChange={(e) => { setTitle(e.target.value); setDirty(true) }}
              onBlur={() => void commitText()}
              placeholder="Titel der Fahrt"
              maxLength={200}
              style={{
                width: '100%', border: 0, borderRadius: 16, padding: '13px 15px',
                background: T.surface2, color: T.ink, fontFamily: FONT,
                fontSize: 14.5, fontWeight: 600, outline: 'none',
              }}
            />
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value.slice(0, MAX_CHARS)); setDirty(true) }}
              onBlur={() => void commitText()}
              placeholder="Wie war sie? Wo bist du langgefahren?"
              rows={4}
              style={{
                width: '100%', border: 0, borderRadius: 16, padding: '13px 15px',
                background: T.surface2, color: T.ink, fontFamily: FONT,
                fontSize: 14, fontWeight: 500, lineHeight: 1.45, outline: 'none', resize: 'none',
              }}
            />

            {error && (
              <span role="alert" style={{ fontSize: 12.5, fontWeight: 600, color: T.warn }}>{error}</span>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
              <span style={{ ...TNUM, fontSize: 11, fontWeight: 600, color: T.quiet }}>
                {text.length}/{MAX_CHARS}
              </span>
              <button type="button" onClick={() => void finish()} disabled={busy}
                style={{
                  marginLeft: 'auto', border: 0, borderRadius: 100, padding: '13px 22px',
                  background: T.acid, color: T.bg, fontFamily: FONT, fontSize: 14.5, fontWeight: 700,
                  cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                }}>
                <Check size={15} color={T.bg} strokeWidth={2.6} />Fertig
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
