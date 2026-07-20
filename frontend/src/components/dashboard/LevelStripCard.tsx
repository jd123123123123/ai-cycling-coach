/**
 * LevelStripCard — the "Arbeit im Sattel" lifetime-work meter, grounded
 * honestly: REAL mechanical work (kJ over the last 90 days) climbing toward
 * the next 5,000 kJ milestone. No levels, no LVL badge, no XP vocabulary and
 * no daily-streak flame (audit P1-11) — competence feedback in physical
 * units only.
 */
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../api/client'
import { useLocale } from '../../contexts/LocaleContext'

const KJ_PER_MILESTONE = 5000

/** Progress toward the next 5,000 kJ milestone — pure, testable. */
export function milestoneMeta(kj: number): { pct: number; toNext: number } {
  const into = kj - Math.floor(kj / KJ_PER_MILESTONE) * KJ_PER_MILESTONE
  return {
    pct: Math.min(100, Math.round((into / KJ_PER_MILESTONE) * 100)),
    toNext: Math.max(0, Math.round(KJ_PER_MILESTONE - into)),
  }
}

/** Audit P1-11 copy: work framed as work — never levels or XP. */
export function milestoneLabel(toNext: number, de: boolean): string {
  return de
    ? `${toNext.toLocaleString('de')} kJ bis zum nächsten Meilenstein — echte Arbeit`
    : `${toNext.toLocaleString('en')} kJ to your next milestone — real work`
}

export default function LevelStripCard() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const { data: profile } = useQuery<{ total_kj: number | null; available?: boolean }>({
    // Shares the locale-keyed cache entry with usePowerProfile (phenotype is localized).
    queryKey: ['analytics', 'power-profile', locale],
    queryFn: async () => (await apiClient.get(`/analytics/power-profile?lang=${locale}`)).data,
    staleTime: 30 * 60 * 1000,
  })

  const kj = profile?.total_kj ?? null
  if (kj == null || kj <= 0) return null

  const { pct, toNext } = milestoneMeta(kj)

  return (
    <div className="rounded-[24px]" style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)', padding: 18 }}>
      {/* Lifetime-work meter: label + total kJ + progress toward next milestone */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink)' }}>
            {de ? 'Arbeit im Sattel' : 'Work in the saddle'}
          </span>
          <span className="num-mono" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-gold)' }}>
            {Math.round(kj).toLocaleString(de ? 'de' : 'en')} kJ
          </span>
        </div>
        <div className="rounded-full overflow-hidden" style={{ height: 10, background: 'var(--color-surface-2)' }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--color-amber), var(--color-gold))' }} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)' }}>
          {milestoneLabel(toNext, de)}
        </span>
      </div>
    </div>
  )
}
