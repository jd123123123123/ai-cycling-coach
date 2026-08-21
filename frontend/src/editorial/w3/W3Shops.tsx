import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Clock, Compass, Gauge, Globe, MapPin, Navigation, Phone, Wrench,
} from 'lucide-react'
import { T, FONT } from './w3tokens'
import { fetchNearbyWorkshops } from '../../api/bikeShops'
import type { NearbyWorkshops, Workshop } from '../../api/bikeShops'

/**
 * W3 · IN DER NÄHE — where to take the bike when the workshop screen says a
 * job is due and it is not a job the rider does themselves.
 *
 * The other half of the maintenance loop, and the half every app in this
 * category leaves out: they track the parts and then hand you a search engine.
 * This answers the three things that actually decide it — how far, open right
 * now, and can they even repair — before the rider taps anything.
 *
 * TWO LISTS, NOT ONE. A shop that shuts at 18:00 and an unattended 24/7 tool
 * stand answer different questions; sorted together by distance the stand
 * disappears exactly when it is the only thing that helps. The hero picks
 * whichever is the best answer RIGHT NOW and says why it picked it.
 *
 * Data is OpenStreetMap via Overpass — free, no key, and the only source that
 * carries `service:bicycle:repair` and the public repair stands at all. ODbL
 * requires the attribution at the foot of the screen; it stays.
 */

const RADII = [5000, 15000, 30000] as const

const routeUrl = (w: Workshop) =>
  `https://www.google.com/maps/dir/?api=1&destination=${w.lat},${w.lng}&travelmode=bicycling`

const km = (m: number) =>
  m < 950
    ? `${Math.round(m / 10) * 10} m`
    : `${(m / 1000).toLocaleString('de-DE', { maximumFractionDigits: m < 10_000 ? 1 : 0 })} km`

/** Minutes at a limping-home 14 km/h, because the reason you are going is that
 *  the bike is broken. Quoting 30 km/h here would be quoting a bike that works. */
const minutes = (m: number) => Math.max(1, Math.round((m / 1000 / 14) * 60))

function statusOf(w: Workshop): { text: string; tone: string } {
  if (w.kind === 'station' && w.todays_hours === '24/7') {
    return { text: 'rund um die Uhr', tone: T.acid }
  }
  if (w.open_now === true) {
    return { text: w.todays_hours ? `offen · ${w.todays_hours}` : 'offen', tone: T.acid }
  }
  if (w.open_now === false) {
    return { text: w.todays_hours ? `zu · ${w.todays_hours}` : 'heute zu', tone: T.warn }
  }
  // Unparseable opening_hours. The raw string beats a confident wrong "zu"
  // that sends somebody with a flat tyre to a shut door.
  return { text: w.opening_hours ?? 'Zeiten unbekannt', tone: T.quiet }
}

const SERVICE_LABEL: Array<[keyof Workshop['services'], string]> = [
  ['repair', 'Reparatur'],
  ['pump', 'Luftpumpe'],
  ['chain_tool', 'Kettenwerkzeug'],
  ['diy', 'selbst schrauben'],
  ['retail', 'Teile'],
  ['second_hand', 'gebraucht'],
  ['cleaning', 'Waschen'],
  ['charging', 'E-Bike laden'],
]

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      flex: 'none', padding: '4px 9px', borderRadius: 100, background: T.heroChip,
      fontSize: 10.5, fontWeight: 700, color: T.mid, letterSpacing: 0.2,
    }}>{children}</span>
  )
}

function Actions({ w, primary }: { w: Workshop; primary?: boolean }) {
  const round = {
    width: 38, height: 38, borderRadius: 100, background: T.heroChip,
    display: 'grid', placeItems: 'center', flex: 'none',
  } as const
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <a href={routeUrl(w)} target="_blank" rel="noreferrer" style={{
        flex: 1, height: 38, borderRadius: 100, display: 'flex', alignItems: 'center',
        justifyContent: 'center', gap: 7, textDecoration: 'none',
        background: primary ? T.acid : T.heroChip,
        color: primary ? T.heroInk : T.ink,
        fontSize: 12.5, fontWeight: 700,
      }}>
        <Navigation size={14} /> Route
      </a>
      {w.phone && (
        <a href={`tel:${w.phone.replace(/\s/g, '')}`} aria-label="Anrufen" style={round}>
          <Phone size={16} color={T.ink} />
        </a>
      )}
      {w.website && (
        <a href={w.website} target="_blank" rel="noreferrer" aria-label="Website" style={round}>
          <Globe size={16} color={T.ink} />
        </a>
      )}
    </div>
  )
}

function ShopRow({ w }: { w: Workshop }) {
  const status = statusOf(w)
  const station = w.kind === 'station'
  const tags = SERVICE_LABEL
    // An unattended stand does not "do repairs" — you do. Its honest tags are
    // the tools it carries, and claiming a service it cannot perform is how a
    // rider ends up standing at a pole expecting a mechanic.
    .filter(([key]) => w.services[key] && !(station && key === 'repair'))
    .slice(0, 3)
  return (
    <div style={{
      background: T.heroDock, borderRadius: 20, padding: 16,
      display: 'flex', flexDirection: 'column', gap: 11,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{
          width: 34, height: 34, borderRadius: 12, flex: 'none',
          background: T.heroChip, display: 'grid', placeItems: 'center',
        }}>
          {station ? <Gauge size={16} color={T.acid} /> : <Wrench size={16} color={T.ink} />}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
          <span style={{
            fontSize: 14.5, fontWeight: 700, color: T.ink,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {w.name ?? (station ? 'Reparatursäule' : 'ohne Namen')}
          </span>
          <span style={{ fontSize: 10.5, fontWeight: 600, color: status.tone }}>
            {status.text}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flex: 'none' }}>
          <span style={{ fontSize: 14.5, fontWeight: 700, color: T.ink, fontVariantNumeric: 'tabular-nums' }}>
            {km(w.distance_m)}
          </span>
          <span style={{ fontSize: 10, fontWeight: 600, color: T.quiet }}>
            {w.direction} · {minutes(w.distance_m)} min
          </span>
        </div>
      </div>

      {w.address && (
        <span style={{
          display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5,
          fontWeight: 600, color: T.quiet, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          <MapPin size={11} /> {w.address}
        </span>
      )}

      {tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {tags.map(([key, label]) => <Tag key={key}>{label}</Tag>)}
        </div>
      )}

      <Actions w={w} />
    </div>
  )
}

export default function W3Shops() {
  const [radius, setRadius] = useState<number>(15000)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [asking, setAsking] = useState(true)

  // Ask once. A denial is not an error state: the backend falls back to the
  // last ride's GPS, which for a rider standing next to their bike at home is
  // the same place anyway.
  useEffect(() => {
    if (!('geolocation' in navigator)) { setAsking(false); return }
    navigator.geolocation.getCurrentPosition(
      (p) => { setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }); setAsking(false) },
      () => setAsking(false),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 },
    )
  }, [])

  const { data, isLoading } = useQuery<NearbyWorkshops>({
    // Coordinates are rounded into the key so a jittering fix does not refetch;
    // the backend caches on a ~1 km grid for the same reason.
    queryKey: ['shops', coords ? Math.round(coords.lat * 100) : null,
               coords ? Math.round(coords.lng * 100) : null, radius],
    enabled: !asking,
    staleTime: 60 * 60 * 1000,
    queryFn: () => fetchNearbyWorkshops({ lat: coords?.lat, lng: coords?.lng, radiusM: radius }),
  })

  const shops = data?.shops ?? []
  const stations = data?.stations ?? []

  const best = useMemo((): { w: Workshop; why: string } | null => {
    const open = shops.find((s) => s.open_now === true)
    if (open) return { w: open, why: 'Jetzt geöffnet — ruf kurz an, ob sie dich heute noch reinnehmen.' }
    const stand = stations[0]
    if (stand) return { w: stand, why: 'Alle Läden zu. Diese Säule hat Werkzeug und Pumpe, rund um die Uhr.' }
    const unknown = shops.find((s) => s.open_now === null)
    if (unknown) return { w: unknown, why: 'Öffnungszeiten sind in OSM nicht hinterlegt — vorher anrufen.' }
    const closest = shops[0]
    if (closest) {
      return {
        w: closest,
        why: closest.todays_hours
          ? `Heute zu. Zeiten: ${closest.todays_hours}.`
          : 'Heute geschlossen — morgen wieder probieren.',
      }
    }
    return null
  }, [shops, stations])

  const rest = best ? shops.filter((s) => s !== best.w) : shops
  const stands = best ? stations.filter((s) => s !== best.w) : stations

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 12,
      padding: '0 20px 26px', fontFamily: FONT, background: T.heroBg,
    }}>
      <div style={{ display: 'flex', gap: 6, padding: 4, borderRadius: 100, background: T.heroDock }}>
        {RADII.map((r) => {
          const on = r === radius
          return (
            <button key={r} onClick={() => setRadius(r)} style={{
              flex: 1, height: 30, borderRadius: 100, border: 0, cursor: on ? 'default' : 'pointer',
              background: on ? T.heroChip : 'transparent', color: on ? T.ink : T.quiet,
              fontFamily: FONT, fontSize: 11.5, fontWeight: 700,
            }}>{r / 1000} km</button>
          )
        })}
      </div>

      {data?.origin && (
        <span style={{
          display: 'flex', alignItems: 'center', gap: 5,
          fontSize: 10.5, fontWeight: 600, color: T.quiet,
        }}>
          <Compass size={11} />
          {data.origin.source === 'device'
            ? 'Von deinem Standort'
            : 'Von deiner letzten Fahrt aus — Standort freigeben trifft es genauer'}
        </span>
      )}

      {isLoading && <div style={{ background: T.heroDock, borderRadius: 20, height: 150 }} />}

      {!isLoading && !data?.available && (
        <div style={{
          background: T.heroDock, borderRadius: 20, padding: 18,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>
            {data?.reason === 'no_location' ? 'Noch kein Standort' : 'Nichts im Umkreis'}
          </span>
          <span style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.45, color: T.mid }}>
            {data?.reason === 'no_location'
              ? 'Gib den Standort frei oder lade eine Fahrt mit GPS hoch — daraus lesen wir deine Gegend.'
              : 'In OpenStreetMap ist hier nichts eingetragen. Ein größerer Radius hilft meistens.'}
          </span>
          {data?.reason !== 'no_location' && (
            <button onClick={() => setRadius(30000)} style={{
              alignSelf: 'flex-start', height: 34, padding: '0 16px', borderRadius: 100,
              border: 0, cursor: 'pointer', background: T.acid, color: T.heroInk,
              fontFamily: FONT, fontSize: 12, fontWeight: 700,
            }}>30 km durchsuchen</button>
          )}
        </div>
      )}

      {best && (
        <div style={{
          background: T.heroDock, borderRadius: 24, padding: 18,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.3, color: T.acid }}>
            JETZT DEINE BESTE OPTION
          </span>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
            <span style={{
              fontSize: 20, fontWeight: 700, lineHeight: 1.15, color: T.ink, minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {best.w.name ?? 'Reparatursäule'}
            </span>
            <span style={{
              marginLeft: 'auto', flex: 'none', fontSize: 20, fontWeight: 700,
              color: T.acid, fontVariantNumeric: 'tabular-nums',
            }}>{km(best.w.distance_m)}</span>
          </div>
          <span style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.45, color: T.mid }}>
            {best.why}
          </span>
          <span style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 10.5, fontWeight: 600, color: T.quiet,
          }}>
            <Clock size={11} /> rund {minutes(best.w.distance_m)} min im Schongang · {best.w.direction}
          </span>
          <Actions w={best.w} primary />
        </div>
      )}

      {rest.length > 0 && (
        <>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.3, color: T.quiet, marginTop: 4 }}>
            WERKSTÄTTEN
          </span>
          {rest.map((w) => <ShopRow key={`${w.osm_type}-${w.osm_id}`} w={w} />)}
        </>
      )}

      {stands.length > 0 && (
        <>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.3, color: T.acid, marginTop: 4 }}>
            SELBSTHILFE-SÄULEN
          </span>
          <span style={{ fontSize: 10.5, fontWeight: 500, lineHeight: 1.4, color: T.quiet, marginTop: -6 }}>
            Öffentliche Säulen mit Werkzeug und Pumpe — meist rund um die Uhr zugänglich.
          </span>
          {stands.map((w) => <ShopRow key={`${w.osm_type}-${w.osm_id}`} w={w} />)}
        </>
      )}

      {data?.attribution && (
        <span style={{ fontSize: 9.5, fontWeight: 500, lineHeight: 1.5, color: T.quiet, marginTop: 4 }}>
          Daten: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer"
                    style={{ color: T.quiet }}>{data.attribution}</a>. Fehlt deine
          Werkstatt? Trag sie in OpenStreetMap ein — dann sieht sie jeder Fahrer hier.
        </span>
      )}
    </div>
  )
}
