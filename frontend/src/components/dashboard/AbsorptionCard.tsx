/**
 * AbsorptionCard — absorb-and-replan disclosure (roadmap P1.4).
 *
 * When the plan silently absorbed an unplanned or bigger-than-planned ride,
 * this card says so with zero guilt: the ride is BANKED, and if the week was
 * rebalanced it names exactly what moved. Renders nothing when nothing was
 * absorbed. The most-praised adaptive behavior in the research, made visible.
 */
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { CheckCircle2 } from 'lucide-react'
import { apiClient } from '../../api/client'
import { useLocale } from '../../contexts/LocaleContext'
import { GLASS_CARD_MARKER, GLASS_PAPER_2, GLASS_BLUR } from './glassCard'

interface Absorption {
  rationale: string
  activity_id: number
  date: string
  kind: 'unplanned' | 'bigger'
  actual_tss: number
  planned_tss: number
  rebalance: { moved_date: string; from_title: string; to: string; freed_tss: number } | null
}

export default function AbsorptionCard() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const { data } = useQuery<Absorption[]>({
    queryKey: ['coach', 'absorptions'],
    queryFn: async () => (await apiClient.get<Absorption[]>('/coach/absorptions?days=3')).data,
    staleTime: 15 * 60 * 1000,
  })

  if (!data || data.length === 0) return null
  const a = data[0]
  const day = (iso: string) => format(parseISO(iso), de ? 'EEEE' : 'EEEE')

  const headline = a.kind === 'unplanned'
    ? (de ? `Starke Fahrt — ${a.actual_tss} TSS eingebucht.` : `Great ride — ${a.actual_tss} TSS banked.`)
    : (de ? `Größer als geplant — ${a.actual_tss} statt ${a.planned_tss} TSS. Zählt alles.` : `Bigger than planned — ${a.actual_tss} for ${a.planned_tss} TSS. It all counts.`)

  const rebalanceLine = a.rebalance
    ? (de
        ? `Die Woche wurde angepasst: ${a.rebalance.from_title} am ${day(a.rebalance.moved_date)} wird lockerer (−${a.rebalance.freed_tss} TSS).`
        : `The week rebalanced: ${a.rebalance.from_title} on ${day(a.rebalance.moved_date)} eases up (−${a.rebalance.freed_tss} TSS).`)
    : (de ? 'Die Woche passt weiterhin — nichts weiter geändert.' : 'The week still fits — nothing else changed.')

  return (
    <div
      className="rounded-[24px] p-5 flex items-start gap-3.5"
      style={{
        background: `color-mix(in srgb, var(--color-recovery) 8%, ${GLASS_PAPER_2})`,
        border: '1px solid color-mix(in srgb, var(--color-recovery) 45%, var(--color-rule))',
        ...GLASS_BLUR,
      }}
      {...GLASS_CARD_MARKER}
    >
      <span className="grid place-items-center rounded-full shrink-0" style={{ width: 40, height: 40, background: 'color-mix(in srgb, var(--color-recovery) 16%, transparent)' }}>
        <CheckCircle2 size={20} style={{ color: 'var(--color-recovery)' }} />
      </span>
      <div className="flex flex-col gap-1 min-w-0">
        <span className="eyebrow" style={{ fontSize: 10.5, letterSpacing: '0.14em', color: 'var(--color-recovery)', fontWeight: 700 }}>
          {de ? 'PLAN HAT MITGEDACHT' : 'PLAN ABSORBED IT'}
        </span>
        <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--color-ink)', lineHeight: 1.3 }}>{headline}</span>
        <p style={{ fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.45 }}>{rebalanceLine}</p>
      </div>
    </div>
  )
}
