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
import { useCallback, useEffect, useMemo, useRef } from 'react'
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

const BOX = { width: '100%', height: '100%' } as const

export default function TodayRoad({ profile, mode, auraColor, onTravel }: TodayRoadProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const travelRef = useRef(0)
  const rafRef = useRef(0)
  const gl = useMemo(() => supportsWebGL(), [])
  const texture = useMemo(() => packRoadTexture(profile), [profile])

  const hasRoad = mode !== 'bare' && profile.samples.length > 0
  // The waterline is meaningful only when CP is genuinely known.
  const waterline = profile.cp != null && (mode === 'prescribed' || mode === 'ridden')

  // Scrub position is a ref + one rAF-coalesced callback per frame, so a
  // pointer drag never causes a React render per pointermove event.
  const publish = useCallback(() => {
    rafRef.current = 0
    onTravel?.(travelRef.current)
  }, [onTravel])

  const onPointer = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const host = hostRef.current
    if (!host || !hasRoad) return
    const rect = host.getBoundingClientRect()
    if (rect.width <= 0) return
    travelRef.current = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    host.style.setProperty('--road-travel', String(travelRef.current))
    if (!rafRef.current) rafRef.current = requestAnimationFrame(publish)
  }, [hasRoad, publish])

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  // NOTE: u_travel intentionally reads travelRef.current — the shader's rider
  // marker follows the scrub on the next uniform refresh only; the
  // authoritative, immediate feedback is the DOM readout built in Task 7.
  // Reading a ref during render is normally unsafe (the eslint react-hooks
  // "refs" rule flags it), but is safe here: travelRef is never used to
  // derive rendered JSX or drive reconciliation, only to seed a value that
  // ShaderCanvas re-reads imperatively every animation frame via its own
  // ref, so a stale read here cannot desync React's output from the DOM.
  const uniforms = useMemo(() => ({
    u_aura: auraColor,
    u_bg: '#0A0C0F',
    // eslint-disable-next-line react-hooks/refs
    u_travel: travelRef.current,
    u_mode: roadModeIndex(mode),
    u_hasRoad: hasRoad ? 1 : 0,
    u_waterline: waterline ? 1 : 0,
  }), [auraColor, mode, hasRoad, waterline])

  // The data-texture re-upload guard inside ShaderCanvas keys on texture
  // WIDTH only (see the CONTRACT comment there): a new profile that
  // resamples to the same sample COUNT (e.g. both hit MAX_SAMPLES) would
  // silently keep rendering the old terrain. Force a remount whenever the
  // profile's CONTENT changes, not just its width, by folding in a few
  // cheap characteristic values instead of hashing the whole sample array.
  const roadKey = `road-${texture.width}-${profile.totalDurationS}-${profile.cp ?? 'x'}-${profile.minWbal ?? 'x'}`

  return (
    <div
      ref={hostRef}
      onPointerDown={onPointer}
      onPointerMove={(e) => { if (e.buttons > 0) onPointer(e) }}
      style={{ position: 'absolute', inset: 0, touchAction: 'pan-y' }}
    >
      {gl ? (
        // Remount on a profile change so the data texture is re-uploaded.
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
