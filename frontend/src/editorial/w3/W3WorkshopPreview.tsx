import { useState } from 'react'
import W3Workshop from './W3Workshop'
import W3StatusBar from './W3StatusBar'
import W3TabBar from './W3TabBar'
import { T, FONT } from './w3tokens'
import './w3.css'
import type { ServiceResult, Workshop } from '../../api/workshop'

/**
 * Design route for the workshop: /e/w3-workshop-preview.
 *
 * The fixture is chosen to show every state the screen can be in AT ONCE, which
 * is the only way to check that none of them reads as a failure: a fresh
 * component still earning the bonus, one that has just come due, one deep into
 * overrun with its accrual stopped, and one barely ridden with nothing to
 * collect yet.
 *
 * Numbers match `services/bike_wear` exactly — chain 250 km / 150 RC and the
 * rest — so this route doubles as a check that the client and the server agree
 * about what a service is worth.
 */
const FIXTURE: Workshop = {
  components: [
    { id: 'chain', name_de: 'Kette', action_de: 'Reinigen & ölen',
      km_since: 372, interval_km: 250, km_total: 4820, bonus_rc: 223,
      status: 'due', progress: 1, accrual_stopped: false,
      days_since: null, interval_days: null, clock: 'km', dormant: false, undated: false, optional: false },
    { id: 'tyres', name_de: 'Reifen', action_de: 'Prüfen & aufpumpen',
      km_since: 1180, interval_km: 2500, km_total: 1180, bonus_rc: 94,
      status: 'fresh', progress: 0.47, accrual_stopped: false,
      days_since: null, interval_days: null, clock: 'km', dormant: false, undated: false, optional: false },
    { id: 'brakes', name_de: 'Bremsbeläge', action_de: 'Beläge prüfen',
      km_since: 4310, interval_km: 2000, km_total: 4310, bonus_rc: 500,
      status: 'overdue', progress: 1, accrual_stopped: true,
      days_since: null, interval_days: null, clock: 'km', dormant: false, undated: false, optional: false },
    { id: 'bartape', name_de: 'Lenkerband', action_de: 'Neu wickeln',
      km_since: 140, interval_km: 4000, km_total: 140, bonus_rc: 6,
      status: 'fresh', progress: 0.035, accrual_stopped: false,
      days_since: null, interval_days: null, clock: 'km', dormant: false, undated: false, optional: false },
    // The calendar part, confirmed and dated — the one row whose meter must
    // read in months and whose kilometres are deliberately irrelevant.
    { id: 'sealant', name_de: 'Dichtmilch', action_de: 'Nachfüllen',
      km_since: 1180, interval_km: null, km_total: 1180, bonus_rc: 140,
      status: 'due', progress: 1, accrual_stopped: false,
      days_since: 141, interval_days: 120, clock: 'days', dormant: false, undated: false, optional: true },
    // The one we have not asked about yet: a QUESTION, not a job. Rendering
    // this as "FÄLLIG" on a rim-brake rider's bike is the failure the dormant
    // state exists to prevent.
    { id: 'brakefluid', name_de: 'Bremsflüssigkeit', action_de: 'Entlüften',
      km_since: 0, interval_km: null, km_total: 0, bonus_rc: 0,
      status: 'unknown', progress: 0, accrual_stopped: false,
      days_since: null, interval_days: 365, clock: 'days', dormant: true, undated: true, optional: true },
    { id: 'cassette', name_de: 'Kassette', action_de: 'Reinigen',
      km_since: 2050, interval_km: 6000, km_total: 2050, bonus_rc: 102,
      status: 'fresh', progress: 0.34, accrual_stopped: false,
      days_since: null, interval_days: null, clock: 'km', dormant: false, undated: false, optional: false },
  ],
  total_bonus_rc: 1065,
  // Deliberately NOT fresh, so the panel shows the bonus as something to go and
  // unlock rather than something already held — the harder of the two states to
  // word without it reading as a penalty.
  drivetrain_fresh: false,
  drivetrain_watts: 4.0,
  chain_km_total: 4820,
  chain_record_km: 512,
  balance: 1448,
  open_question: null,
}

export default function W3WorkshopPreview() {
  const [ws, setWs] = useState<Workshop>(FIXTURE)
  const [last, setLast] = useState<ServiceResult | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  /** The real reducer, locally: pay out, reset the interval, keep km_total. */
  const onService = (id: string) => {
    setBusy(id)
    setTimeout(() => {
      const c = ws.components.find((x) => x.id === id)
      if (!c) return
      const next: Workshop = {
        ...ws,
        components: ws.components.map((x) => x.id === id
          ? { ...x, km_since: 0, bonus_rc: 0, progress: 0, status: 'fresh', accrual_stopped: false, days_since: 0 }
          : x),
        total_bonus_rc: ws.total_bonus_rc - c.bonus_rc,
        drivetrain_fresh: id === 'chain' ? true : ws.drivetrain_fresh,
        drivetrain_watts: id === 'chain' ? null : ws.drivetrain_watts,
        balance: ws.balance + c.bonus_rc,
      }
      setWs(next)
      setLast({
        component_id: id, name_de: c.name_de, paid_rc: c.bonus_rc,
        balance: next.balance, km_serviced: c.km_since,
        new_record: c.km_since > ws.chain_record_km, record_km: Math.max(c.km_since, ws.chain_record_km),
        proof_rc: 0, proof_note: null, proof_confirmed: false,
        workshop: next,
      })
      setBusy(null)
    }, 350)
  }

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, minHeight: '100dvh', background: T.heroBg }}>
        <W3StatusBar />
        <div style={{ padding: '8px 20px 16px' }}>
          <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.8, color: T.ink }}>Garage</span>
        </div>
        <W3Workshop
          workshop={ws} loading={false} busyId={busy} lastResult={last}
          onService={onService}
          // The preview owns no server, so these two answer locally: seeding
          // moves the clock the rider names, declining a part makes the
          // question go away. Enough to exercise every branch of the row from
          // a static route.
          onSeed={(id, iso) => setWs((w) => ({
            ...w,
            components: w.components.map((x) => x.id === id ? {
              ...x, dormant: false, undated: false, status: 'fresh' as const,
              days_since: Math.round((Date.now() - new Date(iso).getTime()) / 86400000),
            } : x),
          }))}
          onDeclare={(id, owned) => setWs((w) => ({
            ...w,
            components: w.components.map((x) => x.id === id
              ? { ...x, dormant: !owned, undated: owned, status: 'unknown' as const }
              : x),
          }))}
          onDismissResult={() => setLast(null)} />
        <W3TabBar />
      </div>
    </div>
  )
}
