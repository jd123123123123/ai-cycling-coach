import { useNavigate } from 'react-router-dom'
import { downloadWorkoutExport } from '../../api/coach'
import Bars, { type BarsBlock } from '../components/Bars'
import NavHeader from '../components/NavHeader'
import QuotePlate from '../components/QuotePlate'
import { SESSION_QUOTE_PHOTO } from '../components/plateImagery'
import RouteOptions from '../components/RouteOptions'
import SecHead from '../components/SecHead'
import SessionBlocks from '../components/SessionBlocks'
import SessionCta from '../components/SessionCta'
import StatTile from '../components/StatTile'
import StatusBar from '../components/StatusBar'
import WhatThisChanges from '../components/WhatThisChanges'
import EditorialRoot from '../EditorialRoot'
import { isPresent, type Value } from '../data/value'
import { useSessionModel, type SessionModel } from '../data/useSessionModel'
import { useCopy } from '../i18n/useCopy'
import { intlLocale } from '../i18n/copy'

/**
 * Session Detail (pen `J5FV6`), transcribed as a pure function of an
 * already-assembled `SessionModel` — same split as `TodayView`/`TodayPage`,
 * so this screen can be rendered from a fixture (visual harness) with no
 * React Query, auth, or backend.
 *
 * PEN-VERIFIED ORDER (2026-08-05 re-read, `J5FV6`'s direct children):
 * StatusBar → Nav → Hero (Cover + Hero Body) → `01 The Blocks` → Quote Plate
 * → `03 THE PAYOFF` → `04 WHERE TO RIDE IT` → CTA. The brief's own copy of
 * this tree names a `02 HOW TO RIDE IT` section between `01` and the Quote
 * Plate — the live tree has no such section; the pen wins. `04 WHERE TO
 * RIDE IT` DOES render now (`components/RouteOptions.tsx`) — see
 * `useSessionModel.ts`'s own doc comment for the real source (`GET
 * /routes/mine`) and exactly what it does/doesn't supply.
 *
 * There is no TabBar on this screen (absent from `J5FV6`'s own tree) — Nav's
 * back arrow is this screen's only way out, matching a drill-down detail
 * page rather than a tab root.
 */
/** Session Detail, wired to live data. The layout itself lives in
 *  `SessionDetailView` — matching `TodayPage`/`TodayView`'s own split, so a
 *  test or the visual harness can render the real screen from a fixture
 *  model without ever calling `useSessionModel` (which needs React Query +
 *  `LanguageProvider` mounted). `/e/session/:id` routes here; the id is not
 *  consumed — see this file's own doc comment on `useSessionModel.ts` for
 *  why (no id-scoped export or session endpoint exists in this backend). */
export default function SessionDetailPage() {
  const navigate = useNavigate()
  return <SessionDetailView model={useSessionModel()} onBack={() => navigate(-1)} />
}

/** Pure layout — no hooks that need React Query/auth. Used directly by
 *  `__tests__/sessionDetail.test.tsx` and the visual harness. */
export function SessionDetailView({ model, onBack }: { model: SessionModel; onBack?: () => void }) {
  return (
    <EditorialRoot state="training">
      <SessionDetailBody model={model} onBack={onBack ?? (() => {})} />
    </EditorialRoot>
  )
}

function SessionDetailBody({ model, onBack }: { model: SessionModel; onBack: () => void }) {
  const { t, locale } = useCopy()

  const timeLabel = new Date().toLocaleTimeString(intlLocale(locale), { hour: '2-digit', minute: '2-digit' })
  const dateLabel = isPresent(model.dateLabel) ? model.dateLabel.value : '—'

  const payoffBlocks: BarsBlock[] = isPresent(model.payoff)
    ? model.payoff.value.map((p) => ({ label: p.label, minutes: 1, watts: p.tss }))
    : []

  const handleExport = async () => {
    await downloadWorkoutExport('fit')
  }

  return (
    <main data-session-detail="">
      <StatusBar time={timeLabel} />

      <div style={{ width: '100%', padding: '4px 24px 0 24px' }}>
        <NavHeader title={t('navSessionTitle')} date={dateLabel} onBack={onBack} />
      </div>

      <Hero model={model} />

      {isPresent(model.blocks) ? (
        <SessionBlocks blocks={model.blocks.value} />
      ) : (
        <div style={{ width: '100%', padding: '40px 24px 8px 24px' }}>
          <SecHead index="01" title={t('sectionTheBlocks')} />
          <p style={{ fontFamily: 'var(--e-body)', fontSize: 12, fontWeight: 600, color: 'var(--e-quiet)', margin: '16px 0 0 0' }}>
            {model.blocks.missing}
          </p>
        </div>
      )}

      <QuotePlate state="training" quote={t('quoteTraining')} attribution={t('quoteTrainingAttribution')} photoUrl={SESSION_QUOTE_PHOTO} />

      <Payoff model={model} payoffBlocks={payoffBlocks} />

      <RouteOptions routes={model.routes} />

      <SessionCta onExport={handleExport} />
    </main>
  )
}

/**
 * AUDIT (a3, 2026-08-06) against `J5FV6`'s own `Hero`/`eShIQ`:
 *
 *  - `Kicker` (`tPNdr`) is TWO texts, space-between: `K-Left` ("TONIGHT ·
 *    INTERVAL SESSION", rendered below as `sessionKicker`) AND `K-Right`
 *    ("STARTS IN 3 H 12", a countdown to the workout's scheduled start).
 *    `K-Right` has no source: `PrescribedWorkout` (`api/coach.ts`) carries
 *    no scheduled time-of-day at all — the coach prescribes a session, not
 *    a start time — so there is nothing to count down to. Permanently
 *    unresolvable, never rendered (the same "no plausible substitute" rule
 *    `RouteOptions.tsx` follows for its own missing fields).
 *  - `Cover` (`bGbru`) is a full-bleed stock photo of a workout with a
 *    ground-tinted scrim over it. This app has no session-specific image
 *    field, and `QuotePlate`/`Cover`'s own resolution elsewhere in this
 *    design system (see `RouteOptions.tsx`'s doc comment) is "scrim over
 *    ground, never a stock photo standing in for real content" — Session
 *    Detail's own Hero already follows that resolution by omitting the
 *    photo entirely and letting `EditorialRoot`'s state ground
 *    (`--g-training`) show through, consistent rather than a fresh
 *    departure.
 */
function Hero({ model }: { model: SessionModel }) {
  const { t } = useCopy()
  const { numeral, claim } = model
  const heroBlocks: BarsBlock[] = isPresent(model.blocks)
    ? model.blocks.value.map((b) => ({ label: b.name, minutes: b.minutes, watts: b.watts }))
    : []

  const stats: { label: string; value: Value<number>; unit: string }[] = [
    { label: t('heroStatWatts'), value: model.statWatts, unit: t('unitWatts') },
    { label: t('heroStatDuration'), value: model.statDurationMin, unit: t('unitMin') },
    { label: t('heroStatTss'), value: model.statTss, unit: t('unitTss') },
    { label: t('heroStatInZone'), value: model.statInZoneMin, unit: t('unitMin') },
  ]

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ width: '100%', padding: '18px 24px 22px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--e-body)', fontSize: 9, fontWeight: 800, letterSpacing: 1.6, color: 'var(--e-mid)' }}>
          {t('sessionKicker')}
        </span>

        <div style={{ width: '100%', display: 'flex', gap: 12, alignItems: 'flex-end', marginTop: 12 }}>
          <span
            data-hero-numeral=""
            style={{
              fontFamily: 'var(--e-display)',
              fontSize: 104,
              fontWeight: 800,
              letterSpacing: -6,
              lineHeight: 0.86,
              color: isPresent(numeral) ? 'var(--st-active)' : 'var(--e-lo)',
              filter: isPresent(numeral) ? 'drop-shadow(0 0 44px var(--a22))' : undefined,
            }}
          >
            {isPresent(numeral) ? numeral.value.text : '—'}
          </span>
          {isPresent(numeral) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingBottom: 16 }}>
              {numeral.value.qualifier && (
                <span style={{ fontFamily: 'var(--e-body)', fontSize: 13, fontWeight: 800, letterSpacing: 1.5, color: 'var(--st-active)' }}>
                  {numeral.value.qualifier}
                </span>
              )}
              <span style={{ fontFamily: 'var(--e-body)', fontSize: 10, fontWeight: 800, letterSpacing: 1.3, color: 'var(--e-quiet)' }}>
                {numeral.value.sub}
              </span>
            </div>
          )}
        </div>
        {!isPresent(numeral) && (
          <p style={{ fontFamily: 'var(--e-body)', fontSize: 12, fontWeight: 600, color: 'var(--e-quiet)', margin: '8px 0 0 0' }}>
            {numeral.missing}
          </p>
        )}
      </div>

      <div style={{ width: '100%', padding: '0 24px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ width: '100%', padding: '24px 0 0 0' }}>
          <p style={{
            margin: 0, fontFamily: 'var(--e-display)', fontSize: 26, fontWeight: 800,
            letterSpacing: -1.1, lineHeight: 1.08, color: isPresent(claim) ? 'var(--e-ink)' : 'var(--e-lo)',
          }}
          >
            {isPresent(claim) ? claim.value : '—'}
          </p>
          {!isPresent(claim) && (
            <p style={{ fontFamily: 'var(--e-body)', fontSize: 12, fontWeight: 600, color: 'var(--e-quiet)', margin: '8px 0 0 0' }}>
              {claim.missing}
            </p>
          )}
        </div>

        <div style={{ width: '100%', padding: '22px 0 0 0' }}>
          <div style={{ width: '100%', height: 1, background: 'var(--e-rule)' }} />
        </div>

        <div style={{ width: '100%', display: 'flex', gap: 10, padding: '16px 0 0 0' }}>
          {stats.map((s) => (
            <StatTile key={s.label} label={s.label} value={s.value} unit={s.unit} />
          ))}
        </div>

        {heroBlocks.length > 0 && (
          <div style={{ width: '100%', padding: '30px 0 0 0' }}>
            <Bars blocks={heroBlocks} emphasizeMax />
          </div>
        )}
      </div>
    </div>
  )
}

function Payoff({ model, payoffBlocks }: { model: SessionModel; payoffBlocks: BarsBlock[] }) {
  const { t } = useCopy()
  const { payoff, payoffClaim } = model

  return (
    <div style={{ width: '100%', padding: '40px 24px 0 24px', display: 'flex', flexDirection: 'column' }}>
      {/* AUDIT (a3, 2026-08-06): `S4Hzi/KAfbw` reads 12px Inter/800/ls1.6
          $e-mid ("THE PAYOFF"), not N42va's canonical 19px Sora display
          title — the same small-caps kicker style `04 WHERE TO RIDE IT`
          already uses (`RouteOptions.tsx`'s own `kicker` prop). Its Chip
          (`S4Hzi/sn3I7`) is also flat `#FFFFFF12`/`$e-mid` label, not the
          accent-tinted default — matching `kicker`'s own chip styling. */}
      <SecHead index="03" title={t('sectionThePayoff')} chip={t('chipNext7Days')} kicker />

      <div style={{ width: '100%', padding: '14px 0 24px 0' }}>
        <p style={{
          margin: 0, fontFamily: 'var(--e-body)', fontSize: 12.5, fontWeight: 500, lineHeight: 1.45,
          color: isPresent(payoffClaim) ? 'var(--e-mid)' : 'var(--e-quiet)',
        }}
        >
          {isPresent(payoffClaim) ? payoffClaim.value : payoffClaim.missing}
        </p>
      </div>

      {isPresent(payoff) ? (
        <>
          <Bars blocks={payoffBlocks} />
          <div style={{ width: '100%', display: 'flex', gap: 6, padding: '9px 0 0 0' }}>
            {payoff.value.map((p, i) => (
              <span
                key={i}
                style={{
                  flex: 1, textAlign: 'center', fontFamily: 'var(--e-body)', fontSize: 8, fontWeight: 800,
                  letterSpacing: 1, color: p.isToday ? 'var(--st-active)' : 'var(--e-quiet)',
                }}
              >
                {p.label}
              </span>
            ))}
          </div>
        </>
      ) : (
        <p style={{ fontFamily: 'var(--e-body)', fontSize: 12, fontWeight: 600, color: 'var(--e-quiet)', margin: 0 }}>
          {payoff.missing}
        </p>
      )}

      <div style={{ width: '100%', padding: '26px 0 0 0' }}>
        <WhatThisChanges value={model.whatThisChanges} />
      </div>
    </div>
  )
}
