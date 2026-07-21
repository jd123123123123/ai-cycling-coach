/**
 * PowerProfileView — a 1:1 build of the pencil frame "V3 · Power Profile"
 * (QLszB / content C1Cuk2): Header → Power Curve card (mean-max hero bars +
 * recent-PR callout) → FTP · Threshold card (hero W + W/kg + monthly FTP
 * progression) → Power Zones card (Coggan, from FTP) → Phenotype card (violet,
 * rider type + trait bars + training-consequence line) → Benchmark card (cohort
 * bands) → Sprint & Pedaling card (fatigue resistance + left/right balance).
 *
 * Every number comes from GET /analytics/power-profile-view — derived from the
 * athlete's OWN ride power, no external service. Where a figure can't be
 * derived (no weight → no W/kg, no pedal-balance channel, too few rides → no
 * phenotype) the UI renders an honest "—", never a fabricated value.
 */
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Share2, LineChart, Zap, Trophy, TrendingUp, Info,
  Bolt, BarChart3, Flag, Pencil, X,
} from 'lucide-react'
import DashboardShell from '../components/dashboard/DashboardShell'
import { usePowerProfileView } from '../hooks/usePowerProfileView'
import { useAthleteProfile } from '../hooks/useAthleteProfile'
import { updateProfile } from '../api/athletes'
import { useLocale } from '../contexts/LocaleContext'
import { useGlossary } from '../components/ui/GlossarySheet'

const DASH = '—'
const RADIUS = 24
const CARD = { background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)', borderRadius: RADIUS } as const
const TAPPABLE = { textDecoration: 'underline dotted', textUnderlineOffset: 3, textDecorationColor: 'var(--color-muted)' } as const

type Bench = NonNullable<NonNullable<ReturnType<typeof usePowerProfileView>['data']>['benchmark']>

export default function PowerProfileView() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const navigate = useNavigate()
  const glossary = useGlossary()
  const { data, isLoading } = usePowerProfileView()
  const profileQ = useAthleteProfile()
  const [editOpen, setEditOpen] = useState(false)

  const fmtInt = (v: number) => v.toLocaleString(de ? 'de-DE' : 'en-US', { maximumFractionDigits: 0 })
  const fmtWkg = (v: number) => (de ? v.toFixed(1).replace('.', ',') : v.toFixed(1))
  const fmtPct = (v: number) => (de ? `${v.toFixed(1).replace('.', ',')} %` : `${v.toFixed(1)}%`)

  const sectionHead = (icon: React.ReactNode, label: string) => (
    <div className="flex items-center gap-1.5">
      {icon}
      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink)' }}>{label}</span>
    </div>
  )

  if (data && data.available === false) {
    return (
      <DashboardShell>
        <div className="mx-auto px-4 pt-6 pb-24" style={{ maxWidth: 640 }}>
          <Header de={de} navigate={navigate} onEdit={() => setEditOpen(true)} />
          <p className="mt-6" style={{ fontSize: 14, color: 'var(--color-muted)', lineHeight: 1.5 }}>
            {de
              ? 'Noch keine Fahrten mit Powermeter — fahre mit Leistungsmesser und synchronisiere, dann baut sich dein Power-Profil aus deinen echten Efforts auf.'
              : 'No rides with a power meter yet — ride with a power meter and sync, and your power profile builds itself from your real efforts.'}
          </p>
        </div>
      </DashboardShell>
    )
  }

  const curve = data?.curve ?? []
  const maxWatts = Math.max(1, ...curve.map((c) => c.watts ?? 0))
  const HERO_ZONE = [6, 5, 4, 3, 2, 1] // 5s→zone-6 … 60min→zone-1 (pen BarRow)

  const threshold = data?.threshold_watts ?? null
  const thresholdWkg = data?.threshold_wkg ?? null
  const isManual = data?.threshold_source === 'manual'
  const prog = data?.ftp_progression ?? []
  const progMax = Math.max(1, ...prog.map((p) => p.watts))
  const ftpDelta = prog.length >= 2 ? prog[prog.length - 1].watts - prog[0].watts : null

  const zones = data?.zones ?? []
  const phen = data?.phenotype ?? null
  const bench = data?.benchmark ?? null
  const sp = data?.sprint_pedal

  return (
    <DashboardShell>
      <div className="mx-auto flex flex-col gap-6 px-4 pb-24 pt-3" style={{ maxWidth: 640 }}>
        <Header de={de} navigate={navigate} rides={data?.rides_with_power ?? null} onEdit={() => setEditOpen(true)} />

        {/* ── Power Curve card (accent border · pen mOAt3) ── */}
        <div className="flex flex-col gap-3.5" style={{ ...CARD, borderColor: 'var(--color-accent)', borderWidth: 1.5, padding: 18 }}>
          {sectionHead(<LineChart size={18} style={{ color: 'var(--color-accent)' }} />, de ? 'Mean-Max-Power' : 'Mean-max power')}
          <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-muted)' }}>
            {de ? 'Deine beste Durchschnittsleistung je Effort-Länge — vom Sprint bis zum langen Anstieg.' : 'Your best average power for each effort length — sprint to steady climb.'}
          </p>
          <div className="flex items-end gap-2">
            {curve.map((c, i) => {
              const has = c.watts != null
              const h = has ? Math.max(10, Math.round((c.watts! / maxWatts) * 150)) : 10
              return (
                <div key={c.seconds} className="flex flex-1 flex-col items-center gap-1.5">
                  {c.is_pr && has && (
                    <span className="rounded-full" style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-gold)', background: 'var(--color-gold-soft)', padding: '1px 6px' }}>PR</span>
                  )}
                  <span className="num-display" style={{ fontSize: 12, fontWeight: 700, color: c.is_pr && has ? 'var(--color-gold)' : 'var(--color-ink)' }}>
                    {has ? fmtInt(c.watts!) : DASH}
                  </span>
                  <div className="w-full" style={{ height: h, borderRadius: '8px 8px 3px 3px', background: has ? `var(--color-zone-${HERO_ZONE[i]})` : 'var(--color-surface-2)', opacity: has ? 0.95 : 0.5 }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}>{de ? c.label_de : c.label_en}</span>
                </div>
              )
            })}
          </div>
          <div style={{ height: 1, background: 'var(--color-rule)' }} />
          {data?.pr_note ? (
            <div className="flex items-center gap-2.5" style={{ borderRadius: 14, background: 'var(--color-gold-soft)', border: '1px solid var(--color-gold)', padding: '12px 13px' }}>
              <Trophy size={22} style={{ color: 'var(--color-gold)', flexShrink: 0 }} />
              <div className="flex flex-col gap-1">
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-gold)' }}>
                  {(() => {
                    const n = data.pr_note.count
                    if (de) return n === 1 ? 'Neuer Rekord!' : `${n} neue Rekorde!`
                    return n === 1 ? 'New record!' : `${n} new records!`
                  })()}
                </span>
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink-2)' }}>
                  {(() => {
                    const labels = (de ? data.pr_note.labels_de : data.pr_note.labels_en).join(' & ')
                    return de ? `Deine besten ${labels}-Werte, die du je gefahren bist.` : `Your best-ever ${labels} power.`
                  })()}
                </span>
              </div>
            </div>
          ) : (
            <p style={{ fontSize: 11.5, color: 'var(--color-muted)' }}>
              {de ? 'Bestwerte über all deine Fahrten mit Power.' : 'Best efforts across all your rides with power.'}
            </p>
          )}
        </div>

        {/* ── FTP · Threshold card (pen CEBwA) ── */}
        <div className="flex flex-col gap-3.5" style={{ ...CARD, padding: 18 }}>
          {sectionHead(<Zap size={18} style={{ color: 'var(--color-accent)' }} />, de ? 'FTP · Schwellenleistung' : 'FTP · Threshold power')}
          <div className="flex items-end justify-between">
            <div className="flex items-end gap-1.5">
              <span className="num-display" style={{ fontSize: 44, lineHeight: 1, color: 'var(--color-ink)' }}>{threshold != null ? fmtInt(threshold) : DASH}</span>
              <button type="button" onClick={() => glossary.open('ftp', threshold != null ? `${threshold} W` : null)} className="pb-2" style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-muted)', background: 'none', border: 0, cursor: 'pointer', ...TAPPABLE }}>
                W · {isManual ? 'FTP' : de ? 'FTP (geschätzt)' : 'FTP (est.)'}
              </button>
            </div>
            <div className="flex flex-col items-end pb-1.5">
              <span className="num-display" style={{ fontSize: 20, color: 'var(--color-recovery)' }}>{thresholdWkg != null ? `${fmtWkg(thresholdWkg)} W/kg` : DASH}</span>
              <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)' }}>{de ? 'Leistung fürs Gewicht' : 'power for your weight'}</span>
            </div>
          </div>
          <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink-2)' }}>
            {isManual
              ? de ? 'Aus deinem Profil — die eine Zahl, an der sich alles ausrichtet.' : 'From your profile — the one number everything keys off.'
              : de ? 'Fortlaufend aus deinen besten Efforts geschätzt — kein Testtag nötig.' : 'Continuously estimated from your best efforts — no test day required.'}
          </p>
          {prog.length > 0 && (
            <>
              <div style={{ height: 1, background: 'var(--color-rule)' }} />
              <div className="flex items-center justify-between">
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>{de ? 'FTP im Verlauf' : 'FTP over time'}</span>
                {ftpDelta != null && ftpDelta > 0 && (
                  <span className="flex items-center gap-1 rounded-full" style={{ background: 'color-mix(in srgb, var(--color-recovery) 15%, transparent)', padding: '3px 9px' }}>
                    <TrendingUp size={12} style={{ color: 'var(--color-recovery)' }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-recovery)' }}>
                      +{ftpDelta} W {de ? `seit ${prog[0].month_de}` : `since ${prog[0].month_en}`}
                    </span>
                  </span>
                )}
              </div>
              <div className="flex items-end gap-2.5">
                {prog.map((p) => (
                  <div key={p.month_en} className="flex flex-1 flex-col items-center gap-1.5">
                    <span className="num-display" style={{ fontSize: 11, fontWeight: 700, color: p.is_current ? 'var(--color-accent)' : 'var(--color-muted)' }}>{p.watts}</span>
                    <div className="w-full" style={{ height: Math.max(12, Math.round((p.watts / progMax) * 62)), borderRadius: '6px 6px 2px 2px', background: p.is_current ? 'var(--color-accent)' : 'var(--color-surface-3)' }} />
                    <span style={{ fontSize: 10, fontWeight: 600, color: p.is_current ? 'var(--color-ink-2)' : 'var(--color-muted)' }}>{de ? p.month_de : p.month_en}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── Power Zones card (pen R2B2fC) ── */}
        {zones.length > 0 && (
          <div className="flex flex-col gap-3.5 p-5" style={CARD}>
            <div className="flex flex-col gap-0.5">
              <span className="num-display" style={{ fontSize: 18, color: 'var(--color-ink)' }}>{de ? 'Leistungszonen' : 'Power Zones'}</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-muted)' }}>{de ? `Basierend auf FTP ${threshold} W` : `Based on FTP ${threshold} W`}</span>
            </div>
            <div className="flex flex-col gap-3">
              {zones.map((z) => (
                <div key={z.code} className="flex items-center gap-2.5">
                  <div style={{ width: 3, height: 26, borderRadius: 2, background: `var(--color-zone-${z.color_idx})` }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink)', width: 22 }}>{z.code}</span>
                  <span className="flex-1" style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-ink-2)' }}>{de ? z.name_de : z.name_en}</span>
                  <span className="num-display" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)' }}>
                    {z.low == null ? `≤ ${z.high} W` : z.high == null ? `${z.low} W +` : `${z.low}–${z.high} W`}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2" style={{ borderRadius: 14, background: 'var(--color-surface-2)', padding: '10px 12px' }}>
              <Info size={15} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink-2)' }}>
                {de ? 'Zonen aus deiner FTP — der Bereich, in dem jede Trainingsart wirkt.' : 'Zones from your FTP — the band each kind of training works in.'}
              </span>
            </div>
          </div>
        )}

        {/* ── Phenotype card (violet · pen cVuvN) ── */}
        {phen && (
          <div className="flex flex-col gap-3.5" style={{ borderRadius: RADIUS, background: 'color-mix(in srgb, var(--color-violet) 12%, var(--color-paper-2))', border: '1px solid var(--color-violet)', padding: 18 }}>
            {sectionHead(<Bolt size={18} style={{ color: 'var(--color-violet)' }} />, de ? 'Dein Fahrertyp' : 'Your rider type')}
            <span className="num-display" style={{ fontSize: 30, color: 'var(--color-ink)' }}>{phen.type}</span>
            <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink-2)', lineHeight: 1.5 }}>{phen.note}</p>
            <div className="flex flex-col gap-2">
              {phen.traits.map((t) => (
                <div key={t.key} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-2)' }}>{de ? t.label_de : t.label_en}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-violet)' }}>{de ? t.word_de : t.word_en}</span>
                  </div>
                  <div className="w-full overflow-hidden rounded-full" style={{ height: 7, background: '#FFFFFF14' }}>
                    <div className="rounded-full" style={{ height: 7, width: `${t.pct}%`, background: 'var(--color-violet)' }} />
                  </div>
                </div>
              ))}
            </div>
            {(de ? phen.consequence_de : phen.consequence_en) && (
              <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>
                <span style={{ fontWeight: 700, color: 'var(--color-ink)' }}>{de ? 'Fürs Training: ' : 'For training: '}</span>
                {de ? phen.consequence_de : phen.consequence_en}
              </p>
            )}
          </div>
        )}

        {/* ── Benchmark / cohort card (pen ntmEi) ── */}
        {bench && (
          <div className="flex flex-col gap-3.5" style={{ ...CARD, padding: 18 }}>
            {sectionHead(<BarChart3 size={18} style={{ color: 'var(--color-strain)' }} />, de ? 'Wie du dich einordnest' : 'How you compare')}
            <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-muted)' }}>
              {de ? 'Deine FTP pro Kilo, neben typischen Referenzfahrern.' : 'Your FTP per kilo, next to typical reference riders.'}
            </p>
            <BenchViz bench={bench} de={de} fmtWkg={fmtWkg} />
            <div className="flex items-center gap-2" style={{ borderRadius: 12, background: 'var(--color-surface-2)', padding: '10px 12px' }}>
              <Flag size={16} style={{ color: 'var(--color-strain)', flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink-2)' }}>{benchNote(bench, de, fmtWkg)}</span>
            </div>
          </div>
        )}

        {/* ── Sprint & Pedaling card (pen thT3S) ── */}
        {sp && (
          <div className="flex flex-col gap-4 p-5" style={CARD}>
            <div className="flex items-center gap-1.5">
              <Bolt size={16} style={{ color: 'var(--color-exercise)' }} />
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--color-ink-2)' }}>{de ? 'SPRINT & TRITT' : 'SPRINT & PEDALING'}</span>
            </div>
            {/* Stamina / fatigue resistance */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => glossary.open('durability', sp.durability_best_pct != null ? fmtPct(sp.durability_best_pct) : null)} style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink-2)', background: 'none', border: 0, cursor: 'pointer', ...TAPPABLE }}>
                  {de ? 'Ausdauer-Reserve' : 'Stamina'}
                </button>
                <span className="num-display" style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink)' }}>
                  {sp.stamina_pct != null ? `${Math.round(sp.stamina_pct)}%` : DASH}
                </span>
              </div>
              <div className="w-full overflow-hidden rounded-full" style={{ height: 8, background: 'var(--color-surface-3)' }}>
                <div className="rounded-full" style={{ height: 8, width: `${sp.stamina_pct ?? 0}%`, background: 'var(--color-recovery)' }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)' }}>
                {sp.durability_best_pct == null
                  ? de ? 'Noch keine lange Fahrt zum Messen der Ermüdungsresistenz.' : 'No long ride yet to measure fatigue resistance.'
                  : de ? 'Wie gut deine Power spät in langen Fahrten hält.' : 'How well your power holds deep into long rides.'}
              </span>
            </div>
            <div style={{ height: 1, background: 'var(--color-rule)' }} />
            {/* Left / right balance */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink-2)' }}>{de ? 'Links / Rechts-Balance' : 'Left / Right balance'}</span>
                <span className="num-display" style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink)' }}>
                  {sp.balance_left_pct != null ? `${Math.round(sp.balance_left_pct)} / ${Math.round(sp.balance_right_pct ?? 100 - sp.balance_left_pct)}` : DASH}
                </span>
              </div>
              {sp.balance_left_pct != null ? (
                <>
                  <div className="relative flex w-full overflow-hidden" style={{ height: 14, borderRadius: 7 }}>
                    <div style={{ width: `${sp.balance_left_pct}%`, background: 'var(--color-strain)' }} />
                    <div style={{ width: `${100 - sp.balance_left_pct}%`, background: 'var(--color-stand)' }} />
                    <div className="absolute" style={{ left: '50%', top: -3, width: 2, height: 20, background: 'var(--color-ink)' }} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)' }}>{de ? 'L Bein' : 'L leg'}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-recovery)' }}>{balanceNote(sp.balance_left_pct, de)}</span>
                    <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)' }}>{de ? 'R Bein' : 'R leg'}</span>
                  </div>
                </>
              ) : (
                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)' }}>
                  {de ? 'Keine Pedal-Balance aufgezeichnet — braucht einen zweiseitigen Powermeter.' : 'No pedal balance recorded — needs a dual-sided power meter.'}
                </span>
              )}
            </div>
          </div>
        )}

        {isLoading && !data && (
          <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>{de ? 'Lädt …' : 'Loading …'}</p>
        )}
      </div>
      {glossary.sheet}
      <StatsEditSheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        ftp={profileQ.data?.ftp_watts ?? null}
        weight={profileQ.data?.weight_kg ?? null}
        de={de}
      />
    </DashboardShell>
  )
}

// Edit-stats sheet — FTP + weight, the two numbers the whole Power Profile is
// built on. Saves via updateProfile and refetches the profile + power-profile
// so every W/kg, zone and benchmark recomputes from the new stats.
function StatsEditSheet({ open, onClose, ftp, weight, de }: {
  open: boolean; onClose: () => void; ftp: number | null; weight: number | null; de: boolean
}) {
  const qc = useQueryClient()
  const [ftpText, setFtpText] = useState('')
  const [weightText, setWeightText] = useState('')

  // Seed inputs from the current values each time the sheet opens.
  useEffect(() => {
    if (open) {
      setFtpText(ftp != null ? String(ftp) : '')
      setWeightText(weight != null ? String(weight).replace('.', de ? ',' : '.') : '')
    }
  }, [open, ftp, weight, de])

  const save = useMutation({
    mutationFn: () => {
      const payload: { ftp_watts?: number; weight_kg?: number } = {}
      const f = parseInt(ftpText, 10)
      if (Number.isFinite(f) && f > 0) payload.ftp_watts = f
      const w = parseFloat(weightText.replace(',', '.'))
      if (Number.isFinite(w) && w > 0) payload.weight_kg = w
      return updateProfile(payload)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['athlete', 'me'] })
      void qc.invalidateQueries({ queryKey: ['analytics', 'power-profile-view'] })
      setFtpText(''); setWeightText('')
      onClose()
    },
  })

  if (!open) return null
  // Render into <body>: the page's <main class="paper-grain"> sets
  // `isolation: isolate`, creating a stacking context that would otherwise trap
  // this z-50 sheet UNDER the z-40 bottom nav and hide its Save button.
  const field = (label: string, unit: string, value: string, set: (v: string) => void, mode: string) => (
    <label className="flex flex-col gap-1.5">
      <span className="eyebrow" style={{ fontSize: 11, letterSpacing: '0.06em', color: 'var(--color-muted)' }}>{label}</span>
      <div className="flex items-center rounded-2xl" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)', padding: '0 14px' }}>
        <input
          type="text" inputMode={mode as 'numeric' | 'decimal'} value={value}
          onChange={(e) => set(e.target.value)}
          className="flex-1 bg-transparent outline-none num-display"
          style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-ink)', height: 52, minWidth: 0 }}
        />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-muted)' }}>{unit}</span>
      </div>
    </label>
  )

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <button type="button" aria-label={de ? 'Abbrechen' : 'Cancel'} onClick={onClose} className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.55)' }} />
      <div className="relative w-full max-w-md rounded-t-[24px] p-5 flex flex-col gap-4" style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)', paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }}>
        <div className="flex items-center justify-between">
          <span className="num-display" style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-ink)' }}>{de ? 'Werte bearbeiten' : 'Edit stats'}</span>
          <button type="button" aria-label={de ? 'Schließen' : 'Close'} onClick={onClose} className="grid place-items-center rounded-full" style={{ width: 36, height: 36, background: 'var(--color-surface-2)' }}>
            <X size={18} style={{ color: 'var(--color-muted)' }} />
          </button>
        </div>
        {field(de ? 'FTP' : 'FTP', 'W', ftpText, setFtpText, 'numeric')}
        {field(de ? 'Gewicht' : 'Weight', 'kg', weightText, setWeightText, 'decimal')}
        <span style={{ fontSize: 12, color: 'var(--color-muted)', lineHeight: 1.4 }}>
          {de ? 'W/kg, Zonen und Benchmark werden neu berechnet.' : 'W/kg, zones and benchmark recompute from these.'}
        </span>
        <button
          type="button" disabled={save.isPending}
          onClick={() => save.mutate()}
          className="rounded-full" style={{ minHeight: 50, fontSize: 15, fontWeight: 700, background: 'var(--color-accent)', color: '#0A0C0F', opacity: save.isPending ? 0.6 : 1 }}
        >
          {save.isPending ? (de ? 'Speichern…' : 'Saving…') : (de ? 'Speichern' : 'Save')}
        </button>
      </div>
    </div>,
    document.body,
  )
}

function Header({ de, navigate, rides, onEdit }: { de: boolean; navigate: (n: number) => void; rides?: number | null; onEdit?: () => void }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => navigate(-1)} aria-label={de ? 'Zurück' : 'Back'} className="grid place-items-center rounded-full" style={{ width: 36, height: 36, background: 'var(--color-surface-2)' }}>
          <ArrowLeft size={20} style={{ color: 'var(--color-ink)' }} />
        </button>
        <div className="flex items-center gap-2">
          {onEdit && (
            <button type="button" onClick={onEdit} aria-label={de ? 'Werte bearbeiten' : 'Edit stats'} className="inline-flex items-center gap-1.5 rounded-full" style={{ height: 36, padding: '0 14px', background: 'var(--color-surface-2)' }}>
              <Pencil size={15} style={{ color: 'var(--color-accent)' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink)' }}>{de ? 'Bearbeiten' : 'Edit'}</span>
            </button>
          )}
          <button type="button" aria-label={de ? 'Teilen' : 'Share'} className="grid place-items-center rounded-full" style={{ width: 36, height: 36, background: 'var(--color-surface-2)' }}>
            <Share2 size={18} style={{ color: 'var(--color-ink)' }} />
          </button>
        </div>
      </div>
      <h1 className="num-display" style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-ink)' }}>{de ? 'Power-Profil' : 'Power Profile'}</h1>
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-ink-2)' }}>
        {rides != null
          ? de ? `Was deine Beine leisten — aus ${rides} Fahrten mit Power` : `What your legs can do — from ${rides} rides with power`
          : de ? 'Was deine Beine leisten — in klaren Zahlen' : 'What your legs can do — in plain numbers'}
      </span>
    </div>
  )
}

function BenchViz({ bench, de, fmtWkg }: { bench: Bench; de: boolean; fmtWkg: (v: number) => string }) {
  const LO = 2.0, HI = 6.0
  const pos = (w: number) => Math.max(0, Math.min(100, ((w - LO) / (HI - LO)) * 100))
  const youPct = pos(bench.you_wkg)
  const bandColor: Record<string, string> = { everyday: 'var(--color-surface-3)', racer: 'color-mix(in srgb, var(--color-strain) 30%, transparent)', pro: 'color-mix(in srgb, var(--color-violet) 30%, transparent)' }
  const labelColor: Record<string, string> = { everyday: 'var(--color-muted)', racer: 'var(--color-strain)', pro: 'var(--color-violet)' }
  return (
    <div className="relative" style={{ height: 76 }}>
      <div className="absolute" style={{ left: `${youPct}%`, top: 0, transform: 'translateX(-50%)' }}>
        <span className="whitespace-nowrap rounded-full" style={{ fontSize: 11, fontWeight: 700, color: '#06121C', background: 'var(--color-strain)', padding: '4px 10px' }}>
          {de ? 'Du' : 'You'} · {fmtWkg(bench.you_wkg)} W/kg
        </span>
      </div>
      <div className="absolute" style={{ left: `${youPct}%`, top: 24, width: 2, height: 30, background: 'var(--color-strain)', transform: 'translateX(-50%)' }} />
      <div className="absolute flex w-full gap-0.5" style={{ top: 40 }}>
        {bench.bands.map((b) => (
          <div key={b.key} style={{ flex: b.high_wkg - b.low_wkg, height: 14, borderRadius: 4, background: bandColor[b.key] }} />
        ))}
      </div>
      <div className="absolute flex w-full gap-0.5" style={{ top: 60 }}>
        {bench.bands.map((b) => (
          <span key={b.key} style={{ flex: b.high_wkg - b.low_wkg, fontSize: 11, fontWeight: b.key === bench.category_key ? 700 : 600, color: labelColor[b.key] }}>
            {de ? b.label_de : b.label_en}
          </span>
        ))}
      </div>
    </div>
  )
}

function benchNote(bench: Bench, de: boolean, fmtWkg: (v: number) => string): string {
  if (bench.category_key === 'pro') return de ? 'Profi-Territorium — außergewöhnliche Leistung fürs Gewicht.' : 'Pro territory — exceptional power for your weight.'
  if (bench.category_key === 'racer') {
    const gap = bench.to_pro_wkg
    return gap != null
      ? de ? `Mitten im Racer-Bereich — ${fmtWkg(gap)} W/kg bis zur Profi-Schwelle.` : `Well inside racer territory — ${fmtWkg(gap)} W/kg from the pro doorstep.`
      : de ? 'Mitten im Racer-Bereich.' : 'Well inside racer territory.'
  }
  return de ? 'Solide Alltags-Basis — jeder Block hebt dich weiter.' : 'A solid everyday base — every block lifts you further.'
}

function balanceNote(left: number, de: boolean): string {
  const off = Math.abs(left - 50)
  if (off <= 2) return de ? 'Schön gleichmäßig' : 'Nicely even'
  if (off <= 5) return de ? 'Leichte Tendenz' : 'Slight lean'
  return de ? 'Deutliche Tendenz' : 'Noticeable lean'
}
