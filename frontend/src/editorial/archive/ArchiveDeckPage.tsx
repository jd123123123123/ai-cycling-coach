import ArchiveDeckView from './ArchiveDeckView'
import { MONTH_FIXTURE } from './archiveFixture'

/**
 * `/e/archive` — the Archive deck.
 *
 * Still on the fixture: the real adapter needs the stream-derived power curve,
 * the PMC series and per-ride GPS, and wiring those before the composition is
 * signed off would mean rebuilding the adapter twice. The view takes its whole
 * model as a prop for exactly that reason.
 */
export default function ArchiveDeckPage() {
  return <ArchiveDeckView model={MONTH_FIXTURE} />
}
