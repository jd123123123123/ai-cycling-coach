/**
 * The numbered section header, transcribed from pen component N42va
 * (component/SectionHead) — NOT rYYq3 (component/SecHead V5), which was
 * this file's source in an earlier revision.
 *
 * `rYYq3` was a mistake, corrected after review: its 3-prop shape
 * (index/title/aside) happened to match the brief's sketch, but the real
 * numbered sections on the flagship Today screen use N42va — confirmed by
 * reading `01 Why` (QvlIq) and `02 Absorbing` (JzYYR), both of whose `Head`
 * children are `ref: N42va`. `rYYq3` also fills from the file's generic,
 * non-EDITORIAL-II variables ($accent, $text-primary, $text-tertiary),
 * while N42va fills from the file's own $e-* variables — a second, stronger
 * signal it belongs to this design system and rYYq3 does not. The pen wins
 * over the brief; matching prop shape was not sufficient reason to keep the
 * wrong node.
 *
 * Tree (N42va, depth 4): root vertical, gap 9, width fill_container.
 *   Row — width fill_container, gap 12, alignItems center.
 *     Index — Sora 22/800, letterSpacing -0.5, lineHeight 1, fill $e-acid.
 *     Title — Sora 19/800, letterSpacing -0.5, lineHeight 1, fill $e-ink,
 *       textGrowth fixed-width, width fill_container (grows to fill the row).
 *     Chip — fill #C8FF001F, cornerRadius 999, padding [4, 10].
 *       Label — Inter 10/800, letterSpacing 1.4, fill $e-acid.
 *   Sub — Inter 12/600, lineHeight 1.35, fill $e-lo, textGrowth fixed-width,
 *     width fill_container.
 *
 * $e-acid is the file's own EDITORIAL II accent variable, but it names one
 * fixed hue (rest-day acid green). Per the architecture EditorialRoot
 * already establishes ("one accent per day-state, referenced not
 * branched"), both $e-acid usages here are var(--st-active) instead, so
 * this header re-tints correctly on every Today state, not just Rest.
 * $e-ink and $e-lo are exact, unmodified token matches. The chip's
 * #C8FF001F is the acid hue at the pen's own ~12% alpha — var(--st-a12)
 * carries that alpha while following the same per-state accent swap. The
 * chip's cornerRadius 999 and --radius-pill (100px) both render as a full
 * pill on a chip this size, so --radius-pill is used rather than a second,
 * near-duplicate pill token.
 */
export default function SecHead({ index, title, chip, sub }: {
  index: string
  title: string
  chip?: string
  sub?: string
}) {
  return (
    <header style={{ display: 'flex', flexDirection: 'column', gap: 9, width: '100%' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%' }}>
        <span
          style={{
            fontFamily: 'var(--e-display)',
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: -0.5,
            lineHeight: 1,
            color: 'var(--st-active)',
          }}
        >
          {index}
        </span>
        <h2
          style={{
            fontFamily: 'var(--e-display)',
            fontSize: 19,
            fontWeight: 800,
            letterSpacing: -0.5,
            lineHeight: 1,
            color: 'var(--e-ink)',
            margin: 0,
            flex: 1,
          }}
        >
          {title}
        </h2>
        {chip && (
          <div
            data-sechead-chip=""
            style={{
              background: 'var(--st-a12)',
              borderRadius: 'var(--radius-pill)',
              padding: '4px 10px',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--e-body)',
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: 1.4,
                color: 'var(--st-active)',
              }}
            >
              {chip}
            </span>
          </div>
        )}
      </div>
      {sub && (
        <p
          data-sechead-sub=""
          style={{
            fontFamily: 'var(--e-body)',
            fontSize: 12,
            fontWeight: 600,
            lineHeight: 1.35,
            color: 'var(--e-lo)',
            margin: 0,
            width: '100%',
          }}
        >
          {sub}
        </p>
      )}
    </header>
  )
}
