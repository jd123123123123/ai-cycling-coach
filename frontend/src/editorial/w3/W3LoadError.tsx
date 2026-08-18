import { RefreshCw, WifiOff } from 'lucide-react'
import { T, FONT } from './w3tokens'
import { S, lux } from './w3surfaces'
import './w3.css'
import W3StatusBar from './W3StatusBar'
import W3TabBar from './W3TabBar'

/**
 * W3 · "We couldn't load this" — with a way out.
 *
 * WHY THIS EXISTS. A react-query failure leaves `isLoading` false and `data`
 * undefined, so a screen that only guards the loading case renders its EMPTY
 * state instead. On the garage that meant a rider whose request timed out was
 * told they own no bikes and have no RideCoin — a confident lie about their
 * possessions, which is far worse than admitting the request failed. An empty
 * state and a failed state look identical to the component and must never look
 * identical to the rider.
 *
 * The tab bar stays mounted so a failure never traps anyone on a dead screen.
 */
export default function W3LoadError({
  title = 'Das hat nicht geladen',
  detail = 'Wir konnten deine Daten gerade nicht abrufen. Das liegt meistens an der Verbindung.',
  onRetry,
  retrying = false,
}: {
  title?: string
  detail?: string
  onRetry?: () => void
  retrying?: boolean
}) {
  return (
    <div className="w3-frame" style={{ fontFamily: FONT, background: T.bg, color: T.ink, minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <W3StatusBar />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 20px' }}>
        <div style={{ ...lux(24), padding: S.xxl, gap: S.md, alignItems: 'center' }}>
          <div style={{ width: 46, height: 46, borderRadius: 100, background: T.surface2, display: 'grid', placeItems: 'center' }}>
            <WifiOff size={21} color={T.mid} />
          </div>
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.4, color: T.ink, textAlign: 'center' }}>{title}</span>
          <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.5, color: T.mid, textAlign: 'center' }}>{detail}</span>
          {onRetry && (
            <button
              onClick={retrying ? undefined : onRetry}
              disabled={retrying}
              style={{
                marginTop: S.xs, height: 44, padding: '0 22px', borderRadius: 100, border: 0,
                background: T.acid, color: T.bg, display: 'flex', alignItems: 'center', gap: S.sm,
                fontFamily: FONT, fontSize: 12.5, fontWeight: 700, letterSpacing: 0.6,
                cursor: retrying ? 'default' : 'pointer', opacity: retrying ? 0.6 : 1,
              }}
            >
              <RefreshCw size={15} color={T.bg} className={retrying ? 'w3-spin' : undefined} />
              {retrying ? 'LÄDT…' : 'NOCHMAL VERSUCHEN'}
            </button>
          )}
        </div>
      </div>
      <W3TabBar />
    </div>
  )
}
