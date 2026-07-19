/**
 * FocusSection — per-sport builder-program picker for the Train tab.
 *
 * Two rows (Bike, Run), each with chips: "Race plan" (the default periodized
 * plan) + that sport's named builder programs (FTP/VO₂/200k · 5k/10k/HM).
 * Selecting a chip POSTs /weeks/program {sport, program}; the server response
 * carries both sports' fresh state, and the week/planned queries are
 * invalidated so the plan surfaces regenerate. Honest loading/error states,
 * EN/DE, no celebration effects.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bike, Crosshair, Footprints, Loader2, RefreshCw } from 'lucide-react'
import { apiClient } from '../../api/client'
import { useLocale } from '../../contexts/LocaleContext'

const cardStyle = { background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' } as const

interface ProgramMeta {
  name_en: string
  name_de: string
  tagline_en: string
  tagline_de: string
  weeks: number
}

interface SportProgramState {
  current: string // program id | 'race'
  started: string | null // ISO date
}

interface ProgramsResponse {
  bike: SportProgramState
  run: SportProgramState
  programs: { bike: Record<string, ProgramMeta>; run: Record<string, ProgramMeta> }
}

type FocusSport = 'bike' | 'run'

const PROGRAMS_KEY = ['weeks', 'programs'] as const

async function fetchPrograms(): Promise<ProgramsResponse> {
  const res = await apiClient.get<ProgramsResponse>('/weeks/programs')
  return res.data
}

async function postProgram(sport: FocusSport, program: string): Promise<ProgramsResponse> {
  const res = await apiClient.post<ProgramsResponse>('/weeks/program', { sport, program })
  return res.data
}

// 1-based week inside the program, honest-clamped to its length.
function weekOf(started: string | null, weeks: number): number | null {
  if (!started) return null
  const s = new Date(started)
  if (Number.isNaN(s.getTime())) return null
  const monday = new Date(s)
  monday.setDate(s.getDate() - ((s.getDay() + 6) % 7))
  const idx = Math.floor((Date.now() - monday.getTime()) / (7 * 86400000))
  return Math.min(weeks, Math.max(1, idx + 1))
}

export default function FocusSection() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const qc = useQueryClient()

  const { data, isLoading, isError, refetch } = useQuery<ProgramsResponse>({
    queryKey: [...PROGRAMS_KEY],
    queryFn: fetchPrograms,
    staleTime: 5 * 60 * 1000,
  })

  const mutation = useMutation({
    mutationFn: ({ sport, program }: { sport: FocusSport; program: string }) =>
      postProgram(sport, program),
    onSuccess: (fresh) => {
      // The POST response already carries both sports' state — seed the cache,
      // then refetch every plan surface built from the (re)generated days.
      qc.setQueryData([...PROGRAMS_KEY], fresh)
      qc.invalidateQueries({ queryKey: ['weeks'] })
      qc.invalidateQueries({ queryKey: ['planned-workouts'] })
      qc.invalidateQueries({ queryKey: ['coach', 'brief'] })
    },
  })

  const pending = mutation.isPending ? mutation.variables : null

  const rows: {
    sport: FocusSport
    Icon: typeof Bike
    color: string
    label: string
    state: SportProgramState | undefined
    metas: Record<string, ProgramMeta>
  }[] = [
    {
      sport: 'bike', Icon: Bike, color: 'var(--color-strain)',
      label: de ? 'Rad' : 'Bike',
      state: data?.bike, metas: data?.programs?.bike ?? {},
    },
    {
      sport: 'run', Icon: Footprints, color: 'var(--color-exercise)',
      label: de ? 'Lauf' : 'Run',
      state: data?.run, metas: data?.programs?.run ?? {},
    },
  ]

  return (
    <div className="rounded-[24px] p-5 flex flex-col" style={{ ...cardStyle, gap: 18 }}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <Crosshair size={15} style={{ color: 'var(--color-accent)' }} />
        <span className="eyebrow" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--color-muted)' }}>
          {de ? 'FOKUS' : 'FOCUS'}
        </span>
      </div>

      {isLoading ? (
        // Honest loading — skeleton chip rows, no fabricated selection.
        <div className="flex flex-col" style={{ gap: 14 }}>
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="animate-pulse rounded-full" style={{ width: 32, height: 32, background: 'var(--color-surface-2)' }} />
              {[72, 96, 84].map((w, j) => (
                <span key={j} className="animate-pulse rounded-full" style={{ width: w, height: 30, background: 'var(--color-surface-2)' }} />
              ))}
            </div>
          ))}
        </div>
      ) : isError || !data ? (
        // Honest error — say it failed, offer a retry, fabricate nothing.
        <div className="flex items-center gap-3 rounded-2xl p-3.5" style={{ background: 'var(--color-surface-2)' }}>
          <span className="flex-1" style={{ fontSize: 13, color: 'var(--color-ink-2)' }}>
            {de ? 'Programme konnten nicht geladen werden.' : 'Couldn’t load programs.'}
          </span>
          <button type="button" onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5"
            style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)', fontSize: 12, fontWeight: 700 }}>
            <RefreshCw size={13} /> {de ? 'Erneut versuchen' : 'Retry'}
          </button>
        </div>
      ) : (
        <div className="flex flex-col" style={{ gap: 16 }}>
          {rows.map(({ sport, Icon, color, label, state, metas }, rowIdx) => {
            const current = state?.current ?? 'race'
            const selectedMeta = current !== 'race' ? metas[current] : undefined
            const week = selectedMeta ? weekOf(state?.started ?? null, selectedMeta.weeks) : null
            const chips: { id: string; label: string }[] = [
              { id: 'race', label: de ? 'Rennplan' : 'Race plan' },
              ...Object.entries(metas).map(([id, m]) => ({ id, label: de ? m.name_de : m.name_en })),
            ]
            return (
              <div key={sport} className="flex flex-col" style={{ gap: 8 }}>
                {rowIdx > 0 && <div style={{ height: 1, background: 'var(--color-rule)', marginBottom: 8 }} />}
                {/* Row header */}
                <div className="flex items-center gap-2.5">
                  <span className="shrink-0 grid place-items-center rounded-full" style={{ width: 30, height: 30, background: `color-mix(in srgb, ${color} 18%, transparent)` }}>
                    <Icon size={16} strokeWidth={2.2} style={{ color }} />
                  </span>
                  <span className="num-display" style={{ fontSize: 15, color: 'var(--color-ink)' }}>{label}</span>
                  {selectedMeta && week != null && (
                    <span className="ml-auto num-mono" style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}>
                      {de ? `Woche ${week}/${selectedMeta.weeks}` : `Week ${week}/${selectedMeta.weeks}`}
                    </span>
                  )}
                </div>
                {/* Program chips */}
                <div className="flex flex-wrap" style={{ gap: 6 }}>
                  {chips.map((chip) => {
                    const active = current === chip.id
                    const isPendingChip = pending?.sport === sport && pending?.program === chip.id
                    return (
                      <button key={chip.id} type="button"
                        disabled={mutation.isPending || active}
                        onClick={() => mutation.mutate({ sport, program: chip.id })}
                        className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 transition-colors"
                        style={{
                          background: active ? 'var(--color-accent)' : 'var(--color-surface-2)',
                          color: active ? '#FFFFFF' : 'var(--color-ink-2)',
                          fontSize: 12.5, fontWeight: active ? 700 : 600,
                          opacity: mutation.isPending && !isPendingChip && !active ? 0.55 : 1,
                          cursor: active ? 'default' : 'pointer',
                        }}>
                        {isPendingChip && <Loader2 size={13} className="animate-spin" />}
                        {chip.label}
                      </button>
                    )
                  })}
                </div>
                {/* Tagline — the selected program's promise, or the race default. */}
                <p style={{ fontSize: 12, color: 'var(--color-muted)', lineHeight: 1.45 }}>
                  {selectedMeta
                    ? (de ? selectedMeta.tagline_de : selectedMeta.tagline_en)
                    : de
                      ? 'Dein Rennplan führt — periodisiert auf dein Zielevent.'
                      : 'Your race plan leads — periodized toward your goal event.'}
                  {sport === 'run' && selectedMeta && (
                    <> {de ? '· Lauftage: Di · Do · Sa' : '· Run days: Tue · Thu · Sat'}</>
                  )}
                </p>
              </div>
            )
          })}
          {mutation.isError && (
            <div className="flex items-center gap-2 rounded-2xl p-3" style={{ background: 'color-mix(in srgb, var(--color-amber) 12%, transparent)' }}>
              <span style={{ fontSize: 12.5, color: 'var(--color-ink)' }}>
                {de ? 'Auswahl konnte nicht gespeichert werden — versuch es nochmal.' : 'Couldn’t save your selection — try again.'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
