import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { useRaceDebrief } from '../../hooks/useRaceDebrief'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { useGarage, useRenderRideScene, useRideScene } from '../../hooks/useGarage'
import {
  renderStoryCard, sharePoster, downloadPoster, canShareImage, laufbandStrings,
  type StoryLayout, type StoryData,
  type ShareAngle, type PosterData,
} from './w3share'
import { VALUES, DEFAULT_VALUES, type ValueId } from './w3shareValues'
import {
  canRenderVideo, renderStoryVideo, videoPosterFrame, renderStoryOverlay, MAX_STORY_SECONDS,
} from './w3share' 
import { T } from './w3tokens'
import W3ShareView, { type W3ShareVm, type ShareAngleChip, type EditField } from './W3ShareView'

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

/**
 * How this effort stands against the rider's own best, as a signed percentage.
 *
 * Null below a whole point in either direction: "0 %" next to a big number
 * reads as a broken calculation, and nobody posts a card to announce a tie.
 */
export function prDelta(pctOfBest: number | null): string | null {
  if (pctOfBest == null || !Number.isFinite(pctOfBest)) return null
  const diff = Math.round(pctOfBest - 100)
  if (diff === 0) return null
  return diff > 0 ? `↑ ${diff}%` : `↓ ${Math.abs(diff)}%`
}

//: Where a rider's card layout is remembered. One key, because the choice is
//: about how THEY like to post rather than about any one ride.

/**
 * What each angle leads with when the rider has not chosen for themselves.
 *
 * These are not arbitrary. A RECORD is about one effort, so it opens with the
 * peaks it beat. A WHOLE RIDE is about where you went, so it opens with the
 * route. A POWER card is about how the effort was distributed, so it opens
 * with the trace and the zones under it.
 */

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
  const composeScene = useRenderRideScene()

  // ── THE HEADER IS THE BIKE, IN THE PLACE THE GPX FOUND ─────────────────
  // The scene — the rider's own machine standing in the world their track was
  // resolved to — was only ever composed from the ride-detail screen. This one
  // merely READ it, so a rider who came straight here got the drawn mountains:
  // a generic landscape on the one picture they were about to post publicly.
  //
  // Composing is a slow, paid model call and the codebase is right to gate it
  // on explicit intent — but OPENING THE SHARE SCREEN IS THAT INTENT. It is
  // asked for exactly once, only when the ride has no scene yet and the server
  // says one can be made (`not_generated`; `needs_bike` and `needs_rider` are
  // answers, not failures, and asking again would only fail again). Nothing
  // waits on it: the poster paints immediately with whatever it has and swaps
  // to the real scene when it lands.
  const askedRef = useRef(false)
  useEffect(() => {
    if (askedRef.current) return
    if (activity?.id == null) return
    if (scene?.status !== 'not_generated') return
    askedRef.current = true
    composeScene.mutate(activity.id)
  }, [activity?.id, scene?.status, composeScene])
  // Weight, for W/kg. Absent is honest — the tile shows an em dash rather than
  // a watts-per-kilo computed against a weight nobody entered.
  const { data: profile } = useAthleteProfile()
  // Never uploaded, never persisted: the picture only exists for as long as
  // this screen is open, which is exactly as long as it is needed.
  const [ownPhoto, setOwnPhoto] = useState<string | null>(null)

  // ── WHAT THE RIDER PUTS ON THE CARD ─────────────────────────────────────
  // Null means "whatever this angle leads with"; the moment they touch the
  // picker their choice takes over for every angle, because a rider who has
  // said they want the trace wants it on the record card too. Remembered
  // across rides — nobody wants to rebuild their card every time they finish
  // one — and read defensively, so a private window or a cleared store just
  // falls back to the defaults.
  // THE BLOCK PICKER IS GONE, and with it the localStorage that remembered it.
  // It chose which pieces the OLD poster composed itself from; the pen's five
  // templates have fixed compositions, so what a rider picks now is which
  // VALUES fill their slots. See `w3shareValues`.
  const { data: garage } = useGarage()

  const [angle, setAngle] = useState<ShareAngle>('fahrt')
  // WHICH OF THE FIVE LEAVES THE APP. The old in-app poster is gone: the pen's
  // templates are the screens now, and keeping a sixth "our own card" option
  // beside them would be the old design surviving as a preference.
  const [format, setFormat] = useState<StoryLayout>('full')
  // The rider's overrides for the card's WORDS — see `EDITABLE` in the view for
  // why the numbers are not in here. Keyed per field, cleared by emptying.
  const [edits, setEdits] = useState<Partial<Record<EditField, string>>>({})
  // What the rider put on the card, in the order they tapped it.
  const [values, setValues] = useState<ValueId[]>(DEFAULT_VALUES)
  const [accent, setAccent] = useState<string>(T.acid)
  // The rider's clip, and the still pulled out of it. The still is what the
  // preview shows and what a browser that cannot record a canvas falls back to;
  // the clip is what gets burned and shared when it can.
  const [video, setVideo] = useState<{ url: string; poster: string } | null>(null)
  const [burning, setBurning] = useState<number | null>(null)

  const pickVideo = useCallback(async (f: File) => {
    const url = URL.createObjectURL(f)
    const poster = await videoPosterFrame(url)
    // No frame means no readable video; say so rather than showing an empty card.
    if (!poster) { URL.revokeObjectURL(url); setVideo(null); return }
    setVideo((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return { url, poster }
    })
    setOwnPhoto(null)
  }, [])

  // Revoke on unmount: an object URL held after the screen closes is the whole
  // clip pinned in memory.
  useEffect(() => () => { if (video) URL.revokeObjectURL(video.url) }, [video])
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
    const statIF: [string, string] = [iff != null ? de(iff, 2) : '—', 'INTENSITÄT']
    // ── THE NUMBERS RIDERS ACTUALLY TRADE IN ──────────────────────────────
    // `tss` and `total_kj` sat in the debrief header unused while the card
    // showed the duration three times over in different clothes. TSS is how
    // hard the ride was and kJ is how much work it took — the two figures a
    // cyclist compares with another cyclist. W/kg is the third, and it is the
    // one that decides who gets up the hill first.
    const tss: number | null = h?.tss ?? null
    const kj: number | null = h?.total_kj ?? null
    const weight = profile?.weight_kg ?? null
    const wkgOf = (w: number | null) => (w != null && weight ? w / weight : null)
    const statTss: [string, string] = [tss != null ? String(Math.round(tss)) : '—', 'TSS']
    const statKj: [string, string] = [kj != null ? de(Math.round(kj)) : '—', 'KILOJOULE']
    const prWkg = wkgOf(bestPR?.ride_watts ?? null)
    const statPrWkg: [string, string] = [prWkg != null ? de(prWkg, 1) : '—', 'W/KG SPITZE']
    const npWkg = wkgOf(np)
    const statNpWkg: [string, string] = [npWkg != null ? de(npWkg, 2) : '—', 'W/KG SCHNITT']

    const s = (t: [string, string]) => ({ v: t[0], l: t[1] })

    // ── WHAT THE BLOCKS DRAW FROM ──────────────────────────────────────────
    // Downsampled here, once, rather than inside the painter: 240 columns is
    // what fills the card's width at one column per pixel-and-a-bit, and a
    // five-hour ride arrives with eighteen thousand samples. Averaging into
    // buckets keeps the SHAPE — a max would turn every ride into spikes and a
    // stride would drop whole intervals.
    const bucket = (xs: (number | null)[], n = 240): number[] => {
      const vals = xs.map((v) => (v == null ? 0 : v))
      if (vals.length <= n) return vals
      const size = vals.length / n
      return Array.from({ length: n }, (_, i) => {
        const lo = Math.floor(i * size), hi = Math.max(lo + 1, Math.floor((i + 1) * size))
        let sum = 0
        for (let k = lo; k < hi; k++) sum += vals[k]
        return sum / (hi - lo)
      })
    }
    const story = debrief?.story ?? null
    const blockData = {
      power: story ? bucket(story.power) : [],
      hr: story ? bucket(story.hr) : [],
      altitude: story ? bucket(story.altitude) : [],
      ftp,
      peaks: efforts
        .slice()
        .sort((a, b) => a.duration_s - b.duration_s)
        .map((e) => ({
          label: e.duration_s < 60 ? `${e.duration_s} s` : `${Math.round(e.duration_s / 60)} min`,
          watts: e.ride_watts,
          best: e.best_watts,
          isPr: e.is_pr,
        })),
      polyline: activity?.route_polyline ?? null,
      stats: [] as { v: string; l: string }[],
      pills: [] as { text: string; sub: string; tone: 'acid' | 'violet' }[],
    }
    const prCount = prs.length

    // `data` is the ANGLE's own copy and figures; everything structural —
    // the blocks, the series they draw from, the imagery — is added once below.
    let data: Omit<PosterData, 'angle' | 'polyline' | 'bikeSrc' | 'avatarUrl' | 'avatarInitial' | 'handle' | 'club' | 'footer' | 'blocks' | 'blockData' | 'sceneSrc' | 'intensity'>
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
        // The whole ride: how far, how much of it went up, what it cost.
        stats: [s(statKm), s(statHm), s(statKj)],
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
        // Intensity leads a power card; the work done and the time back it up.
        stats: [s(statIF), s(statNpWkg), s(statTss)],
      }
    } else {
      // rekord — the ride's standout power PR effort (real)
      data = {
        kicker: bestPR ? `BESTLEISTUNG · ${prDur}` : 'HIGHLIGHT DER FAHRT',
        bigValue: bestPR?.ride_watts != null ? String(bestPR.ride_watts) : (np != null ? String(Math.round(np)) : '—'),
        bigUnit: 'W',
        // `pct_of_best` IS A PERCENTAGE — `effort_matching` computes
        // `rw / bw * 100`, so 118.2 means "118 % of your best". This read it as
        // a RATIO and printed `(118.2 - 1) * 100` = 11720 %, under a hardcoded
        // down-arrow, on the one card riders post publicly.
        delta: prDelta(bestPR?.pct_of_best ?? null),
        sentence: bestPR ? `Deine beste ${prDur?.toLowerCase()}-Leistung dieser Fahrt.` : 'Ein starker Moment dieser Fahrt.',
        pills: [
          { text: prCount > 0 ? `${prCount} PRs` : 'Neuer Reiz', sub: prCount > 0 ? 'an einem Tag' : 'gesetzt', tone: 'acid' },
          { text: 'Längste', sub: 'Fahrt im Block', tone: 'violet' }, // sub: framing
        ],
        // A record card leads with what that effort was worth per kilo.
        stats: [s(statPrWkg), s(statTss), s(statDur)],
      }
    }

    return {
      angle,
      handle,
      club: dateStr,
      // The two blocks that were always on the card read their content from
      // the angle, so they are filled in here rather than above.
      // `blocks` is vestigial: it told the OLD poster painter which pieces to
      // compose. Nothing reads it now — this object survives only as the shape
      // the page assembles its numbers into before handing them to the story
      // card. It goes when that assembly is rewritten against `StoryData`.
      blocks: [],
      blockData: { ...blockData, stats: data.stats, pills: data.pills },
      // Real ride intensity (IF) — tints the route glow on the poster.
      intensity: iff ?? (h?.tss != null && durS ? Math.sqrt(h.tss / ((durS / 3600) * 100)) : undefined),
      polyline: activity?.route_polyline ?? null,
      // THE RIDE'S OWN HERO when one has been composed: the rider's bike, shot
      // in the framing that ride earned. It becomes the whole top half.
      // THE RIDER'S OWN PHOTOGRAPH WINS. A composed scene is a picture of
      // where the app believes they were; a photo from their pocket is a
      // picture of where they were. It stays on the device — the poster is
      // painted locally, so the only copy that travels is the one they hand to
      // the share sheet themselves.
      sceneSrc: ownPhoto ?? scene?.image_base64 ?? null,
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
  }, [activity, debrief, angle, user, scene, garage, ownPhoto, profile])

  /**
   * The story card's payload.
   *
   * THE RIDER'S PICKED VALUES ARE THE STATS, in the order they tapped them —
   * that is what makes the WERTE row a control rather than an ornament. The
   * first pick leads (it is the card's big number), the next two fill the
   * slots beside it, and a template that shows fewer simply uses fewer.
   */
  const story = useMemo<StoryData | null>(() => {
    if (!poster || !debrief) return null
    const kg = profile?.weight_kg ?? null
    const picked = values
      .map((id) => VALUES.find((v) => v.id === id))
      .filter((v): v is NonNullable<typeof v> => v != null)
      .map((v) => ({ id: v.id, short: v.short, value: v.resolve(debrief, kg) }))
      .filter((v): v is { id: ValueId; short: string; value: string } => v.value != null)

    const [lead, ...rest] = picked
    // The leading value is split into figure and unit so the card can set them
    // at different sizes; a value with no unit keeps the whole string.
    const cut = lead ? lead.value.lastIndexOf(' ') : -1
    const bigValue = lead ? (cut > 0 ? lead.value.slice(0, cut) : lead.value) : poster.bigValue
    const bigUnit = lead
      ? (cut > 0 ? lead.value.slice(cut + 1) : lead.short.toLowerCase())
      : poster.bigUnit

    const pair = rest.slice(0, 2).map((v) => ({ v: v.value, l: v.short }))
    while (pair.length < 2) pair.push({ v: '', l: '' })

    const power = poster.blockData?.power ?? []
    const peak = power.length ? Math.max(...power) : 0

    return {
      layout: format,
      accent,
      handle: poster.handle,
      // The app is called Ridr. "W3" is the internal name of the design
      // system, and it had no business being the credit line on the one
      // surface of this app that gets posted in public.
      badge: 'RIDR ANALYSE',
      lead: poster.sentence.split(/ — | – |: /)[0] ?? poster.sentence,
      emphasis: poster.sentence.split(/ — | – |: /).slice(1).join(' — '),
      bigValue,
      bigUnit,
      stats: pair as [{ v: string; l: string }, { v: string; l: string }],
      series: peak > 0 ? power.slice(0, 48).map((w) => Math.min(1, w / peak)) : [],
      footer: poster.footer,
      // The rider's own picture first — a still they chose, or the frame pulled
      // from their clip — then the ride's composed scene. Never a stock image.
      photo: ownPhoto ?? video?.poster ?? poster.sceneSrc ?? null,
      polyline: poster.polyline,
      routeName: activity?.title ?? '',
      dateline: poster.footer,
      ticker: poster.sentence,
      readings: picked.map((v) => ({ v: v.value, l: v.short })),
    }
  }, [poster, debrief, profile, format, accent, values, ownPhoto, video, activity])

  /**
   * THE RIDE'S OWN WORDS, AND THEN THE RIDER'S ON TOP.
   *
   * Kept as a separate layer rather than folded into `story` so that clearing a
   * field is a real gesture: an empty override falls back to what the ride
   * said, which is the undo every rider tries first. Folding the edits into the
   * memo above would make "" a legitimate value and print a blank headline.
   */
  const edited = useMemo<StoryData | null>(() => {
    if (!story) return story
    const on = (k: EditField) => {
      const v = edits[k]
      return v != null && v.trim() !== '' ? v : undefined
    }
    return {
      ...story,
      routeName: on('routeName') ?? story.routeName,
      dateline: on('dateline') ?? story.dateline,
      lead: on('lead') ?? story.lead,
      emphasis: on('emphasis') ?? story.emphasis,
      ticker: on('ticker') ?? story.ticker,
    }
  }, [story, edits])

  // ── render whichever card is selected whenever the payload changes ──
  useEffect(() => {
    if (!edited) return
    let alive = true
    setGenerating(true)
    const job = renderStoryCard(edited)
    job
      .then((out) => { if (alive) { setPosterDataUrl(out.dataUrl || null); setPosterBlob(out.blob) } })
      .finally(() => { if (alive) setGenerating(false) })
    return () => { alive = false }
  }, [poster, edited])

  const caption = useMemo(() => {
    if (!poster) return 'w3.ride'
    return `${poster.footer} — ${poster.sentence} #w3ride`
  }, [poster])

  /**
   * WHAT LEAVES THE APP. A still by default; the rider's own clip with the ride
   * burned into it when they picked one and the browser can record a canvas.
   *
   * The encode is REAL TIME — `MediaRecorder` records the stream as it plays —
   * so the rider is told what is happening and the still is always ready
   * underneath as the answer if the burn fails or the browser refuses.
   */
  const onShare = useCallback(async () => {
    if (video && edited && canRenderVideo()) {
      setBurning(0)
      try {
        const out = await renderStoryVideo(video.url, edited, setBurning)
        if (out?.blob) {
          await sharePoster(out.blob, caption, 'w3-ride.mp4')
          return
        }
      } catch { /* fall through to the still, which always exists */ } finally {
        setBurning(null)
      }
    }
    void sharePoster(posterBlob, caption)
  }, [video, edited, posterBlob, caption])
  /**
   * THE STICKER ROUTE. The overlay alone, transparent, saved to the camera roll
   * — the rider opens their own story in Instagram, adds their photo or video
   * as the background, and drops this on with the photo sticker, which keeps a
   * PNG's alpha. More taps than the burn, and the only way the composition ends
   * up in their hands rather than ours.
   *
   * It is a SAVE, not a share sheet: a transparent PNG sent through the sheet
   * lands in Instagram as a post, not as a sticker.
   */
  const onSticker = useCallback(async () => {
    if (!edited) return
    const out = await renderStoryOverlay(edited)
    if (out.blob) downloadPoster(out.blob, 'w3-sticker.png')
  }, [edited])

  const onDownload = useCallback(() => { if (posterBlob) downloadPoster(posterBlob) }, [posterBlob])
  const onLink = useCallback(async () => { try { if (navigator.clipboard) await navigator.clipboard.writeText(caption) } catch { /* ignore */ } }, [caption])

  const vm: W3ShareVm = {
    posterDataUrl,
    generating,
    activeAngle: angle,
    canShare: shareable,
    hasOwnPhoto: ownPhoto != null || video != null,
    format,
    values,
    accent,
    // What the video path is doing, in the rider's language. Real-time encoding
    // is a wait, and a wait nobody explains reads as a hang.
    videoNote: burning != null
      ? `Video wird gerendert · ${Math.round(burning * 100)} %`
      : video
        ? (canRenderVideo()
            ? `Video · bis ${MAX_STORY_SECONDS} Sekunden werden geteilt`
            : 'Video · dieser Browser teilt daraus ein Standbild')
        : null,
    // Only what this ride recorded. A value it has no number for is not offered,
    // so an empty slot can never be printed.
    availableValues: debrief
      ? VALUES.map((v) => ({ id: v.id, label: v.label, value: v.resolve(debrief, profile?.weight_kg ?? null) }))
          .filter((v): v is { id: ValueId; label: string; value: string } => v.value != null)
      : [],
    // The belt the preview scrolls is built by the same function the canvas
    // paints with, so the two cannot drift apart.
    laufband: edited ? laufbandStrings(edited) : undefined,
    edits,
    // The placeholders: what each field says when the rider has not typed over
    // it. Shown as placeholder rather than as value, so an untouched field is
    // visibly the ride's word and not something they already edited.
    defaults: story
      ? { routeName: story.routeName, dateline: story.dateline, lead: story.lead, emphasis: story.emphasis, ticker: story.ticker }
      : undefined,
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
      onPickPhoto={setOwnPhoto}
      onPickValues={setValues}
      onPickAccent={setAccent}
      onPickVideo={pickVideo}
      onPickFormat={setFormat}
      onEditText={(field, value) => setEdits((prev) => ({ ...prev, [field]: value }))}
      onShare={onShare}
      onSticker={onSticker}
      onCrew={() => navigate('/e/w3-crew')}
      onLink={onLink}
    />
  )
}
