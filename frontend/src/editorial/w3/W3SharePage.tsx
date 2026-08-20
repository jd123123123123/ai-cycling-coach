import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useRaceDebrief } from '../../hooks/useRaceDebrief'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { useGarage, useRideScene } from '../../hooks/useGarage'
import {
  renderSharePoster, sharePoster, downloadPoster, canShareImage,
  type ShareAngle, type PosterData,
} from './w3share'
import W3ShareView, { type W3ShareVm, type ShareAngleChip } from './W3ShareView'

/**
 * W3 · FAHRT TEILEN, wired to real data. Routes /e/w3-share and /e/w3-share/:id.
 *
 * REAL: the ride's stats + power PRs from `useRaceDebrief`
 * (`/analytics/activity-debrief/:id`); the GPX track (`route_polyline`) and the
 * ride's name/date from the activities list; the rider avatar/handle from
 * `useAuth`; the ride's composed hero and the rider's own bike render. The
 * poster is drawn once by
 * `renderSharePoster` and that exact PNG is what the OS share sheet posts to
 * Instagram / LinkedIn / WhatsApp. Celebratory comparatives (the "seit April"
 * pill sublines) are framing, not backed by an endpoint — marked below.
 */

const de = (n: number, d = 0) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })
const hms = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`
const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' })
}

export default function W3SharePage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const from = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 90); return d }, [])
  const { data: acts } = useActivitiesRange(from, new Date())

  // Which ride: the :id, else the most recent cycling ride with a GPS track.
  const activity = useMemo(() => {
    const list = (acts?.activities ?? []).filter((a) => a.sport === 'cycling')
    if (id) return list.find((a) => a.id === Number(id)) ?? null
    return list.find((a) => a.route_polyline && a.route_polyline.length > 1) ?? list[0] ?? null
  }, [acts, id])

  const { data: debrief } = useRaceDebrief(activity?.id)
  // The composed hero for this ride, and the rider's own garage bike behind it.
  // Both are cheap cached reads and neither ever generates.
  const { data: scene } = useRideScene(activity?.id)
  const { data: garage } = useGarage()

  const [angle, setAngle] = useState<ShareAngle>('fahrt')
  const [posterDataUrl, setPosterDataUrl] = useState<string | null>(null)
  const [posterBlob, setPosterBlob] = useState<Blob | null>(null)
  const [generating, setGenerating] = useState(false)

  const shareable = canShareImage()

  // ── build the poster payload for the current angle from REAL ride data ──
  const poster: PosterData | null = useMemo(() => {
    if (!activity && !debrief) return null
    const h = debrief?.header ?? null
    const distKm = h?.distance_km ?? (activity?.distance_meters != null ? activity.distance_meters / 1000 : null)
    const hm = h?.elevation_m ?? activity?.elevation_gain_m ?? null
    const durS = h?.moving_time_s ?? activity?.duration_seconds ?? null
    const np = h?.np_watts ?? activity?.normalized_power ?? null
    const ftp = debrief?.wko?.mftp_watts ?? null
    const speed = distKm != null && durS ? (distKm / (durS / 3600)) : null
    const iff = np != null && ftp ? np / ftp : null
    const efforts = debrief?.efforts ?? []
    const prs = efforts.filter((e) => e.is_pr)
    const bestPR = prs.reduce<typeof efforts[number] | null>((m, e) => ((e.pct_of_best ?? 0) > (m?.pct_of_best ?? 0) ? e : m), null)
      ?? efforts.reduce<typeof efforts[number] | null>((m, e) => ((e.ride_watts ?? 0) > (m?.ride_watts ?? 0) ? e : m), null)
    const prDur = bestPR ? (bestPR.duration_s < 60 ? `${bestPR.duration_s} SEK` : `${Math.round(bestPR.duration_s / 60)} MIN`) : null

    const rideName = activity?.title || 'Meine Fahrt'
    const dateStr = fmtDate(activity?.started_at)
    const handle = user?.display_name ? `@${user.display_name}` : (user?.email ? `@${user.email.split('@')[0]}` : '@rider')
    const avatarInitial = (user?.display_name || user?.email || '?').charAt(0).toUpperCase()

    const statKm: [string, string] = [distKm != null ? String(Math.round(distKm)) : '—', 'KM']
    const statHm: [string, string] = [hm != null ? de(Math.round(hm)) : '—', 'HÖHENMETER']
    const statDur: [string, string] = [durS != null ? hms(durS) : '—', 'STUNDEN']
    const statSpeed: [string, string] = [speed != null ? `${de(speed, 1)}` : '—', 'KM/H Ø']
    const statNP: [string, string] = [np != null ? String(Math.round(np)) : '—', 'NORMALISIERT']
    const statIF: [string, string] = [iff != null ? de(iff, 2) : '—', 'INTENSITÄT']

    const s = (t: [string, string]) => ({ v: t[0], l: t[1] })
    const prCount = prs.length

    let data: Omit<PosterData, 'angle' | 'polyline' | 'bikeSrc' | 'avatarUrl' | 'avatarInitial' | 'handle' | 'club' | 'footer'>
    if (angle === 'fahrt') {
      data = {
        kicker: `GANZE FAHRT · ${rideName.toUpperCase()}`,
        bigValue: distKm != null ? String(Math.round(distKm)) : '—',
        bigUnit: 'km',
        delta: null,
        sentence: distKm != null ? `${de(Math.round(distKm))} Kilometer, ${hm != null ? `${de(Math.round(hm))} Höhenmeter` : 'ein solider Block'} — sauber durchgezogen.` : 'Fahrt geteilt.',
        pills: [
          { text: prCount > 0 ? `${prCount} Bestzeiten` : 'Solide Fahrt', sub: prCount > 0 ? 'an Segmenten' : 'im Kasten', tone: 'acid' },
          { text: 'Ausdauer', sub: 'lange im Sattel', tone: 'violet' }, // sub: framing
        ],
        stats: [s(statHm), s(statDur), s(statSpeed)],
      }
    } else if (angle === 'leistung') {
      data = {
        kicker: 'LEISTUNG · NORMALIZED POWER',
        bigValue: np != null ? String(Math.round(np)) : '—',
        bigUnit: 'Watt',
        delta: null,
        sentence: np != null ? `${Math.round(np)} Watt normalisiert über ${durS != null ? hms(durS) : 'die Fahrt'} — richtig gedrückt.` : 'Leistung geteilt.',
        pills: [
          { text: ftp != null ? `${Math.round(ftp)} W FTP` : 'Solide Power', sub: 'aktuelle Schwelle', tone: 'acid' },
          { text: iff != null ? `IF ${de(iff, 2)}` : 'Intensität', sub: 'Belastungsgrad', tone: 'violet' },
        ],
        stats: [s(statNP), s(statIF), s(statDur)],
      }
    } else {
      // rekord — the ride's standout power PR effort (real)
      data = {
        kicker: bestPR ? `BESTLEISTUNG · ${prDur}` : 'HIGHLIGHT DER FAHRT',
        bigValue: bestPR?.ride_watts != null ? String(bestPR.ride_watts) : (np != null ? String(Math.round(np)) : '—'),
        bigUnit: 'W',
        delta: bestPR?.pct_of_best != null && bestPR.pct_of_best >= 1 ? `${Math.round((bestPR.pct_of_best - 1) * 100)}%` : null,
        sentence: bestPR ? `Deine beste ${prDur?.toLowerCase()}-Leistung dieser Fahrt.` : 'Ein starker Moment dieser Fahrt.',
        pills: [
          { text: prCount > 0 ? `${prCount} PRs` : 'Neuer Reiz', sub: prCount > 0 ? 'an einem Tag' : 'gesetzt', tone: 'acid' },
          { text: 'Längste', sub: 'Fahrt im Block', tone: 'violet' }, // sub: framing
        ],
        stats: [s(statKm), s(statHm), s(statDur)],
      }
    }

    return {
      angle,
      handle,
      club: dateStr,
      // Real ride intensity (IF) — tints the route glow on the poster.
      intensity: iff ?? (h?.tss != null && durS ? Math.sqrt(h.tss / ((durS / 3600) * 100)) : undefined),
      polyline: activity?.route_polyline ?? null,
      // THE RIDE'S OWN HERO when one has been composed: the rider's bike, shot
      // in the framing that ride earned. It becomes the whole top half.
      sceneSrc: scene?.image_base64 ?? null,
      // THE RIDER'S OWN BIKE otherwise — never `STARTER_BIKE`, which is what
      // stood here and put a grey catalogue bicycle on every rider's poster.
      // Null draws no bike: a poster with a route and no machine is honest, one
      // with somebody else's machine is not.
      bikeSrc: garage?.bike?.image_base64 ?? null,
      avatarUrl: user?.avatar_url ?? null,
      avatarInitial,
      footer: `${rideName} · ${dateStr}`,
      ...data,
    }
  }, [activity, debrief, angle, user, scene, garage])

  // ── render the poster whenever the payload changes ──
  useEffect(() => {
    if (!poster) return
    let alive = true
    setGenerating(true)
    renderSharePoster(poster)
      .then((out) => { if (alive) { setPosterDataUrl(out.dataUrl || null); setPosterBlob(out.blob) } })
      .finally(() => { if (alive) setGenerating(false) })
    return () => { alive = false }
  }, [poster])

  const caption = useMemo(() => {
    if (!poster) return 'w3.ride'
    return `${poster.footer} — ${poster.sentence} #w3ride`
  }, [poster])

  const onShare = useCallback(() => { void sharePoster(posterBlob, caption) }, [posterBlob, caption])
  const onDownload = useCallback(() => { if (posterBlob) downloadPoster(posterBlob) }, [posterBlob])
  const onLink = useCallback(async () => { try { if (navigator.clipboard) await navigator.clipboard.writeText(caption) } catch { /* ignore */ } }, [caption])

  const vm: W3ShareVm = {
    posterDataUrl,
    generating,
    activeAngle: angle,
    canShare: shareable,
    angles: [
      { id: 'rekord', label: 'Bestleistung', sub: 'Stärkster Push' },
      { id: 'fahrt', label: 'Ganze Fahrt', sub: activity?.title || 'Deine Runde' },
      { id: 'leistung', label: 'Leistung', sub: 'Normalized Power' },
    ] as ShareAngleChip[],
  }

  return (
    <W3ShareView
      vm={vm}
      onClose={() => navigate(-1)}
      onDownload={onDownload}
      onSelectAngle={setAngle}
      onShare={onShare}
      onStory={onShare}
      onCrew={() => navigate('/e/w3-crew')}
      onLink={onLink}
    />
  )
}
