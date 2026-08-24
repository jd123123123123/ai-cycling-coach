/**
 * RIDR — the app's mark.
 *
 * An R whose leg rides away instead of ending straight: one unbroken band,
 * carrying the name rather than a symmetry, and deliberately without a
 * counter-hole so it survives being drawn at 27 px on a tab bar.
 *
 * Exported from the design file (`ridr/Mark`) as GEOMETRY rather than as a
 * picture, so it stays crisp at every size, costs no request, and takes its
 * colour from wherever it is placed — a lime mark on the near-black room and a
 * near-black mark on a lime tile are the same path, not two assets that can
 * drift apart. The one raster copy, `public/ridr/mark.svg`, exists for the
 * places a file is required (favicon, share cards, composited art).
 *
 * The stroke width is the design file's own 13.2 at a 200 unit box; scaling is
 * the viewBox's job, so it is never restated in pixels here.
 */
export default function RidrMark({ size = 28, color = 'currentColor' }: {
  size?: number
  color?: string
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden focusable="false">
      <path
        d="M54 176v-136h50a36 36 0 0 1 0 72h-50m46 0c32 16 38 40 72 28"
        fill="none" stroke={color} strokeWidth={13.2}
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** The brand lime, from the design file's own `g-lime`. Not the app's `#BFFF3C`
 *  acid: that token is the interface's accent and this one is the logo's. */
export const RIDR_LIME = '#C6F53C'
