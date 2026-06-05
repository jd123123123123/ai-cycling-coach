import { useMemo, useState } from 'react'
import { Responsive, useContainerWidth, type Layout } from 'react-grid-layout'
import { AnimatePresence, motion } from 'motion/react'
import { Pencil, Sparkles, Trash2 } from 'lucide-react'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import ChartCanvas from './ChartCanvas'
import { useAnalyticsQuery } from '../../hooks/useAnalyticsQuery'
import { summarizeChart } from '../../api/analytics'
import type { ChartSpec } from '../../types/chartSpec'
import type { GridLayoutItem } from '../../api/dashboards'
import { useLocale } from '../../contexts/LocaleContext'

// react-grid-layout v2 dropped the WidthProvider HOC in favor of useContainerWidth.
function ResponsiveGrid({ children, ...props }: React.ComponentProps<typeof Responsive>) {
  const { width, containerRef } = useContainerWidth()
  return (
    <div ref={containerRef as React.Ref<HTMLDivElement>}>
      <Responsive {...props} width={width}>
        {children}
      </Responsive>
    </div>
  )
}

/**
 * DashboardCanvas — drag-to-rearrange, resize-to-taste grid of charts.
 *
 * Each cell is a `<ChartCanvas>` rendered with the live ChartSpec; the
 * surrounding chrome adds an edit affordance and a delete button when
 * the dashboard is in `editable` mode (read-only otherwise).
 *
 * Layout state is fully controlled by the parent so saves can persist
 * the exact grid the user laid out — including across breakpoints.
 */

interface DashboardCanvasProps {
  charts: ChartSpec[]
  layout: GridLayoutItem[]
  editable?: boolean
  onLayoutChange?: (layout: GridLayoutItem[]) => void
  onEditChart?: (chartId: string) => void
  onDeleteChart?: (chartId: string) => void
}

const COLS = { lg: 12, md: 12, sm: 6, xs: 4, xxs: 2 }
const BREAKPOINTS = { lg: 1280, md: 996, sm: 768, xs: 480, xxs: 0 }
const ROW_HEIGHT = 56

function ensureLayout(charts: ChartSpec[], layout: GridLayoutItem[]): GridLayoutItem[] {
  // Make sure every chart has a layout entry; auto-place new charts.
  const byId = new Map(layout.map((l) => [l.i, l]))
  const result: GridLayoutItem[] = []
  let cursorY = layout.length ? Math.max(...layout.map((l) => l.y + l.h)) : 0
  for (const c of charts) {
    if (!c.id) continue
    const existing = byId.get(c.id)
    if (existing) {
      result.push(existing)
    } else {
      result.push({ i: c.id, x: 0, y: cursorY, w: 6, h: 6, minW: 3, minH: 4 })
      cursorY += 6
    }
  }
  return result
}

export default function DashboardCanvas({
  charts,
  layout,
  editable = false,
  onLayoutChange,
  onEditChart,
  onDeleteChart,
}: DashboardCanvasProps) {
  const { locale } = useLocale()
  const safeLayout = useMemo(() => ensureLayout(charts, layout), [charts, layout])

  const handleLayoutChange = (newLayout: Layout[]) => {
    if (!onLayoutChange) return
    onLayoutChange(
      newLayout.map((l) => ({
        i: String(l.i),
        x: l.x,
        y: l.y,
        w: l.w,
        h: l.h,
        minW: l.minW,
        minH: l.minH,
      })),
    )
  }

  if (charts.length === 0) {
    return (
      <div
        className="rounded-[18px] py-12 px-6 text-center flex flex-col items-center gap-3"
        style={{
          backgroundColor: 'var(--color-paper-2)',
          border: '1px dashed var(--color-rule)',
        }}
      >
        <span
          className="eyebrow"
          style={{ color: 'var(--color-forest)', letterSpacing: '0.28em', fontSize: 11 }}
        >
          {locale === 'de' ? 'Eine leere Leinwand' : 'A blank canvas'}
        </span>
        <p
          className="text-[14px] max-w-[42ch] leading-relaxed"
          style={{ color: 'var(--color-ink-2)' }}
        >
          {locale === 'de' ? (
            <>
              Klicke auf <strong style={{ color: 'var(--color-ink)' }}>+ Diagramm hinzufügen</strong>, um
              deine erste Karte abzulegen. Ziehe an den Ecken zum Skalieren, an der Kopfzeile zum Verschieben.
            </>
          ) : (
            <>
              Click <strong style={{ color: 'var(--color-ink)' }}>+ Add chart</strong> to drop your
              first card. Drag the corners to resize, drag the header to move.
            </>
          )}
        </p>
      </div>
    )
  }

  return (
    <ResponsiveGrid
      className="layout"
      layouts={{ lg: safeLayout, md: safeLayout, sm: safeLayout, xs: safeLayout, xxs: safeLayout }}
      cols={COLS}
      breakpoints={BREAKPOINTS}
      rowHeight={ROW_HEIGHT}
      margin={[14, 14]}
      isDraggable={editable}
      isResizable={editable}
      draggableHandle=".cell-handle"
      onLayoutChange={handleLayoutChange}
    >
      {charts.map((chart) => (
        <div key={chart.id} className="relative">
          <Cell
            chart={chart}
            editable={editable}
            onEdit={() => chart.id && onEditChart?.(chart.id)}
            onDelete={() => chart.id && onDeleteChart?.(chart.id)}
          />
        </div>
      ))}
    </ResponsiveGrid>
  )
}

interface CellInnerProps {
  chart: ChartSpec
  editable: boolean
  onEdit: () => void
  onDelete: () => void
}

function Cell({ chart, editable, onEdit, onDelete }: CellInnerProps) {
  const { locale } = useLocale()
  // Read the same query the chart renders from, so the summarise call gets
  // the exact rows the user is looking at without a re-fetch.
  const { data } = useAnalyticsQuery(chart.query)
  const [summary, setSummary] = useState<string | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)

  const handleSummarize = async () => {
    if (!data) return
    setLoadingSummary(true)
    try {
      const res = await summarizeChart({
        chart_title: chart.title ?? null,
        chart_mark: chart.mark,
        rows: data.rows,
        x_field: chart.encoding.x,
        y_field: chart.encoding.y,
        series_field: chart.encoding.series ?? null,
      })
      setSummary(res.narrative)
    } catch {
      setSummary(
        locale === 'de'
          ? 'Zusammenfassung konnte gerade nicht erstellt werden.'
          : 'Could not generate summary right now.',
      )
    } finally {
      setLoadingSummary(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="@container flex flex-col rounded-[18px] overflow-hidden h-full"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5), 0 1px 2px rgba(20,24,17,0.04)',
      }}
    >
      <header
        className={`cell-handle flex items-center justify-between gap-3 px-4 py-2.5 ${editable ? 'cursor-move' : ''}`}
        style={{ borderBottom: '1px solid var(--color-rule)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            aria-hidden
            className="inline-block rounded-full shrink-0"
            style={{
              width: 6,
              height: 6,
              backgroundColor: chart.accent ?? 'var(--color-forest-2)',
            }}
          />
          <h3
            className="leading-tight truncate"
            style={{
              fontFamily: '"Fraunces", serif',
              fontStyle: 'italic',
              fontVariationSettings: '"opsz" 144, "SOFT" 30, "wght" 400',
              fontSize: 14,
              color: 'var(--color-ink)',
              letterSpacing: '-0.01em',
            }}
          >
            {chart.title ?? (locale === 'de' ? 'Unbenanntes Diagramm' : 'Untitled chart')}
          </h3>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!editable && (
            <IconButton
              label={
                loadingSummary
                  ? locale === 'de' ? 'Zusammenfassen…' : 'Summarising…'
                  : locale === 'de' ? 'KI-Zusammenfassung' : 'AI summary'
              }
              onClick={handleSummarize}
              disabled={loadingSummary || !data}
            >
              <Sparkles
                size={12}
                strokeWidth={2}
                className={loadingSummary ? 'animate-pulse' : ''}
              />
            </IconButton>
          )}
          {editable && (
            <>
              <IconButton label={locale === 'de' ? 'Bearbeiten' : 'Edit'} onClick={onEdit}>
                <Pencil size={12} strokeWidth={2} />
              </IconButton>
              <IconButton label={locale === 'de' ? 'Löschen' : 'Delete'} onClick={onDelete} danger>
                <Trash2 size={12} strokeWidth={2} />
              </IconButton>
            </>
          )}
        </div>
      </header>
      <div className="flex-1 p-3 min-h-0">
        <ChartCanvas spec={chart} height={Number.NaN /* fill */ as unknown as number} />
      </div>
      <AnimatePresence>
        {summary && (
          <motion.aside
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="px-4 pb-3"
          >
            <div
              className="rounded-[12px] px-3 py-2.5 flex items-start gap-2"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--color-amber) 8%, var(--color-paper))',
                border: '1px solid color-mix(in srgb, var(--color-amber) 28%, var(--color-rule))',
              }}
            >
              <Sparkles size={11} strokeWidth={2.4} style={{ color: 'var(--color-amber)', marginTop: 2 }} />
              <p
                className="text-[12.5px] leading-snug flex-1"
                style={{ color: 'var(--color-ink)' }}
              >
                {summary}
              </p>
              <button
                type="button"
                onClick={() => setSummary(null)}
                aria-label={locale === 'de' ? 'Zusammenfassung schließen' : 'Dismiss summary'}
                className="text-[10px] num-mono"
                style={{ color: 'var(--color-muted)', letterSpacing: '0.18em' }}
              >
                ×
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function IconButton({
  children,
  onClick,
  label,
  danger = false,
  disabled = false,
}: {
  children: React.ReactNode
  onClick: () => void
  label: string
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center rounded-full"
      style={{
        width: 24,
        height: 24,
        color: danger ? 'var(--color-alert)' : 'var(--color-ink-2)',
        border: '1px solid var(--color-rule)',
        backgroundColor: 'var(--color-paper)',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  )
}
