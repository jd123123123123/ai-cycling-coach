import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Repeat, Mountain, Clock, Shuffle, MapPin } from 'lucide-react'
import { apiClient } from '../../../api/client'
import { useLocale } from '../../../contexts/LocaleContext'
import RouteSketch from '../../ui/RouteSketch'
import { glassCardStyle, GLASS_CARD_MARKER } from '../glassCard'
import { eyebrow, surface } from '../surfaces'

/**
 * RouteSuggestionCard — "today's plan says 90 minutes at 70 TSS; here is a
 * road of yours that fits."
 *
 * Every other app answers "what should I ride today?" with an invented route
 * from a map database, or with the same nearby-popular list regardless of what
 * the plan asks. This answers with roads the athlete has ALREADY ridden,
 * scored against today's actual duration and TSS target — so the suggestion is
 * a real road with real climbs and a time they have already proven on it.
 *
 * The card renders NOTHING at all when the backend cannot make a confident
 * suggestion (rest day, no planned ride, no GPS history, no target to match).
 * A "no suggestion" placeholder on the primary screen is noise, and the
 * backend already distinguishes those cases as machine-readable reasons rather
 * than making the frontend guess.
 *
 * The alternatives are deliberately behind one tap rather than always visible:
 * the top pick is the answer, and showing five routes at equal weight turns a
 * decision into a menu. But the tap is always there — a suggestion the athlete
 * cannot decline is a prescription, not a suggestion.
 */

interface RouteSummary {
  name: string | null
  times_ridden: number
  distance_km: number
  elevation_m: number | null
  best_time_s: number | null
  avg_time_s: number | null
  avg_tss: number | null
  last_ridden: string | null
  is_virtual: boolean
  polyline: [number, number][]
}

interface Fit {
  route: RouteSummary
  score: number
  raw_fit: number
  duration_fit: number | null
  tss_fit: number | null
  is_low_confidence: boolean
  is_virtual: boolean
}

interface Recommendation {
  available: boolean
  reason?: string
  planned?: { title: string | null; target_tss: number | null; duration_minutes: number | null }
  top?: Fit
  alternatives?: Fit[]
}

function fmtDuration(seconds: number | null, de: boolean): string {
  if (!seconds) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')} h`
  return de ? `${m} Min` : `${m} min`
}

export default function RouteSuggestionCard() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const [showAll, setShowAll] = useState(false)
  const [chosenIdx, setChosenIdx] = useState<number | null>(null)

  const { data } = useQuery({
    queryKey: ['routes', 'recommended'],
    queryFn: async () => (await apiClient.get<Recommendation>('/routes/recommended')).data,
    staleTime: 10 * 60 * 1000,
  })

  // Honest silence: the backend states exactly why it cannot suggest, and none
  // of those reasons are worth a placeholder on the primary screen.
  if (!data?.available || !data.top) return null

  const all: Fit[] = [data.top, ...(data.alternatives ?? [])]
  const shown = chosenIdx != null ? all[chosenIdx] ?? data.top : data.top
  const hasAlternatives = all.length > 1

  return (
    <section
      {...GLASS_CARD_MARKER}
      style={{
        ...glassCardStyle,
        borderRadius: 20,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span style={eyebrow('var(--color-accent)')}>
          {de ? 'PASST ZU HEUTE' : 'FITS TODAY'}
        </span>
        {data.planned?.duration_minutes != null && (
          <span style={{ fontSize: 11.5, color: 'var(--color-muted)' }}>
            {de
              ? `Plan: ${Math.round(data.planned.duration_minutes)} Min`
              : `Plan: ${Math.round(data.planned.duration_minutes)} min`}
            {data.planned.target_tss != null && ` · ${Math.round(data.planned.target_tss)} TSS`}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <RouteSketch
          polyline={shown.route.polyline}
          width={104}
          height={68}
          pad={6}
          radius={14}
          background="var(--color-surface-2)"
          color={shown.is_virtual ? 'var(--color-strain)' : 'var(--color-accent)'}
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span
            style={{
              fontSize: 15,
              fontWeight: 620,
              color: 'var(--color-ink)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {shown.route.name || (de ? 'Unbenannte Runde' : 'Unnamed loop')}
          </span>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--color-muted)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <MapPin size={11} /> {shown.route.distance_km.toFixed(1)} km
            </span>
            {shown.route.elevation_m != null && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Mountain size={11} /> {Math.round(shown.route.elevation_m)} m
              </span>
            )}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Clock size={11} /> {fmtDuration(shown.route.avg_time_s, de)}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Repeat size={11} /> {shown.route.times_ridden}×
            </span>
          </div>
        </div>
      </div>

      {/* Why this one — and, when the evidence is thin, that it IS thin. */}
      <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--color-ink-2)', margin: 0 }}>
        {shown.is_virtual
          ? de
            ? 'Eine Indoor-Runde — passt zur Vorgabe, aber nicht zur Straße.'
            : 'An indoor route — it fits the target, but not the road.'
          : shown.route.avg_tss != null
            ? de
              ? `Diese Runde kostet dich sonst rund ${Math.round(shown.route.avg_tss)} TSS bei ${fmtDuration(shown.route.avg_time_s, de)}.`
              : `This loop usually costs you about ${Math.round(shown.route.avg_tss)} TSS in ${fmtDuration(shown.route.avg_time_s, de)}.`
            : de
              ? 'Passt von der Dauer — wie hart sie dich fordert, wissen wir noch nicht.'
              : 'The length fits — how hard it works you, we do not know yet.'}
        {shown.is_low_confidence && (
          <>
            {' '}
            <span style={{ color: 'var(--color-muted)' }}>
              {de
                ? `Erst ${shown.route.times_ridden}× gefahren — die Zahlen sind noch dünn.`
                : `Ridden only ${shown.route.times_ridden}× — the numbers are still thin.`}
            </span>
          </>
        )}
      </p>

      {hasAlternatives && (
        <>
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              alignSelf: 'flex-start',
              fontSize: 12.5,
              fontWeight: 620,
              color: 'var(--color-accent)',
            }}
          >
            <Shuffle size={13} />
            {showAll
              ? de ? 'Auswahl schließen' : 'Close picker'
              : de ? 'Andere Runde' : 'Different route'}
          </button>

          {showAll && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {all.map((f, i) => {
                const active = (chosenIdx ?? 0) === i
                return (
                  <button
                    key={`${f.route.name}-${i}`}
                    type="button"
                    onClick={() => {
                      setChosenIdx(i)
                      setShowAll(false)
                    }}
                    style={{
                      ...surface('recessed'),
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 10px',
                      textAlign: 'left',
                      border: active
                        ? '1px solid color-mix(in srgb, var(--color-accent) 45%, transparent)'
                        : '1px solid transparent',
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        fontSize: 13,
                        color: 'var(--color-ink)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {f.route.name || (de ? 'Unbenannt' : 'Unnamed')}
                    </span>
                    <span style={{ fontSize: 11.5, color: 'var(--color-muted)', flex: '0 0 auto' }}>
                      {f.route.distance_km.toFixed(0)} km · {fmtDuration(f.route.avg_time_s, de)}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}
    </section>
  )
}
