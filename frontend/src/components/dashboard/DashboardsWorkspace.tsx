import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { Plus, Save, Pencil, Trash2, ArrowLeft } from 'lucide-react'
import ChartBuilder from '../charts/ChartBuilder'
import ChartTextPrompt from '../charts/ChartTextPrompt'
import DashboardCanvas from '../charts/DashboardCanvas'
import {
  useCreateDashboard,
  useDashboard,
  useDashboards,
  useDeleteDashboard,
  useUpdateDashboard,
} from '../../hooks/useDashboards'
import type { ChartSpec } from '../../types/chartSpec'
import type { GridLayoutItem } from '../../api/dashboards'
import { STARTER_DASHBOARDS, type StarterDashboard } from '../../data/starterDashboards'

/**
 * DashboardsWorkspace — list + editor for the customizable analytics workspace.
 *
 * Extracted from the former standalone DashboardsPage so the same workspace can
 * render in two homes: the Analyze hub's "Workspace" sub-tab (inside the
 * dashboard shell) and the /dashboards route (its own page wrapper). The
 * component renders chrome-free content; the host supplies the page container.
 *
 * Two modes:
 *   · list mode  — index of saved dashboards, plus "New dashboard" button
 *   · view mode  — load one dashboard. Toggle to edit-mode to add charts /
 *                  rearrange the grid / save.
 *
 * Cap of 15 charts per user is enforced server-side. Client surfaces the
 * count + remaining budget in the header.
 */

const MAX_CHARTS = 15

function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export default function DashboardsWorkspace() {
  const { data: list = [], isLoading } = useDashboards()
  const [selectedId, setSelectedId] = useState<number | null>(null)

  return selectedId === null ? (
    <ListView list={list} loading={isLoading} onOpen={setSelectedId} />
  ) : (
    <DetailView id={selectedId} onBack={() => setSelectedId(null)} />
  )
}

// ─── List ──────────────────────────────────────────────────────────────────

function ListView({
  list,
  loading,
  onOpen,
}: {
  list: { id: number; name: string; description: string | null; chart_count: number; updated_at: string | null }[]
  loading: boolean
  onOpen: (id: number) => void
}) {
  const create = useCreateDashboard()
  const totalCharts = list.reduce((s, d) => s + d.chart_count, 0)

  const handleNew = async () => {
    const name = window.prompt('Name your dashboard', 'Untitled dashboard')?.trim()
    if (!name) return
    const created = await create.mutateAsync({
      name,
      description: null,
      layout: [],
      charts: [],
    })
    onOpen(created.id)
  }

  const handleStarter = async (s: StarterDashboard) => {
    // Mint fresh chart ids and tie the layout entries to them.
    const chartIds = s.charts.map(() => Math.random().toString(36).slice(2, 10))
    const charts = s.charts.map((c, i) => ({ ...c, id: chartIds[i] }))
    const layout = s.layout.map((l, i) => ({ ...l, i: chartIds[i] }))
    const created = await create.mutateAsync({
      name: s.name,
      description: s.description,
      layout,
      charts,
    })
    onOpen(created.id)
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div className="flex flex-col gap-2">
          <span
            className="eyebrow"
            style={{ color: 'var(--color-forest-2)', letterSpacing: '0.32em', fontSize: 11, fontWeight: 600 }}
          >
            Workspace
          </span>
          <h1
            style={{
              fontFamily: '"Fraunces", serif',
              fontStyle: 'italic',
              fontVariationSettings: '"opsz" 144, "SOFT" 50, "wght" 400',
              fontSize: 'clamp(34px, 5vw, 56px)',
              letterSpacing: '-0.025em',
              lineHeight: 1.04,
            }}
          >
            Your dashboards
          </h1>
          <p className="text-[13px]" style={{ color: 'var(--color-ink-2)', maxWidth: '52ch' }}>
            Build any chart from your training, recovery, and biometrics — drag, resize, save.
            Total charts: <strong>{totalCharts}</strong> / {MAX_CHARTS}.
          </p>
        </div>
        <button
          type="button"
          onClick={handleNew}
          disabled={create.isPending}
          className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-medium"
          style={{
            color: 'var(--color-paper)',
            backgroundColor: 'var(--color-ink)',
            opacity: create.isPending ? 0.7 : 1,
          }}
        >
          <Plus size={14} strokeWidth={2.4} />
          New dashboard
        </button>
      </header>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
        {loading && <div style={{ color: 'var(--color-muted)' }}>Loading…</div>}
        {!loading && list.length === 0 && (
          <div
            className="col-span-full rounded-[18px] py-12 px-6 text-center flex flex-col items-center gap-3"
            style={{
              backgroundColor: 'var(--color-paper-2)',
              border: '1px dashed var(--color-rule)',
            }}
          >
            <span
              className="eyebrow"
              style={{ color: 'var(--color-forest)', letterSpacing: '0.28em', fontSize: 11 }}
            >
              An empty workshop
            </span>
            <p style={{ color: 'var(--color-ink-2)', maxWidth: '46ch' }}>
              Create your first dashboard to start composing charts. Pick a name, add charts —
              they save automatically.
            </p>
            <button
              type="button"
              onClick={handleNew}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium mt-2"
              style={{ color: 'var(--color-paper)', backgroundColor: 'var(--color-ink)' }}
            >
              <Plus size={13} strokeWidth={2.4} />
              Blank dashboard
            </button>
            <div className="mt-4 w-full">
              <span
                className="eyebrow block mb-3"
                style={{ color: 'var(--color-muted)', letterSpacing: '0.28em', fontSize: 10 }}
              >
                Or start from a preset
              </span>
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                {STARTER_DASHBOARDS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => handleStarter(s)}
                    className="text-left rounded-[14px] p-4 transition-transform hover:-translate-y-[2px]"
                    style={{
                      backgroundColor: 'var(--color-paper)',
                      border: '1px solid var(--color-rule)',
                    }}
                  >
                    <div
                      className="mb-1 font-medium"
                      style={{ fontSize: 15, color: 'var(--color-ink)' }}
                    >
                      {s.name}
                    </div>
                    <div className="text-[12px]" style={{ color: 'var(--color-ink-2)' }}>
                      {s.description} · {s.charts.length} chart{s.charts.length === 1 ? '' : 's'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {list.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => onOpen(d.id)}
            className="text-left flex flex-col gap-3 rounded-[18px] p-5 transition-transform hover:-translate-y-[2px]"
            style={{
              backgroundColor: 'var(--color-paper-2)',
              border: '1px solid var(--color-rule)',
            }}
          >
            <div className="flex items-baseline justify-between gap-2 min-w-0">
              <h3
                className="truncate"
                style={{
                  fontFamily: '"Fraunces", serif',
                  fontStyle: 'italic',
                  fontVariationSettings: '"opsz" 144, "SOFT" 30, "wght" 400',
                  fontSize: 22,
                  color: 'var(--color-ink)',
                  letterSpacing: '-0.015em',
                }}
              >
                {d.name}
              </h3>
              <span
                className="num-mono shrink-0"
                style={{ fontSize: 10, color: 'var(--color-muted)', letterSpacing: '0.18em', textTransform: 'uppercase' }}
              >
                {d.chart_count} chart{d.chart_count === 1 ? '' : 's'}
              </span>
            </div>
            {d.description && (
              <p className="text-[12.5px]" style={{ color: 'var(--color-ink-2)' }}>
                {d.description}
              </p>
            )}
            {d.updated_at && (
              <span
                className="num-mono"
                style={{ fontSize: 10, color: 'var(--color-muted)', letterSpacing: '0.04em' }}
              >
                edited {new Date(d.updated_at).toLocaleDateString()}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Detail / Editor ───────────────────────────────────────────────────────

function DetailView({ id, onBack }: { id: number; onBack: () => void }) {
  const { data, isLoading } = useDashboard(id)
  const update = useUpdateDashboard()
  const del = useDeleteDashboard()

  // Local working copy. Hydrated from server `data`; saves push back.
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [charts, setCharts] = useState<ChartSpec[]>([])
  const [layout, setLayout] = useState<GridLayoutItem[]>([])
  const [builderOpen, setBuilderOpen] = useState(false)
  const [editingChartId, setEditingChartId] = useState<string | null>(null)
  const [draftSpec, setDraftSpec] = useState<ChartSpec | null>(null)

  useEffect(() => {
    if (!data) return
    setName(data.name)
    setCharts(data.charts ?? [])
    setLayout(data.layout ?? [])
  }, [data])

  const editingChart = useMemo(
    () => (editingChartId ? charts.find((c) => c.id === editingChartId) ?? null : null),
    [charts, editingChartId],
  )

  const dirty =
    !!data &&
    (name !== data.name ||
      JSON.stringify(charts) !== JSON.stringify(data.charts) ||
      JSON.stringify(layout) !== JSON.stringify(data.layout))

  const handleSave = async () => {
    if (!data) return
    await update.mutateAsync({
      id,
      payload: { name, description: data.description, charts, layout },
    })
    setEditing(false)
  }

  const handleAddChart = (spec: ChartSpec) => {
    if (charts.length >= MAX_CHARTS) {
      window.alert(`Chart cap reached (${MAX_CHARTS} max per account).`)
      return
    }
    if (editingChartId) {
      setCharts(charts.map((c) => (c.id === editingChartId ? { ...spec, id: editingChartId } : c)))
    } else {
      setCharts([...charts, { ...spec, id: newId() }])
    }
    setBuilderOpen(false)
    setEditingChartId(null)
  }

  const handleDeleteDashboard = async () => {
    if (!window.confirm('Delete this dashboard? This cannot be undone.')) return
    await del.mutateAsync(id)
    onBack()
  }

  if (isLoading || !data) {
    return <div style={{ color: 'var(--color-muted)' }}>Loading dashboard…</div>
  }

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-[13px]"
          style={{ color: 'var(--color-ink-2)' }}
        >
          <ArrowLeft size={14} strokeWidth={2} />
          All dashboards
        </button>
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          {editing ? (
            <>
              <ChartTextPrompt
                disabled={charts.length >= MAX_CHARTS}
                onSpec={(spec) => {
                  setEditingChartId(null)
                  setDraftSpec(spec)
                  setBuilderOpen(true)
                }}
              />
              <button
                type="button"
                onClick={() => setBuilderOpen(true)}
                disabled={charts.length >= MAX_CHARTS}
                className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] font-medium"
                style={{
                  color: 'var(--color-paper)',
                  backgroundColor: charts.length >= MAX_CHARTS ? 'var(--color-muted)' : 'var(--color-forest-2)',
                  opacity: charts.length >= MAX_CHARTS ? 0.6 : 1,
                }}
              >
                <Plus size={13} strokeWidth={2.4} />
                Add chart
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!dirty || update.isPending}
                className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] font-medium"
                style={{
                  color: 'var(--color-paper)',
                  backgroundColor: dirty ? 'var(--color-ink)' : 'var(--color-muted)',
                  opacity: !dirty ? 0.6 : 1,
                }}
              >
                <Save size={13} strokeWidth={2.4} />
                Save
              </button>
              <button
                type="button"
                onClick={handleDeleteDashboard}
                aria-label="Delete dashboard"
                className="inline-flex items-center justify-center rounded-full"
                style={{
                  width: 34,
                  height: 34,
                  color: 'var(--color-alert)',
                  border: '1px solid var(--color-rule)',
                }}
              >
                <Trash2 size={13} strokeWidth={2} />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] font-medium"
              style={{
                color: 'var(--color-ink)',
                border: '1px solid var(--color-rule)',
                backgroundColor: 'var(--color-paper-2)',
              }}
            >
              <Pencil size={13} strokeWidth={2} />
              Edit
            </button>
          )}
        </div>
      </header>

      {editing ? (
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full text-[clamp(28px,4.4vw,48px)] leading-none bg-transparent outline-none"
          style={{
            fontFamily: '"Fraunces", serif',
            fontStyle: 'italic',
            fontVariationSettings: '"opsz" 144, "SOFT" 50, "wght" 400',
            color: 'var(--color-ink)',
            letterSpacing: '-0.025em',
            borderBottom: '1px dashed var(--color-rule)',
            paddingBottom: 6,
          }}
        />
      ) : (
        <h1
          style={{
            fontFamily: '"Fraunces", serif',
            fontStyle: 'italic',
            fontVariationSettings: '"opsz" 144, "SOFT" 50, "wght" 400',
            fontSize: 'clamp(28px, 4.4vw, 48px)',
            color: 'var(--color-ink)',
            letterSpacing: '-0.025em',
            lineHeight: 1.04,
          }}
        >
          {data.name}
        </h1>
      )}

      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
        <DashboardCanvas
          charts={charts}
          layout={layout}
          editable={editing}
          onLayoutChange={setLayout}
          onEditChart={(cid) => {
            setEditingChartId(cid)
            setBuilderOpen(true)
          }}
          onDeleteChart={(cid) => {
            setCharts(charts.filter((c) => c.id !== cid))
            setLayout(layout.filter((l) => l.i !== cid))
          }}
        />
      </motion.div>

      <ChartBuilder
        open={builderOpen}
        onClose={() => {
          setBuilderOpen(false)
          setEditingChartId(null)
          setDraftSpec(null)
        }}
        onSave={(spec) => {
          setDraftSpec(null)
          handleAddChart(spec)
        }}
        initial={editingChart ?? draftSpec}
      />
    </div>
  )
}
