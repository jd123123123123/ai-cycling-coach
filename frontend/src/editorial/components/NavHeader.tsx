/**
 * Transcribed from pen component `kdOT0` (component/NavHeader), the same
 * instance Session Detail's own Nav frame (`zWpVV`, `J5FV6`) uses (Title
 * override "TODAY" in that instance, "RECOVERY" in the canonical component —
 * this task's own call site supplies "EINHEIT"/"SESSION" via `useCopy`).
 *
 * Tree (`kdOT0`, depth 8): root width 342, justifyContent space-between,
 * alignItems center.
 *   L — gap 10, alignItems center.
 *     Back — Material Symbols Rounded "arrow_back", 22×22, fill $e-ink.
 *     Title — Inter 12/800, letterSpacing 2, fill $e-ink.
 *   Right — Inter 10/800, letterSpacing 1.6, fill $e-lo ("WED 22 JUL").
 *
 * The pen's root has an explicit `width: 342` (390 frame − 24 padding on
 * each side); the real Nav frame (`tT4p8`) supplies that same 24px padding
 * around this component instead, so here it is `width: 100%` — identical
 * rendered width, derived from the parent instead of duplicated as a magic
 * number.
 */
export default function NavHeader({
  title,
  date,
  onBack,
}: {
  title: string
  date: string
  onBack: () => void
}) {
  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          type="button"
          onClick={onBack}
          aria-label="back"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 22,
            height: 22,
            padding: 0,
            border: 'none',
            background: 'transparent',
            color: 'var(--e-ink)',
            cursor: 'pointer',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <span
          style={{
            fontFamily: 'var(--e-body)',
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: 2,
            color: 'var(--e-ink)',
          }}
        >
          {title}
        </span>
      </div>
      <span
        style={{
          fontFamily: 'var(--e-body)',
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 1.6,
          color: 'var(--e-lo)',
        }}
      >
        {date}
      </span>
    </div>
  )
}
