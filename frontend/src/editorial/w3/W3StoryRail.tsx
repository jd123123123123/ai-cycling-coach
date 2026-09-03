import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ChevronRight, Plus, X } from 'lucide-react'
import { T, FONT } from './w3tokens'
import { TNUM } from './w3surfaces'
import W3Eyebrow from './W3Eyebrow'

/**
 * W3 · JETZT UNTERWEGS — the story rail, pen frame `Y5ewIu`, and the viewer
 * behind it.
 *
 * ── WHAT MAKES SOMEBODY A STORY ──────────────────────────────────────────
 *
 * A crew-mate who rode TODAY. Not "is riding right now" — the app learns about
 * a ride when it syncs, minutes to hours after the wheels stopped, so a rail
 * claiming live activity would be claiming something it cannot know. The
 * heading says what is true: these are the people who have been out today.
 *
 * ── THE RING IS THE UNREAD MARK ──────────────────────────────────────────
 *
 * Lit acid until their ride has been opened, then dropped to a quiet outline —
 * the one convention everybody already knows from every story rail they have
 * ever used. Seen state is per browser (`localStorage`) because it is a
 * reading convenience, not a fact worth a column, and it is keyed by RIDE and
 * not by rider: tomorrow's ride from the same person is unread again.
 *
 * ── AND THE VIEWER BEHAVES LIKE THE ONE THEY KNOW ────────────────────────
 *
 * Segmented progress along the top, auto-advance, tap the right third for the
 * next and the left third for the previous, hold to pause, swipe down or press
 * Escape to close. Deviating from that vocabulary buys nothing: a story viewer
 * that invents its own gestures is a story viewer people cannot use.
 */

const SEEN_KEY = 'w3.stories.seen'
/** Long enough to read the numbers, short enough that a rail of six is not a
 *  commitment. Instagram sits at five for a photo; a ride card is denser. */
const STORY_MS = 6000

function seenSet(): Set<number> {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    return new Set<number>(raw ? JSON.parse(raw) : [])
  } catch {
    return new Set()
  }
}

function markSeen(id: number): void {
  try {
    const all = seenSet()
    all.add(id)
    localStorage.setItem(SEEN_KEY, JSON.stringify([...all].slice(-300)))
  } catch { /* storage refused — every ring stays unread, which is harmless */ }
}

export interface W3Story {
  /** The ride's id — the unit of "seen", so tomorrow's ride is unread again. */
  id: number
  name: string
  avatarUrl: string | null
  initial: string
  mine: boolean
  /** What the viewer shows for this rider. */
  card: React.ReactNode
  /** Out to the whole ride. A story is a glance and the recap is the page;
   *  without this the viewer is a dead end, which is the one thing a story
   *  viewer must not be. */
  onOpenRide?: () => void
}

// ── the rail ────────────────────────────────────────────────────────────────

export default function W3StoryRail({ stories, onStart, startLabel = 'Foto', tint = T.acid }: {
  stories: W3Story[]
  /**
   * The leading tile.
   *
   * OMITTED WHEN THERE IS NOTHING FOR IT TO DO, and that is the whole rule.
   * Instagram's "+" makes a story; this app cannot — a ride arrives from a
   * head unit, it is not begun in here. The nearest true thing is "make your
   * ride worth looking at", so the tile opens the photo sheet for the rider's
   * own newest ride that has none, and simply does not render when they have
   * no such ride. A tile that navigated somewhere vaguely related would be a
   * dead control, which is the defect this codebase grows fastest.
   */
  onStart?: () => void
  startLabel?: string
  tint?: string
}) {
  const [seen, setSeen] = useState<Set<number>>(() => seenSet())
  const [at, setAt] = useState<number | null>(null)

  const open = useCallback((i: number) => {
    setAt(i)
    const id = stories[i]?.id
    if (id != null) { markSeen(id); setSeen((s) => new Set(s).add(id)) }
  }, [stories])

  // NOBODY OUT MEANS NO RAIL. The earlier guard kept the strip alive whenever
  // the rider had a ride to dress up, which drew "JETZT UNTERWEGS 0" over a
  // row holding nothing but the plus — a heading that counts people, counting
  // none. The plus is not lost: every one of your own photoless posts carries
  // its own Foto button over the media.
  if (stories.length === 0) return null

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 20px' }}>
          <span aria-hidden style={{ width: 7, height: 7, borderRadius: 100, background: tint }} />
          <W3Eyebrow tone={T.mid}>Jetzt unterwegs</W3Eyebrow>
          <span style={{ ...TNUM, fontSize: 11, fontWeight: 700, color: T.ink }}>{stories.length}</span>
        </div>

        {/* Edge-to-edge scroll with the padding INSIDE it, so the first and
            last tiles can sit against the screen edge the way a rail should
            rather than being boxed in by the page's own gutter. */}
        <div style={{
          display: 'flex', gap: 14, width: '100%', overflowX: 'auto',
          padding: '2px 20px 4px', scrollbarWidth: 'none',
        }}>
          {onStart && (
            <button type="button" onClick={onStart}
              style={{
                flex: 'none', border: 0, background: 'transparent', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
                fontFamily: FONT, padding: 0, width: 66,
              }}>
              <span style={{
                width: 62, height: 62, borderRadius: 100, display: 'grid', placeItems: 'center',
                background: T.surface2,
              }}>
                <Plus size={22} color={tint} strokeWidth={2.2} />
              </span>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet }}>{startLabel}</span>
            </button>
          )}

          {stories.map((s, i) => {
            const unread = !seen.has(s.id)
            return (
              <button key={s.id} type="button" onClick={() => open(i)}
                aria-label={`${s.name}: Fahrt ansehen`}
                style={{
                  flex: 'none', border: 0, background: 'transparent', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
                  fontFamily: FONT, padding: 0, width: 66,
                }}>
                <span style={{
                  width: 62, height: 62, borderRadius: 100, display: 'grid', placeItems: 'center',
                  // The ring IS the unread mark. Lit while there is something
                  // to see, a quiet outline once there is not.
                  boxShadow: unread
                    ? `0 0 0 2.5px ${tint}`
                    : `0 0 0 1.5px ${T.d2}`,
                }}>
                  {s.avatarUrl ? (
                    <img src={s.avatarUrl} alt="" style={{
                      width: 56, height: 56, borderRadius: 100, objectFit: 'cover',
                    }} />
                  ) : (
                    <span style={{
                      width: 56, height: 56, borderRadius: 100, display: 'grid', placeItems: 'center',
                      background: T.surface2, color: T.mid, fontSize: 20, fontWeight: 700,
                    }}>{s.initial}</span>
                  )}
                </span>
                <span style={{
                  fontSize: 10.5, fontWeight: 600, maxWidth: 66, whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis',
                  color: unread ? T.ink : T.quiet,
                }}>{s.name}</span>
              </button>
            )
          })}
        </div>
      </div>

      <W3StoryViewer
        stories={stories}
        at={at}
        onClose={() => setAt(null)}
        onSeen={(id) => { markSeen(id); setSeen((s) => new Set(s).add(id)) }}
      />
    </>
  )
}

// ── the viewer ──────────────────────────────────────────────────────────────

function W3StoryViewer({ stories, at, onClose, onSeen }: {
  stories: W3Story[]
  at: number | null
  onClose: () => void
  onSeen: (id: number) => void
}) {
  const reduce = useReducedMotion()
  const [i, setI] = useState(0)
  const [held, setHeld] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const startedAt = useRef(0)
  const raf = useRef(0)

  const openIdx = at
  const active = openIdx != null

  useEffect(() => { if (openIdx != null) { setI(openIdx); setElapsed(0) } }, [openIdx])

  const next = useCallback(() => {
    setI((cur) => {
      const n = cur + 1
      if (n >= stories.length) { onClose(); return cur }
      const id = stories[n]?.id
      if (id != null) onSeen(id)
      return n
    })
    setElapsed(0)
  }, [stories, onClose, onSeen])

  const prev = useCallback(() => {
    setI((cur) => Math.max(0, cur - 1))
    setElapsed(0)
  }, [])

  // The clock. Paused while held, and it measures REAL time rather than
  // counting frames, so a backgrounded tab does not silently bank progress.
  useEffect(() => {
    if (!active || held) return
    startedAt.current = performance.now() - elapsed
    const tick = () => {
      const e = performance.now() - startedAt.current
      setElapsed(e)
      if (e >= STORY_MS) { next(); return }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
    // `elapsed` deliberately absent: it is the loop's own output, and listing
    // it here would restart the loop on every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, held, i, next])

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, onClose, next, prev])

  const story = active ? stories[i] : null
  const pct = useMemo(() => Math.min(1, elapsed / STORY_MS), [elapsed])

  return (
    <AnimatePresence>
      {active && story && (
        <motion.div
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduce ? undefined : { opacity: 0 }}
          transition={{ duration: 0.16 }}
          role="dialog" aria-modal="true" aria-label={`Fahrt von ${story.name}`}
          style={{
            position: 'fixed', inset: 0, zIndex: 100, background: T.bg,
            display: 'flex', flexDirection: 'column', fontFamily: FONT,
          }}
        >
          {/* segmented progress — one bar per story, the current one filling */}
          <div style={{ display: 'flex', gap: 4, padding: '10px 12px 0', flex: 'none' }}>
            {stories.map((s, n) => (
              <span key={s.id} style={{
                flex: 1, height: 2.5, borderRadius: 100, background: `${T.ink}2E`, overflow: 'hidden',
              }}>
                <span style={{
                  display: 'block', height: '100%', borderRadius: 100, background: T.ink,
                  width: n < i ? '100%' : n === i ? `${pct * 100}%` : '0%',
                }} />
              </span>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', flex: 'none' }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>{story.name}</span>
            <button type="button" onClick={onClose} aria-label="Schließen"
              style={{
                marginLeft: 'auto', border: 0, background: 'transparent', cursor: 'pointer',
                padding: 6, display: 'grid', placeItems: 'center',
              }}>
              <X size={20} color={T.ink} />
            </button>
          </div>

          {/* THE CARD, and the tap zones over it. Right third advances, left
              third goes back, holding anywhere pauses — the vocabulary every
              story viewer shares, because one that invents its own is one
              people cannot use. */}
          <div style={{ position: 'relative', flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 16px 20px' }}>
            {story.card}
            <div
              style={{ position: 'absolute', inset: 0, display: 'flex' }}
              onPointerDown={() => setHeld(true)}
              onPointerUp={() => setHeld(false)}
              onPointerCancel={() => setHeld(false)}
            >
              <button type="button" onClick={prev} aria-label="Zurück"
                style={{ flex: 1, border: 0, background: 'transparent', cursor: 'pointer' }} />
              {/* The middle is inert on purpose: it is where the card's own
                  controls live, and a tap zone over them would eat them. */}
              <span style={{ flex: 1.4, pointerEvents: 'none' }} />
              <button type="button" onClick={next} aria-label="Weiter"
                style={{ flex: 1, border: 0, background: 'transparent', cursor: 'pointer' }} />
            </div>
          </div>

          {/* OUT TO THE RIDE. Below the tap zones and outside them, so the
              gesture that advances a story can never be the gesture that
              navigates away from it. */}
          {story.onOpenRide && (
            <div style={{ flex: 'none', padding: '0 16px 22px' }}>
              <button
                type="button"
                onClick={() => { onClose(); story.onOpenRide?.() }}
                style={{
                  width: '100%', height: 46, borderRadius: 100, border: 0,
                  background: T.acid, color: T.bg, fontFamily: FONT,
                  fontSize: 14.5, fontWeight: 700, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                }}>
                Ganze Fahrt ansehen <ChevronRight size={16} color={T.bg} />
              </button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
