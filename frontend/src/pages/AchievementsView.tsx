/**
 * AchievementsView — built against pencil-new.pen "V2 · Achievements" (YOpJB,
 * content SIGni), translated to the app's token system and stripped of the
 * mock's loot mechanics per product decision: physiology + riding milestones
 * only — no XP, no levels, no login streaks.
 *
 * Card order follows the .pen: Header → hero ring (unlocked/total, gold) →
 * trophy cabinet (unlocked grid, gold medals + real unlock dates) → next
 * milestones (in-progress list with honest progress bars) → all-time tiles.
 *
 * Every number from GET /achievements/mine — detected server-side from the
 * athlete's own activities + PMC + altitude streams and persisted, so unlock
 * dates survive device switches (replaces the localStorage-v0 badges).
 */
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Bike, Flame, Gauge, Medal, Mountain, Route, Sparkles,
  TrendingUp, Trophy, Zap,
} from 'lucide-react'
import DashboardShell from '../components/dashboard/DashboardShell'
import { apiClient } from '../api/client'
import { useRideCounts } from '../hooks/usePowerProfile'
import { useLocale } from '../contexts/LocaleContext'

interface UnlockedItem {
  key: string
  icon: string
  title: string
  detail: string
  unlocked_at: string        // ISO yyyy-mm-dd — date of the triggering ride/day
  value_label: string | null // "133,1 km" · "Cat 4" · "286 W"
  fresh: boolean
}

interface ProgressItem {
  key: string
  icon: string
  title: string
  detail: string
  progress: { current: number; target: number; label: string } | null
  pct: number | null
}

interface AchievementsPayload {
  unlocked: UnlockedItem[]
  in_progress: ProgressItem[]
  counts: { unlocked: number; total: number }
  latest: UnlockedItem | null
  all_time: {
    rides: number
    km: number | null
    hours: number | null
    kj: number | null
    ascent_m: number | null
  }
}

const CARD = { background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)', borderRadius: 24 } as const
const ON_GOLD = '#0A0C0F' // ink-on-accent, same convention as PowerProfileView's toggle

const ICONS: Record<string, typeof Trophy> = {
  bike: Bike, trophy: Trophy, flame: Flame, route: Route, mountain: Mountain,
  'trending-up': TrendingUp, zap: Zap, gauge: Gauge,
}

function AchIcon({ name, size, color }: { name: string; size: number; color: string }) {
  const Cmp = ICONS[name] ?? Medal
  return <Cmp size={size} strokeWidth={2.2} style={{ color }} />
}

/** Gold donut — unlocked count over the catalog, .pen XPRing translated. */
function ProgressRing({ unlocked, total, de }: { unlocked: number; total: number; de: boolean }) {
  const size = 176
  const stroke = 14
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const frac = total > 0 ? unlocked / total : 0
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-surface-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="var(--color-gold)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - frac)}
          style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(.22,1,.36,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.22em', fontWeight: 700, color: 'var(--color-muted)' }}>
          {de ? 'FREIGESCHALTET' : 'UNLOCKED'}
        </span>
        <span className="num-display" style={{ fontSize: 56, lineHeight: 1, color: 'var(--color-ink)' }}>{unlocked}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-gold)' }}>
          {de ? `von ${total}` : `of ${total}`}
        </span>
      </div>
    </div>
  )
}

export default function AchievementsView() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const navigate = useNavigate()
  const { data } = useQuery<AchievementsPayload>({
    queryKey: ['achievements', 'mine', locale],
    queryFn: async () =>
      (await apiClient.get<AchievementsPayload>('/achievements/mine', { params: { lang: de ? 'de' : 'en' } })).data,
    staleTime: 5 * 60 * 1000,
  })
  // ONE honest denominator (audit P0-5): the shared /analytics/ride-counts total.
  const { data: rideCounts } = useRideCounts()

  const fmtDate = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(de ? 'de-DE' : 'en-US', {
        day: 'numeric', month: 'short', year: 'numeric',
      }).format(new Date(`${iso}T12:00:00`))
    } catch {
      return iso
    }
  }
  const fmtNum = (v: number) => v.toLocaleString(de ? 'de-DE' : 'en-US')

  const unlocked = data?.unlocked ?? []
  const inProgress = data?.in_progress ?? []
  const counts = data?.counts ?? { unlocked: 0, total: 0 }
  const remaining = counts.total - counts.unlocked

  const allTime: { icon: typeof Trophy; color: string; value: string; label: string }[] = data
    ? [
        {
          icon: Route, color: 'var(--color-strain)',
          value: data.all_time.km != null ? fmtNum(Math.round(data.all_time.km)) : '—',
          label: de ? 'km gefahren' : 'km ridden',
        },
        {
          icon: Mountain, color: 'var(--color-recovery)',
          value: data.all_time.ascent_m != null ? fmtNum(Math.round(data.all_time.ascent_m)) : '—',
          label: de ? 'Höhenmeter' : 'm climbed',
        },
        {
          icon: Bike, color: 'var(--color-accent)',
          value: fmtNum(rideCounts?.total_rides ?? data.all_time.rides),
          label: de ? 'Fahrten (gesamt)' : 'rides (all-time)',
        },
      ]
    : []

  return (
    <DashboardShell>
      <div className="mx-auto flex flex-col gap-5 px-4 pb-24 pt-3" style={{ maxWidth: 640 }}>
        {/* ── Header (.pen ysDvJ) ── */}
        <div className="flex items-center gap-3">
          <button
            type="button" onClick={() => navigate(-1)} aria-label={de ? 'Zurück' : 'Back'}
            className="grid place-items-center rounded-full"
            style={{ width: 40, height: 40, background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' }}
          >
            <ArrowLeft size={18} style={{ color: 'var(--color-ink-2)' }} />
          </button>
          <div className="flex flex-col">
            <h1 className="num-display" style={{ fontSize: 26, color: 'var(--color-ink)' }}>
              {de ? 'Erfolge' : 'Achievements'}
            </h1>
            <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
              {de
                ? 'Echte Meilensteine aus deinen Fahrten — kein XP, keine Streaks'
                : 'Real milestones from your riding — no XP, no streaks'}
            </span>
          </div>
        </div>

        {/* ── Hero ring (gold card, .pen XmQr1) ── */}
        {data && (
        <div className="flex flex-col items-center gap-4 p-5" style={{ ...CARD, borderColor: 'var(--color-gold)' }}>
          <div className="flex w-full items-center justify-between">
            <span className="eyebrow" style={{ fontSize: 11.5, letterSpacing: '0.14em', fontWeight: 700, color: 'var(--color-ink-2)' }}>
              {de ? 'MEILENSTEINE' : 'MILESTONES'}
            </span>
            {data?.latest?.fresh && (
              <span
                className="eyebrow rounded-full px-2.5 py-1"
                style={{ fontSize: 10, letterSpacing: '0.14em', fontWeight: 700, background: 'var(--color-gold-soft)', color: 'var(--color-gold)' }}
              >
                {de ? 'NEU' : 'NEW'}
              </span>
            )}
          </div>
          <ProgressRing unlocked={counts.unlocked} total={counts.total} de={de} />
          {data?.latest ? (
            <div className="flex flex-col items-center gap-0.5">
              <span className="num-display" style={{ fontSize: 22, color: 'var(--color-ink)' }}>{data.latest.title}</span>
              <span style={{ fontSize: 12.5, color: 'var(--color-muted)' }}>
                {de ? 'Zuletzt freigeschaltet' : 'Latest unlock'} · {fmtDate(data.latest.unlocked_at)}
                {data.latest.value_label ? ` · ${data.latest.value_label}` : ''}
              </span>
            </div>
          ) : (
            data && (
              <span style={{ fontSize: 13, color: 'var(--color-muted)', textAlign: 'center' }}>
                {de ? 'Noch nichts freigeschaltet — fahr los.' : 'Nothing unlocked yet — go ride.'}
              </span>
            )
          )}
          <div className="w-full rounded-full" style={{ height: 10, background: 'var(--color-surface-2)' }}>
            <div
              className="rounded-full"
              style={{
                height: 10,
                width: `${counts.total > 0 ? Math.round((counts.unlocked / counts.total) * 100) : 0}%`,
                background: 'var(--color-gold)',
                transition: 'width 600ms cubic-bezier(.22,1,.36,1)',
              }}
            />
          </div>
          <div className="flex w-full items-center justify-between">
            <span className="num-mono" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--color-ink)' }}>
              {de ? `${counts.unlocked} von ${counts.total} freigeschaltet` : `${counts.unlocked} of ${counts.total} unlocked`}
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--color-muted)' }}>
              {de ? `${remaining} offen` : `${remaining} to chase`}
            </span>
          </div>
        </div>
        )}

        {/* ── Trophy cabinet — unlocked grid (.pen E5nNY) ── */}
        {data && (
        <div className="flex flex-col gap-4 p-5" style={CARD}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy size={16} style={{ color: 'var(--color-gold)' }} />
              <span className="eyebrow" style={{ fontSize: 11.5, letterSpacing: '0.14em', fontWeight: 700, color: 'var(--color-ink-2)' }}>
                {de ? 'TROPHÄENSCHRANK' : 'TROPHY CABINET'}
              </span>
            </div>
            <span className="num-mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-muted)' }}>
              {counts.unlocked} / {counts.total}
            </span>
          </div>
          {unlocked.length > 0 ? (
            <div className="grid grid-cols-4 gap-x-2 gap-y-4">
              {unlocked.map((u) => (
                <div key={u.key} className="flex flex-col items-center gap-1.5" title={`${u.detail} · ${fmtDate(u.unlocked_at)}`}>
                  <div className="relative">
                    <div
                      className="grid place-items-center rounded-full"
                      style={{
                        width: 56, height: 56,
                        background: 'linear-gradient(135deg, var(--color-gold), color-mix(in srgb, var(--color-gold) 55%, var(--color-accent)))',
                        boxShadow: '0 6px 18px -6px var(--color-gold-soft)',
                      }}
                    >
                      <AchIcon name={u.icon} size={22} color={ON_GOLD} />
                    </div>
                    {u.fresh && (
                      <span
                        className="absolute -right-1 -top-1 grid place-items-center rounded-full"
                        style={{ width: 18, height: 18, background: 'var(--color-gold)', border: '2px solid var(--color-paper-2)' }}
                        aria-label={de ? 'Neu' : 'New'}
                      >
                        <Sparkles size={9} style={{ color: ON_GOLD }} />
                      </span>
                    )}
                  </div>
                  <span className="text-center" style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink)', lineHeight: 1.2 }}>
                    {u.title}
                  </span>
                  <span className="num-mono text-center" style={{ fontSize: 9.5, color: 'var(--color-muted)', lineHeight: 1.2 }}>
                    {u.value_label ? `${u.value_label} · ` : ''}{fmtDate(u.unlocked_at)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            data && (
              <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                {de
                  ? 'Noch keine Trophäen — jede Fahrt zählt für die ersten Meilensteine.'
                  : 'No trophies yet — every ride counts toward the first milestones.'}
              </p>
            )
          )}
        </div>
        )}

        {/* ── In progress — honest progress bars (.pen k9mqq, sans XP) ── */}
        {inProgress.length > 0 && (
          <div className="flex flex-col gap-4 p-5" style={CARD}>
            <div className="flex items-center gap-2">
              <TrendingUp size={16} style={{ color: 'var(--color-gold)' }} />
              <span className="eyebrow" style={{ fontSize: 11.5, letterSpacing: '0.14em', fontWeight: 700, color: 'var(--color-ink-2)' }}>
                {de ? 'NÄCHSTE MEILENSTEINE' : 'NEXT MILESTONES'}
              </span>
            </div>
            {inProgress.map((p) => (
              <div key={p.key} className="flex flex-col gap-2.5">
                <div className="flex items-center gap-3">
                  <div
                    className="grid shrink-0 place-items-center"
                    style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--color-gold-soft)' }}
                  >
                    <AchIcon name={p.icon} size={17} color="var(--color-gold)" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--color-ink)' }}>{p.title}</span>
                    <span style={{ fontSize: 11.5, color: 'var(--color-muted)', lineHeight: 1.35 }}>
                      {p.progress ? p.progress.label : p.detail}
                    </span>
                  </div>
                  {p.pct != null && (
                    <span className="num-mono shrink-0" style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-gold)' }}>
                      {Math.round(p.pct * 100)}%
                    </span>
                  )}
                </div>
                {p.pct != null && (
                  <div className="w-full overflow-hidden rounded-full" style={{ height: 8, background: 'var(--color-surface-2)' }}>
                    <div
                      className="rounded-full"
                      style={{ height: 8, width: `${Math.max(2, Math.round(p.pct * 100))}%`, background: 'var(--color-gold)' }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── All-time tiles (.pen m4J4x) ── */}
        {data && (
          <div className="flex flex-col gap-2.5">
            <span className="eyebrow px-1" style={{ fontSize: 11, letterSpacing: '0.14em', fontWeight: 700, color: 'var(--color-muted)' }}>
              {de ? 'GESAMT' : 'ALL-TIME'}
            </span>
            <div className="grid grid-cols-3 gap-3">
              {allTime.map((s, i) => (
                <div key={i} className="flex flex-col gap-2 p-4" style={CARD}>
                  <s.icon size={18} style={{ color: s.color }} />
                  <span className="num-display" style={{ fontSize: 22, color: 'var(--color-ink)' }}>{s.value}</span>
                  <span style={{ fontSize: 10.5, color: 'var(--color-muted)' }}>{s.label}</span>
                </div>
              ))}
            </div>
            <p className="px-1" style={{ fontSize: 10.5, color: 'var(--color-muted)', lineHeight: 1.4 }}>
              {de
                ? 'Alles aus deinen eigenen Aufzeichnungen — Höhenmeter aus deinen Höhendaten, sonst „—".'
                : 'All from your own recordings — climbing from your altitude data, otherwise "—".'}
            </p>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
