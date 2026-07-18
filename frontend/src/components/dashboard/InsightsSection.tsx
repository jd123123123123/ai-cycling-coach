/**
 * InsightsSection — the curated deep end (roadmap P0.5).
 *
 * Resurrects the genuinely-missing analytics as ONE section on Analyze:
 * AI-FTP framing (TrainerRoad's most-loved feature is marketing of a
 * capability we already have), PMC, training distribution, efficiency,
 * VO₂max, form progress — plus the `/dashboards` natural-language chart
 * workspace no competitor has. Every card is self-contained (own hooks).
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { subDays } from 'date-fns'
import { Link } from 'react-router-dom'
import { ChevronRight, Fingerprint, Gauge, MessageSquarePlus, Mountain, Trophy } from 'lucide-react'
import { apiClient } from '../../api/client'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { useLocale } from '../../contexts/LocaleContext'

const cardStyle = { background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' } as const

interface FtpHistoryResponse {
  current_ftp: number | null
  history: { ftp_watts: number; measured_at: string; source: string }[]
}

// AI-FTP framing: continuous detection from real rides, no test day. The
// confidence tier is an honest function of how much power data backs it.
function FtpConfidenceCard() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const today = useMemo(() => new Date(), [])
  const start = useMemo(() => subDays(today, 90), [today])
  const { data: ftp } = useQuery<FtpHistoryResponse>({
    queryKey: ['ftp', 'history'],
    queryFn: async () => (await apiClient.get<FtpHistoryResponse>('/athletes/me/ftp/history')).data,
    staleTime: 60 * 60 * 1000,
  })
  const { data: acts } = useActivitiesRange(start, today)

  const rides = (acts?.activities ?? []).filter((a) => a.sport === 'cycling' && a.tss != null).length
  const current = ftp?.current_ftp ?? null
  if (current == null) return null

  const tier = rides >= 20 ? 'high' : rides >= 8 ? 'medium' : 'low'
  const tierLabel = tier === 'high' ? (de ? 'hoch' : 'high') : tier === 'medium' ? (de ? 'mittel' : 'medium') : (de ? 'niedrig' : 'low')
  const tierColor = tier === 'high' ? 'var(--color-recovery)' : tier === 'medium' ? 'var(--color-amber)' : 'var(--color-muted)'
  const prev = ftp?.history && ftp.history.length >= 2 ? ftp.history[ftp.history.length - 2].ftp_watts : null
  const delta = prev != null ? current - prev : null

  return (
    <div className="rounded-[24px] p-5 flex flex-col gap-3" style={cardStyle}>
      <div className="flex items-center gap-2">
        <Gauge size={16} style={{ color: 'var(--color-accent)' }} />
        <span className="eyebrow" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--color-ink-2)' }}>
          {de ? 'FTP — OHNE TESTTAG' : 'FTP — NO TEST DAY NEEDED'}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="num-display" style={{ fontSize: 34, color: 'var(--color-ink)' }}>{current}</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-muted)' }}>W</span>
        {delta != null && delta !== 0 && (
          <span className="num-mono" style={{ fontSize: 13, fontWeight: 700, color: delta > 0 ? 'var(--color-recovery)' : 'var(--color-amber)' }}>
            {delta > 0 ? '+' : ''}{delta} W
          </span>
        )}
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.45 }}>
        {de
          ? `Fortlaufend aus deinen echten Fahrten erkannt — kein 20-Minuten-Test nötig. Vertrauen: `
          : `Detected continuously from your real rides — no 20-minute test required. Confidence: `}
        <span style={{ fontWeight: 700, color: tierColor }}>{tierLabel}</span>
        {de ? ` (${rides} Fahrten mit Last in 90 Tagen).` : ` (${rides} scored rides in 90 days).`}
        {tier === 'low' && (de ? ' Mehr harte Fahrten schärfen die Schätzung.' : ' A few more hard efforts will sharpen the estimate.')}
      </p>
    </div>
  )
}

export default function InsightsSection({ sport }: { sport: 'cycling' | 'running' | 'gym' | 'all' }) {
  const { locale } = useLocale()
  const de = locale === 'de'
  void sport
  // Deliberately curated DOWN (user feedback, July 18): the old-era donor
  // cards (PMC chart, TID, efficiency scatter, VO2, form panel) clashed with
  // the current design language — mixed locales, off-brand chips, scatter
  // plots. Depth stays reachable via /load-form and /progress/*; only cards
  // built to the current quality bar render here.
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5" style={{ marginTop: 8 }}>
        <span className="eyebrow" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', color: 'var(--color-accent)' }}>INSIGHTS</span>
        <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>
          {de ? 'Die Tiefe hinter deinem Training — alles aus echten Daten.' : 'The deep end of your training — all from real data.'}
        </span>
      </div>
      <FtpConfidenceCard />
      {/* Deep power science → the Power Profile page (.pen QLszB, built V2) */}
      <Link to="/power-profile" className="rounded-[24px] p-5 hover-card flex items-center gap-3.5" style={cardStyle}>
        <span className="grid place-items-center rounded-[14px] shrink-0" style={{ width: 46, height: 46, background: 'color-mix(in srgb, var(--color-violet) 16%, transparent)' }}>
          <Fingerprint size={22} style={{ color: 'var(--color-violet)' }} />
        </span>
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{de ? 'Dein Power-Profil' : 'Your power profile'}</span>
          <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
            {de ? 'Bestwerte, Critical Power, W′ und dein Fahrertyp — aus deinen Fahrten.' : 'Peak powers, Critical Power, W′ and your rider type — from your rides.'}
          </span>
        </div>
        <ChevronRight size={18} className="hover-arrow shrink-0" style={{ color: 'var(--color-violet)' }} />
      </Link>
      {/* Bike-native deep pages: climbs + achievements */}
      <div className="grid grid-cols-2 gap-3">
        <Link to="/climbs" className="rounded-[24px] p-4 hover-card flex flex-col gap-2" style={cardStyle}>
          <span className="grid place-items-center rounded-[12px]" style={{ width: 38, height: 38, background: 'color-mix(in srgb, var(--color-recovery) 15%, transparent)' }}>
            <Mountain size={19} style={{ color: 'var(--color-recovery)' }} />
          </span>
          <span className="num-display" style={{ fontSize: 14.5, color: 'var(--color-ink)' }}>{de ? 'Deine Anstiege' : 'Your climbs'}</span>
          <span style={{ fontSize: 11, color: 'var(--color-muted)', lineHeight: 1.35 }}>{de ? 'Profile, Pacing, Bestzeiten' : 'Profiles, pacing, PRs'}</span>
        </Link>
        <Link to="/achievements" className="rounded-[24px] p-4 hover-card flex flex-col gap-2" style={cardStyle}>
          <span className="grid place-items-center rounded-[12px]" style={{ width: 38, height: 38, background: 'color-mix(in srgb, var(--color-gold) 18%, transparent)' }}>
            <Trophy size={19} style={{ color: 'var(--color-gold)' }} />
          </span>
          <span className="num-display" style={{ fontSize: 14.5, color: 'var(--color-ink)' }}>{de ? 'Erfolge' : 'Achievements'}</span>
          <span style={{ fontSize: 11, color: 'var(--color-muted)', lineHeight: 1.35 }}>{de ? 'Echte Meilensteine, kein XP' : 'Real milestones, no XP'}</span>
        </Link>
      </div>
      {/* Power users → the NL chart workspace (no competitor has this) */}
      <Link to="/dashboards" className="rounded-[24px] p-5 hover-card flex items-center gap-3.5" style={{ ...cardStyle, borderColor: 'var(--color-accent)' }}>
        <span className="grid place-items-center rounded-[14px] shrink-0" style={{ width: 46, height: 46, background: 'color-mix(in srgb, var(--color-accent) 16%, transparent)' }}>
          <MessageSquarePlus size={22} style={{ color: 'var(--color-accent)' }} />
        </span>
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{de ? 'Baue jeden Chart — einfach fragen' : 'Build any chart — just ask'}</span>
          <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
            {de ? '„Zeig mir W/kg vs. HRV der letzten 90 Tage" — dein eigenes Analyse-Board.' : '“Show me W/kg vs. HRV for the last 90 days” — your own analytics board.'}
          </span>
        </div>
        <ChevronRight size={18} className="hover-arrow shrink-0" style={{ color: 'var(--color-accent)' }} />
      </Link>
    </div>
  )
}
