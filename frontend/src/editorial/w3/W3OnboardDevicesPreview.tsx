import { Watch, Gauge, Heart, Check } from 'lucide-react'
import { T, FONT } from './w3tokens'
import W3OnboardDevicesView from './W3OnboardDevicesView'

/** TEMP preview — /e/w3-onboard-devices-preview (unguarded). Static fixture rows. */
export default function W3OnboardDevicesPreview() {
  // fixture: static rows so the layout renders without the live status hooks.
  const rows = [
    { icon: <Watch size={20} color={T.acid} strokeWidth={2} />, name: 'Garmin', sub: 'Jede Fahrt automatisch', connected: true },
    { icon: <Gauge size={20} color={T.acid} strokeWidth={2} />, name: 'Wahoo', sub: 'Watt, Trittfrequenz, HF', connected: true },
    { icon: <Heart size={20} color={T.acid} strokeWidth={2} />, name: 'Apple Health', sub: 'Erholung & HRV-Basiswert', connected: false },
  ]
  return (
    <W3OnboardDevicesView onNext={() => {}} onSkip={() => {}}>
      {rows.map((r) => (
        <div key={r.name} style={{ borderRadius: 18, background: T.surface, border: `1px solid ${r.connected ? `${T.acid}44` : T.rule}`, padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: T.acidDim, display: 'grid', placeItems: 'center', flex: 'none' }}>{r.icon}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>{r.name}</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: T.mid }}>{r.sub}</span>
          </div>
          {r.connected ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 100, background: T.acid, color: T.bg, fontSize: 11, fontWeight: 800, letterSpacing: 0.5, flex: 'none' }}>
              <Check size={13} strokeWidth={3} />VERBUNDEN
            </span>
          ) : (
            <span style={{ padding: '8px 16px', borderRadius: 100, border: `1px solid ${T.stroke}`, color: T.ink, fontFamily: FONT, fontSize: 11, fontWeight: 800, letterSpacing: 0.5, flex: 'none' }}>VERBINDEN</span>
          )}
        </div>
      ))}
    </W3OnboardDevicesView>
  )
}
