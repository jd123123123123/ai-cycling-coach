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
 *
 * ADDED (Task 9): `kicker`. The Trained flagship's own numbered-section
 * heads ("01 The Session" etc. — bRBYv/fLBkn/Y5DjnE, all `ref: N42va`) are
 * NOT the canonical instance above — every one overrides the Title
 * descendant to Inter 12/800, letterSpacing 1.6, lineHeight 1.2, $e-mid
 * (small caps kicker, not the 19px Sora display heading) and overrides the
 * Chip to a flat #FFFFFF12 (var(--e-hairline), added in this task) with an
 * $e-mid label instead of the accent-tinted default. Confirmed by reading
 * the descendant overrides directly (`Get('bRBYv', {depth:0})`), not by
 * guessing from the rendered dump. The index stays var(--st-active) either
 * way — the override's literal #FF5E00 equals --st-trained exactly, and
 * following the accent variable is what makes every other state's numbered
 * section re-tint correctly too. Every Sub in these three instances is
 * `enabled: false` in the tree, so Trained's call site simply omits `sub`.
 */
export default function SecHead({ index, title, chip, sub, kicker }: {
  index: string
  title: string
  chip?: string
  sub?: string
  kicker?: boolean
}) {
  return (
    <header style={{ display: 'flex', flexDirection: 'column', gap: 9, width: '100%' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%' }}>
        <span
          style={{
            fontFamily: 'var(--e-display)',
            fontSize: 'var(--t-lead)',
            fontWeight: 800,
            letterSpacing: -0.5,
            lineHeight: 1,
            color: 'var(--st-active)',
          }}
        >
          {index}
        </span>
        <h2
          style={kicker ? {
            fontFamily: 'var(--e-body)',
            fontSize: 'var(--t-label)',
            fontWeight: 800,
            letterSpacing: 1.6,
            lineHeight: 1.2,
            color: 'var(--e-mid)',
            margin: 0,
            flex: 1,
          } : {
            fontFamily: 'var(--e-display)',
            fontSize: 'var(--t-lead)',
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
              background: kicker ? 'var(--e-hairline)' : 'var(--st-a12)',
              borderRadius: 'var(--radius-pill)',
              padding: '4px 10px',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--e-body)',
                fontSize: 'var(--t-micro)',
                fontWeight: 800,
                letterSpacing: 1.2,
                color: kicker ? 'var(--e-mid)' : 'var(--st-active)',
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
            fontSize: 'var(--t-body)',
            fontWeight: 500,
            lineHeight: 1.4,
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
