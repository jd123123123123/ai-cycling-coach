/**
 * Branded full-screen loading state used as the <Suspense> fallback while a
 * lazily-imported route chunk is being fetched. Renders on the app background
 * so opening the app never flashes a blank white screen on slow / mobile
 * connections.
 */
export default function AppSplash() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'var(--color-paper)' }}
    >
      <div className="flex flex-col items-center gap-4">
        <div
          className="w-10 h-10 rounded-full animate-spin"
          style={{
            border: '3px solid var(--color-rule)',
            borderTopColor: 'var(--color-accent)',
          }}
        />
        <p
          className="text-[13px] tracking-wide"
          style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-serif)' }}
        >
          Coach
        </p>
      </div>
    </div>
  )
}
