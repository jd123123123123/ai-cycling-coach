import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { formatDistanceToNow } from 'date-fns'
import { RefreshCw, Sparkles, ChevronRight, AlertTriangle } from 'lucide-react'
import { useCoachBrief, useRefreshBrief } from '../../hooks/useCoachBrief'
import type {
  BriefIntensity,
  BriefOption,
  CoachBriefResponse,
  OutlookEntry,
} from '../../api/coach'
import WhyAmITired from './WhyAmITired'
import TransparencyDrawer from './TransparencyDrawer'

// ─── Intensity metadata ──────────────────────────────────────────────────────

const INTENSITY_ORDER: BriefIntensity[] = ['rest', 'easy', 'moderate', 'push']

const INTENSITY_META: Record<BriefIntensity, { label: string; color: string; bar: string }> = {
  rest:     { label: 'Rest',     color: 'var(--color-muted)',    bar: 'repeating-linear-gradient(90deg, var(--color-muted) 0 4px, transparent 4px 8px)' },
  easy:     { label: 'Easy',     color: 'var(--color-forest-2)', bar: 'var(--color-forest-2)' },
  moderate: { label: 'Moderate', color: 'var(--color-ink-blue)', bar: 'var(--color-ink-blue)' },
  push:     { label: 'Push',     color: 'var(--color-amber-2)',  bar: 'var(--color-amber-2)' },
}

function isRuleBased(model: string): boolean {
  return model === 'rule-based-fallback'
}

// ─── Evidence chips — inline, typographic ────────────────────────────────────

interface EvidenceChipProps { children: React.ReactNode; tone?: 'default' | 'alert' }

function EvidenceChip({ children, tone = 'default' }: EvidenceChipProps) {
  const fg = tone === 'alert' ? 'var(--color-alert)' : 'var(--color-ink)'
  const bg = tone === 'alert' ? 'rgba(138, 29, 29, 0.07)' : 'rgba(20,24,17,0.05)'
  const border = tone === 'alert' ? 'rgba(138, 29, 29, 0.25)' : 'var(--color-rule)'
  return (
    <span
      className="num-mono text-[12px] px-2 py-0.5 rounded-sm whitespace-nowrap"
      style={{ color: fg, backgroundColor: bg, border: `1px solid ${border}` }}
    >
      {children}
    </span>
  )
}

/**
 * Derive inline evidence chips from the snapshot the LLM was shown.
 * Falls back gracefully when fields are missing (rule-based fallback).
 */
function buildEvidenceChips(evidence: Record<string, unknown>): React.ReactNode[] {
  const chips: React.ReactNode[] = []
  const pmc = evidence.pmc as Record<string, unknown> | undefined
  const biometrics = evidence.biometrics as Record<string, unknown> | undefined

  const tsb = (pmc?.tsb ?? evidence.tsb) as number | null | undefined
  if (typeof tsb === 'number') {
    const tone = tsb < -20 ? 'alert' : 'default'
    chips.push(<EvidenceChip key="tsb" tone={tone}>TSB {tsb >= 0 ? '+' : ''}{tsb.toFixed(0)}</EvidenceChip>)
  }

  const ctl = (pmc?.ctl ?? evidence.ctl) as number | null | undefined
  if (typeof ctl === 'number') {
    chips.push(<EvidenceChip key="ctl">CTL {ctl.toFixed(0)}</EvidenceChip>)
  }

  const hrvDelta = (biometrics?.hrv_delta_pct ?? evidence.hrv_delta_pct) as number | null | undefined
  if (typeof hrvDelta === 'number') {
    const sign = hrvDelta >= 0 ? '+' : ''
    const tone = hrvDelta < -8 ? 'alert' : 'default'
    chips.push(<EvidenceChip key="hrv" tone={tone}>HRV {sign}{hrvDelta.toFixed(0)}% 7d</EvidenceChip>)
  }

  const sleepDebt = (biometrics?.sleep_debt_hours ?? evidence.sleep_debt_hours) as number | null | undefined
  if (typeof sleepDebt === 'number' && sleepDebt > 0.2) {
    const tone = sleepDebt > 3 ? 'alert' : 'default'
    chips.push(<EvidenceChip key="sleep" tone={tone}>Sleep debt {sleepDebt.toFixed(1)}h</EvidenceChip>)
  }

  const zoneCreep = (evidence.zone_creep ?? (evidence.zones as Record<string, unknown> | undefined)?.grey_zone_flag) as boolean | undefined
  if (zoneCreep === true) {
    chips.push(<EvidenceChip key="zone" tone="alert">Grey-zone creep</EvidenceChip>)
  }

  const injury = (evidence.injury_flag ?? (evidence.athlete as Record<string, unknown> | undefined)?.injury_flag) as boolean | undefined
  if (injury === true) {
    chips.push(<EvidenceChip key="injury" tone="alert">Injury flagged</EvidenceChip>)
  }

  return chips
}

// ─── 7-day outlook mini chart (uPlot bars) ───────────────────────────────────

function OutlookChart({ outlook }: { outlook: OutlookEntry[] }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el || outlook.length === 0) return
    const width = el.clientWidth || 400

    const xs = outlook.map((o) => o.day_offset)
    const ys = outlook.map((o) => o.suggested_tss)
    const maxY = Math.max(60, ...ys)

    // Use uPlot's native bars factory — 55% width, rounded corners not supported
    // natively but we keep the editorial feel with spacing.
    const barsBuilder = uPlot.paths.bars?.({ size: [0.55] })

    const opts: uPlot.Options = {
      width,
      height: 72,
      padding: [4, 8, 4, 8],
      scales: {
        x: { time: false, range: [-0.5, 6.5] },
        y: { range: [0, maxY * 1.1] },
      },
      series: [
        {},
        {
          label: 'Suggested TSS',
          stroke: 'var(--color-ink)',
          fill: 'var(--color-ink)',
          width: 0,
          paths: barsBuilder,
          points: { show: false },
        },
      ],
      axes: [
        {
          show: true,
          stroke: '#757465',
          grid: { show: false },
          ticks: { show: false },
          font: '10px JetBrains Mono, monospace',
          size: 18,
          values: (_u, splits) =>
            splits.map((v) => {
              const offset = Math.round(v as number)
              if (offset === 0) return 'today'
              const d = new Date()
              d.setDate(d.getDate() + offset)
              return d.toLocaleDateString('en', { weekday: 'short' }).slice(0, 3)
            }),
        },
        { show: false },
      ],
      legend: { show: false },
      cursor: { drag: { x: false, y: false }, x: false, y: false },
    }

    const data: uPlot.AlignedData = [xs, ys]
    const plot = new uPlot(opts, data, el)
    const ro = new ResizeObserver(() => {
      if (el) plot.setSize({ width: el.clientWidth, height: 72 })
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      plot.destroy()
    }
  }, [outlook])

  return <div ref={containerRef} className="w-full min-w-0" />
}

// ─── Option card ─────────────────────────────────────────────────────────────

function OptionCard({ option, recommended }: { option: BriefOption; recommended: boolean }) {
  const meta = INTENSITY_META[option.intensity]
  const blocked = option.blocked === true
  const opacity = blocked ? 0.45 : 1
  const borderColor = recommended && !blocked ? meta.color : 'var(--color-rule)'
  const glow = recommended && !blocked ? `0 0 0 1px ${meta.color}40, 0 10px 28px -18px ${meta.color}` : 'none'

  return (
    <div
      className="relative flex flex-col gap-2 rounded-[12px] p-3 transition-all min-w-0"
      style={{
        backgroundColor: 'var(--color-paper)',
        border: `1px solid ${borderColor}`,
        opacity,
        boxShadow: glow,
      }}
      title={blocked ? option.block_reason ?? 'Blocked by safety rails' : undefined}
    >
      {/* Intensity bar */}
      <div className="flex items-center gap-2">
        <span
          className="h-1.5 flex-1 rounded-full"
          style={{ background: meta.bar, opacity: blocked ? 0.5 : 1 }}
        />
        <span
          className="eyebrow whitespace-nowrap"
          style={{ color: meta.color, letterSpacing: '0.22em' }}
        >
          {meta.label}
        </span>
      </div>
      {/* TSS target */}
      <div className="flex items-baseline gap-1">
        <span
          className="num-display leading-none"
          style={{ fontSize: 22, color: 'var(--color-ink)', textDecoration: blocked ? 'line-through' : 'none' }}
        >
          {Math.round(option.tss_target)}
        </span>
        <span className="num-mono text-[10px]" style={{ color: 'var(--color-muted)' }}>TSS</span>
      </div>
      {/* Title + why */}
      <div className="flex flex-col gap-0.5 min-w-0">
        <span
          className="serif-caps text-[13px] leading-tight dashboard-break-words"
          style={{ color: 'var(--color-ink)' }}
        >
          {option.title}
        </span>
        <span
          className="text-[11px] leading-snug dashboard-break-words"
          style={{ color: 'var(--color-ink-2)' }}
        >
          {option.why}
        </span>
      </div>
      {blocked && option.block_reason && (
        <div
          className="flex items-start gap-1.5 mt-0.5 pt-1.5"
          style={{ borderTop: '1px dashed var(--color-rule)' }}
        >
          <AlertTriangle size={11} strokeWidth={1.8} style={{ color: 'var(--color-alert)', flexShrink: 0, marginTop: 1 }} />
          <span className="text-[10px] leading-snug" style={{ color: 'var(--color-alert)' }}>
            {option.block_reason}
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function BriefSkeleton() {
  return (
    <div
      className="paper-grain rounded-[18px] p-6 sm:p-8"
      style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
    >
      <div className="h-4 w-32 rounded animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
      <div className="h-10 w-3/4 mt-4 rounded animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
      <div className="h-20 w-full mt-4 rounded animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-5">
        {[0,1,2,3].map((i) => (
          <div key={i} className="h-24 rounded-[12px] animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
        ))}
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function CoachBrief() {
  const { data, isLoading, isError, refetch } = useCoachBrief()
  const refresh = useRefreshBrief()

  const [whyOpen, setWhyOpen] = useState(false)
  const [transparencyOpen, setTransparencyOpen] = useState(false)

  if (isLoading) return <BriefSkeleton />

  if (isError || !data) {
    return (
      <div
        className="paper-grain rounded-[18px] p-6 sm:p-8 flex items-center justify-between gap-3 flex-wrap"
        style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
      >
        <span className="eyebrow" style={{ color: 'var(--color-alert)' }}>
          Couldn&apos;t load today&apos;s brief
        </span>
        <button
          onClick={() => void refetch()}
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium min-h-[40px]"
          style={{ backgroundColor: 'var(--color-ink)', color: 'var(--color-paper)' }}
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <>
      <BriefBody
        brief={data}
        isRefreshing={refresh.isPending}
        onRefresh={() => refresh.mutate()}
        onOpenWhy={() => setWhyOpen(true)}
        onOpenTransparency={() => setTransparencyOpen(true)}
      />
      <WhyAmITired open={whyOpen} onClose={() => setWhyOpen(false)} />
      <TransparencyDrawer open={transparencyOpen} onClose={() => setTransparencyOpen(false)} />
    </>
  )
}

// ─── Body — extracted so the motion stagger has a clean parent ───────────────

function BriefBody({
  brief, isRefreshing, onRefresh, onOpenWhy, onOpenTransparency,
}: {
  brief: CoachBriefResponse
  isRefreshing: boolean
  onRefresh: () => void
  onOpenWhy: () => void
  onOpenTransparency: () => void
}) {
  const ruleBased = isRuleBased(brief.model_used)

  const evidenceChips = useMemo(
    () => buildEvidenceChips(brief.evidence || {}),
    [brief.evidence],
  )

  // Identify the "recommended" option — conventionally the first non-blocked,
  // highest-intensity-under-ceiling. Here we use the last non-blocked entry in
  // intensity order (rest < easy < moderate < push). If none exist (all blocked),
  // nothing highlighted.
  const recommended = useMemo(() => {
    const sorted = [...brief.options].sort(
      (a, b) => INTENSITY_ORDER.indexOf(a.intensity) - INTENSITY_ORDER.indexOf(b.intensity),
    )
    const unblocked = sorted.filter((o) => !o.blocked)
    return unblocked[unblocked.length - 1]?.intensity ?? null
  }, [brief.options])

  const generatedAgo = useMemo(() => {
    try {
      return formatDistanceToNow(new Date(brief.generated_at), { addSuffix: true })
    } catch { return '' }
  }, [brief.generated_at])

  // Ensure options render in canonical intensity order (rest → push)
  const orderedOptions = useMemo(() => {
    const byIntensity = new Map(brief.options.map((o) => [o.intensity, o]))
    return INTENSITY_ORDER.map((i) => byIntensity.get(i)).filter(
      (o): o is BriefOption => o !== undefined,
    )
  }, [brief.options])

  return (
    <motion.div
      className="paper-grain rounded-[18px] p-5 sm:p-7 flex flex-col gap-5 min-w-0"
      style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 1 },
        visible: { transition: { staggerChildren: 0.08, delayChildren: 0.04 } },
      }}
    >
      {/* Header row — eyebrow + meta + refresh */}
      <motion.div
        className="flex items-center justify-between gap-3 flex-wrap"
        variants={{ hidden: { opacity: 0, y: -6 }, visible: { opacity: 1, y: 0 } }}
        transition={{ duration: 0.35 }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Sparkles size={14} strokeWidth={1.8} style={{ color: 'var(--color-amber)' }} />
          <span className="eyebrow" style={{ color: 'var(--color-amber)' }}>
            Coach brief · today
          </span>
          {generatedAgo && (
            <span className="eyebrow opacity-60 num-mono">{generatedAgo}</span>
          )}
          {brief.from_cache && (
            <span
              className="eyebrow num-mono px-1.5 py-0.5 rounded-sm"
              style={{
                color: 'var(--color-muted)',
                backgroundColor: 'rgba(20,24,17,0.04)',
                border: '1px solid var(--color-rule)',
              }}
              title="Served from the 6h read-through cache"
            >
              cached
            </span>
          )}
          {ruleBased && (
            <span
              className="eyebrow num-mono px-1.5 py-0.5 rounded-sm"
              style={{
                color: 'var(--color-amber)',
                backgroundColor: 'rgba(176, 74, 12, 0.08)',
                border: '1px solid rgba(176, 74, 12, 0.25)',
              }}
              title="Set ANTHROPIC_API_KEY in backend/.env to enable Claude coaching"
            >
              AI offline · rule-based
            </span>
          )}
        </div>
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[12px] font-medium transition-colors min-h-[40px] disabled:opacity-50"
          style={{
            color: 'var(--color-ink-2)',
            border: '1px solid var(--color-rule)',
            backgroundColor: 'transparent',
          }}
          aria-label="Regenerate brief"
          title="Force a fresh generation"
        >
          <RefreshCw size={12} strokeWidth={1.8} className={isRefreshing ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </motion.div>

      {/* Verdict */}
      <motion.h2
        className="num-display leading-[1.02] max-w-[22ch]"
        style={{
          fontSize: 'clamp(28px, 4.2vw, 42px)',
          color: 'var(--color-ink)',
          fontStyle: 'italic',
          fontVariationSettings: '"opsz" 144, "SOFT" 30',
        }}
        variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
        transition={{ duration: 0.45 }}
      >
        {brief.verdict}
      </motion.h2>

      {/* Rationale */}
      <motion.p
        className="text-[15px] sm:text-[16px] leading-relaxed dashboard-break-words"
        style={{ color: 'var(--color-ink-2)', maxWidth: '60ch' }}
        variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}
        transition={{ duration: 0.4 }}
      >
        {brief.rationale}
      </motion.p>

      {/* Evidence chips */}
      {evidenceChips.length > 0 && (
        <motion.div
          className="flex items-center gap-2 flex-wrap"
          variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
          transition={{ duration: 0.35 }}
        >
          {evidenceChips}
        </motion.div>
      )}

      {/* Options grid */}
      <motion.div
        className="grid gap-2.5 grid-cols-2 md:grid-cols-4 min-w-0"
        variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}
        transition={{ duration: 0.4 }}
      >
        {orderedOptions.map((o) => (
          <OptionCard key={o.intensity} option={o} recommended={o.intensity === recommended} />
        ))}
      </motion.div>

      {/* Outlook */}
      {brief.outlook_7d && brief.outlook_7d.length > 0 && (
        <motion.div
          className="flex flex-col gap-2 pt-1"
          variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="eyebrow">7-day outlook</span>
            <span className="num-mono text-[11px]" style={{ color: 'var(--color-muted)' }}>
              {brief.outlook_7d.reduce((s, e) => s + (e.suggested_tss ?? 0), 0).toFixed(0)} TSS total
            </span>
          </div>
          <OutlookChart outlook={brief.outlook_7d} />
        </motion.div>
      )}

      {/* Frameworks cited */}
      {brief.frameworks_cited.length > 0 && (
        <motion.div
          className="pt-2 border-t"
          style={{ borderColor: 'var(--color-rule)' }}
          variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
          transition={{ duration: 0.3 }}
        >
          <span
            className="num-mono text-[11px] leading-relaxed"
            style={{ color: 'var(--color-muted)' }}
          >
            Grounded in: {brief.frameworks_cited.join(' · ')}
          </span>
        </motion.div>
      )}

      {/* Transparency links */}
      <motion.div
        className="flex items-center gap-2 flex-wrap pt-1"
        variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
        transition={{ duration: 0.3 }}
      >
        <button
          onClick={onOpenWhy}
          className="inline-flex items-center gap-1 text-[12px] font-medium transition-colors"
          style={{ color: 'var(--color-ink-2)' }}
        >
          <ChevronRight size={13} strokeWidth={2} />
          <span className="underline underline-offset-2 decoration-[var(--color-rule)] hover:decoration-[var(--color-ink)]">
            Why this?
          </span>
        </button>
        <span className="eyebrow opacity-40">·</span>
        <button
          onClick={onOpenTransparency}
          className="inline-flex items-center gap-1 text-[12px] font-medium transition-colors"
          style={{ color: 'var(--color-ink-2)' }}
        >
          <ChevronRight size={13} strokeWidth={2} />
          <span className="underline underline-offset-2 decoration-[var(--color-rule)] hover:decoration-[var(--color-ink)]">
            What did the AI see?
          </span>
        </button>
      </motion.div>
    </motion.div>
  )
}
