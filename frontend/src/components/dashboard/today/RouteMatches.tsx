import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Mountain, Clock, Repeat, MapPin, TrendingUp, ChevronDown } from 'lucide-react'
import { apiClient } from '../../../api/client'
import { useLocale } from '../../../contexts/LocaleContext'
import RouteSketch from '../../ui/RouteSketch'

/**
 * RouteMatches — the roads of the athlete's own that suit today's session.
 *
 * Lives INSIDE the session card, because "which road" is part of the answer to
 * "what am I riding today", not a separate question asked further down the
 * page. It renders as one of the card's inner panels and owns no card chrome.
 *
 * ── One, then the field ──────────────────────────────────────────────────
 * The best match is shown on its own and the rest expand on tap. Both halves
 * of that matter: the session card is already dense, and five roads at equal
 * weight would turn a glanceable answer into a menu to work through — but the
 * field has to be REACHABLE, because several roads genuinely fit a given
 * session and the athlete chooses between them on things the model cannot see
 * (traffic, who they are riding with, whether they can face that climb today).
 * Collapsed it reads as an answer; expanded it admits it is a preference.
 * The count is on the toggle so the choice is visible before it is opened.
 *
 * ── Why the chips matter ─────────────────────────────────────────────────
 * The backend returns a per-term breakdown (length, intensity, terrain, climb)
 * and never the copy. The chips say WHICH of those a road actually won on, so
 * "this one is right" is inspectable rather than asserted: a road can be the
 * right length and the wrong shape, and the athlete should be able to see that
 * before committing two hours to it.
 *
 * Renders nothing when the backend cannot make a confident suggestion — rest
 * day, no planned ride, no GPS history, no target. Those are stated as
 * machine-readable reasons, and none of them deserve a placeholder.
 */

interface RouteSummary {
  name: string | null
  times_ridden: number
  distance_km: number
  elevation_m: number | null
  avg_time_s: number | null
  avg_tss: number | null
  last_ridden: string | null
  is_virtual: boolean
  polyline: [number, number][]
  longest_climb_m: number | null
  max_gradient_pct: number | null
  climb_share_pct: number | null
}

interface Fit {
  route: RouteSummary
  score: number
  raw_fit: number
  duration_fit: number | null
  tss_fit: number | null
  terrain_fit: number | null
  climb_fit: number | null
  is_low_confidence: boolean
  is_virtual: boolean
  is_recently_ridden: boolean
}

interface Recommendation {
  available: boolean
  reason?: string
  planned?: {
    title: string | null
    target_tss: number | null
    duration_minutes: number | null
    category: string | null
  }
  matches?: Fit[]
  top?: Fit
}

function fmtDuration(seconds: number | null, de: boolean): string {
  if (!seconds) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')} h`
  return de ? `${m} Min` : `${m} min`
}

/** A term only earns a chip when it genuinely matched. */
const CHIP_THRESHOLD = 0.7

function chipsFor(fit: Fit, de: boolean): string[] {
  const out: string[] = []
  if ((fit.duration_fit ?? 0) >= CHIP_THRESHOLD) out.push(de ? 'Länge' : 'Length')
  if ((fit.tss_fit ?? 0) >= CHIP_THRESHOLD) out.push(de ? 'Intensität' : 'Intensity')
  if ((fit.terrain_fit ?? 0) >= CHIP_THRESHOLD) out.push(de ? 'Profil' : 'Profile')
  if ((fit.climb_fit ?? 0) >= CHIP_THRESHOLD) out.push(de ? 'Anstieg' : 'Climb')
  return out
}

/** Terrain in the words a rider uses, from the measured climb share. */
function terrainWord(share: number | null, de: boolean): string | null {
  if (share == null) return null
  if (share < 6) return de ? 'flach' : 'flat'
  if (share < 18) return de ? 'wellig' : 'rolling'
  if (share < 35) return de ? 'hügelig' : 'hilly'
  return de ? 'bergig' : 'mountainous'
}

export default function RouteMatches() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const [expanded, setExpanded] = useState(false)

  const { data } = useQuery({
    queryKey: ['routes', 'recommended'],
    queryFn: async () => (await apiClient.get<Recommendation>('/routes/recommended')).data,
    staleTime: 10 * 60 * 1000,
  })

  const matches = data?.matches ?? (data?.top ? [data.top] : [])
  // Honest silence: the backend states exactly why it cannot suggest, and none
  // of those reasons are worth a placeholder inside the session card.
  if (!data?.available || matches.length === 0) return null

  const shown = expanded ? matches : matches.slice(0, 1)
  const hidden = matches.length - shown.length

  return (
    <div
      className="rounded-2xl p-3.5 flex flex-col gap-2.5"
      style={{
        background: 'color-mix(in srgb, var(--color-paper) 55%, transparent)',
        border: '1px solid var(--color-rule)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="eyebrow"
          style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--color-ink-2)' }}
        >
          {de ? 'STRECKEN, DIE PASSEN' : 'ROADS THAT FIT'}
        </span>
        {data.planned?.duration_minutes != null && (
          <span style={{ fontSize: 10.5, color: 'var(--color-muted)' }}>
            {`${Math.round(data.planned.duration_minutes)} ${de ? 'Min' : 'min'}`}
            {data.planned.target_tss != null && ` · ${Math.round(data.planned.target_tss)} TSS`}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {shown.map((f, i) => {
          const r = f.route
          const chips = chipsFor(f, de)
          const terrain = terrainWord(r.climb_share_pct, de)
          // The leader gets the accent; the rest are a ranked field, not
          // rejects, so they stay legible rather than greyed out.
          const lead = i === 0
          return (
            <div
              key={`${r.name}-${i}`}
              className="flex items-center gap-2.5 rounded-[14px]"
              style={{
                padding: '7px 8px',
                background: lead
                  ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)'
                  : 'transparent',
                border: `1px solid ${lead ? 'color-mix(in srgb, var(--color-accent) 32%, transparent)' : 'transparent'}`,
              }}
            >
              <RouteSketch
                polyline={r.polyline}
                width={52}
                height={38}
                pad={4}
                radius={10}
                background="var(--color-surface-2)"
                color={f.is_virtual ? 'var(--color-strain)' : 'var(--color-accent)'}
              />

              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 620,
                    color: 'var(--color-ink)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {r.name || (de ? 'Unbenannte Runde' : 'Unnamed loop')}
                </span>

                <div
                  className="flex items-center gap-2 flex-wrap"
                  style={{ fontSize: 10.5, color: 'var(--color-muted)' }}
                >
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={10} /> {r.distance_km.toFixed(0)} km
                  </span>
                  {r.elevation_m != null && (
                    <span className="inline-flex items-center gap-1">
                      <Mountain size={10} /> {Math.round(r.elevation_m)} m
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Clock size={10} /> {fmtDuration(r.avg_time_s, de)}
                  </span>
                  {/* The steepest pitch is the number that decides whether an
                      athlete is willing to ride a road at all on a given day. */}
                  {r.max_gradient_pct != null && r.max_gradient_pct >= 4 && (
                    <span className="inline-flex items-center gap-1">
                      <TrendingUp size={10} /> {r.max_gradient_pct.toFixed(0)}%
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Repeat size={10} /> {r.times_ridden}×
                  </span>
                </div>

                {(chips.length > 0 || terrain) && (
                  <div className="flex items-center gap-1 flex-wrap">
                    {terrain && (
                      <span
                        className="rounded-full"
                        style={{
                          padding: '1px 6px',
                          fontSize: 9.5,
                          fontWeight: 700,
                          color: 'var(--color-ink-2)',
                          background: 'var(--color-surface-2)',
                        }}
                      >
                        {terrain}
                      </span>
                    )}
                    {chips.map((c) => (
                      <span
                        key={c}
                        className="rounded-full"
                        style={{
                          padding: '1px 6px',
                          fontSize: 9.5,
                          fontWeight: 700,
                          color: 'var(--color-recovery)',
                          background: 'color-mix(in srgb, var(--color-recovery) 13%, transparent)',
                        }}
                      >
                        {c}
                      </span>
                    ))}
                    {f.is_virtual && (
                      <span
                        className="rounded-full"
                        style={{
                          padding: '1px 6px',
                          fontSize: 9.5,
                          fontWeight: 700,
                          color: 'var(--color-strain)',
                          background: 'color-mix(in srgb, var(--color-strain) 13%, transparent)',
                        }}
                      >
                        {de ? 'Indoor' : 'Indoor'}
                      </span>
                    )}
                    {/* Thin evidence is stated, not hidden — one ride's median
                        is one number from one day. */}
                    {f.is_low_confidence && (
                      <span style={{ fontSize: 9.5, color: 'var(--color-muted)' }}>
                        {de ? 'wenig Daten' : 'thin data'}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {matches.length > 1 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1.5 self-start"
          style={{ fontSize: 11.5, fontWeight: 620, color: 'var(--color-accent)', minHeight: 32 }}
          aria-expanded={expanded}
        >
          <ChevronDown
            size={13}
            style={{
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.18s ease',
            }}
          />
          {expanded
            ? de ? 'Weniger zeigen' : 'Show fewer'
            : de ? `${hidden} weitere Strecken` : `${hidden} more roads`}
        </button>
      )}
    </div>
  )
}
