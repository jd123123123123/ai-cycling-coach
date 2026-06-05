import { useEffect, useMemo, useState } from 'react'
import { differenceInCalendarDays, getDayOfYear, startOfYear, subDays } from 'date-fns'
import { Lightbulb } from 'lucide-react'
import { prefersReducedMotion } from '../../utils/motion'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { useDailyMetrics } from '../../hooks/useDailyMetrics'
import { useT, useLocale } from '../../contexts/LocaleContext'
import type { Locale } from '../../i18n/strings'
import type { ActivityRead } from '../../api/dashboard'

/**
 * DidYouKnow — a single rotating data-driven trivia line on Today.
 *
 * Computes a pool of season-long facts from the athlete's own activity
 * history, then picks one deterministically per day (day-of-year mod N) so
 * the card is stable across page reloads but shifts each morning. Each fact
 * is one sentence with one bolded number — the "look how far you've come"
 * mechanic that makes Strava's year-in-review work, on a daily cadence.
 *
 * Renders nothing if there's not enough data (< 5 logged activities this
 * year) so brand-new accounts don't see thin numbers framed as triumphs.
 */

const KM_BETWEEN: Array<{ km: number; en: string; de: string }> = [
  { km: 200, en: 'Berlin to Hamburg', de: 'Berlin–Hamburg' },
  { km: 500, en: 'Munich to Hamburg', de: 'München–Hamburg' },
  { km: 580, en: 'Berlin to Munich', de: 'Berlin–München' },
  { km: 870, en: 'a full Paris-Brest-Paris loop', de: 'eine ganze Paris–Brest–Paris-Runde' },
  { km: 1200, en: 'a London Edinburgh London', de: 'ein London–Edinburgh–London' },
  { km: 1800, en: 'Berlin to Lisbon', de: 'Berlin–Lissabon' },
  { km: 3500, en: 'a Tour de France in distance', de: 'eine Tour de France an Distanz' },
  { km: 5000, en: 'the Tour Divide in distance', de: 'die Tour Divide an Distanz' },
  { km: 7000, en: 'Berlin to Beijing', de: 'Berlin–Peking' },
]

function kmComparison(km: number, locale: Locale): string | null {
  const best = [...KM_BETWEEN].reverse().find((c) => km >= c.km)
  if (!best) return null
  const ratio = km / best.km
  if (ratio < 0.95) return null
  return locale === 'de' ? best.de : best.en
}

interface Fact {
  text: string
}

function buildPool(
  acts: ActivityRead[],
  yearStartActs: ActivityRead[],
  today: Date,
  locale: Locale,
): Fact[] {
  const de = locale === 'de'
  const nf = de ? 'de-DE' : 'en-US'
  const num = (n: number) => Math.round(n).toLocaleString(nf)
  const pool: Fact[] = []

  // YTD totals
  let kmYtd = 0
  let hoursYtd = 0
  let sessionsYtd = 0
  let tssYtd = 0
  for (const a of yearStartActs) {
    if ((a.duration_seconds ?? 0) < 600) continue
    sessionsYtd += 1
    hoursYtd += (a.duration_seconds ?? 0) / 3600
    kmYtd += (a.distance_meters ?? 0) / 1000
    tssYtd += a.tss ?? 0
  }

  if (kmYtd >= 50) {
    const cmp = kmComparison(kmYtd, locale)
    if (de) {
      pool.push({
        text: cmp
          ? `Du bist dieses Jahr ${num(kmYtd)} km gefahren — etwa ${cmp}.`
          : `Du bist dieses Jahr ${num(kmYtd)} km gefahren.`,
      })
    } else {
      pool.push({
        text: cmp
          ? `You've ridden ${num(kmYtd)} km this year — about ${cmp}.`
          : `You've ridden ${num(kmYtd)} km this year.`,
      })
    }
  }

  if (hoursYtd >= 5) {
    const fullDays = Math.floor(hoursYtd / 24)
    if (de) {
      pool.push({
        text: fullDays >= 1
          ? `${hoursYtd.toFixed(1)} Stunden im Sattel dieses Jahr — das sind ${fullDays} volle ${fullDays === 1 ? 'Tag' : 'Tage'} Fahrzeit.`
          : `${hoursYtd.toFixed(1)} Stunden im Sattel dieses Jahr.`,
      })
    } else {
      pool.push({
        text: fullDays >= 1
          ? `${hoursYtd.toFixed(1)} hours in the saddle this year — that's ${fullDays} full ${fullDays === 1 ? 'day' : 'days'} of riding.`
          : `${hoursYtd.toFixed(1)} hours in the saddle this year.`,
      })
    }
  }

  if (sessionsYtd >= 8) {
    const daysSoFar = differenceInCalendarDays(today, startOfYear(today)) + 1
    const perWeek = (sessionsYtd / daysSoFar) * 7
    pool.push({
      text: de
        ? `${sessionsYtd} Einheiten dieses Jahr — im Schnitt ${perWeek.toFixed(1)} pro Woche.`
        : `${sessionsYtd} sessions logged this year — averaging ${perWeek.toFixed(1)} per week.`,
    })
  }

  // Longest ride this year
  const longest = [...yearStartActs]
    .filter((a) => (a.duration_seconds ?? 0) >= 600)
    .sort((a, b) => (b.duration_seconds ?? 0) - (a.duration_seconds ?? 0))[0]
  if (longest) {
    const h = (longest.duration_seconds ?? 0) / 3600
    const km = (longest.distance_meters ?? 0) / 1000
    if (h >= 1.5) {
      if (de) {
        pool.push({
          text: km > 5
            ? `Deine längste Ausfahrt dieses Jahr war ${h.toFixed(1)} h und ${Math.round(km)} km — die hat sich den Kaffee danach verdient.`
            : `Deine längste Ausfahrt dieses Jahr dauerte ${h.toFixed(1)} Stunden.`,
        })
      } else {
        pool.push({
          text: km > 5
            ? `Your longest ride this year was ${h.toFixed(1)} h and ${Math.round(km)} km — that one earned its post-ride coffee.`
            : `Your longest ride this year clocked ${h.toFixed(1)} hours.`,
        })
      }
    }
  }

  // Day-of-week pattern (last 90 days)
  if (acts.length >= 5) {
    const counts = [0, 0, 0, 0, 0, 0, 0]  // Sun..Sat
    for (const a of acts) {
      try {
        const d = new Date(a.started_at)
        counts[d.getDay()] += 1
      } catch {
        /* ignore */
      }
    }
    const dayLabels = de
      ? ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
      : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    let maxIdx = 0
    for (let i = 1; i < 7; i++) if (counts[i] > counts[maxIdx]) maxIdx = i
    if (counts[maxIdx] >= 3) {
      pool.push({
        text: de
          ? `Dein meistgefahrener Tag dieses Quartal ist ${dayLabels[maxIdx]} — ${counts[maxIdx]} Einheiten im Logbuch.`
          : `Your most-ridden day this quarter is ${dayLabels[maxIdx]} — ${counts[maxIdx]} sessions on the books.`,
      })
    }
  }

  // Energy expenditure proxy from TSS (rough: 1 TSS @ FTP 250 ≈ ~10-12 kJ for
  // a 75 kg rider; we use 11 as a middling constant since FTP isn't passed in
  // and the fact is conversational, not clinical).
  if (tssYtd >= 200) {
    const kJ = tssYtd * 11
    const calories = Math.round(kJ / 4.184)  // 1 kcal ≈ 4.184 kJ
    if (calories >= 10_000) {
      const pizzas = Math.round(calories / 2500)
      pool.push({
        text: de
          ? `Rund ${num(kJ)} kJ Arbeit dieses Jahr — das entspricht etwa ${pizzas} großen Pizzen zum Abendessen.`
          : `Roughly ${num(kJ)} kJ of work this year — that's about ${pizzas} large pizzas worth of dinner.`,
      })
    }
  }

  return pool
}

export default function DidYouKnow() {
  const t = useT()
  const { locale } = useLocale()
  const today = useMemo(() => new Date(), [])
  const yearStart = useMemo(() => startOfYear(today), [today])
  const ninetyAgo = useMemo(() => subDays(today, 90), [today])

  const { data: ytdData, isLoading } = useActivitiesRange(yearStart, today)
  const { data: ninetyData } = useActivitiesRange(ninetyAgo, today)
  // Bound the daily-metrics request the same way other Today components do
  // — keeps React Query cache hits warm even though we don't read it directly.
  useDailyMetrics(useMemo(() => subDays(today, 14), [today]), today)

  // Rotate the whole pool rather than pinning one fact per day — the season has
  // more than one story to tell. Start on a day-seeded offset so the opening
  // fact still shifts each morning.
  const pool = useMemo(() => {
    const acts = ninetyData?.activities ?? []
    const ytdActs = ytdData?.activities ?? []
    return buildPool(acts, ytdActs, today, locale)
  }, [ninetyData, ytdData, today, locale])

  // `step` advances; the displayed index is derived from a day-of-year seed so
  // the opening fact still shifts each morning — no seeding effect (and no
  // synchronous setState in render) required.
  const [step, setStep] = useState(0)
  const reduceMotion = prefersReducedMotion()

  const len = pool.length
  const seed = len > 0 ? getDayOfYear(today) % len : 0
  const index = len > 0 ? (seed + step) % len : 0

  // Auto-advance every 7s. Pauses for reduced-motion users and single-fact pools.
  useEffect(() => {
    if (reduceMotion || len < 2) return
    const id = window.setInterval(() => setStep((s) => s + 1), 7000)
    return () => window.clearInterval(id)
  }, [reduceMotion, len])

  if (isLoading) return null
  if (len === 0) return null

  const fact = pool[index]

  return (
    <div
      className="rounded-[12px] px-4 py-3 flex items-start gap-3"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--color-amber-2) 6%, var(--color-paper-2))',
        border: '1px solid color-mix(in srgb, var(--color-amber-2) 24%, var(--color-rule))',
      }}
    >
      <Lightbulb
        size={14}
        strokeWidth={2}
        style={{ color: 'var(--color-amber-2)', marginTop: 2, flexShrink: 0 }}
      />
      <div className="flex flex-col gap-1.5 min-w-0 flex-1">
        <span
          className="eyebrow num-mono"
          style={{
            color: 'var(--color-amber-2)',
            fontSize: 9,
            letterSpacing: '0.22em',
            fontWeight: 600,
          }}
        >
          {t('did_you_know')}
        </span>
        <p
          key={index}
          className="text-[13px] leading-relaxed"
          style={{
            color: 'var(--color-ink)',
            maxWidth: '60ch',
            animation: reduceMotion ? undefined : 'fade-in 320ms ease-out both',
          }}
        >
          {fact.text}
        </p>

        {/* Pager dots — clickable; also a quiet hint there's more than one fact. */}
        {pool.length > 1 && (
          <div className="flex items-center gap-1.5 mt-0.5">
            {pool.map((_, i) => {
              const active = i === index
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setStep(((i - seed) % len + len) % len)}
                  aria-label={`Fact ${i + 1} of ${len}`}
                  aria-current={active ? 'true' : undefined}
                  style={{
                    width: active ? 16 : 6,
                    height: 6,
                    borderRadius: 3,
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    backgroundColor: active
                      ? 'var(--color-amber-2)'
                      : 'color-mix(in srgb, var(--color-amber-2) 30%, transparent)',
                    transition: 'width 240ms ease, background-color 240ms ease',
                  }}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
