import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Check, Download, ImagePlus, Users, Link2, Palette, Sticker, SlidersHorizontal, X } from 'lucide-react'
import { T, FONT, EASE, HIDDEN_FILE_INPUT } from './w3tokens'
import { TNUM } from './w3surfaces'
import type { ShareAngle, StoryField, StoryLayout, StoryTextZone } from './w3share'
import W3StatusBar from './W3StatusBar'
import W3TopBar from './W3TopBar'
import W3LaufbandBands from './W3LaufbandBands'
import { fileToDownscaledDataUrl } from './w3photo'
import { MAX_VALUES, type ValueId } from './w3shareValues'
import { FIELD_LABEL, STORY_FORMATS, stepFormat } from './w3storyEdit'
import './w3.css'

/**
 * W3 · STORY STUDIO — one screen, and you work ON the picture.
 *
 * WHAT THIS REPLACED, AND WHY. The studio was a small preview tile with five
 * labelled settings sections stacked under it: format chips, a list of text
 * inputs, angle chips, a photo row, an accent row, a value grid. Everything was
 * reachable and nothing was direct — the rider looked at a thumbnail of their
 * card while typing into a form about it, and had to scroll a page and a half
 * to see what one change did. That is a settings screen for an image, and the
 * app it is competing with is Instagram.
 *
 * So: ONE VIEWPORT, NO PAGE SCROLL, and every control is on the thing it
 * changes.
 *
 *   · the card fills the screen;
 *   · SWIPE it to change format — the six are ordered by how much they give up,
 *     so the gesture runs along a continuum instead of shuffling a menu;
 *   · TAP A WORD to rewrite it, in place, where it sits on the picture. The
 *     rectangles come from the renderer itself (`renderStoryCard` emits them as
 *     it paints), so a tap target cannot drift away from its type;
 *   · TAP THE PICTURE to put a different one behind it;
 *   · colour and numbers live behind two glass buttons on the card, opening a
 *     tray over it rather than a section below it.
 *
 * THE NUMBERS ARE STILL NOT EDITABLE, and that is the same rule as before: a
 * share sheet where you can retype the wattage is a lie generator. Only
 * `StoryField` — the card's LANGUAGE — is the rider's to change.
 */

export interface ShareAngleChip { id: ShareAngle; label: string; sub: string }

/** Kept as the view's own name for the renderer's field type, so the page and
 *  its tests do not all have to be rewritten to import from `w3share`. */
export type EditField = StoryField

export interface W3ShareVm {
  /** Which of the six story formats is selected. Absent → the full card. */
  format?: StoryLayout
  posterDataUrl: string | null
  /** Where each editable word ended up on the bitmap, in 1080x1920 space.
   *  Emitted by the paint pass, so it is always the current layout's truth. */
  zones?: StoryTextZone[]
  generating: boolean
  angles: ShareAngleChip[]
  activeAngle: ShareAngle
  canShare: boolean
  /** True once the rider has put their own photograph behind the card. */
  hasOwnPhoto: boolean
  /** The values on the card, in the order the rider tapped them. */
  values?: ValueId[]
  /** Only what this ride actually recorded, already formatted. */
  availableValues?: { id: ValueId; label: string; value: string }[]
  /** The card's accent. Absent → the app's acid. */
  accent?: string
  /** What the video path is doing right now, in the rider's language. */
  videoNote?: string | null
  /** The two Laufband strings, built by `laufbandStrings` so the belt that
   *  scrolls here and the one burned into the PNG are the same tape. */
  laufband?: { figures: string; verdicts: string }
  /** What the rider has typed over the card's own words. */
  edits?: Partial<Record<EditField, string>>
  /** The card's own words, for the placeholders. */
  defaults?: Partial<Record<EditField, string>>
}

export interface W3ShareActions {
  onPickPhoto?: (dataUrl: string | null) => void
  onPickValues?: (ids: ValueId[]) => void
  onPickAccent?: (hex: string) => void
  onPickVideo?: (file: File) => void
  onPickFormat?: (id: StoryLayout) => void
  onEditText?: (field: EditField, value: string) => void
  onClose?: () => void
  onDownload?: () => void
  onSelectAngle?: (id: ShareAngle) => void
  onShare?: () => void
  onSticker?: () => void
  onCrew?: () => void
  onLink?: () => void
}

/** The accent palette. Five, all tokens — the app's own colours, never a wheel.
 *  A sixth would be a preference; five is a decision. */
const ACCENTS: { name: string; value: string }[] = [
  { name: 'Acid', value: T.acid },
  { name: 'Abend', value: T.evening },
  { name: 'Kühl', value: T.cool },
  { name: 'Warn', value: T.warn },
  { name: 'Weiß', value: T.ink },
]

const SECONDARY = [
  { id: 'sticker', label: 'Sticker', Icon: Sticker },
  { id: 'crew', label: 'Crew', Icon: Users },
  { id: 'link', label: 'Link', Icon: Link2 },
] as const

/** Below this a horizontal drag is a tap that wandered, not a swipe. */
const SWIPE_PX = 44

type Tray = 'accent' | 'values' | null

export default function W3ShareView({
  vm, onClose, onDownload, onSelectAngle, onPickPhoto, onPickValues, onPickAccent,
  onPickVideo, onPickFormat, onEditText, onShare, onSticker, onCrew, onLink,
}: { vm: W3ShareVm } & W3ShareActions) {
  const reduce = useReducedMotion()
  const format = vm.format ?? 'full'
  const accent = vm.accent ?? T.acid

  const cardRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [editing, setEditing] = useState<EditField | null>(null)
  const [draft, setDraft] = useState('')
  const [tray, setTray] = useState<Tray>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)

  /** The zones are in canvas units; everything drawn over them is in CSS px.
   *  Measured rather than computed, because the card is height-constrained on a
   *  short screen and width-constrained on a tall one. */
  useLayoutEffect(() => {
    const el = cardRef.current
    if (!el) return
    const read = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Opening the editor puts the caret in it; the keyboard is the point.
  useEffect(() => {
    if (!editing) return
    const t = window.setTimeout(() => inputRef.current?.focus(), reduce ? 0 : 120)
    return () => window.clearTimeout(t)
  }, [editing, reduce])

  /** Change format, and close any open editor first — each layout prints its
   *  own set of words, so a format change can drop the one being edited and
   *  leave a caret floating over type that is no longer there. Done here rather
   *  than in an effect on `format`: setState inside an effect cascades a render,
   *  and this is a plain consequence of an event, not of the state settling. */
  const pickFormat = (id: StoryLayout) => {
    setEditing(null)
    onPickFormat?.(id)
  }

  // The strip follows the swipe. Six chips do not fit in 390 — that is why the
  // row scrolls — so swiping to either end would otherwise light a chip the
  // rider cannot see, and the one control that says where they are in the list
  // would be the one thing off screen.
  useEffect(() => {
    const el = stripRef.current?.querySelector('[data-on="1"]')
    el?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest', inline: 'center' })
  }, [format, reduce])

  const openEditor = (field: EditField) => {
    setTray(null)
    setDraft(vm.edits?.[field] ?? '')
    setEditing(field)
  }
  const commit = () => {
    if (editing) onEditText?.(editing, draft)
    setEditing(null)
  }

  // ── the swipe ─────────────────────────────────────────────────────────────
  //
  // `swallow` is the whole reason this is not three lines. A swipe that crosses
  // a word ends with a `click` on that word — pointerup fires first and clears
  // the drag, so a guard reading the drag state at click time is ALWAYS looking
  // at null and always lets the tap through. Swiping over the headline would
  // change the format and open its keyboard on the way past. The verdict has to
  // outlive the gesture that produced it, so pointerup records it and the next
  // click consumes it.
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const swallow = useRef(false)
  /** True once, for the click a just-finished swipe is about to fire. */
  const swiped = () => {
    if (!swallow.current) return false
    swallow.current = false
    return true
  }
  const onDown = (e: React.PointerEvent) => {
    swallow.current = false
    drag.current = { x: e.clientX, y: e.clientY, moved: false }
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    if (Math.abs(e.clientX - d.x) > 10 || Math.abs(e.clientY - d.y) > 10) d.moved = true
  }
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.moved) swallow.current = true
    const dx = e.clientX - d.x
    // A vertical drag is the rider scrolling something else, not a format swipe.
    if (Math.abs(dx) < SWIPE_PX || Math.abs(e.clientY - d.y) > Math.abs(dx)) return
    pickFormat(stepFormat(format, dx < 0 ? 1 : -1))
  }

  const zones = vm.zones ?? []
  const sx = box.w / 1080
  const sy = box.h / 1920
  const editingZone = editing ? zones.find((z) => z.field === editing) ?? null : null

  const glass: CSSProperties = {
    width: 36, height: 36, borderRadius: 100, border: 0, cursor: 'pointer',
    background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
    display: 'grid', placeItems: 'center',
  }
  const tool: CSSProperties = {
    width: 36, height: 36, flex: 'none', borderRadius: 100, border: 0, cursor: 'pointer',
    background: T.surface, display: 'grid', placeItems: 'center',
  }

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{
        fontFamily: FONT, display: 'flex', flexDirection: 'column',
        // ONE PAGER. The card is the only thing that flexes; nothing scrolls.
        height: '100dvh', overflow: 'hidden',
      }}>
        <W3StatusBar />
        <W3TopBar title="Fahrt teilen" onBack={onClose}
          extra={
            <button onClick={onDownload} aria-label="Bild speichern"
              style={{ width: 40, height: 40, borderRadius: 100, background: T.surface, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
              <Download size={17} color={T.ink} />
            </button>
          } />

        {/* ── THE CONTROL ROW ────────────────────────────────────────────
            These sat ON the card, which is where Instagram puts them — and
            Instagram's canvas is a photograph. Ours is a designed card with
            type hard against BOTH edges: rendered at 390x844 the angle pill
            landed exactly on the Laufband's dateline, and the tool rail was one
            row above the 138px headline. A control that covers the thing it
            controls is worse than a control that costs 40px.

            So the card stays pristine — it is the product — and its chrome sits
            in a slim row of its own. Tapping the picture is still how you
            change the picture; this only adds the button that SAYS so. ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 20px 8px', flex: 'none' }}>
          {vm.angles.length > 0 && (
            <button type="button"
              onClick={() => {
                const i = vm.angles.findIndex((a) => a.id === vm.activeAngle)
                onSelectAngle?.(vm.angles[(i + 1) % vm.angles.length].id)
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
                borderRadius: 100, background: T.surface, border: 0, cursor: 'pointer', fontFamily: FONT,
              }}>
              <span style={{ width: 6, height: 6, borderRadius: 100, background: accent }} />
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, color: T.ink }}>
                {vm.angles.find((a) => a.id === vm.activeAngle)?.label ?? ''}
              </span>
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" aria-label={vm.hasOwnPhoto ? 'Anderes Bild wählen' : 'Eigenes Bild wählen'}
            onClick={() => fileRef.current?.click()}
            style={{ ...tool, background: vm.hasOwnPhoto ? T.acidDim : T.surface }}>
            <ImagePlus size={16} color={vm.hasOwnPhoto ? accent : T.ink} />
          </button>
          {vm.hasOwnPhoto && (
            <button type="button" aria-label="Eigenes Bild entfernen" onClick={() => onPickPhoto?.(null)} style={tool}>
              <X size={16} color={T.mid} />
            </button>
          )}
          <button type="button" aria-label="Akzentfarbe" onClick={() => setTray(tray === 'accent' ? null : 'accent')}
            style={{ ...tool, background: tray === 'accent' ? T.acidDim : T.surface }}>
            <Palette size={16} color={tray === 'accent' ? accent : T.ink} />
          </button>
          {(vm.availableValues ?? []).length > 0 && (
            <button type="button" aria-label="Werte" onClick={() => setTray(tray === 'values' ? null : 'values')}
              style={{ ...tool, background: tray === 'values' ? T.acidDim : T.surface }}>
              <SlidersHorizontal size={16} color={tray === 'values' ? accent : T.ink} />
            </button>
          )}
        </div>

        {/* ── THE CARD, AND THE WORDS ON IT ─────────────────────────────── */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '6px 20px 10px' }}>
          <div
            ref={cardRef}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
            style={{
              position: 'relative', height: '100%', aspectRatio: '1080 / 1920',
              maxWidth: '100%', borderRadius: 22, overflow: 'hidden',
              background: T.surface, boxShadow: '0 18px 55px rgba(0,0,0,0.65)',
              touchAction: 'pan-y',
            }}>
            {vm.posterDataUrl
              ? <motion.img key={`${vm.activeAngle}-${format}`} src={vm.posterDataUrl} alt="Teilbares Bild deiner Fahrt"
                  initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.28, ease: EASE }}
                  draggable={false}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              : <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.quiet }}>Bild wird erstellt…</span>
                </div>}

            {format === 'headline' && vm.laufband && vm.posterDataUrl && (
              <W3LaufbandBands figures={vm.laufband.figures} verdicts={vm.laufband.verdicts} accent={accent} />
            )}

            {/* TAP THE PICTURE → ANOTHER PICTURE. It sits UNDER the word
                targets, so a rider aiming at the headline gets the headline and
                a rider aiming at the sky gets their photo library. */}
            <button type="button" aria-label="Anderes Bild wählen"
              onClick={() => { if (!swiped()) fileRef.current?.click() }}
              style={{ position: 'absolute', inset: 0, border: 0, background: 'transparent', cursor: 'pointer' }} />

            {/* THE WORDS, WHERE THEY ARE. Invisible until touched — the card is
                the design, and dotted boxes over it would be a form again. */}
            {box.w > 0 && !editing && zones.map((z) => (
              <button key={z.field} type="button"
                aria-label={`${FIELD_LABEL[z.field]} bearbeiten`}
                onClick={() => { if (!swiped()) openEditor(z.field) }}
                style={{
                  position: 'absolute',
                  left: z.x * sx, top: z.y * sy, width: z.w * sx, height: z.h * sy,
                  border: 0, borderRadius: 8, cursor: 'text', padding: 0,
                  background: vm.edits?.[z.field] ? `${accent}1F` : 'transparent',
                }} />
            ))}

            {vm.generating && vm.posterDataUrl && (
              <div style={{ position: 'absolute', bottom: 12, left: 12, padding: '5px 11px', borderRadius: 100, background: 'rgba(0,0,0,0.63)' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: accent }}>rendert…</span>
              </div>
            )}

            {/* ── EDITING, IN PLACE ──────────────────────────────────────
                The rest of the card dims so the word being rewritten is the
                only lit thing, and the field sits exactly where its type sits.
                Not a modal with a form in it: the rider is looking at the
                sentence they are changing, in the place it will be read. */}
            {editing && editingZone && (
              <>
                <button type="button" aria-label="Fertig" onClick={commit}
                  style={{ position: 'absolute', inset: 0, border: 0, background: 'rgba(0,0,0,0.62)', cursor: 'pointer' }} />
                {/* ON ITS OWN GROUND. Sat directly on the type at first, so
                    the placeholder ("Harzrunde") was printed across the 138px
                    headline saying the same word and neither could be read. The
                    field keeps the word's POSITION — that is the whole idea —
                    and brings a surface with it. Clamped so a zone near the
                    foot of the card cannot push the keyboard off-screen. */}
                <div style={{
                  position: 'absolute',
                  left: 10,
                  top: Math.max(10, Math.min(box.h - 118, editingZone.y * sy - 30)),
                  width: box.w - 20,
                  display: 'flex', flexDirection: 'column', gap: 5,
                  background: 'rgba(8,8,8,0.94)', borderRadius: 14,
                  padding: '11px 13px 13px',
                }}>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: accent }}>
                    {FIELD_LABEL[editing].toUpperCase()}
                  </span>
                  <input
                    ref={inputRef}
                    value={draft}
                    placeholder={vm.defaults?.[editing] ?? ''}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(null) }}
                    className="w3-share-edit"
                    style={{
                      width: '100%', border: 0, outline: 'none', background: 'transparent',
                      borderBottom: `2px solid ${accent}`, padding: '2px 0 6px',
                      fontFamily: FONT, fontSize: 17, fontWeight: 700, color: T.ink,
                      ['--w3-ph' as string]: 'rgba(255,255,255,0.45)',
                    } as CSSProperties} />
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>
                    Leer lassen — dann sagt es wieder, was die Fahrt sagt.
                  </span>
                </div>
                <button type="button" onClick={commit}
                  style={{
                    position: 'absolute', right: 12, top: 12, ...glass,
                    background: accent,
                  }}>
                  <Check size={17} color={T.bg} />
                </button>
              </>
            )}

            {/* ── THE TRAY ───────────────────────────────────────────────
                Colour and numbers open OVER the card rather than under it, so
                the rider never loses sight of what they are changing and the
                page never grows a second screenful. */}
            {tray && !editing && (
              <motion.div
                initial={reduce ? false : { y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.2, ease: EASE }}
                style={{
                  position: 'absolute', left: 8, right: 8, bottom: 8, borderRadius: 18,
                  background: 'rgba(10,10,10,0.86)', backdropFilter: 'blur(10px)',
                  padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 11,
                }}>
                {tray === 'accent' ? (
                  <>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>AKZENT</span>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {ACCENTS.map((a) => (
                        <button key={a.name} type="button" aria-label={a.name}
                          onClick={() => onPickAccent?.(a.value)}
                          style={{
                            width: 36, height: 36, borderRadius: 100, cursor: 'pointer', background: a.value,
                            border: accent === a.value ? `3px solid ${T.ink}` : 0,
                          }} />
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>WERTE</span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: T.mid, ...TNUM }}>
                        {(vm.values ?? []).length} VON {MAX_VALUES}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                      {(vm.availableValues ?? []).map((v) => {
                        const at = (vm.values ?? []).indexOf(v.id)
                        const on = at >= 0
                        const full = !on && (vm.values ?? []).length >= MAX_VALUES
                        return (
                          <button key={v.id} type="button" disabled={full}
                            onClick={() => onPickValues?.(
                              on ? (vm.values ?? []).filter((x) => x !== v.id) : [...(vm.values ?? []), v.id],
                            )}
                            style={{
                              padding: '7px 11px', borderRadius: 100, cursor: full ? 'default' : 'pointer',
                              border: 0, opacity: full ? 0.35 : 1, fontFamily: FONT,
                              background: on ? accent : 'rgba(255,255,255,0.10)',
                              color: on ? T.bg : T.ink, fontSize: 11, fontWeight: 700,
                            }}>
                            {v.label}
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </div>
        </div>

        {/* ── THE FILTER STRIP ───────────────────────────────────────────
            The same six the swipe walks, so the gesture has somewhere to read
            itself. Tapping is the shortcut; swiping the card is the gesture a
            rider already knows from every other photo editor they own. */}
        <div ref={stripRef} style={{
          display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none',
          padding: '0 20px 10px', flex: 'none',
        }}>
          {STORY_FORMATS.map((f) => {
            const on = f.id === format
            return (
              <button key={f.id} type="button" data-on={on ? '1' : '0'} onClick={() => pickFormat(f.id)}
                style={{
                  flex: 'none', padding: '8px 12px', borderRadius: 12, border: 0, cursor: 'pointer',
                  background: on ? accent : T.surface, fontFamily: FONT,
                  display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start',
                }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap', color: on ? T.bg : T.ink }}>{f.name}</span>
                <span style={{ fontSize: 8.5, fontWeight: 600, whiteSpace: 'nowrap', color: on ? `${T.bg}A6` : T.quiet }}>{f.drops}</span>
              </button>
            )
          })}
        </div>

        {/* ── OUT ────────────────────────────────────────────────────────
            One button shares the finished file; the three glyphs beside it go
            somewhere else — the sticker to Instagram's own compositor, the crew
            into the app, the link to the clipboard. */}
        <div style={{
          display: 'flex', gap: 10, alignItems: 'center', flex: 'none',
          padding: '0 20px calc(12px + env(safe-area-inset-bottom))',
        }}>
          <button type="button" onClick={onShare} disabled={!vm.posterDataUrl}
            style={{
              flex: 1, height: 50, borderRadius: 100, border: 0, cursor: 'pointer',
              background: accent, color: T.bg, fontFamily: FONT, fontSize: 15, fontWeight: 700,
              opacity: vm.posterDataUrl ? 1 : 0.5,
            }}>
            {vm.canShare ? 'Teilen' : 'Speichern'}
          </button>
          {SECONDARY.map(({ id, label, Icon }) => (
            <button key={id} type="button" aria-label={label}
              onClick={() => { if (id === 'sticker') onSticker?.(); else if (id === 'crew') onCrew?.(); else onLink?.() }}
              style={{ width: 44, height: 44, flex: 'none', borderRadius: 100, background: T.surface, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
              <Icon size={17} color={T.ink} />
            </button>
          ))}
        </div>

        {/* Images and video through one control — the rider's library already
            answers which kind they picked. */}
        <input
          ref={fileRef} type="file" accept="image/*,video/*" style={HIDDEN_FILE_INPUT}
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''   // picking the SAME file twice must still fire
            if (!f) return
            if (f.type.startsWith('video/')) { onPickVideo?.(f); return }
            onPickPhoto?.(await fileToDownscaledDataUrl(f, 1440).catch(() => null))
          }} />
      </div>
    </div>
  )
}
