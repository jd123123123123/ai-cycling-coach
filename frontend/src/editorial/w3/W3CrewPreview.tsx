import { useState } from 'react'
import { T } from './w3tokens'
import W3CrewView, { type W3CrewVm } from './W3CrewView'
import { W3CrewFeedView } from './W3CrewFeed'
import W3StoryRail from './W3StoryRail'
import { W3FeedFilters, W3CollectiveGoal, W3FeedFoot } from './W3FeedShell'
import W3RecordCard from './W3RecordCard'
import { cutRides, feedHeadEyebrow, headlineRecord, recordMonth, storiesFromRides, type W3FeedCut } from './w3feedCuts'
import type { CrewRide } from '../../api/crewRides'
import { periodWord, thisPeriod, type W3Period } from './w3crew'

/**
 * TEMP preview — /e/w3-crew-preview (unguarded). A design fixture for the crew
 * board in the spirit of the pen's "Nachtschicht CC" frame `WAjw9`; the wired
 * `W3CrewPage` fills all of it from real crew standings.
 *
 * The period control is live so the layout is inspectable on every tab, but the
 * FIXTURE NUMBERS DO NOT CHANGE with it — only the wired page re-fetches.
 */

/** Fixture rides for chapter 03, so the feed is reviewable without a backend.
 *  The wired screen reads the crew's real ones. */
const H = 3600
const now = Date.now()
// Synthetic GPS loops, in the shape the server actually sends
// (`[[lat, lng], ...]` — see `crew_chat._route_thumbs`). Real coordinates
// matter here: the projector corrects for cos(lat), so a Berlin loop and an
// alpine one must be at their true latitudes or the preview would flatter a
// projection bug it should expose. Ride 904 deliberately carries NO route —
// that is the indoor case, and the post must print numbers, not a fake map.
const ROUTE_MARA: [number, number][] = [[52.52, 13.47896], [52.52553, 13.47545], [52.52996, 13.46716], [52.53366, 13.45985], [52.53756, 13.45509], [52.54119, 13.44983], [52.54273, 13.4411], [52.54115, 13.42992], [52.53818, 13.42022], [52.53735, 13.41434], [52.54078, 13.41048], [52.54696, 13.405], [52.55204, 13.39655], [52.55332, 13.38706], [52.55137, 13.37874], [52.54876, 13.37111], [52.54697, 13.36216], [52.54499, 13.35214], [52.54096, 13.3452], [52.5347, 13.34598], [52.52811, 13.35434], [52.52319, 13.3643], [52.52, 13.36896], [52.51699, 13.36657], [52.51305, 13.36161], [52.50874, 13.35979], [52.50512, 13.36255], [52.5019, 13.3667], [52.49738, 13.36907], [52.49068, 13.37045], [52.48361, 13.37453], [52.47978, 13.38335], [52.48139, 13.39482], [52.48696, 13.405], [52.49265, 13.41221], [52.49575, 13.41805], [52.49679, 13.42443], [52.49828, 13.43058], [52.50162, 13.4342], [52.50569, 13.43527], [52.50852, 13.43774], [52.50978, 13.44604], [52.51121, 13.45989], [52.51465, 13.47319], [52.52, 13.47896]]
const ROUTE_DU: [number, number][] = [[52.49, 13.40101], [52.4951, 13.39829], [52.49929, 13.39111], [52.50154, 13.37894], [52.50213, 13.36674], [52.50347, 13.36051], [52.50838, 13.36162], [52.51726, 13.36545], [52.52726, 13.36556], [52.53443, 13.35909], [52.53706, 13.34801], [52.53674, 13.33589], [52.53631, 13.32416], [52.53665, 13.31214], [52.53573, 13.30006], [52.53093, 13.29094], [52.52204, 13.28834], [52.51204, 13.29208], [52.50464, 13.29685], [52.50123, 13.29598], [52.50008, 13.28727], [52.49839, 13.27482], [52.49484, 13.26513], [52.49, 13.26101], [52.48475, 13.25959], [52.47879, 13.2563], [52.47126, 13.25053], [52.46264, 13.24712], [52.45551, 13.25191], [52.45284, 13.26606], [52.45517, 13.28471], [52.45978, 13.30115], [52.46282, 13.31221], [52.46265, 13.31953], [52.46092, 13.32634], [52.46049, 13.33372], [52.46224, 13.34063], [52.46412, 13.34694], [52.46345, 13.35534], [52.45995, 13.36907], [52.4565, 13.38764], [52.45668, 13.40545], [52.46174, 13.4156], [52.4698, 13.41568], [52.47789, 13.40963], [52.48449, 13.40383], [52.49, 13.40101]]
const ROUTE_TIMO: [number, number][] = [[47.56, 11.05788], [47.56379, 11.05913], [47.56959, 11.07113], [47.57913, 11.08908], [47.59157, 11.10396], [47.60376, 11.10856], [47.61266, 11.10176], [47.61756, 11.08792], [47.62028, 11.07259], [47.62291, 11.05844], [47.62536, 11.04475], [47.62502, 11.0303], [47.61914, 11.01609], [47.6078, 11.00508], [47.59487, 10.99912], [47.58574, 10.99631], [47.58367, 10.99177], [47.58759, 10.98135], [47.59313, 10.96515], [47.59596, 10.94734], [47.59441, 10.9325], [47.58969, 10.92162], [47.58376, 10.9118], [47.57729, 10.89981], [47.56953, 10.88657], [47.56, 10.87788], [47.55001, 10.88055], [47.54224, 10.89679], [47.53864, 10.92172], [47.53857, 10.94623], [47.53911, 10.96294], [47.53736, 10.97054], [47.5328, 10.97318], [47.5274, 10.97615], [47.52338, 10.9818], [47.52074, 10.98913], [47.51697, 10.99657], [47.50935, 11.00479], [47.49802, 11.01638], [47.48682, 11.03284], [47.48113, 11.05194], [47.48414, 11.06841], [47.49471, 11.0778], [47.50838, 11.07988], [47.52066, 11.07855], [47.52975, 11.07812], [47.5367, 11.07936], [47.54327, 11.07916], [47.54993, 11.07416], [47.55574, 11.06515], [47.56, 11.05788]]

const FEED_RIDES: CrewRide[] = [
  { id: 901, user_id: 2, handle: 'mara', display_name: 'Mara', title: 'Feierabendrunde am Kanal', started_at: new Date(now - 5 * H * 1000).toISOString(),
    distance_m: 48200, elevation_gain_m: 310, duration_seconds: 5820, sport: 'cycling', tss: 78, avg_power_w: 212, avg_hr: 148,
    description: 'Über den Kesselberg, zurück am Starnberger See', photo_urls: ['/w3/onboard-hero.webp'],
    record: { duration_s: 1200, value_w: 312, prior_best_w: 303, gain_pct: 3.0, label: '20-Minuten', prior_best_at: '2026-03-14' },
    elevation_profile: [390.0, 431.8, 472.7, 511.7, 547.9, 545.4, 573.7, 597.1, 615.1, 627.5, 599.0, 599.8, 595.0, 584.8, 569.8, 515.7, 493.0, 467.7, 440.6, 412.7, 350.0, 323.3, 298.7, 277.0, 259.1, 210.5, 201.9, 198.7, 201.2, 209.5, 188.6, 208.3, 233.2, 262.8, 296.6, 298.7, 338.3, 379.6, 421.5, 463.2, 468.6, 506.8, 542.0, 573.3, 600.2, 587.0, 603.3, 614.0], power_profile: null,
    calories: 1180, is_mine: false, comment_count: 2, reactions: { counts: { '🔥': 3, '💪': 1 }, mine: ['💪'] }, route: ROUTE_MARA },
  { id: 902, user_id: 1, handle: 'du', display_name: 'Du', title: 'Intervalle, 4×8', started_at: new Date(now - 26 * H * 1000).toISOString(),
    distance_m: 62400, elevation_gain_m: 680, duration_seconds: 7980, sport: 'cycling', tss: 121, avg_power_w: 241, avg_hr: 156,
    record: null, description: null, photo_urls: [],
    elevation_profile: [599.5, 606.0, 606.8, 602.0, 591.8, 541.8, 522.7, 500.0, 474.7, 447.6, 384.7, 357.0, 330.3, 305.7, 284.0, 231.1, 217.5, 208.9, 205.7, 208.2, 181.5, 195.6, 215.3, 240.2, 269.8, 268.6, 305.7, 345.3, 386.6, 428.5, 435.2, 475.6, 513.8, 549.0, 580.3, 572.2, 594.0, 610.3, 621.0, 625.8, 589.8, 583.3, 571.7, 555.4, 535.1, 476.5, 450.6, 423.2], power_profile: null,
    calories: 1640, is_mine: true, comment_count: 1, reactions: { counts: { '🚀': 2 }, mine: [] }, route: ROUTE_DU },
  { id: 903, user_id: 3, handle: 'timo', display_name: 'Timo', title: 'Lange Ausfahrt in die Berge', started_at: new Date(now - 50 * H * 1000).toISOString(),
    distance_m: 118600, elevation_gain_m: 1840, duration_seconds: 16200, sport: 'cycling', tss: 214, avg_power_w: 198, avg_hr: 141,
    record: null, description: null, photo_urls: [],
    elevation_profile: [316.3, 291.7, 270.0, 252.1, 238.5, 194.9, 191.7, 194.2, 202.5, 216.6, 201.3, 226.2, 255.8, 289.6, 326.7, 331.3, 372.6, 414.5, 456.2, 496.6, 499.8, 535.0, 566.3, 593.2, 615.0, 596.3, 607.0, 611.8, 610.8, 604.3, 557.7, 541.4, 521.1, 497.5, 471.6, 409.2, 381.2, 353.7, 327.6, 303.8, 248.1, 231.4, 219.3, 212.3, 210.8, 180.0, 190.1, 205.9], power_profile: null,
    calories: 3120, is_mine: false, comment_count: 0, reactions: { counts: { '👏': 4, '⚡': 2 }, mine: [] }, route: ROUTE_TIMO },
  // A ride imported without a power meter — the card must print DASH, not a
  // padded zero. Worth having in the fixture precisely because it is the case
  // that looks wrong when it is wrong.
  { id: 904, user_id: 4, handle: 'jo', display_name: 'Jo', title: 'Regeneration', started_at: new Date(now - 74 * H * 1000).toISOString(),
    distance_m: 24100, elevation_gain_m: 90, duration_seconds: 3600, sport: 'cycling', tss: null, avg_power_w: null, avg_hr: 118,
    calories: 620, is_mine: false, comment_count: 0, reactions: { counts: {}, mine: [] },
    record: null, description: null, photo_urls: [], elevation_profile: null, power_profile: null },
  { id: 905, user_id: 2, handle: 'mara', display_name: 'Mara', title: 'Rolle, Sweetspot', started_at: new Date(now - 98 * H * 1000).toISOString(),
    distance_m: 31000, elevation_gain_m: 0, duration_seconds: 4200, sport: 'cycling', tss: 68, avg_power_w: 205, avg_hr: 144,
    calories: 840, is_mine: false, comment_count: 3, reactions: { counts: { '🙌': 1 }, mine: [] },
    record: null, description: null, photo_urls: [], elevation_profile: null, power_profile: [120.0, 129.8, 138.7, 146.0, 317.3, 320.8, 133.1, 135.2, 113.9, 118.2, 124.3, 132.4, 307.8, 317.7, 327.3, 335.5, 317.9, 322.4, 135.3, 137.4, 115.6, 119.0, 124.0, 131.0, 305.7, 315.5, 325.4, 334.4, 317.9, 323.5, 137.2, 139.7, 117.7, 120.3, 124.3, 130.2, 304.0, 313.3, 323.2, 332.8, 317.3, 324.0, 138.7, 141.8, 119.9, 122.1, 125.2, 130.0] },
]

const BASE = {
  inCrew: true,
  crewName: 'Nachtschicht CC',
  blurb: 'Each rider is scored against their own weekly plan — so a short week and a big week sit on the same board.',
  windowChip: 'AUG 10–16',
  rankOrdinal: '2nd',
  propsHint: 'Three a week. Spend them on the effort, not the number.',
  crewTss: '2,140',
  crewKm: '412 km',
  crewTotals: [
    { key: 'km', value: '412', unit: 'km', label: 'ZUSAMMEN GEFAHREN' },
    { key: 'h', value: '22', unit: 'h', label: 'IM SATTEL' },
    { key: 'tss', value: '2.140', label: 'CREW TSS' },
  ],
  crewKmCoverage: null,
  avgTss: '357',
  yourShare: '19%',
  outputNote: 'Points are each rider’s share of their own weekly bar. TSS and kilometres are the raw totals for this window.',
  members: [
    { id: 1, name: '@mara', rank: 1, tssLabel: '486', kmLabel: '121 km', pct: 143, isYou: false , hoursLabel: '6,1 h' },
    { id: 2, name: 'You', rank: 2, tssLabel: '412', kmLabel: '84 km', pct: 131, isYou: true , hoursLabel: '4,3 h' },
    { id: 3, name: '@timo', rank: 3, tssLabel: '351', kmLabel: '78 km', pct: 104, isYou: false , hoursLabel: '3,9 h' },
    { id: 4, name: '@jonas', rank: 4, tssLabel: '318', kmLabel: '61 km', pct: 96, isYou: false , hoursLabel: '3,2 h' },
    { id: 5, name: '@lena', rank: 5, tssLabel: '294', kmLabel: '43 km', pct: 88, isYou: false , hoursLabel: '2,4 h' },
    { id: 6, name: '@ilker', rank: 6, tssLabel: '279', kmLabel: '25 km', pct: 61, isYou: false , hoursLabel: '1,6 h' },
  ],
  showedUp: [
    { id: 1, name: '@mara', isYou: false, days: [true, false, false, true, false, true, false] },
    { id: 2, name: 'You', isYou: true, days: [true, true, false, true, false, true, true] },
    { id: 3, name: '@timo', isYou: false, days: [false, true, false, false, true, false, true] },
    { id: 4, name: '@jonas', isYou: false, days: [true, false, false, true, false, true, false] },
    { id: 5, name: '@lena', isYou: false, days: [false, true, false, true, false, false, true] },
    { id: 6, name: '@ilker', isYou: false, days: [false, false, true, false, false, true, false] },
  ],
  showedUpFilled: 21,
  showedUpTotal: 42,
  showedUpNote: 'A filled block is a day a rider actually logged a session.',
  gridEdges: null,
  distanceKm: 412,
  distanceGoalKm: 500,
  distancePct: 82,
  distanceToGo: 88,
  yourDistanceNote: "You've put in 84 km — more than four of the six",
  yourSharePct: 20,
  highlights: [
    { id: 'h1', name: '@mara', isYou: false, text: 'Leads the crew board this week', badge: '860 PTS' },
    { id: 'h2', name: 'You', isYou: true, text: '412 TSS · 84 km this week', badge: '2ND' },
    { id: 'h3', name: '@timo', isYou: false, text: 'Showed up in 3 of 7 days', badge: '3/7' },
  ],
  seatsOpen: 2,
  seatsCopy: 'Crews of six to eight hold each other best. Fewer, and a quiet week goes unnoticed.',
}

/**
 * THE PREVIEW RENDERS WHAT THE PAGE RENDERS.
 *
 * It used to mount `W3CrewFeedView` alone, so the head, the rail, the cuts and
 * the collective card — everything the crew screen actually shows — were
 * invisible to every review that used this route. A harness that draws less
 * than production is the same defect as one that draws a shape production
 * cannot: it makes the screen look finished when it is not.
 */
function PreviewFeed() {
  const [cut, setCut] = useState<W3FeedCut>('all')
  const shown = cutRides(FEED_RIDES, cut)
  const topRecord = headlineRecord(FEED_RIDES)
  const stories = storiesFromRides(FEED_RIDES, new Date(), (r) => ({
    id: r.id,
    name: r.is_mine ? 'Du' : `@${r.handle}`,
    avatarUrl: null,
    initial: (r.handle || '?').charAt(0).toUpperCase(),
    mine: r.is_mine,
    card: <W3CrewFeedView rides={[r]} variant="page" />,
  }))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, width: '100%' }}>
      <span style={{ padding: '0 20px', fontSize: 9.5, fontWeight: 700, letterSpacing: 1.4, color: T.quiet }}>
        {feedHeadEyebrow()}
      </span>
      <W3StoryRail stories={stories} onStart={() => { /* preview */ }} />
      <W3FeedFilters
        value={cut}
        onChange={setCut}
        layoutId="w3-crew-cut"
        options={[
          { key: 'all', label: 'Alle', count: FEED_RIDES.length },
          { key: 'mine', label: 'Nur meine', count: FEED_RIDES.filter((r) => r.is_mine).length },
          { key: 'crew', label: 'Ohne mich', count: FEED_RIDES.filter((r) => !r.is_mine).length },
        ]}
      />
      <div style={{ padding: '0 20px' }}>
        <W3CollectiveGoal km={782} goalKm={1000} pct={0.78} riders={9} daysLeft={2} onContribute={() => {}} />
      </div>
      {/* THE ONE RECORD RAISED TO A HEADLINE. Every ride that set one
          already wears a chip on its own post; this is the biggest of
          them, and there is exactly one or none. */}
      {(() => {
        const top = topRecord
        return top?.record ? (
          <div style={{ padding: '0 20px' }}>
            <W3RecordCard vm={{
              handle: top.is_mine ? 'Du' : `@${top.handle}`,
              label: top.record.label,
              valueW: top.record.value_w,
              priorW: top.record.prior_best_w,
              priorWhen: recordMonth(top.record.prior_best_at),
            }} />
          </div>
        ) : null
      })()}

      <div style={{ padding: '0 20px' }}>
        <W3CrewFeedView rides={shown} variant="page" headlinedId={topRecord?.id ?? null} />
      </div>
      {shown.length > 0 && <W3FeedFoot text="Das war die Crew von heute" />}
    </div>
  )
}

export default function W3CrewPreview() {
  const [tab, setTab] = useState<'feed' | 'crew'>('feed')
  const [period, setPeriod] = useState<W3Period>('week')
  const vm: W3CrewVm = {
    ...BASE,
    period,
    rankSub: `of six ${thisPeriod(period)}`,
    crewTssSub: `six riders · ${thisPeriod(period)}`,
    gridDow: period === 'week',
    showDistanceGoal: period === 'week',
    highlightsTitle: `This ${periodWord(period)} in the crew`,
  }
  return <W3CrewView vm={vm} onPeriod={setPeriod}
    feed={<PreviewFeed />}
    tab={tab}
    chips={
      <W3FeedFilters
        value={tab}
        onChange={setTab}
        layoutId="w3-crew-tab"
        options={[{ key: 'feed', label: 'Feed' }, { key: 'crew', label: 'Crew' }]}
      />
    } />
}
