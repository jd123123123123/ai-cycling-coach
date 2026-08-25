import { type CSSProperties } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Download, Camera, Users, Link2, Sticker, Share2, ImagePlus, X } from 'lucide-react'
import { T, FONT, EASE, HIDDEN_FILE_INPUT } from './w3tokens'
import { TNUM } from './w3surfaces'
import type { StoryLayout } from './w3share'
import W3StatusBar from './W3StatusBar'
import W3TopBar from './W3TopBar'
import type { ShareAngle } from './w3share'
import { fileToDownscaledDataUrl } from './w3photo'
import { MAX_VALUES, type ValueId } from './w3shareValues'
import './w3.css'

/**
 * W3 · 18 FAHRT TEILEN — a 1:1 code rebuild of pen `oLeCk` (w3.pen).
 *
 * Pure function of `vm`. The poster is the SAME PNG bitmap that will be shared
 * (rendered by `w3share.renderSharePoster` in the page), so the preview and the
 * shared file are identical. The angle chips ("Was du zeigst") re-render the
 * poster with a different headline (Segment-PR / Beste Fahrt / Beste 20 min).
 * Every action is real: Teilen/Story open the native share sheet, Link copies a
 * caption, Crew opens the crew, the download icon saves the PNG.
 */

export interface ShareAngleChip { id: ShareAngle; label: string; sub: string }
export interface W3ShareVm {
  /** Which of the four story formats is selected. Absent → the full card. */
  format?: StoryLayout
  posterDataUrl: string | null
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
}
export interface W3ShareActions {
  /** The rider's own photograph, already downscaled to a data URL. Null clears
   *  it and hands the background back to the composed scene. */
  onPickPhoto?: (dataUrl: string | null) => void
  /** The rider rebuilt their card. Between MIN_BLOCKS and MAX_BLOCKS. */
  onPickValues?: (ids: ValueId[]) => void
  onPickAccent?: (hex: string) => void
  /** The rider chose a clip. The overlay is burned into it frame by frame. */
  onPickVideo?: (file: File) => void
  /** Which of the four story formats leaves the app. See `StoryLayout`. */
  onPickFormat?: (id: StoryLayout) => void
  onClose?: () => void
  onDownload?: () => void
  onSelectAngle?: (id: ShareAngle) => void
  onShare?: () => void
  onStory?: () => void
  /** Save the overlay alone, transparent, to place by hand in Instagram. */
  onSticker?: () => void
  onCrew?: () => void
  onLink?: () => void
}

const ACTIONS = [
  { id: 'story', label: 'Story', Icon: Camera },
  // The sticker route: the overlay alone, on transparency, for a rider who
  // wants to place it themselves in Instagram rather than accept ours.
  { id: 'sticker', label: 'Sticker', Icon: Sticker },
  { id: 'crew', label: 'Crew', Icon: Users },
  { id: 'link', label: 'Link', Icon: Link2 },
] as const

/** The four, in the order they give things up. See `StoryLayout` for why there
 *  are exactly four and not five. */
/** The accent palette. Five, all tokens — the app's own colours, never a wheel.
 *  A sixth would be a preference; five is a decision. */
const ACCENTS: { name: string; value: string }[] = [
  { name: 'Acid', value: T.acid },
  { name: 'Abend', value: T.evening },
  { name: 'Kühl', value: T.cool },
  { name: 'Warn', value: T.warn },
  { name: 'Weiß', value: T.ink },
]

const STORY_FORMATS: { id: StoryLayout; name: string; drops: string }[] = [
  { id: 'full', name: 'Karte', drops: 'Satz + Zahlen' },
  { id: 'silent', name: 'Ohne Worte', drops: 'Nur Zahlen' },
  { id: 'trace', name: 'Spur', drops: 'Foto + Strecke' },
  { id: 'headline', name: 'Schlagzeile', drops: 'Titel + Laufband' },
  { id: 'viewfinder', name: 'Sucher', drops: 'Telemetrie' },
  { id: 'effort', name: 'Effort', drops: 'Satz oben' },
]

export default function W3ShareView({ vm, onClose, onDownload, onSelectAngle, onPickPhoto, onPickValues, onPickAccent, onPickVideo, onPickFormat, onShare, onStory, onSticker, onCrew, onLink }: { vm: W3ShareVm } & W3ShareActions) {
  const reduce = useReducedMotion()
  const iconBtn: CSSProperties = { width: 40, height: 40, borderRadius: 100, background: T.surface, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }

  const onAction = (id: (typeof ACTIONS)[number]['id']) => {
    if (id === 'story') onStory?.()
    else if (id === 'sticker') onSticker?.()
    else if (id === 'crew') onCrew?.()
    else onLink?.()
  }

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <W3StatusBar />

        {/* Nav */}
        <W3TopBar title="Fahrt teilen" onBack={onClose}
          extra={<button onClick={onDownload} aria-label="Bild speichern" style={iconBtn}><Download size={17} color={T.ink} /></button>} />

        {/* Poster preview (the exact bitmap that gets shared) */}
        <div style={{ padding: '10px 20px 4px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: 360, aspectRatio: '1080 / 1720', borderRadius: 26, overflow: 'hidden', background: T.surface, border: `1px solid ${T.stroke}`, position: 'relative' }}>
            {vm.posterDataUrl
              ? <motion.img key={vm.activeAngle} src={vm.posterDataUrl} alt="Teilbares Bild deiner Fahrt"
                  initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35, ease: EASE }}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              : <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.quiet }}>Bild wird erstellt…</span>
                </div>}
            {vm.generating && vm.posterDataUrl && (
              <div style={{ position: 'absolute', top: 12, right: 12, padding: '5px 11px', borderRadius: 100, background: '#000000A0' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: T.acid }}>rendert…</span>
              </div>
            )}
          </div>
        </div>

        {/* ── WIE DU ES ZEIGST ────────────────────────────────────────────
            The format is the design decision, not a setting. Strava posts one
            layout for every ride — a photo with four numbers over it, the same
            for a commute and for an alpine day — and the reason it can never
            offer this row is that each of these four is defined by what it
            REFUSES to print. A rider posting a mountain does not want four
            numbers across it; a rider posting a personal best does not want a
            landscape behind it. ── */}
        <div style={{ padding: '18px 20px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>WIE DU ES ZEIGST</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {STORY_FORMATS.map((f) => {
              const on = f.id === (vm.format ?? 'full')
              return (
                <button key={f.id} type="button" onClick={() => onPickFormat?.(f.id)}
                  style={{
                    flex: 1, minWidth: 0, padding: '11px 8px 10px', borderRadius: 14,
                    border: `1px solid ${on ? T.acid : 'transparent'}`,
                    background: on ? T.acidDim : T.surface, cursor: 'pointer',
                    fontFamily: FONT, display: 'flex', flexDirection: 'column', gap: 3,
                  }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3, color: on ? T.acid : T.ink }}>{f.name}</span>
                  <span style={{ fontSize: 8.5, fontWeight: 600, lineHeight: 1.25, color: T.quiet }}>{f.drops}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Was du zeigst — angle chips */}
        <div style={{ padding: '18px 20px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>WAS DU ZEIGST</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {vm.angles.map((a) => {
              const on = a.id === vm.activeAngle
              return (
                <button key={a.id} onClick={() => onSelectAngle?.(a.id)}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: '12px 12px', borderRadius: 16, background: on ? T.acidDim : T.surface, border: on ? `1px solid ${T.acid}` : `1px solid ${T.stroke}`, cursor: 'pointer', fontFamily: FONT, textAlign: 'left' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: on ? T.acid : T.ink }}>{a.label}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: T.quiet }}>{a.sub}</span>
                </button>
              )
            })}
          </div>

          {/* ── THE RIDER'S OWN PHOTOGRAPH ────────────────────────────────
              A composed scene is a picture of where the app thinks they were;
              a photo from their pocket is a picture of where they WERE. It
              never leaves the device — the poster is rendered locally in a
              canvas, so the only copy that goes anywhere is the one the rider
              hands to the share sheet themselves. ── */}
          <label style={{
            display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px',
            borderRadius: 16, cursor: 'pointer', fontFamily: FONT,
            background: vm.hasOwnPhoto ? T.acidDim : T.surface,
            border: `1px ${vm.hasOwnPhoto ? 'solid' : 'dashed'} ${vm.hasOwnPhoto ? T.acid : T.stroke}`,
          }}>
            <span style={{
              width: 34, height: 34, flex: 'none', borderRadius: 11,
              background: vm.hasOwnPhoto ? 'transparent' : T.surface2,
              display: 'grid', placeItems: 'center',
            }}>
              <ImagePlus size={17} color={vm.hasOwnPhoto ? T.acid : T.mid} />
            </span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: vm.hasOwnPhoto ? T.acid : T.ink }}>
                {vm.hasOwnPhoto ? 'Dein Foto ist drauf' : 'Eigenes Foto nehmen'}
              </span>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet }}>
                {vm.videoNote ?? (vm.hasOwnPhoto ? 'Tippen zum Wechseln' : 'Bild oder Video · bleibt auf deinem Gerät')}
              </span>
            </span>
            {vm.hasOwnPhoto && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPickPhoto?.(null) }}
                aria-label="Eigenes Foto entfernen"
                style={{
                  width: 28, height: 28, flex: 'none', borderRadius: 100, border: 0,
                  background: T.surface2, display: 'grid', placeItems: 'center', cursor: 'pointer',
                }}>
                <X size={13} color={T.mid} />
              </button>
            )}
            {/* IMAGES AND VIDEO, through one control. A story is as often a
                clip as a photograph, and asking the rider which KIND of file
                they are about to pick is a question their photo library already
                answers. The page decides what to do with it. */}
            <input
              type="file" accept="image/*,video/*" style={HIDDEN_FILE_INPUT}
              onChange={async (e) => {
                const f = e.target.files?.[0]
                // Reset first: picking the SAME file twice must still fire.
                e.target.value = ''
                if (!f) return
                if (f.type.startsWith('video/')) { onPickVideo?.(f); return }
                // 1440 rather than the studio's 1024 — this one is drawn at
                // 1080 across and then cropped, so it needs the headroom.
                onPickPhoto?.(await fileToDownscaledDataUrl(f, 1440).catch(() => null))
              }} />
          </label>
        </div>

        {/* ── AKZENT ───────────────────────────────────────────────────
            One colour, and it moves everything the card is loud with at once —
            the emphasised words, the unit, the strip, the ticker band, the
            viewfinder brackets, the route line. A rider picks a colour, not
            six, which is the difference between a control and a settings page.
            Tokens only: this is the app's palette, not a colour wheel. ── */}
        <div style={{ padding: '18px 20px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>AKZENT</span>
          <div style={{ display: 'flex', gap: 10 }}>
            {ACCENTS.map((a) => {
              const on = (vm.accent ?? T.acid) === a.value
              return (
                <button key={a.name} type="button" onClick={() => onPickAccent?.(a.value)}
                  aria-label={a.name}
                  style={{
                    width: 44, height: 44, borderRadius: 100, cursor: 'pointer',
                    background: a.value, border: on ? `3px solid ${T.ink}` : `1px solid ${T.stroke}`,
                    boxShadow: on ? `0 0 0 2px ${T.bg}` : 'none',
                  }} />
              )
            })}
          </div>
        </div>

        {/* ── WERTE ────────────────────────────────────────────────────
            Which measurements fill the template's slots. This asked which
            BLOCKS to draw before — a chart, a zone bar, a trace — because the
            old poster composed itself out of them. The pen's templates have
            fixed compositions, so the only question left is the easy one: a
            rider knows they want their climbing on there; nobody knows whether
            they want a "zone block". Tap to add, tap to remove, up to three. ── */}
        <div style={{ padding: '18px 20px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>WERTE</span>
            <span style={{ fontSize: 9.5, fontWeight: 700, color: T.mid, ...TNUM }}>
              {(vm.values ?? []).length} VON {MAX_VALUES}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(vm.availableValues ?? []).map((v) => {
              const at = (vm.values ?? []).indexOf(v.id)
              const on = at >= 0
              const full = !on && (vm.values ?? []).length >= MAX_VALUES
              return (
                <button key={v.id} type="button" disabled={full}
                  onClick={() => onPickValues?.(
                    on ? (vm.values ?? []).filter((x) => x !== v.id)
                       : [...(vm.values ?? []), v.id],
                  )}
                  style={{
                    padding: '10px 14px', borderRadius: 100, cursor: full ? 'default' : 'pointer',
                    border: `1px solid ${on ? T.acid : 'transparent'}`,
                    background: on ? T.acidDim : T.surface,
                    opacity: full ? 0.4 : 1, fontFamily: FONT,
                    display: 'flex', alignItems: 'center', gap: 7,
                  }}>
                  {on && (
                    <span style={{
                      width: 17, height: 17, borderRadius: 100, background: T.acid,
                      display: 'grid', placeItems: 'center',
                      fontSize: 9.5, fontWeight: 800, color: T.heroInk, ...TNUM,
                    }}>{at + 1}</span>
                  )}
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: on ? T.acid : T.ink }}>{v.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: T.quiet, ...TNUM }}>{v.value}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Action row */}
        <div style={{ padding: '22px 20px 0', display: 'flex', justifyContent: 'space-between' }}>
          {ACTIONS.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => onAction(id)}
              style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', background: 'transparent', border: 0, cursor: 'pointer', fontFamily: FONT }}>
              <div style={{ width: 58, height: 58, borderRadius: 100, background: T.surface, display: 'grid', placeItems: 'center' }}><Icon size={22} color={T.ink} /></div>
              <span style={{ fontSize: 11, fontWeight: 600, color: T.mid }}>{label}</span>
            </button>
          ))}
        </div>

        {/* Primary share CTA */}
        <div style={{ padding: '24px 20px calc(28px + env(safe-area-inset-bottom))', marginTop: 'auto' }}>
          <button onClick={onShare} disabled={!vm.posterDataUrl}
            style={{ width: '100%', height: 58, borderRadius: 100, background: T.evening, display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', border: 0, cursor: vm.posterDataUrl ? 'pointer' : 'default', fontFamily: FONT, opacity: vm.posterDataUrl ? 1 : 0.6 }}>
            <Share2 size={19} color={T.ink} />
            <span style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>{vm.canShare ? 'Teilen' : 'Bild speichern & teilen'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
