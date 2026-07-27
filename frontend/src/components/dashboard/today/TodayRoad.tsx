/**
 * TodayRoad — the Today tab's landscape layer.
 *
 * One fullscreen WebGL canvas (the shader draws sky + terrain in a single
 * pass) plus pointer scrubbing. Physiology lives in utils/roadProfile.ts; the
 * landscape choice lives in utils/roadMode.ts. This component owns pixels and
 * gestures only.
 *
 * Degradation: no WebGL → a static SVG elevation profile that still shows the
 * terrain and the CP waterline, and is still scrubbable. The information
 * survives; only the atmosphere is lost.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ShaderCanvas, { packRoadTexture } from '../../wrapped/ShaderCanvas'
import type { RoadProfile } from '../../../utils/roadProfile'
import { roadModeIndex, type RoadMode } from '../../../utils/roadMode'

export interface TodayRoadProps {
  profile: RoadProfile
  mode: RoadMode
  auraColor: string
  onTravel?: (t: number) => void
}

/** Whether a WebGL context can be created at all. */
// eslint-disable-next-line react-refresh/only-export-components
export function supportsWebGL(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!c.getContext('webgl')
  } catch {
    return false
  }
}

/** Terrain outline as an SVG path, CP at mid-height (the fallback renderer). */
// eslint-disable-next-line react-refresh/only-export-components
export function roadSvgPath(profile: RoadProfile, w: number, h: number): string {
  const n = profile.samples.length
  if (n === 0) return ''
  const peak = Math.max(...profile.samples.map((s) => s.watts), 1)
  const ref = profile.cp ?? peak
  const span = Math.max(1, n - 1)
  // Round to 1dp but drop a trailing ".0" (Number() strips it) so the first
  // point renders as "M0," rather than "M0.0,".
  const fmt = (v: number) => Number(v.toFixed(1))
  return profile.samples
    .map((s, i) => {
      const x = (i / span) * w
      const rel = Math.min(s.watts / ref, 2) / 2 // 0.5 == the waterline
      const y = h - rel * h
      return `${i === 0 ? 'M' : 'L'}${fmt(x)},${fmt(y)}`
    })
    .join(' ')
}

/**
 * Compact structural signature of the packed terrain: one `zone.blockIndex`
 * token per RUN of samples that share both values, so a plan edit that
 * reclassifies a block's zone or splits/reorders blocks changes the string
 * even when it doesn't change the sample count, the total duration, CP, or
 * the deepest W′ point. Cheap — one pass over at most MAX_SAMPLES samples,
 * no hashing.
 */
function terrainSignature(profile: RoadProfile): string {
  let sig = ''
  let prevZone = -1
  let prevBlock = -1
  for (const s of profile.samples) {
    if (s.zone !== prevZone || s.blockIndex !== prevBlock) {
      sig += `${s.zone}.${s.blockIndex}|`
      prevZone = s.zone
      prevBlock = s.blockIndex
    }
  }
  return sig
}

/**
 * The React `key` ShaderCanvas must be remounted under whenever the profile's
 * CONTENT changes, not just its sample count.
 *
 * ShaderCanvas's own data-texture re-upload guard keys on texture WIDTH only
 * (see the CONTRACT comment there): two different profiles that resample to
 * the same width — e.g. both hit MAX_SAMPLES, or an edited plan keeps the
 * same total duration/CP/minWbal but reclassifies a block's zone or
 * reorders blocks — would silently keep rendering the previous profile's
 * texture on the GPU. `totalDurationS` + `cp` + `minWbal` catch most content
 * changes cheaply; `terrainSignature` additionally catches changes to the
 * zone (G channel, terrain tint) and blockIndex (A channel, scrub→block
 * mapping) that packRoadTexture packs but the other four fields can miss.
 * Exported so the "changes when content changes at constant sample count"
 * property is directly testable without rendering GL.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function roadRemountKey(profile: RoadProfile, textureWidth: number): string {
  return `road-${textureWidth}-${profile.totalDurationS}-${profile.cp ?? 'x'}-${profile.minWbal ?? 'x'}-${terrainSignature(profile)}`
}

const BOX = { width: '100%', height: '100%' } as const

export default function TodayRoad({ profile, mode, auraColor, onTravel }: TodayRoadProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)
  // Coalesces multiple pointermove events that land in the same animation
  // frame into a single published value; read only inside the rAF callback
  // below (never during render), so it never triggers the react-hooks/refs
  // "no ref reads during render" rule.
  const pendingTravelRef = useRef(0)
  const [travel, setTravel] = useState(0)
  const gl = useMemo(() => supportsWebGL(), [])
  const texture = useMemo(() => packRoadTexture(profile), [profile])

  const hasRoad = mode !== 'bare' && profile.samples.length > 0
  // The waterline is meaningful only when CP is genuinely known.
  const waterline = profile.cp != null && (mode === 'prescribed' || mode === 'ridden')

  // Scrub position is coalesced through rAF to at most one React render per
  // animation frame during an active drag (never one render per pointermove
  // event), and that render is what actually reaches the GPU: it produces a
  // new `uniforms` object, ShaderCanvas re-renders with it and reassigns its
  // own `uniformsRef.current` (see ShaderCanvas.tsx), and its already-running
  // render loop picks up the new u_travel on the very next frame.
  const publish = useCallback(() => {
    rafRef.current = 0
    setTravel(pendingTravelRef.current)
    onTravel?.(pendingTravelRef.current)
  }, [onTravel])

  const onPointer = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const host = hostRef.current
    if (!host || !hasRoad) return
    const rect = host.getBoundingClientRect()
    if (rect.width <= 0) return
    pendingTravelRef.current = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    if (!rafRef.current) rafRef.current = requestAnimationFrame(publish)
  }, [hasRoad, publish])

  // Capture the pointer on down so a fast drag that leaves the div bounds
  // keeps delivering pointermove (clamped at 0/1 by onPointer above) instead
  // of the scrub going stale. Guarded — not every test/DOM environment
  // implements the Pointer Capture API.
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    onPointer(e)
  }, [onPointer])

  const releaseCapture = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }, [])

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  const uniforms = useMemo(() => ({
    u_aura: auraColor,
    u_bg: '#0A0C0F',
    u_travel: travel,
    u_mode: roadModeIndex(mode),
    u_hasRoad: hasRoad ? 1 : 0,
    u_waterline: waterline ? 1 : 0,
  }), [auraColor, mode, hasRoad, waterline, travel])

  const roadKey = useMemo(() => roadRemountKey(profile, texture.width), [profile, texture.width])

  return (
    <div
      ref={hostRef}
      onPointerDown={onPointerDown}
      onPointerMove={(e) => { if (e.buttons > 0) onPointer(e) }}
      onPointerUp={releaseCapture}
      onPointerCancel={releaseCapture}
      style={{ position: 'absolute', inset: 0, touchAction: 'pan-y' }}
    >
      {gl ? (
        // Remount on a profile CONTENT change so the data texture is
        // re-uploaded; travel changes do NOT change roadKey, so scrubbing
        // never remounts (and never re-initializes) the WebGL canvas.
        <ShaderCanvas
          key={roadKey}
          variant="road"
          uniforms={uniforms}
          texture={texture}
          style={BOX}
        />
      ) : (
        <svg
          data-testid="road-svg-fallback"
          aria-hidden="true"
          viewBox="0 0 390 200"
          preserveAspectRatio="none"
          style={{ ...BOX, display: 'block', background: '#0A0C0F' }}
        >
          {waterline && (
            <line x1="0" y1="100" x2="390" y2="100" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1" />
          )}
          {hasRoad && (
            <path d={`${roadSvgPath(profile, 390, 200)} L390,200 L0,200 Z`} fill={auraColor} fillOpacity="0.30" />
          )}
          {hasRoad && (
            <path d={roadSvgPath(profile, 390, 200)} fill="none" stroke={auraColor} strokeWidth="1.5" />
          )}
        </svg>
      )}
    </div>
  )
}
