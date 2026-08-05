/**
 * Train / Recovery / History / Social are not designed in the pen. The TabBar
 * is built 1:1 and complete, but these destinations say so rather than
 * inventing screens the design never specified.
 */
export default function NotInThisSystem({ tab }: { tab: string }) {
  return (
    <div style={{ padding: '120px 24px', textAlign: 'center' }}>
      <div style={{
        fontFamily: 'var(--e-body)', fontSize: 11, letterSpacing: '0.18em',
        color: 'var(--e-lo)', marginBottom: 16,
      }}>
        {tab}
      </div>
      <div style={{
        fontFamily: 'var(--e-display)', fontSize: 20, lineHeight: 1.35,
        color: 'var(--e-mid)',
      }}>
        This tab is not in this design system yet.
      </div>
    </div>
  )
}
