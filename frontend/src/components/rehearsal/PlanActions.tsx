import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, MessageCircle, Bookmark, Check } from 'lucide-react'
import { useLocale } from '../../contexts/LocaleContext'
import { apiClient } from '../../api/client'

/**
 * PlanActions — what the athlete can DO with the forecast, once they believe it.
 *
 * ── Why the primary action is "export", not "send to Garmin" ─────────────
 * The design's CTA reads "Send pacing plan to Garmin". There is no Garmin
 * workout-push anywhere in this codebase — the Garmin integration is read-only
 * sync — so a button making that claim would be asserting something the app
 * cannot do. That is the single thing every other surface here refuses, and a
 * button is not exempt from the rule the numbers follow. It downloads a real
 * structured workout (.zwo, power as fractions of FTP so it survives an FTP
 * change) and the label says so.
 *
 * ── Why "save" is a real state and not a nice-to-have ────────────────────
 * A rehearsal is already persisted the moment it is created, so a "Save route"
 * button that only looked saved would be theatre. It marks the rehearsal as
 * kept via the existing PATCH, which is what makes it findable later.
 */
export default function PlanActions({
  rehearsalId,
  canExport,
}: {
  rehearsalId: number
  canExport: boolean
}) {
  const { locale } = useLocale()
  const de = locale === 'de'
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onExport = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await apiClient.get(`/rehearsals/${rehearsalId}/pacing-plan.zwo`, {
        responseType: 'blob',
      })
      // Same-origin blob download: no new tab, no popup blocker, and the
      // Content-Disposition filename from the server is honoured.
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `pacing-${rehearsalId}.zwo`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      // The backend 409s when there is no plan to export rather than emitting
      // an empty file — say that plainly instead of failing silently.
      setError(
        de
          ? 'Für diese Probefahrt gibt es noch keinen Pacing-Plan.'
          : 'There is no pacing plan for this rehearsal yet.',
      )
    } finally {
      setBusy(false)
    }
  }

  const onSave = async () => {
    setBusy(true)
    setError(null)
    try {
      // A dedicated endpoint, not the assumptions PATCH: that one re-runs the
      // whole simulation, which is several hundred milliseconds of physics to
      // flip one boolean.
      await apiClient.post(`/rehearsals/${rehearsalId}/save?saved=true`)
      setSaved(true)
    } catch {
      setError(de ? 'Konnte nicht gespeichert werden.' : 'Could not save this route.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      <button
        type="button"
        onClick={onExport}
        disabled={busy || !canExport}
        className="inline-flex items-center justify-center rounded-full"
        style={{
          minHeight: 49,
          gap: 9,
          background: 'linear-gradient(90deg, #FF5A3C, #FA1E55)',
          opacity: busy || !canExport ? 0.5 : 1,
        }}
      >
        <Download size={18} style={{ color: '#FFFFFF' }} />
        <span style={{ fontSize: 16, fontWeight: 700, color: '#FFFFFF' }}>
          {de ? 'Pacing-Plan exportieren' : 'Export pacing plan'}
        </span>
      </button>

      <div className="flex" style={{ gap: 10 }}>
        <button
          type="button"
          onClick={() => navigate('/coach')}
          className="flex-1 inline-flex items-center justify-center rounded-full"
          style={{ minHeight: 39, gap: 7, background: '#FFFFFF0F' }}
        >
          <MessageCircle size={16} style={{ color: 'var(--color-ink-2)' }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink)' }}>
            {de ? 'Coach fragen' : 'Ask Coach'}
          </span>
        </button>

        <button
          type="button"
          onClick={onSave}
          disabled={busy || saved}
          className="flex-1 inline-flex items-center justify-center rounded-full"
          style={{ minHeight: 39, gap: 7, background: '#FFFFFF0F', opacity: busy ? 0.6 : 1 }}
        >
          {saved ? (
            <Check size={16} style={{ color: 'var(--color-recovery)' }} />
          ) : (
            <Bookmark size={16} style={{ color: 'var(--color-ink-2)' }} />
          )}
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink)' }}>
            {saved ? (de ? 'Gespeichert' : 'Saved') : de ? 'Route speichern' : 'Save route'}
          </span>
        </button>
      </div>

      {error && (
        <span role="alert" style={{ fontSize: 12, color: 'var(--color-amber)', textAlign: 'center' }}>
          {error}
        </span>
      )}
    </div>
  )
}
