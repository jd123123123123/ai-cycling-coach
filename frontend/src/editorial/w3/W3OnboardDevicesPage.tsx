import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Watch, Gauge, Heart, Check, Loader2, Copy } from 'lucide-react'
import { T, FONT } from './w3tokens'
import { useGarminStatus } from '../../hooks/useGarminStatus'
import { useWahooStatus } from '../../hooks/useWahooStatus'
import { getWahooConnectUrl } from '../../api/wahoo'
import { getAppleHealthSetup, type AppleHealthSetup } from '../../api/appleHealth'
import { apiClient } from '../../api/client'
import { markW3OnboardingSeen } from './w3Onboarding'
import W3OnboardDevicesView from './W3OnboardDevicesView'

/**
 * W3 · Onboarding 02, wired. Route /e/w3-onboard-devices.
 *
 * Real device state and connect actions: Garmin & Wahoo linked-status come
 * from the live status hooks (honest LINKED pills), Garmin connects inline via
 * POST /garmin/connect, Wahoo redirects to its real OAuth, Apple Health reveals
 * its real webhook/token. NEXT always advances — linking is optional and can
 * happen later — so no device row ever traps the rider.
 */

type ProviderKey = 'garmin' | 'wahoo' | 'apple'

export default function W3OnboardDevicesPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: garmin } = useGarminStatus()
  const { data: wahoo } = useWahooStatus()
  const [open, setOpen] = useState<ProviderKey | null>(null)

  const skip = () => {
    markW3OnboardingSeen()
    navigate('/e/w3-today', { replace: true })
  }

  const rows: Array<{
    key: ProviderKey
    icon: ReactNode
    name: string
    sub: string
    connected: boolean
    panel: ReactNode
  }> = [
    {
      key: 'garmin',
      icon: <Watch size={20} color={T.acid} strokeWidth={2} />,
      name: 'Garmin',
      sub: 'Auto-sync every ride',
      connected: !!garmin?.connected,
      panel: <GarminInline qc={qc} />,
    },
    {
      key: 'wahoo',
      icon: <Gauge size={20} color={T.acid} strokeWidth={2} />,
      name: 'Wahoo',
      sub: 'Power, cadence, HR',
      connected: !!wahoo?.connected,
      panel: <WahooInline />,
    },
    {
      key: 'apple',
      icon: <Heart size={20} color={T.acid} strokeWidth={2} />,
      name: 'Apple Health',
      sub: 'Recovery & HRV baseline',
      connected: false,
      panel: <AppleInline />,
    },
  ]

  return (
    <W3OnboardDevicesView onNext={() => navigate('/e/w3-onboard-rewards')} onSkip={skip}>
      {rows.map((r) => (
        <div
          key={r.key}
          style={{ borderRadius: 18, background: T.surface, border: `1px solid ${r.connected ? `${T.acid}44` : T.rule}`, padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: T.acidDim, display: 'grid', placeItems: 'center', flex: 'none' }}>{r.icon}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>{r.name}</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: T.mid }}>{r.sub}</span>
            </div>
            {r.connected ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 100, background: T.acid, color: T.bg, fontSize: 11, fontWeight: 800, letterSpacing: 0.5, flex: 'none' }}>
                <Check size={13} strokeWidth={3} />LINKED
              </span>
            ) : (
              <button
                onClick={() => setOpen((o) => (o === r.key ? null : r.key))}
                style={{ padding: '8px 16px', borderRadius: 100, background: 'transparent', border: `1px solid ${T.stroke}`, color: T.ink, fontFamily: FONT, fontSize: 11, fontWeight: 800, letterSpacing: 0.5, cursor: 'pointer', flex: 'none' }}
              >
                CONNECT
              </button>
            )}
          </div>
          {open === r.key && !r.connected && (
            <div style={{ borderTop: `1px solid ${T.rule}`, paddingTop: 12 }}>{r.panel}</div>
          )}
        </div>
      ))}
    </W3OnboardDevicesView>
  )
}

const field: React.CSSProperties = {
  background: T.surface2, border: `1px solid ${T.stroke}`, borderRadius: 12,
  padding: '10px 12px', fontSize: 14, color: T.ink, width: '100%', outline: 'none',
  fontFamily: FONT, colorScheme: 'dark',
}
const smallBtn: React.CSSProperties = {
  display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center',
  padding: '10px 0', borderRadius: 100, background: T.surface2, color: T.ink,
  fontFamily: FONT, fontSize: 12, fontWeight: 800, border: `1px solid ${T.stroke}`, cursor: 'pointer',
}

function GarminInline({ qc }: { qc: ReturnType<typeof useQueryClient> }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function connect() {
    setBusy(true); setErr(null)
    try {
      await apiClient.post('/garmin/connect', { email, password })
      await qc.invalidateQueries({ queryKey: ['garmin', 'status'] })
      await qc.invalidateQueries({ queryKey: ['activities'] })
      setDone(true)
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status
      setErr(status === 401 ? 'Credentials rejected.' : 'Connection failed.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <p style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, fontWeight: 700, color: T.acid, margin: 0 }}>
        <Check size={14} strokeWidth={2.6} />Garmin connected — first sync running.
      </p>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Garmin email" style={field} />
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Garmin password" style={field} />
      {err && <span style={{ fontSize: 11.5, color: T.bad }}>{err}</span>}
      <button onClick={connect} disabled={busy || !email || !password} style={{ ...smallBtn, opacity: busy || !email || !password ? 0.55 : 1 }}>
        {busy && <Loader2 size={13} className="animate-spin" />}
        {busy ? 'Connecting…' : 'Connect Garmin'}
      </button>
      <p style={{ fontSize: 10.5, color: T.quiet, margin: 0, lineHeight: 1.4 }}>Stored encrypted — the first sync pulls 90 days of history.</p>
    </div>
  )
}

function WahooInline() {
  const [busy, setBusy] = useState(false)
  const [notConfigured, setNotConfigured] = useState(false)

  async function connect() {
    setBusy(true)
    try {
      window.location.href = await getWahooConnectUrl()
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status
      if (status === 409) setNotConfigured(true)
      setBusy(false)
    }
  }

  if (notConfigured) {
    return <p style={{ fontSize: 12, color: T.quiet, margin: 0 }}>Wahoo isn’t configured on this server yet.</p>
  }
  return (
    <button onClick={connect} disabled={busy} style={{ ...smallBtn, width: '100%', opacity: busy ? 0.6 : 1 }}>
      {busy && <Loader2 size={13} className="animate-spin" />}
      {busy ? 'Opening Wahoo…' : 'Sign in with Wahoo'}
    </button>
  )
}

function AppleInline() {
  const [setup, setSetup] = useState<AppleHealthSetup | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  async function load() {
    setBusy(true)
    try { setSetup(await getAppleHealthSetup()) } catch { /* button stays enabled */ } finally { setBusy(false) }
  }
  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500)
    } catch { /* value stays visible */ }
  }

  if (!setup) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ fontSize: 11.5, color: T.quiet, margin: 0, lineHeight: 1.45 }}>Apple Health pushes via the “Auto Health Export” iOS app (REST API destination).</p>
        <button onClick={load} disabled={busy} style={{ ...smallBtn, opacity: busy ? 0.6 : 1 }}>
          {busy && <Loader2 size={13} className="animate-spin" />}Show setup
        </button>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {[{ k: 'url', label: 'Webhook-URL', v: setup.webhook_url }, { k: 'token', label: 'Token', v: setup.token }].map((row) => (
        <div key={row.k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...field, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: T.mid, flex: 1, minWidth: 0 }}>{row.v}</span>
          <button onClick={() => copy(row.v, row.k)} style={{ ...smallBtn, padding: '8px 12px', fontSize: 11, flex: 'none' }}>
            {copied === row.k ? <Check size={12} strokeWidth={2.6} /> : <Copy size={12} />}{row.label}
          </button>
        </div>
      ))}
      <p style={{ fontSize: 10.5, color: T.quiet, margin: 0, lineHeight: 1.4 }}>Paste as a REST destination in “Auto Health Export” — header “Authorization: Bearer &lt;token&gt;”.</p>
    </div>
  )
}
