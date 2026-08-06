import type { CSSProperties } from 'react'

/** WCAG's own touch-target minimum, in CSS px. */
export const TOUCH_TARGET_MIN = 44

/**
 * "Hit targets, not hairlines": an invisible overlay centred on a visual
 * mark that may itself be much thinner than a comfortable touch target — a
 * 12px-tall zone-time segment, a 3px range marker, a narrow interval-block
 * bar — WITHOUT widening the visual mark itself, which would break the
 * pen's own duration/value-proportional geometry (`Bars`' column widths are
 * literally the session's own block minutes).
 *
 * Apply to a `position: absolute` sibling/child of a `position: relative`
 * parent sized to the visual mark; it participates in no layout of its own
 * and carries no visible fill, only the pointer handlers. `max(100%, 44px)`
 * means it only ever GROWS the hit area, never shrinks it below the mark's
 * own footprint on a mark that's already comfortably large (LiveRing,
 * RouteOptions' cards) — those simply don't need this helper at all.
 */
export function touchTargetOverlayStyle(): CSSProperties {
  return {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: `max(100%, ${TOUCH_TARGET_MIN}px)`,
    height: `max(100%, ${TOUCH_TARGET_MIN}px)`,
  }
}

/**
 * The same overlay, but grows ONLY height, never width — for a mark that is
 * one of several HORIZONTAL siblings sized by a real, potentially uneven
 * proportion (a zone's own time-in-zone, `ZoneRows`' flex-grow segments).
 * Growing width there is what a live-browser check at `/e/today` found
 * actually breaks: an absolutely-positioned overlay doesn't respect its
 * flex sibling's own box, so a mark whose PROPORTION is small (a zone with
 * little real time in it) grows an overlay wide enough to invade its
 * neighbour — and DOM order makes the LATER sibling win that overlap,
 * silently misreading a tap meant for one zone as a tap on the next one.
 * Height has no such neighbour to invade (nothing else occupies that same
 * horizontal band), so it's always safe to grow.
 */
export function touchTargetOverlayStyleVertical(): CSSProperties {
  return {
    position: 'absolute',
    top: '50%',
    left: 0,
    transform: 'translateY(-50%)',
    width: '100%',
    height: `max(100%, ${TOUCH_TARGET_MIN}px)`,
  }
}
