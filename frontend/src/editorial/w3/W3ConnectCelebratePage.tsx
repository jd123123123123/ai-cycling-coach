import { useEffect, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { useGrantOnboarding } from '../../hooks/useWallet'
import W3ConnectCelebrateView, { type W3ConnectVm, type W3CelebrateStat } from './W3ConnectCelebrateView'

/**
 * W3 · Connect celebration, wired to live data. Route /e/w3-connected.
 *
 * After a Garmin/COROS/Wahoo sync, this celebrates the history the rider just
 * shared. Every figure is REAL, computed from the imported activities over a
 * wide window (`useActivitiesRange`). `?source=Garmin` names the provider.
 * Reaching this screen means a device is connected, so it fires the equal
 * 125 RC device grant (idempotent), then chains on to the avatar step.
 */

const fmtInt = (n: number) => Math.round(n).toLocaleString('de-DE')

export default function W3ConnectCelebratePage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const source = params.get('source') || 'Garmin'

  // The device is connected by the time this screen shows — award the one-time
  // device grant once on mount (server enforces once-ever; failures are silent
  // so a reward hiccup never blocks onboarding).
  const grant = useGrantOnboarding()
  const grantedRef = useRef(false)
  useEffect(() => {
    if (grantedRef.current) return
    grantedRef.current = true
    grant.mutate('device')
  }, [grant])

  // Wide window so a multi-year backfill is fully counted.
  const end = new Date()
  const start = new Date(end.getFullYear() - 10, 0, 1)
  const { data } = useActivitiesRange(start, end)

  const vm = useMemo<W3ConnectVm>(() => {
    const acts = data?.activities ?? []
    const rides = acts.length
    const totalSec = acts.reduce((s, a) => s + (a.duration_seconds ?? 0), 0)
    const totalM = acts.reduce((s, a) => s + (a.distance_meters ?? 0), 0)
    const totalElev = acts.reduce((s, a) => s + (a.elevation_gain_m ?? 0), 0)
    const hours = Math.round(totalSec / 3600)
    const km = Math.round(totalM / 1000)

    // date range → "N years / months of riding"
    const dates = acts.map((a) => new Date(a.started_at).getTime()).filter((t) => !isNaN(t))
    const earliest = dates.length ? Math.min(...dates) : Date.now()
    const spanDays = (Date.now() - earliest) / 86_400_000
    const years = spanDays / 365
    const headline = rides === 0
      ? 'Verbunden. Deine Fahrten laufen ein.'
      : years >= 1.5 ? `${Math.round(years)} Jahre Fahrten. Alles drin.`
        : spanDays >= 45 ? `${Math.round(spanDays / 30)} Monate Fahrten. Alles drin.`
          : 'Dein Fahrten-Verlauf. Alles drin.'
    const rangeLabel = dates.length
      ? `Von ${new Date(earliest).toLocaleDateString('de-DE', { month: 'short', year: 'numeric' })} bis heute — nichts fehlt.`
      : 'Dein Coach liest jede Fahrt, sobald sie ankommt.'

    // biggest ride by distance = the standout
    const biggest = acts.reduce<typeof acts[number] | null>((m, a) => ((a.distance_meters ?? 0) > (m?.distance_meters ?? 0) ? a : m), null)
    const standout = biggest && (biggest.distance_meters ?? 0) > 0
      ? {
          title: biggest.title ?? 'Längste Fahrt',
          detail: `${fmtInt((biggest.distance_meters ?? 0) / 1000)} km${biggest.elevation_gain_m ? ` · ${fmtInt(biggest.elevation_gain_m)} m hoch` : ''} · ${new Date(biggest.started_at).toLocaleDateString('de-DE', { month: 'short', year: 'numeric' })}`,
        }
      : null

    // epic comparisons — turn raw data into something that feels earned.
    const earthKm = 40075
    const earthPct = km / earthKm
    const earthLine = earthPct >= 1 ? `${earthPct.toFixed(1)}× um die Erde` : `${Math.round(earthPct * 100)}% um die Erde`
    const everest = 8849
    const everests = Math.floor(totalElev / everest)
    const everestLine = everests >= 1 ? `${fmtInt(everests)}× Everest` : null

    const stats: W3CelebrateStat[] = [
      { icon: 'clock', value: hours > 0 ? `${fmtInt(hours)} h` : '—', label: 'im Sattel' },
      { icon: 'mountain', value: totalElev > 0 ? `${fmtInt(totalElev)} m` : '—', label: 'Höhenmeter' },
      { icon: 'flame', value: rides > 0 ? fmtInt(rides) : '—', label: 'Fahrten' },
    ]

    return {
      source,
      headline,
      sub: rangeLabel,
      ridesCount: rides,
      ridesLabel: 'Fahrten importiert',
      km,
      earthPct,
      earthLine,
      everestLine,
      stats,
      standout,
      ctaLabel: 'Lern deinen Rider kennen',
    }
  }, [data, source])

  return <W3ConnectCelebrateView vm={vm} onContinue={() => navigate('/e/w3-avatar-onboard')} />
}
