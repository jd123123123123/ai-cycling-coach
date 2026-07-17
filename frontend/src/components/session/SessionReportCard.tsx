import { Link } from 'react-router-dom'
import { Bike, Footprints, ChevronRight } from 'lucide-react'
import type { SessionReport, SessionKPI, Sentiment } from '../../api/sessionReport'
import { useLocale } from '../../contexts/LocaleContext'

// The per-activity "rated against the prescription" card. Renders whatever
// KPIs the backend sends (sport-aware) — this view stays dumb; all the
// bike-vs-run logic lives server-side.

function sentimentColor(s: Sentiment): string {
  switch (s) {
    case 'good': return 'var(--color-good)'
    case 'caution': return 'var(--color-caution)'
    case 'bad': return 'var(--color-bad)'
    default: return 'var(--color-muted)'
  }
}

// grade → verdict letter + ring colour. The backend grade vocabulary is
// perfect|strong|okay|overcooked|undercooked.
function gradeDisplay(grade: string | null): { letter: string; color: string } {
  switch (grade) {
    case 'perfect': return { letter: 'A', color: 'var(--color-good)' }
    case 'strong': return { letter: 'B', color: 'var(--color-good)' }
    case 'okay': return { letter: 'C', color: 'var(--color-caution)' }
    case 'overcooked': return { letter: 'D', color: 'var(--color-bad)' }
    case 'undercooked': return { letter: 'D', color: 'var(--color-bad)' }
    default: return { letter: '—', color: 'var(--color-muted)' }
  }
}

function VerdictRing({ score, color, letter }: { score: number; color: string; letter: string }) {
  const pct = Math.max(0, Math.min(100, score))
  return (
    <div
      className="relative shrink-0 grid place-items-center"
      style={{
        width: 78, height: 78, borderRadius: '50%',
        background: `conic-gradient(${color} ${pct}%, rgba(255,255,255,.07) 0)`,
      }}
      aria-label={`Grade ${letter}, ${score} out of 100`}
    >
      <div className="absolute rounded-full" style={{ inset: 7, background: 'var(--color-paper-2)' }} />
      <span className="relative font-serif" style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: 30, lineHeight: 1, color }}>{letter}</span>
      <span className="relative num-mono" style={{ fontSize: 8.5, letterSpacing: '.14em', color: 'var(--color-muted)', marginTop: 2 }}>{Math.round(score)}/100</span>
    </div>
  )
}

// One prescribed-vs-actual row. The green band is the prescribed zone (±10%);
// the marker is where the athlete landed, coloured by sentiment.
function KPIRow({ kpi }: { kpi: SessionKPI }) {
  const markerPct = Math.max(5, Math.min(95, 50 + kpi.delta_pct))
  const col = sentimentColor(kpi.sentiment)
  const badgeCol = sentimentColor(kpi.sentiment)
  return (
    <div className="py-3.5" style={{ borderTop: '1px solid var(--color-rule)' }}>
      <div className="flex items-baseline justify-between gap-3">
        <span style={{ fontSize: 13.5, color: 'var(--color-ink-2)' }}>{kpi.label}</span>
        <span className="num-mono flex items-baseline gap-2" style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ color: 'var(--color-muted)' }}>{kpi.target_display}</span>
          <span style={{ color: 'var(--color-muted)' }}>→</span>
          <span style={{ color: 'var(--color-ink)', fontWeight: 500 }}>{kpi.actual_display}</span>
          <span
            className="rounded-md px-1.5"
            style={{ fontSize: 10.5, color: badgeCol, background: `color-mix(in srgb, ${badgeCol} 14%, transparent)` }}
          >{kpi.delta_display}</span>
        </span>
      </div>
      {/* target-band bar */}
      <div className="relative mt-2.5" style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,.06)' }}>
        <div
          className="absolute"
          style={{
            top: 0, bottom: 0, left: '40%', width: '20%', borderRadius: 999,
            background: 'color-mix(in srgb, var(--color-good) 24%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-good) 45%, transparent)',
          }}
        />
        <div
          className="absolute"
          style={{
            top: '50%', left: `${markerPct}%`, width: 13, height: 13, borderRadius: '50%',
            transform: 'translate(-50%,-50%)', background: col,
            border: '2.5px solid var(--color-paper-2)', boxShadow: '0 0 0 1px rgba(0,0,0,.4)',
          }}
        />
      </div>
    </div>
  )
}

const SecLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="num-mono" style={{ fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--color-muted)', padding: '16px 0 4px' }}>{children}</div>
)

export default function SessionReportCard({ report }: { report: SessionReport }) {
  const { locale } = useLocale()
  const de = locale === 'de'
  const g = gradeDisplay(report.grade)
  const isRun = report.sport === 'running'
  const accent = isRun ? 'var(--color-sport-run)' : 'var(--color-sport-bike)'
  const SportIcon = isRun ? Footprints : Bike
  const dateLabel = (() => {
    try { return new Date(report.date).toLocaleDateString(de ? 'de-DE' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }
    catch { return report.date }
  })()
  const durH = Math.floor(report.duration_minutes / 60)
  const durM = Math.round(report.duration_minutes % 60)
  const durStr = durH > 0 ? `${durH}:${String(durM).padStart(2, '0')}` : `${durM} min`

  return (
    <div
      className="rounded-[22px] overflow-hidden"
      style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)', boxShadow: 'var(--shadow-2), var(--shadow-glass-rim)' }}
    >
      {/* header */}
      <div className="px-6 pt-6 flex flex-col gap-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span
            className="num-mono inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
            style={{ fontSize: 11, letterSpacing: '.06em', color: accent, border: `1px solid color-mix(in srgb, ${accent} 40%, transparent)` }}
          >
            <SportIcon size={12} strokeWidth={2} />{isRun ? (de ? 'LAUF' : 'RUN') : (de ? 'RAD' : 'RIDE')}
          </span>
          <span className="eyebrow" style={{ fontSize: 10.5, letterSpacing: '.2em', color: 'var(--color-muted)' }}>{de ? 'Einheiten-Report' : 'Session Report'}</span>
        </div>
        <h1 className="font-serif" style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: 27, lineHeight: 1.08, letterSpacing: '-.01em', color: 'var(--color-ink)', textWrap: 'balance' }}>{report.title}</h1>
        <div className="num-mono flex gap-2 flex-wrap" style={{ fontSize: 12, color: 'var(--color-muted)' }}>
          <span>{dateLabel}</span><span>·</span>
          {report.distance_km != null && (<><b style={{ color: 'var(--color-ink-2)', fontWeight: 500 }}>{report.distance_km.toFixed(1)} km</b><span>·</span></>)}
          <b style={{ color: 'var(--color-ink-2)', fontWeight: 500 }}>{durStr}</b>
        </div>
      </div>

      {/* verdict */}
      <div className="px-6 py-5 flex items-center gap-5" style={{ borderBottom: '1px solid var(--color-rule)' }}>
        <VerdictRing score={report.grade_score} color={g.color} letter={g.letter} />
        <div className="min-w-0">
          {report.prescribed_title && (
            <span className="num-mono block" style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: accent, marginBottom: 5 }}>
              {de ? 'Verordnet: ' : 'Prescribed: '}{report.prescribed_title}
            </span>
          )}
          <p className="font-serif" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 18.5, lineHeight: 1.32, color: 'var(--color-ink)', textWrap: 'pretty', margin: 0 }}>{report.headline}</p>
        </div>
      </div>

      {/* KPIs */}
      {report.kpis.length > 0 && (
        <div className="px-6">
          <SecLabel>{de ? 'Verordnet vs. tatsächlich' : 'Prescribed vs actual'}</SecLabel>
          <div>{report.kpis.map((k) => <KPIRow key={k.key} kpi={k} />)}</div>
        </div>
      )}

      {/* what it means */}
      {report.reads.length > 0 && (
        <div className="px-6">
          <SecLabel>{de ? 'Was das bedeutet' : 'What it means'}</SecLabel>
          <div>
            {report.reads.map((r, i) => {
              const tone = r.tone === 'ok' ? 'var(--color-good)' : r.tone === 'down' ? 'var(--color-bad)' : 'var(--color-caution)'
              const glyph = r.tone === 'ok' ? '✓' : r.tone === 'down' ? '↓' : '↑'
              return (
                <div key={i} className="flex gap-3 py-3" style={{ borderTop: '1px solid var(--color-rule)' }}>
                  <span className="shrink-0 grid place-items-center" style={{ width: 22, height: 22, borderRadius: 7, marginTop: 1, fontSize: 12, color: tone, background: `color-mix(in srgb, ${tone} 14%, transparent)` }}>{glyph}</span>
                  <div>
                    <h4 style={{ margin: '0 0 2px', fontSize: 13.5, fontWeight: 600, color: 'var(--color-ink)' }}>{r.title}</h4>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.5 }}>{r.detail}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* next session */}
      {report.next_session && (
        <div
          className="mx-6 my-5 rounded-[16px] px-[18px] py-4"
          style={{ background: `color-mix(in srgb, ${accent} 8%, var(--color-paper))`, border: `1px solid color-mix(in srgb, ${accent} 30%, var(--color-rule))` }}
        >
          <span className="num-mono" style={{ fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: accent }}>{report.next_session.label}</span>
          <h3 className="font-serif" style={{ fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 600, letterSpacing: '-.01em', margin: '6px 0 4px', color: 'var(--color-ink)' }}>{report.next_session.headline}</h3>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-ink-2)' }}>{report.next_session.detail}</p>
        </div>
      )}

      {/* detail strip */}
      {report.detail_metrics.length > 0 && (
        <div className="px-6 pb-5">
          <SecLabel>{de ? 'Die Zahlen' : 'The numbers'}</SecLabel>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${Math.min(4, report.detail_metrics.length)}, 1fr)` }}>
            {report.detail_metrics.map((m, i) => (
              <div key={i} className="rounded-[12px] px-3 py-2.5" style={{ background: 'var(--color-paper)', border: '1px solid var(--color-rule)' }}>
                <div className="num-mono" style={{ fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>{m.label}</div>
                <div className="num-mono" style={{ fontSize: 16, marginTop: 3, fontVariantNumeric: 'tabular-nums', color: 'var(--color-ink)' }}>{m.value}{m.unit && <small style={{ fontSize: 11, color: 'var(--color-ink-2)', marginLeft: 3 }}>{m.unit}</small>}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* full analysis link */}
      {report.debrief_available && (
        <Link
          to={`/activities/${report.activity_id}/debrief`}
          className="flex items-center justify-between px-6 py-4"
          style={{ borderTop: '1px solid var(--color-rule)', color: 'var(--color-ink-2)', fontSize: 13 }}
        >
          <span>{de ? 'Vollständige Fahrt-Analyse' : 'Full ride analysis'} — {de ? 'Verläufe, Anstiege, Pacing' : 'story, climbs, pacing'}</span>
          <ChevronRight size={16} strokeWidth={2} />
        </Link>
      )}
    </div>
  )
}
