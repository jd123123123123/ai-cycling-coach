import { useState } from 'react'
import ArchiveDeckView from '../archive/ArchiveDeckView'
import { stepMonth } from './monthBuckets'
import { useHistoryModel } from './useHistoryModel'
import '../tokens.css'
import '../archive/archive.css'

/** One centred plate, in the archive's own palette, for the two states that
 *  are not a deck: nothing fetched yet, and nothing to show. */
function Plate({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="archive-root"
      data-testid="history-plate"
      style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12, padding: '0 24px' }}
    >
      <span style={{
        fontFamily: 'var(--ar-sans)', fontSize: 'var(--ar-t-micro)', fontWeight: 700,
        letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ar-quiet)',
      }}>History</span>
      <p style={{ fontFamily: 'var(--ar-serif)', fontSize: 30, lineHeight: 1.14, color: 'var(--ar-ink)', margin: 0 }}>{title}</p>
      <p style={{ fontFamily: 'var(--ar-sans)', fontSize: 'var(--ar-t-body)', lineHeight: 1.45, color: 'var(--ar-quiet)', margin: 0 }}>{body}</p>
    </div>
  )
}

/**
 * `/e/history` — the archive deck, on the rider's own months.
 *
 * This route used to be `TabPlate`, the "not in this system" stub, while the
 * finished six-chapter deck sat at `/e/archive` on a fixture with no link into
 * it from anywhere in the app. Same screen, real data, and now the destination
 * the History tab has always pointed at.
 *
 * The month is component state rather than a URL param because the deck is one
 * continuous reading experience — stepping months is browsing within a screen,
 * not navigating between screens, and pushing history entries for it would put
 * a dozen months in the back button on the way out.
 *
 * `key={active}` on the deck is deliberate: a month change remounts it, which
 * resets the scroll to chapter 00. Keeping the scroll position would leave you
 * on "what it cost" for a month you have not been introduced to.
 */
export default function HistoryPage() {
  const [selected, setSelected] = useState<string | null>(null)
  const { buckets, model, latestKey, isLoading, isError } = useHistoryModel(selected)
  const active = selected ?? latestKey

  if (isLoading) return <Plate title="Reading your months." body="Pulling every ride from the last two years." />
  if (isError) return <Plate title="Your history did not load." body="The ride list could not be fetched. Pull down to try again." />
  if (!model || !active) {
    return <Plate title="No rides on record yet." body="Ride once and this becomes a month you can read." />
  }

  return (
    <ArchiveDeckView
      key={active}
      model={model}
      nav={{
        onStep: (dir) => {
          const next = stepMonth(buckets, active, dir)
          if (next) setSelected(next)
        },
        // Stepping is bounded by months that actually contain rides, so the
        // control can never land on an empty deck.
        canPrev: stepMonth(buckets, active, -1) != null,
        canNext: stepMonth(buckets, active, 1) != null,
      }}
    />
  )
}
