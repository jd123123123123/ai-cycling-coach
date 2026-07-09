import { useEffect, useMemo, useState } from 'react'
import { format, parseISO, startOfYear, subDays } from 'date-fns'
import {
  Award,
  Calendar,
  Clock,
  Flame,
  Mountain,
  Rocket,
  Sparkles,
  Trophy,
} from 'lucide-react'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { usePMC } from '../../hooks/usePMC'
import { useT, useLocale } from '../../contexts/LocaleContext'
import type { ActivityRead, PMCEntry } from '../../api/dashboard'

/**
 * AchievementBadges — first-time training milestones derived from activity
 * and PMC history. Pure-frontend, persisted in localStorage so a returning
 * athlete sees the same unlocks even after a long offline gap.
 *
 * What we show
 * ────────────
 * Unlocked badges, newest first. Locked badges aren't rendered — the goal
 * is celebration, not a punishment surface. The newest unlock (within 7
 * days) gets a small "NEW" indicator.
 *
 * Why localStorage v0
 * ───────────────────
 * The dates we record here are *first-seen* dates from the *current* user's
 * device. Switching devices recomputes from history (the date might shift to
 * "today" for legacy unlocks). That's fine — the achievement is real either
 * way; the timestamp is a nice-to-have. A backend table (`crew_achievements`-
 * style) is the natural next step.
 */

interface Achievement {
  id: string
  label: string
  hint: string                       // tooltip
  icon: React.ReactNode
  unlockedAt: string                 // ISO yyyy-mm-dd
}

const STORAGE_KEY = 'achievements_v0'
const CELEBRATED_KEY = 'achievements_celebrated_v0'

interface StoredDates {
  [id: string]: string  // id → first-seen ISO date
}

function loadStored(): StoredDates {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredDates) : {}
  } catch {
    return {}
  }
}

function saveStored(dates: StoredDates) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dates))
  } catch {
    /* ignore */
  }
}

function loadCelebrated(): Set<string> {
  try {
    const raw = localStorage.getItem(CELEBRATED_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function saveCelebrated(ids: Set<string>) {
  try {
    localStorage.setItem(CELEBRATED_KEY, JSON.stringify(Array.from(ids)))
  } catch {
    /* ignore */
  }
}

// ── Achievement detectors ────────────────────────────────────────────
// Each detector returns the earliest activity / PMC entry date that
// triggered the milestone, or null if not yet earned.

function activityDate(a: ActivityRead): string {
  return (a.date ?? a.started_at.slice(0, 10)).slice(0, 10)
}

function firstActivityMatching(
  acts: ActivityRead[],
  pred: (a: ActivityRead) => boolean,
): string | null {
  const sorted = [...acts].sort((a, b) => a.started_at.localeCompare(b.started_at))
  const hit = sorted.find(pred)
  return hit ? activityDate(hit) : null
}

function firstDailyTssAtLeast(
  acts: ActivityRead[],
  target: number,
): string | null {
  const byDay = new Map<string, number>()
  for (const a of acts) {
    const d = activityDate(a)
    byDay.set(d, (byDay.get(d) ?? 0) + (a.tss ?? 0))
  }
  const sortedDates = Array.from(byDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
  const hit = sortedDates.find(([, tss]) => tss >= target)
  return hit ? hit[0] : null
}

function firstWeeklyHoursAtLeast(
  acts: ActivityRead[],
  hours: number,
): string | null {
  if (acts.length === 0) return null
  // Group by ISO week (Mon-anchored). Sum duration. Return Monday of the
  // first week that clears the bar.
  const byWeek = new Map<string, { sumS: number; mondayIso: string }>()
  for (const a of acts) {
    const d = parseISO(a.started_at)
    const dow = (d.getDay() + 6) % 7  // Mon=0
    const monday = new Date(d)
    monday.setDate(d.getDate() - dow)
    const key = format(monday, 'yyyy-MM-dd')
    const cur = byWeek.get(key) ?? { sumS: 0, mondayIso: key }
    cur.sumS += a.duration_seconds ?? 0
    byWeek.set(key, cur)
  }
  const sorted = Array.from(byWeek.values()).sort((a, b) =>
    a.mondayIso.localeCompare(b.mondayIso),
  )
  const hit = sorted.find((w) => w.sumS / 3600 >= hours)
  return hit ? hit.mondayIso : null
}

function firstCtlAtLeast(entries: PMCEntry[], target: number): string | null {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date))
  const hit = sorted.find((e) => e.ctl >= target)
  return hit ? hit.date : null
}

const ACHIEVEMENT_DEFS: Array<{
  id: string
  label: string
  labelDe: string
  hint: string
  hintDe: string
  icon: React.ReactNode
  // Compute unlock date; takes the inputs we have on hand.
  resolve: (acts: ActivityRead[], pmc: PMCEntry[]) => string | null
}> = [
  {
    id: 'first-ride',
    label: 'First ride',
    labelDe: 'Erste Fahrt',
    hint: 'Your first logged activity. The streak starts here.',
    hintDe: 'Deine erste erfasste Aktivität. Hier beginnt die Serie.',
    icon: <Sparkles size={11} strokeWidth={2.2} />,
    resolve: (acts) =>
      firstActivityMatching(acts, (a) => (a.duration_seconds ?? 0) >= 600),
  },
  {
    id: 'first-hour',
    label: '1 hour',
    labelDe: '1 Stunde',
    hint: 'First ride of 60 minutes or more.',
    hintDe: 'Erste Fahrt ab 60 Minuten.',
    icon: <Clock size={11} strokeWidth={2.2} />,
    resolve: (acts) =>
      firstActivityMatching(acts, (a) => (a.duration_seconds ?? 0) >= 3600),
  },
  {
    id: 'first-2h',
    label: '2-hour ride',
    labelDe: '2-Stunden-Fahrt',
    hint: 'First single ride that broke two hours.',
    hintDe: 'Erste Einzelfahrt über zwei Stunden.',
    icon: <Clock size={11} strokeWidth={2.2} />,
    resolve: (acts) =>
      firstActivityMatching(acts, (a) => (a.duration_seconds ?? 0) >= 2 * 3600),
  },
  {
    id: 'first-3h',
    label: 'Big day · 3h',
    labelDe: 'Großer Tag · 3h',
    hint: 'First ride at or past three hours — durability begins here.',
    hintDe: 'Erste Fahrt ab drei Stunden — hier beginnt die Durability.',
    icon: <Mountain size={11} strokeWidth={2.2} />,
    resolve: (acts) =>
      firstActivityMatching(acts, (a) => (a.duration_seconds ?? 0) >= 3 * 3600),
  },
  {
    id: 'first-50km',
    label: '50 km',
    labelDe: '50 km',
    hint: 'First ride at 50 km or more.',
    hintDe: 'Erste Fahrt ab 50 km.',
    icon: <Mountain size={11} strokeWidth={2.2} />,
    resolve: (acts) =>
      firstActivityMatching(acts, (a) => (a.distance_meters ?? 0) >= 50_000),
  },
  {
    id: 'first-century',
    label: 'Century · 100 km',
    labelDe: 'Century · 100 km',
    hint: 'First century ride. A real one.',
    hintDe: 'Erste Century-Fahrt. Eine echte.',
    icon: <Trophy size={11} strokeWidth={2.2} />,
    resolve: (acts) =>
      firstActivityMatching(acts, (a) => (a.distance_meters ?? 0) >= 100_000),
  },
  {
    id: 'first-100tss',
    label: '100 TSS day',
    labelDe: '100-TSS-Tag',
    hint: 'First day with 100+ TSS — meaningful daily load.',
    hintDe: 'Erster Tag mit 100+ TSS — spürbare Tagesbelastung.',
    icon: <Rocket size={11} strokeWidth={2.2} />,
    resolve: (acts) => firstDailyTssAtLeast(acts, 100),
  },
  {
    id: 'first-150tss',
    label: '150 TSS day',
    labelDe: '150-TSS-Tag',
    hint: 'First day with 150+ TSS — a proper big day.',
    hintDe: 'Erster Tag mit 150+ TSS — ein richtig großer Tag.',
    icon: <Rocket size={11} strokeWidth={2.2} />,
    resolve: (acts) => firstDailyTssAtLeast(acts, 150),
  },
  {
    id: 'week-10h',
    label: '10-hour week',
    labelDe: '10-Stunden-Woche',
    hint: 'First training week that crossed 10 hours.',
    hintDe: 'Erste Trainingswoche über 10 Stunden.',
    icon: <Calendar size={11} strokeWidth={2.2} />,
    resolve: (acts) => firstWeeklyHoursAtLeast(acts, 10),
  },
  {
    id: 'week-15h',
    label: '15-hour week',
    labelDe: '15-Stunden-Woche',
    hint: 'First training week at 15+ hours.',
    hintDe: 'Erste Trainingswoche mit 15+ Stunden.',
    icon: <Calendar size={11} strokeWidth={2.2} />,
    resolve: (acts) => firstWeeklyHoursAtLeast(acts, 15),
  },
  {
    id: 'ctl-30',
    label: 'CTL 30',
    labelDe: 'CTL 30',
    hint: 'Fitness climbed past 30 for the first time.',
    hintDe: 'Die Fitness ist erstmals über 30 gestiegen.',
    icon: <Award size={11} strokeWidth={2.2} />,
    resolve: (_acts, pmc) => firstCtlAtLeast(pmc, 30),
  },
  {
    id: 'ctl-50',
    label: 'CTL 50',
    labelDe: 'CTL 50',
    hint: 'Fitness climbed past 50 for the first time — solid amateur base.',
    hintDe: 'Die Fitness ist erstmals über 50 gestiegen — solide Amateur-Basis.',
    icon: <Award size={11} strokeWidth={2.2} />,
    resolve: (_acts, pmc) => firstCtlAtLeast(pmc, 50),
  },
  {
    id: 'ctl-70',
    label: 'CTL 70',
    labelDe: 'CTL 70',
    hint: 'Fitness climbed past 70 — race-ready territory.',
    hintDe: 'Die Fitness über 70 — Rennform-Bereich.',
    icon: <Trophy size={11} strokeWidth={2.2} />,
    resolve: (_acts, pmc) => firstCtlAtLeast(pmc, 70),
  },
  {
    id: 'streak-7',
    label: '7-day streak',
    labelDe: '7-Tage-Serie',
    hint: 'Seven straight logged days.',
    hintDe: 'Sieben Tage am Stück erfasst.',
    icon: <Flame size={11} strokeWidth={2.2} />,
    resolve: (acts) => {
      if (acts.length === 0) return null
      const days = new Set(acts.map(activityDate))
      // Walk the sorted day list; find the first 7-in-a-row.
      const sorted = Array.from(days).sort()
      for (let i = 0; i + 6 < sorted.length; i++) {
        const start = parseISO(sorted[i])
        let ok = true
        for (let k = 1; k < 7; k++) {
          const need = format(
            new Date(start.getTime() + k * 86400000),
            'yyyy-MM-dd',
          )
          if (!days.has(need)) { ok = false; break }
        }
        if (ok) {
          return format(
            new Date(start.getTime() + 6 * 86400000),
            'yyyy-MM-dd',
          )
        }
      }
      return null
    },
  },
]

export default function AchievementBadges() {
  const t = useT()
  const { locale } = useLocale()
  const today = useMemo(() => new Date(), [])
  const yearStart = useMemo(() => startOfYear(today), [today])
  const { data: actsData, isLoading } = useActivitiesRange(yearStart, today)
  const { data: pmc } = usePMC(365)

  const [stored, setStored] = useState<StoredDates>(() => loadStored())
  const [celebrated, setCelebrated] = useState<Set<string>>(() => loadCelebrated())
  const [toast, setToast] = useState<Achievement | null>(null)

  const unlocked = useMemo<Achievement[]>(() => {
    const acts = actsData?.activities ?? []
    const entries = pmc?.entries ?? []
    const result: Achievement[] = []
    const next: StoredDates = { ...stored }

    for (const def of ACHIEVEMENT_DEFS) {
      const earliest = def.resolve(acts, entries)
      if (!earliest) continue
      // First-seen wins — only set if not previously stored.
      const unlockedAt = next[def.id] ?? earliest
      next[def.id] = unlockedAt
      result.push({
        id: def.id,
        label: locale === 'de' ? def.labelDe : def.label,
        hint: locale === 'de' ? def.hintDe : def.hint,
        icon: def.icon,
        unlockedAt,
      })
    }
    // Persist only when something actually changed.
    if (Object.keys(next).length !== Object.keys(stored).length) {
      // Defer the write so render is pure. useEffect below picks it up.
    }
    return result
  }, [actsData, pmc, stored, locale])

  useEffect(() => {
    if (unlocked.length === 0) return
    const next: StoredDates = {}
    for (const u of unlocked) next[u.id] = u.unlockedAt
    const a = Object.keys(stored).sort().join('|')
    const b = Object.keys(next).sort().join('|')
    if (a !== b) {
      saveStored(next)
      setStored(next)
    }
  }, [unlocked, stored])

  // First-time celebration: any unlock that's not yet in `celebrated` AND
  // was earned within the last 7 days gets a one-shot mid-screen toast.
  // We pick the most recent fresh-and-uncelebrated badge; if a session
  // unlocked several at once (rare — new account replay), we toast each in
  // turn as the user dismisses them.
  useEffect(() => {
    if (toast) return  // a toast is already on screen
    const sevenAgo = subDays(new Date(), 7)
    const fresh = unlocked
      .filter((u) => !celebrated.has(u.id))
      .filter((u) => {
        try {
          return parseISO(u.unlockedAt) >= sevenAgo
        } catch {
          return false
        }
      })
      .sort((a, b) => b.unlockedAt.localeCompare(a.unlockedAt))
    if (fresh.length > 0) {
      setToast(fresh[0])
    } else {
      // Backfill: mark any non-fresh unlocks as already celebrated so the
      // toast queue never resurfaces them.
      const next = new Set(celebrated)
      let changed = false
      for (const u of unlocked) {
        if (!next.has(u.id)) { next.add(u.id); changed = true }
      }
      if (changed) {
        saveCelebrated(next)
        setCelebrated(next)
      }
    }
  }, [unlocked, celebrated, toast])

  // Auto-dismiss after 8 seconds.
  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => dismissToast(), 8000)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast])

  function dismissToast() {
    if (!toast) return
    const next = new Set(celebrated)
    next.add(toast.id)
    saveCelebrated(next)
    setCelebrated(next)
    setToast(null)
  }

  if (isLoading) return null
  if (unlocked.length === 0) return null

  // Sort newest unlock first; mark "NEW" for unlocks within 7 days.
  const sevenAgo = subDays(today, 7)
  const sorted = [...unlocked].sort((a, b) => b.unlockedAt.localeCompare(a.unlockedAt))

  return (
    <>
    {/* Mid-screen celebration toast — fires once per fresh unlock. Auto-
       dismisses after 8s or on click. The fixed overlay sits above the
       page; tapping the backdrop dismisses too. */}
    {toast && (
      <div
        role="dialog"
        aria-modal="false"
        aria-label={`${locale === 'de' ? 'Neues Abzeichen freigeschaltet' : 'New badge unlocked'}: ${toast.label}`}
        onClick={dismissToast}
        className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-auto"
        style={{
          background: 'radial-gradient(80% 60% at 50% 50%, rgba(0,0,0,0.45), rgba(0,0,0,0))',
          animation: 'fade-in 320ms ease-out',
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="rounded-[18px] px-6 py-5 max-w-sm w-full text-center flex flex-col items-center gap-3"
          style={{
            backgroundColor: 'var(--color-paper-2)',
            border: '1px solid color-mix(in srgb, var(--color-good) 40%, var(--color-rule))',
            backgroundImage: `radial-gradient(80% 60% at 50% 0%, color-mix(in srgb, var(--color-good) 15%, transparent), transparent 70%)`,
            boxShadow: '0 12px 40px -12px rgba(0,0,0,0.45)',
            animation: 'score-enter 360ms cubic-bezier(.22,1,.36,1) both',
          }}
        >
          <span
            className="eyebrow num-mono"
            style={{
              color: 'var(--color-good)',
              fontSize: 10,
              letterSpacing: '0.28em',
              fontWeight: 700,
            }}
          >
            {t('new_badge')}
          </span>
          <div
            className="rounded-full p-3 flex items-center justify-center"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-good) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-good) 40%, var(--color-rule))',
            }}
          >
            <span style={{ color: 'var(--color-good)', display: 'flex' }}>
              {toast.icon}
            </span>
          </div>
          <h3
            className="leading-tight"
            style={{
              fontFamily: 'var(--font-serif, serif)',
              fontStyle: 'italic',
              fontSize: 22,
              color: 'var(--color-ink)',
            }}
          >
            {toast.label}
          </h3>
          <p
            className="text-[13px] leading-relaxed"
            style={{ color: 'var(--color-ink-2)', maxWidth: '34ch' }}
          >
            {toast.hint}
          </p>
          <button
            type="button"
            onClick={dismissToast}
            className="mt-2 inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium min-h-[40px]"
            style={{
              backgroundColor: 'var(--color-good)',
              color: 'var(--color-paper)',
            }}
          >
            {locale === 'de' ? 'Stark' : 'Nice'}
          </button>
        </div>
      </div>
    )}
    <div
      className="rounded-[12px] px-4 py-3"
      style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
    >
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <span
          className="eyebrow num-mono"
          style={{ color: 'var(--color-muted)', fontSize: 10, letterSpacing: '0.22em' }}
        >
          {t('badges_eyebrow')} · {sorted.length} {t('unlocked').toUpperCase()}
        </span>
        <span
          className="num-mono"
          style={{ color: 'var(--color-muted)', fontSize: 10 }}
        >
          {ACHIEVEMENT_DEFS.length - sorted.length} {t('more_to_chase')}
        </span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {sorted.map((b) => {
          const isFresh = parseISO(b.unlockedAt) >= sevenAgo
          return (
            <span
              key={b.id}
              className="num-mono text-[11px] px-2 py-1 rounded-md inline-flex items-center gap-1.5 whitespace-nowrap"
              style={{
                color: isFresh ? 'var(--color-good)' : 'var(--color-ink)',
                border: `1px solid ${isFresh ? 'color-mix(in srgb, var(--color-good) 35%, var(--color-rule))' : 'var(--color-rule)'}`,
                backgroundColor: isFresh ? 'color-mix(in srgb, var(--color-good) 6%, transparent)' : 'transparent',
              }}
              title={`${b.hint} · ${b.unlockedAt}`}
            >
              <span style={{ color: isFresh ? 'var(--color-good)' : 'var(--color-amber-2)' }}>
                {b.icon}
              </span>
              {b.label}
              {isFresh && (
                <span
                  className="eyebrow ml-0.5"
                  style={{
                    color: 'var(--color-good)',
                    fontSize: 10.5,
                    letterSpacing: '0.18em',
                    fontWeight: 700,
                  }}
                >
                  {t('new_chip')}
                </span>
              )}
            </span>
          )
        })}
      </div>
    </div>
    </>
  )
}
