import { useMemo } from 'react'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import W3RidesView, { type W3RidesVm, type W3HistoryRow } from './W3RidesView'

/**
 * W3 · 03 RIDES, wired to live data. Route /e/w3-rides.
 *
 * REAL: the month summary (count / total time / total TSS) and the confirmed
 * history list come from `useActivitiesRange` over the current month. Honest
 * "—" for a ride with no training load (e.g. a walk). FIXTURE: the
 * "Unconfirmed" claim rows and every POWER/CYCLE number — this app
 * auto-ingests from Garmin (no confirm step) and the reward economy is the
 * unbuilt `garage-composable-figures` layer.
 */

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export default function W3RidesPage() {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const { data } = useActivitiesRange(monthStart, monthEnd)
  const mon = MONTHS[now.getMonth()]

  const vm = useMemo<W3RidesVm>(() => {
    const acts = (data?.activities ?? []).slice().sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
    const totalTss = acts.reduce((s, a) => s + (a.tss ?? 0), 0)
    const totalSec = acts.reduce((s, a) => s + (a.duration_seconds ?? 0), 0)
    const maxTss = Math.max(1, ...acts.map((a) => a.tss ?? 0))
    const hrs = Math.floor(totalSec / 3600)
    const mins = Math.round((totalSec % 3600) / 60)

    const history: W3HistoryRow[] = acts.slice(0, 12).map((a) => {
      const rested = a.tss == null || a.tss === 0
      // reward is a fixture — a legible function of TSS so the column reads,
      // clearly not a real balance.
      const power = a.tss != null ? Math.round(a.tss * 38) : null
      return {
        day: String(new Date(a.started_at).getDate()).padStart(2, '0'),
        title: a.title ?? 'Ride',
        tss: a.tss != null ? `${Math.round(a.tss)} TSS` : '—',
        power: power != null ? `+${power.toLocaleString('en-US')}` : '—',
        fill: a.tss != null ? Math.min(1, a.tss / maxTss) : 0.05,
        rested,
      }
    })

    return {
      title: 'Your rides,\nthis month',
      subtitle: 'Pulled automatically from Garmin. Your training load, banked as you ride.',
      monthStats: [
        { v: String(acts.length), l: `RIDES · ${mon}` },
        { v: totalSec > 0 ? `${hrs}h ${mins}m` : '—', l: `TIME · ${mon}` },
        { v: totalTss > 0 ? Math.round(totalTss).toLocaleString('en-US') : '—', l: `TSS · ${mon}` },
      ],
      // fixture: the app has no unconfirmed-ride concept (auto-ingest).
      unconfirmed: [],
      historyLabel: `THIS MONTH · ${mon}`,
      history,
    }
  }, [data, mon])

  return <W3RidesView vm={vm} />
}
