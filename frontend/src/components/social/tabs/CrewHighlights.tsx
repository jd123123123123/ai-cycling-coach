/**
 * CrewHighlights — the "Crew Week Highlights" surface, built 1:1 against the
 * Pencil frame `SAO8Y` ("V3 · Crew Week Highlights"). A weekly digest of what
 * the crew did TOGETHER: a colourful hero (crew name + combined distance +
 * member avatars), award tiles for the week's standouts, a ride-of-the-week
 * banner, a gold crew-PR row, and a crew chat thread.
 *
 * HONEST DATA POLICY. The crew backend exposes weekly per-member totals
 * (distance / hours / rides / active-days) via /crews/me/duel, and crew
 * membership via /crews/me — those drive the real cards. Everything the
 * backend does NOT yet expose renders an explicit "coming"/"—" state, never a
 * fabricated number:
 *   - REAL: crew name, member count + avatars, combined weekly km, saddle
 *     hours, ride count, "biggest week" (most km) + "most consistent" (most
 *     active days) award tiles.
 *   - HONEST-EMPTY (no data source): elevation ("King of the Mountain" +
 *     climbed pill), peak power ("Watt Bomb"), ride-of-the-week, crew personal
 *     records, and the crew chat thread. These show a locked/coming state.
 */
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Share2, Route, Mountain, Zap, CheckCircle2, Medal, Trophy, ChevronRight,
  Heart, SmilePlus, ArrowUp, Users, Lock, MessageCircle, Sparkles, UserPlus,
} from 'lucide-react'
import { useDuel, useMyCrew } from '../../../hooks/useCrew'
import type { DuelStats } from '../../../api/crew'
import { useLocale } from '../../../contexts/LocaleContext'

// ── Deterministic avatar colour per handle, from the token palette ──
const AV_COLORS = ['var(--color-accent)', 'var(--color-violet)', 'var(--color-strain)', 'var(--color-recovery)', 'var(--color-gold)']
const avColor = (h: string) => AV_COLORS[[...(h || '?')].reduce((s, c) => s + c.charCodeAt(0), 0) % AV_COLORS.length]
const initial = (h: string) => ((h || '?').trim()[0] ?? '?').toUpperCase()

const DIM = '#5C6570' // dimmest label tint (no token maps exactly)

// Format the week window as "JUL 15–21" (or German "15.–21. JUL").
function weekRange(start?: string, end?: string, de = false): string {
  if (!start || !end) return de ? 'DIESE WOCHE' : 'THIS WEEK'
  const s = new Date(start)
  const e = new Date(end)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return de ? 'DIESE WOCHE' : 'THIS WEEK'
  const mon = e.toLocaleDateString(de ? 'de-DE' : 'en-US', { month: 'short' }).toUpperCase().replace('.', '')
  return de ? `${s.getDate()}.–${e.getDate()}. ${mon}` : `${mon} ${s.getDate()}–${e.getDate()}`
}

interface AwardSpec {
  color: string
  icon: typeof Route
  label: string
  value: string
  unit: string
  lead: string
  who: { name: string; initial: string; color: string } | null
  locked?: boolean
}

export default function CrewHighlights() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const navigate = useNavigate()
  const { data: duel } = useDuel()
  const { data: myCrew } = useMyCrew()

  const you = duel?.you_this_week
  const crewMates: DuelStats[] = duel?.crew ?? []
  const hasCrew = crewMates.length > 0
  // Full roster this week = you + your crew-mates (real duel rows only).
  const roster: DuelStats[] = you ? [you, ...crewMates] : crewMates
  const crewName = myCrew?.crew?.name ?? (de ? 'Deine Crew' : 'Your crew')

  // ── Combined weekly totals (real) ──
  const totals = useMemo(() => {
    const km = roster.reduce((s, r) => s + Number(r.distance_km ?? 0), 0)
    const hours = roster.reduce((s, r) => s + Number(r.hours ?? 0), 0)
    const rides = roster.reduce((s, r) => s + Number(r.rides ?? 0), 0)
    return { km: Math.round(km), hours: Math.round(hours), rides }
  }, [roster])

  // ── Award tiles ──
  const awards = useMemo<AwardSpec[]>(() => {
    const nf = (n: number) => Math.round(n).toLocaleString(de ? 'de-DE' : 'en-US')
    // Biggest week — most distance. Lead = gap to 2nd place.
    const byKm = [...roster].sort((a, b) => Number(b.distance_km ?? 0) - Number(a.distance_km ?? 0))
    const kmLeader = byKm[0]
    const kmGap = kmLeader && byKm[1] ? Math.round(Number(kmLeader.distance_km ?? 0) - Number(byKm[1].distance_km ?? 0)) : 0
    const biggest: AwardSpec = kmLeader && Number(kmLeader.distance_km ?? 0) > 0
      ? {
          color: 'var(--color-accent)', icon: Route,
          label: de ? 'GRÖSSTE WOCHE' : 'BIGGEST WEEK',
          value: nf(Number(kmLeader.distance_km ?? 0)), unit: 'km',
          lead: byKm[1] ? (de ? `+${kmGap} km Vorsprung` : `+${kmGap} km clear`) : (de ? 'Spitzenreiter' : 'out front'),
          who: { name: kmLeader.handle, initial: initial(kmLeader.handle), color: avColor(kmLeader.handle) },
        }
      : {
          color: 'var(--color-accent)', icon: Route,
          label: de ? 'GRÖSSTE WOCHE' : 'BIGGEST WEEK',
          value: '—', unit: 'km', lead: de ? 'noch keine Fahrt' : 'no rides yet', who: null,
        }

    // Most consistent — most active days (tie → most rides).
    const byDays = [...roster].sort((a, b) =>
      (b.active_days - a.active_days) || (Number(b.rides ?? 0) - Number(a.rides ?? 0)))
    const daysLeader = byDays[0]
    const consistent: AwardSpec = daysLeader && daysLeader.active_days > 0
      ? {
          color: 'var(--color-recovery)', icon: CheckCircle2,
          label: de ? 'AM KONSTANTESTEN' : 'MOST CONSISTENT',
          value: `${daysLeader.active_days}/7`, unit: de ? 'Tage' : 'days',
          lead: daysLeader.active_days >= 7 ? (de ? 'perfekte Woche' : 'perfect week') : (de ? `${daysLeader.rides} Fahrten` : `${daysLeader.rides} rides`),
          who: { name: daysLeader.handle, initial: initial(daysLeader.handle), color: avColor(daysLeader.handle) },
        }
      : {
          color: 'var(--color-recovery)', icon: CheckCircle2,
          label: de ? 'AM KONSTANTESTEN' : 'MOST CONSISTENT',
          value: '—', unit: de ? 'Tage' : 'days', lead: de ? 'noch keine Fahrt' : 'no rides yet', who: null,
        }

    // King of the mountain — elevation is NOT tracked by the backend. Honest.
    const mountain: AwardSpec = {
      color: 'var(--color-gold)', icon: Mountain,
      label: de ? 'BERGKÖNIG' : 'KING OF THE MTN',
      value: '—', unit: 'm', lead: de ? 'noch nicht erfasst' : 'not tracked yet', who: null, locked: true,
    }
    // Watt bomb — peak power is NOT tracked by the backend. Honest.
    const watt: AwardSpec = {
      color: 'var(--color-strain)', icon: Zap,
      label: de ? 'WATT-BOMBE' : 'WATT BOMB',
      value: '—', unit: 'W', lead: de ? 'noch nicht erfasst' : 'not tracked yet', who: null, locked: true,
    }
    return [biggest, mountain, watt, consistent]
  }, [roster, de])

  // No crew yet → an inviting empty state that routes to the finder.
  if (!hasCrew) {
    return (
      <div className="flex flex-col gap-5 pb-6">
        <div className="flex flex-col gap-0.5">
          <span className="eyebrow" style={{ fontSize: 12, letterSpacing: '0.08em', color: 'var(--color-muted)' }}>{de ? 'CREW-HIGHLIGHTS' : 'CREW HIGHLIGHTS'}</span>
          <h1 className="num-display" style={{ fontSize: 28, color: 'var(--color-ink)' }}>{de ? 'Deine Woche' : 'Your week'}</h1>
        </div>
        <div className="rounded-[24px] p-6 flex flex-col items-center text-center gap-3" style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
          <span className="grid place-items-center rounded-full" style={{ width: 56, height: 56, background: 'var(--color-accent-soft)' }}>
            <Users size={28} style={{ color: 'var(--color-accent)' }} />
          </span>
          <span className="num-display" style={{ fontSize: 18, color: 'var(--color-ink)' }}>{de ? 'Noch keine Crew' : 'No crew yet'}</span>
          <span style={{ fontSize: 13, color: 'var(--color-ink-2)', maxWidth: 260, lineHeight: 1.4 }}>
            {de ? 'Bilde eine Crew, um eure Woche gemeinsam zu feiern — Highlights, Rekorde und mehr.' : 'Build a crew to celebrate the week together — highlights, records and more.'}
          </span>
          <button type="button" onClick={() => navigate('/dashboard?tab=social')} className="inline-flex items-center gap-1.5 rounded-full" style={{ background: 'var(--color-accent)', padding: '11px 18px', marginTop: 4 }}>
            <UserPlus size={16} style={{ color: 'var(--color-paper)' }} />
            <span className="num-display" style={{ fontSize: 13, color: 'var(--color-paper)' }}>{de ? 'Crew aufbauen' : 'Build your crew'}</span>
          </button>
        </div>
      </div>
    )
  }

  const memberCount = roster.length
  const heroBg = `radial-gradient(120% 90% at 18% 12%, #FF5A3C55, transparent 55%), radial-gradient(110% 90% at 88% 18%, #FFD16640, transparent 52%), radial-gradient(130% 120% at 72% 105%, #8B5CF666, transparent 62%), radial-gradient(100% 100% at 22% 95%, #38B6FF33, transparent 55%), #0A0C0F`

  return (
    <div className="flex flex-col gap-5 pb-6">
      {/* ── HERO ── */}
      <div className="rounded-[24px] flex flex-col gap-3.5 overflow-hidden" style={{ background: heroBg, padding: '24px 20px' }}>
        {/* Header: crew name + share */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-[3px]">
            <span className="eyebrow" style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', color: 'var(--color-accent)' }}>
              {de ? `DEINE CREW · ${weekRange(duel?.week_start, duel?.week_end, de)}` : `YOUR CREW · ${weekRange(duel?.week_start, duel?.week_end, de)}`}
            </span>
            <span className="num-display truncate" style={{ fontSize: 24, fontWeight: 800, color: 'var(--color-ink)' }}>{crewName}</span>
          </div>
          <button type="button" aria-label={de ? 'Teilen' : 'Share'} className="grid place-items-center rounded-full shrink-0" style={{ width: 40, height: 40, background: 'var(--color-surface-2)' }}>
            <Share2 size={18} style={{ color: 'var(--color-ink-2)' }} />
          </button>
        </div>

        {/* Combined distance */}
        <div className="flex flex-col gap-2">
          <span className="eyebrow" style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.16em', color: '#FFFFFFE6' }}>{de ? 'DIESE WOCHE, GEMEINSAM' : 'THIS WEEK, TOGETHER'}</span>
          <div className="flex items-end gap-2">
            <span className="num-display" style={{ fontSize: 60, fontWeight: 800, lineHeight: 0.9, color: 'var(--color-ink)', textShadow: '0 2px 16px #000000AA' }}>{totals.km.toLocaleString(de ? 'de-DE' : 'en-US')}</span>
            <span className="num-display" style={{ fontSize: 24, fontWeight: 700, color: '#FFFFFFE6', paddingBottom: 10 }}>km</span>
          </div>
        </div>

        {/* Caption */}
        <span style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.35, color: '#FFFFFFF2' }}>
          {de ? `Gemeinsam gefahren von ${memberCount} — gespürt von allen.` : `Ridden by ${memberCount} — felt by all.`}
        </span>

        {/* Stat pills — hours + rides are real; climbed elevation is not tracked */}
        <div className="flex flex-wrap gap-2">
          <HeroPill value={de ? '—' : '—'} label={de ? 'Höhenmeter' : 'climbed'} muted />
          <HeroPill value={`${totals.hours} h`} label={de ? 'im Sattel' : 'saddle'} />
          <HeroPill value={`${totals.rides}`} label={de ? 'Fahrten' : 'rides'} />
        </div>

        {/* Avatar stack */}
        <div className="relative" style={{ height: 30, marginTop: 2 }}>
          {roster.slice(0, 6).map((r, i) => (
            <span key={r.user_id ?? r.handle} className="num-display grid place-items-center rounded-full absolute" style={{ left: i * 19, top: 0, width: 30, height: 30, fontSize: 12, fontWeight: 800, color: 'var(--color-paper)', background: avColor(r.handle), border: '2px solid var(--color-paper)' }}>{initial(r.handle)}</span>
          ))}
        </div>
      </div>

      {/* ── CREW HIGHLIGHTS grid ── */}
      <div className="flex flex-col gap-3">
        <span className="eyebrow" style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--color-muted)' }}>{de ? 'CREW-HIGHLIGHTS' : 'CREW HIGHLIGHTS'}</span>
        <div className="grid grid-cols-2 gap-2.5">
          {awards.map((a, i) => <AwardCard key={i} a={a} de={de} />)}
        </div>
      </div>

      {/* ── RIDE OF THE WEEK — no named-ride source yet → honest empty ── */}
      <div className="rounded-[24px] overflow-hidden" style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
        <div className="flex flex-col justify-between" style={{ height: 100, padding: '14px 16px', background: 'linear-gradient(120deg, #8B5CF6, #14181D)' }}>
          <div className="flex items-center justify-between">
            <span className="eyebrow" style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', color: '#FFFFFFF2' }}>{de ? 'FAHRT DER WOCHE' : 'RIDE OF THE WEEK'}</span>
            <span className="inline-flex items-center gap-1 rounded-full" style={{ padding: '4px 9px', background: '#0A0C0F99', border: '1px solid #FFFFFF33' }}>
              <Lock size={11} style={{ color: '#FFFFFFCC' }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: '#FFFFFFCC' }}>{de ? 'BALD' : 'SOON'}</span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3" style={{ padding: '14px 16px 16px' }}>
          <span className="grid place-items-center rounded-[12px] shrink-0" style={{ width: 40, height: 40, background: 'var(--color-surface-2)' }}>
            <Sparkles size={20} style={{ color: 'var(--color-violet)' }} />
          </span>
          <span style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.35, color: 'var(--color-ink-2)' }}>
            {de ? 'Die herausragende Fahrt der Crew wird hier gefeiert, sobald einzelne Fahrten erfasst werden.' : "The crew's standout ride gets featured here once individual rides are tracked."}
          </span>
        </div>
      </div>

      {/* ── CREW PRs — no PR backend yet → honest gold "coming" row ── */}
      <div className="rounded-[24px] flex items-center gap-3.5" style={{ padding: '14px 16px', background: 'linear-gradient(60deg, #FFD16626, #14181D)', border: '1px solid var(--color-gold)' }}>
        <span className="grid place-items-center rounded-full shrink-0" style={{ width: 44, height: 44, background: 'linear-gradient(45deg, #FFD166, #FFB020)' }}>
          <Trophy size={24} style={{ color: 'var(--color-paper)' }} />
        </span>
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <div className="flex items-end gap-1.5">
            <span className="num-display" style={{ fontSize: 24, fontWeight: 800, color: 'var(--color-ink)' }}>—</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink)', paddingBottom: 3 }}>{de ? 'neue Rekorde' : 'new records'}</span>
          </div>
          <span style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>{de ? 'Crew-Rekorde bald verfügbar' : 'Crew records coming soon'}</span>
        </div>
        <ChevronRight size={20} style={{ color: DIM }} />
      </div>

      {/* ── CREW CHAT — no chat backend yet → honest empty thread ── */}
      <div className="rounded-[24px] flex flex-col gap-3.5" style={{ padding: 16, background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
        <div className="flex items-center justify-between">
          <span className="eyebrow" style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.14em', color: 'var(--color-muted)' }}>{de ? 'DIE CREW ANFEUERN' : 'CHEER THE CREW'}</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: DIM }}>{de ? '0 Kommentare' : '0 comments'}</span>
        </div>

        {/* Reaction chips (structure present; counts honestly zero) */}
        <div className="flex flex-wrap gap-2">
          {['🔥', '💪', '👏', '🚀'].map((e) => (
            <span key={e} className="inline-flex items-center gap-1.5 rounded-full" style={{ padding: '7px 12px', background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' }}>
              <span style={{ fontSize: 15 }}>{e}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-ink-2)' }}>0</span>
            </span>
          ))}
          <span className="grid place-items-center rounded-full" style={{ width: 34, height: 34, background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' }}>
            <SmilePlus size={16} style={{ color: 'var(--color-ink-2)' }} />
          </span>
        </div>

        {/* Empty thread */}
        <div className="flex items-center gap-2.5 rounded-[12px]" style={{ background: 'var(--color-surface-2)', padding: '12px 12px' }}>
          <MessageCircle size={16} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.35, color: 'var(--color-muted)' }}>
            {de ? 'Crew-Chat kommt bald — feiert die Woche eures Teams direkt hier.' : "Crew chat is coming — cheer your team's week right here."}
          </span>
        </div>

        {/* Composer (present, disabled until the feature ships) */}
        <div className="flex items-center gap-2.5" style={{ paddingTop: 6 }}>
          <span className="num-display grid place-items-center rounded-full shrink-0" style={{ width: 30, height: 30, fontSize: 11, fontWeight: 800, color: 'var(--color-paper)', background: you ? avColor(you.handle) : 'var(--color-accent)' }}>{initial(you?.handle ?? '?')}</span>
          <div className="flex-1 rounded-full flex items-center" style={{ padding: '10px 14px', background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: DIM }}>{de ? 'Kommentieren bald möglich…' : 'Commenting coming soon…'}</span>
          </div>
          <span className="grid place-items-center rounded-full shrink-0" style={{ width: 36, height: 36, background: 'var(--color-surface-2)' }}>
            <ArrowUp size={18} style={{ color: DIM }} />
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Hero stat pill ──
function HeroPill({ value, label, muted }: { value: string; label: string; muted?: boolean }) {
  return (
    <span className="inline-flex items-end gap-1.5 rounded-full" style={{ padding: '6px 10px', background: '#0A0C0F80', border: '1px solid #FFFFFF26' }}>
      <span className="num-display" style={{ fontSize: 14, fontWeight: 800, color: muted ? '#FFFFFFB3' : 'var(--color-ink)' }}>{value}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#FFFFFFB3' }}>{label}</span>
    </span>
  )
}

// ── Award tile ──
function AwardCard({ a, de }: { a: AwardSpec; de: boolean }) {
  const Icon = a.icon
  const soft = `color-mix(in srgb, ${a.color} 15%, transparent)`
  return (
    <div className="rounded-[18px] flex flex-col gap-2.5 overflow-hidden" style={{
      padding: 15,
      background: `linear-gradient(135deg, ${soft}, var(--color-paper-2) 72%)`,
      border: `1px solid color-mix(in srgb, ${a.color} 24%, transparent)`,
      opacity: a.locked ? 0.78 : 1,
    }}>
      <div className="flex items-center justify-between">
        <span className="grid place-items-center rounded-full" style={{ width: 38, height: 38, background: a.color }}>
          <Icon size={20} style={{ color: 'var(--color-paper)' }} />
        </span>
        {a.locked ? <Lock size={16} style={{ color: `color-mix(in srgb, ${a.color} 60%, transparent)` }} /> : <Medal size={20} style={{ color: `color-mix(in srgb, ${a.color} 60%, transparent)` }} />}
      </div>
      <span className="eyebrow" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: a.color }}>{a.label}</span>
      <div className="flex items-end gap-1">
        <span className="num-display" style={{ fontSize: 28, fontWeight: 800, color: 'var(--color-ink)' }}>{a.value}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: DIM, paddingBottom: 5 }}>{a.unit}</span>
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: a.color }}>{a.lead}</span>
      {a.who ? (
        <div className="flex items-center gap-1.5" style={{ paddingTop: 4 }}>
          <span className="num-display grid place-items-center rounded-full shrink-0" style={{ width: 24, height: 24, fontSize: 10, fontWeight: 800, color: 'var(--color-paper)', background: a.who.color, border: `2px solid ${a.color}` }}>{a.who.initial}</span>
          <span className="truncate" style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink-2)' }}>{a.who.name}</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5" style={{ paddingTop: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-muted)' }}>{de ? 'noch niemand' : 'nobody yet'}</span>
        </div>
      )}
    </div>
  )
}
