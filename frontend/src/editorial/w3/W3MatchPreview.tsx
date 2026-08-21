import { Suspense, lazy } from 'react'
import { RAW_HAIRPINS, MATCHED_HAIRPINS } from './matchFixture'
import { W3_MAP } from './w3map'
import { T, FONT } from './w3tokens'
import './w3.css'

const RouteMap = lazy(() => import('../../components/crew/RouteMap'))

/** TEMP preview — the recorded trace against the map-matched road, on one set
 *  of Maratona hairpins. The only way to see what map matching actually buys:
 *  side by side at a zoom where a ten-metre error is a whole road width. */
export default function W3MatchPreview() {
  const rows: [string, [number, number][], string][] = [
    ['AUFGEZEICHNET · GPS', RAW_HAIRPINS, T.warn],
    ['EINGERASTET · STRASSE', MATCHED_HAIRPINS, T.acid],
  ]
  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, minHeight: '100dvh', background: T.bg }}>
        {rows.map(([label, poly, hue]) => (
          <div key={label} style={{ position: 'relative', height: '46dvh', borderBottom: `1px solid ${T.rule}` }}>
            <Suspense fallback={null}>
              <RouteMap polyline={poly} styleKey="dark" interactive={false}
                palette={W3_MAP} lineColor={hue} lineWidth={5}
                startColor={T.ink} endColor={hue} attributionBottom={6} />
            </Suspense>
            <span style={{
              position: 'absolute', top: 12, left: 14, zIndex: 3,
              padding: '5px 10px', borderRadius: 100, background: `${T.bg}D9`,
              fontSize: 10, fontWeight: 700, letterSpacing: 1, color: hue,
            }}>{label} · {poly.length} Pkt.</span>
          </div>
        ))}
      </div>
    </div>
  )
}
