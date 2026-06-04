import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { interpretChart } from '../../api/analytics'
import type { ChartSpec } from '../../types/chartSpec'

/**
 * ChartTextPrompt — type a phrase ("weekly TSS for the last 3 months") and get
 * back a ChartSpec the parent opens in the ChartBuilder for preview/tweak.
 * Shown in dashboard edit mode next to "Add chart".
 */
export default function ChartTextPrompt({
  onSpec,
  disabled,
}: {
  onSpec: (spec: ChartSpec) => void
  disabled?: boolean
}) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const phrase = text.trim()
    if (!phrase || loading) return
    setLoading(true)
    setError(null)
    try {
      const spec = await interpretChart(phrase)
      setText('')
      onSpec(spec)
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status
      setError(
        status === 503
          ? 'AI card creation is unavailable right now.'
          : "Couldn't turn that into a chart — try naming a metric like TSS, HRV, or sleep.",
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <div
          className="flex items-center gap-2 rounded-full px-3 py-1.5"
          style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
        >
          <Sparkles size={14} strokeWidth={2} style={{ color: 'var(--color-forest-2)' }} />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
            placeholder="Describe a chart…"
            disabled={disabled || loading}
            aria-label="Describe a chart to create"
            className="bg-transparent outline-none num-mono"
            style={{ fontSize: 12.5, color: 'var(--color-ink)', width: 180 }}
          />
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={disabled || loading || !text.trim()}
          className="inline-flex items-center rounded-full px-3 py-2 text-[12.5px] font-medium"
          style={{
            color: 'var(--color-paper)',
            backgroundColor: disabled || !text.trim() ? 'var(--color-muted)' : 'var(--color-forest-2)',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Thinking…' : 'Create'}
        </button>
      </div>
      {error && (
        <span style={{ color: 'var(--color-bad)', fontSize: 11 }}>{error}</span>
      )}
    </div>
  )
}
