import { type CSSProperties } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Download, Camera, Users, Link2, MoreHorizontal, Share2, ImagePlus, X } from 'lucide-react'
import { T, FONT, EASE, HIDDEN_FILE_INPUT } from './w3tokens'
import W3StatusBar from './W3StatusBar'
import W3TopBar from './W3TopBar'
import type { ShareAngle } from './w3share'
import { fileToDownscaledDataUrl } from './w3photo'
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
  posterDataUrl: string | null
  generating: boolean
  angles: ShareAngleChip[]
  activeAngle: ShareAngle
  canShare: boolean
  /** True once the rider has put their own photograph behind the card. */
  hasOwnPhoto: boolean
}
export interface W3ShareActions {
  /** The rider's own photograph, already downscaled to a data URL. Null clears
   *  it and hands the background back to the composed scene. */
  onPickPhoto?: (dataUrl: string | null) => void
  onClose?: () => void
  onDownload?: () => void
  onSelectAngle?: (id: ShareAngle) => void
  onShare?: () => void
  onStory?: () => void
  onCrew?: () => void
  onLink?: () => void
}

const ACTIONS = [
  { id: 'story', label: 'Story', Icon: Camera },
  { id: 'crew', label: 'Crew', Icon: Users },
  { id: 'link', label: 'Link', Icon: Link2 },
  { id: 'more', label: 'Mehr', Icon: MoreHorizontal },
] as const

export default function W3ShareView({ vm, onClose, onDownload, onSelectAngle, onPickPhoto, onShare, onStory, onCrew, onLink }: { vm: W3ShareVm } & W3ShareActions) {
  const reduce = useReducedMotion()
  const iconBtn: CSSProperties = { width: 40, height: 40, borderRadius: 100, background: T.surface, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }

  const onAction = (id: (typeof ACTIONS)[number]['id']) => {
    if (id === 'story') onStory?.()
    else if (id === 'crew') onCrew?.()
    else if (id === 'link') onLink?.()
    else onShare?.()
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
                {vm.hasOwnPhoto ? 'Tippen zum Wechseln' : 'Bleibt auf deinem Gerät'}
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
            <input
              type="file" accept="image/*" style={HIDDEN_FILE_INPUT}
              onChange={async (e) => {
                const f = e.target.files?.[0]
                // Reset first: picking the SAME file twice must still fire.
                e.target.value = ''
                if (!f) return
                // 1440 rather than the studio's 1024 — this one is drawn at
                // 1080 across and then cropped, so it needs the headroom.
                onPickPhoto?.(await fileToDownscaledDataUrl(f, 1440).catch(() => null))
              }} />
          </label>
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
