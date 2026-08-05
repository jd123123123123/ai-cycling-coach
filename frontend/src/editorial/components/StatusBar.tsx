import { BatteryFull, SignalHigh, Wifi } from 'lucide-react'

/**
 * The device status bar, transcribed from pen component vrvl9
 * (component/StatusBar): 390x62, padding [0, 32] (vertical, horizontal),
 * space-between, center-aligned. Time is 16px/600 Inter. The icon cluster
 * is gap 7, icons 18x18 (signal, wifi) / 22x22 (battery).
 *
 * The pen fills this frame with $bg (#0A0C0F), a color with no exact match
 * among the EDITORIAL II tokens (closest is --e-bg #08090C, but it is not
 * equal). Every real usage sits directly on the page ground painted by
 * EditorialRoot, so this is left transparent rather than inlining an
 * approximated hex — it inherits var(--e-ground) from the ancestor.
 *
 * $text-primary (#FFFFFF) is an exact match for --e-ink.
 */
export default function StatusBar({ time }: { time: string }) {
  return (
    <div
      style={{
        height: 62,
        padding: '0 32px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--e-body)',
          fontSize: 16,
          fontWeight: 600,
          color: 'var(--e-ink)',
        }}
      >
        {time}
      </span>
      <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
        <SignalHigh size={18} color="var(--e-ink)" aria-hidden="true" />
        <Wifi size={18} color="var(--e-ink)" aria-hidden="true" />
        <BatteryFull size={22} color="var(--e-ink)" aria-hidden="true" />
      </div>
    </div>
  )
}
