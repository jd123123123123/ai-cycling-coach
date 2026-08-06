import { useNavigate } from 'react-router-dom'
import type { CSSProperties } from 'react'
import { downloadWorkoutExport } from '../../api/coach'
import { useAuth } from '../../contexts/AuthContext'
import { useStreak } from '../../hooks/useStreak'
import Bars, { type BarsBlock } from '../components/Bars'
import NavHeader, { type NavHeaderIdentity } from '../components/NavHeader'
import QuotePlate from '../components/QuotePlate'
import { SESSION_QUOTE_PHOTO } from '../components/plateImagery'
import RouteOptions from '../components/RouteOptions'
import SecHead from '../components/SecHead'
import SessionBlocks from '../components/SessionBlocks'
import SessionCta from '../components/SessionCta'
import StatTile from '../components/StatTile'
import WhatThisChanges from '../components/WhatThisChanges'
import EditorialRoot from '../EditorialRoot'
import { isPresent, type Value } from '../data/value'
import { useSessionModel, type SessionModel } from '../data/useSessionModel'
import { useCopy } from '../i18n/useCopy'

/**
 * Session Detail (pen `J5FV6`), transcribed as a pure function of an
 * already-assembled `SessionModel` — same split as `TodayView`/`TodayPage`,
 * so this screen can be rendered from a fixture (visual harness) with no
 * React Query, auth, or backend.
 *
 * PEN-VERIFIED ORDER (2026-08-05 re-read, `J5FV6`'s direct children):
 * StatusBar → Nav → Hero (Cover + Hero Body) → `01 The Blocks` → Quote Plate
 * → `03 THE PAYOFF` → `04 WHERE TO RIDE IT` → CTA. StatusBar is the pen's own
 * mock iOS chrome (topbar task: deleted, a real phone already draws its own —
 * see `components/DayRail.tsx`'s topbar-task doc comment for the sibling
 * change on Today). The brief's own copy of this tree names a
 * `02 HOW TO RIDE IT` section between `01` and the Quote Plate — the live
 * tree has no such section; the pen wins. `04 WHERE TO RIDE IT` DOES render
 * now (`components/RouteOptions.tsx`) — see `useSessionModel.ts`'s own doc
 * comment for the real source (`GET /routes/mine`) and exactly what it
 * does/doesn't supply.
 *
 * HEADER SPINE (design pass, 2026-08-06 — re-verified live against `zWpVV`,
 * `J5FV6`'s own Nav, same day): the pen's Nav still carries no avatar slot
 * at all — Back + Title on the left, a bare date on the right, nothing else.
 * That is a genuine, fresh-re-read disagreement with the owner's own
 * complaint about this build: "the header is differently formatted on every
 * screen... Session Detail opens with a completely unrelated NavHeader
 * (title + date + back) and no avatar." The owner's ruling on this exact
 * conflict is explicit — "where the pen and the system's consistency
 * disagree, say so and choose consistency" — so `NavHeader` now renders the
 * SAME identity strip Today's Cover Meta row does (date · streak · avatar),
 * reusing `ProfileAvatar` and the identical Flame/streak markup Today's own
 * Cover uses (`pages/TodayView.tsx`), just relocated to the Nav's right
 * side alongside the back affordance a detail view still needs. `identity`
 * is optional, resolved here from the same hooks `TodayPage.tsx` already
 * uses (`useAuth`, `useStreak`) — components/ still never reaches for a
 * hook itself; the page resolves real data and hands it down as a plain
 * prop, matching `TodayPage`'s own `profile`/`control` pattern exactly.
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
  const { user } = useAuth()
  const streakQuery = useStreak()
  const identity: NavHeaderIdentity = {
    avatarUrl: user?.avatar_url ?? null,
    avatarInitial: (user?.display_name || user?.email || '?').charAt(0).toUpperCase(),
    streakDays: streakQuery.data?.streak ?? null,
  }
  return <SessionDetailView model={useSessionModel()} onBack={() => navigate(-1)} identity={identity} />
}

/** Pure layout — no hooks that need React Query/auth. Used directly by
 *  `__tests__/sessionDetail.test.tsx` and the visual harness. `identity` is
 *  optional so a fixture render (no auth, no backend) simply shows the Nav
 *  without an avatar/streak — exactly like `TodayView`'s own `profile` prop
 *  being absent shows no avatar there. */
export function SessionDetailView({ model, onBack, identity }: { model: SessionModel; onBack?: () => void; identity?: NavHeaderIdentity }) {
  return (
    <EditorialRoot state="training">
      <SessionDetailBody model={model} onBack={onBack ?? (() => {})} identity={identity} />
    </EditorialRoot>
  )
}

function SessionDetailBody({ model, onBack, identity }: { model: SessionModel; onBack: () => void; identity?: NavHeaderIdentity }) {
  const { t } = useCopy()

  const dateLabel = isPresent(model.dateLabel) ? model.dateLabel.value : '—'

  const payoffBlocks: BarsBlock[] = isPresent(model.payoff)
    ? model.payoff.value.map((p) => ({ label: p.label, minutes: 1, watts: p.tss }))
    : []

  // Dedupe reasons screen-wide (design pass, 2026-08-06): when there is no
  // session today, `model.numeral`/`model.claim`/every hero stat/`model.
  // blocks` all share the identical "nothing planned" reason — the old
  // render printed it once under the numeral, once under the claim, once
  // per stat tile (×4) and once more under "01 The Blocks": six copies of
  // the same sentence on one screen, the exact defect measured in the
  // spec ("the same apology printed 3×"). The hero numeral is this screen's
  // most prominent slot, so it carries the ONE printed reason; every other
  // slot that shares it now shows its own honest "—" with no repeated text
  // (a genuinely distinct reason — e.g. a session that exists but has no
  // watt target on one block — still prints normally, since only an EXACT
  // string match is suppressed).
  const heroReason: string | null = !isPresent(model.numeral) ? model.numeral.missing : null

  const handleExport = async () => {
    await downloadWorkoutExport('fit')
  }

  return (
    <main data-session-detail="">
      <div style={{ width: '100%', padding: '14px 24px 0 24px' }}>
        <NavHeader title={t('navSessionTitle')} date={dateLabel} onBack={onBack} identity={identity} />
      </div>

      <Hero model={model} heroReason={heroReason} />

      {isPresent(model.blocks) ? (
        <SessionBlocks blocks={model.blocks.value} />
      ) : (
        <div style={{ width: '100%', padding: '40px 24px 8px 24px' }}>
          <SecHead index="01" title={t('sectionTheBlocks')} />
          {model.blocks.missing !== heroReason && (
            <p style={quietReason}>{model.blocks.missing}</p>
          )}
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
 *    departure. RE-VERIFIED live 2026-08-06 (`Get('bGbru')`): the pen now
 *    DOES carry a real Unsplash photo fill on this node, 372 tall — a
 *    change since the last audit. Out of scope for this pass (not one of
 *    the two named bugs, not one of the design-pass's six points, and
 *    `Cover.tsx`/the photographic-plate machinery belong to another agent);
 *    flagged in the task report rather than silently added or silently
 *    dropped.
 */
function Hero({ model, heroReason }: { model: SessionModel; heroReason: string | null }) {
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
        <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-label)', fontWeight: 800, letterSpacing: 1.4, color: 'var(--e-mid)' }}>
          {t('sessionKicker')}
        </span>

        {isPresent(numeral) ? (
          <div style={{ width: '100%', display: 'flex', gap: 12, alignItems: 'flex-end', marginTop: 12 }}>
            {/* Design pass (2026-08-06): NOT routed through --t-display. That
                token is the hero numeral's own ceiling everywhere else in
                this system (146px, shrunk only via numeralFit's own
                fit-to-width rule) — this screen's numeral is a different
                shape entirely (a repeat-pattern label like "4×8", not a
                plain number) and its 104/-6 geometry is this frame's own
                pen-audited size (task a3, 2026-08-06), not a stray literal
                the 22-distinct-steps audit was measuring. Left as its own
                deliberate value rather than forced into a token built for a
                different content shape. */}
            <span
              data-hero-numeral=""
              style={{
                fontFamily: 'var(--e-display)',
                fontSize: 104,
                fontWeight: 800,
                letterSpacing: -6,
                lineHeight: 0.86,
                color: 'var(--st-active)',
                filter: 'drop-shadow(0 0 44px var(--a22))',
              }}
            >
              {numeral.value.text}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingBottom: 16 }}>
              {numeral.value.qualifier && (
                <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', fontWeight: 800, letterSpacing: 1.2, color: 'var(--st-active)' }}>
                  {numeral.value.qualifier}
                </span>
              )}
              <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-label)', fontWeight: 800, letterSpacing: 1.2, color: 'var(--e-quiet)' }}>
                {numeral.value.sub}
              </span>
            </div>
          </div>
        ) : (
          // Bug fix (2026-08-06): a "—" scaled to this numeral's 104px slot
          // stopped reading as punctuation and rendered as a solid grey
          // rectangle — the same defect just fixed on Today's hero
          // (`components/MetricTrack.tsx`, commit 5f98a62: "the withheld
          // hero is designed, not a grey bar"). This mirrors that
          // component's own composed missing-state: a small status dot plus
          // a headline, instead of an oversized glyph. Unlike Today's
          // readiness gate, there is only ONE reason string here (no
          // separate short/dated headline + longer detail pair) — so this
          // follows MetricTrack's own no-distinct-headline fallback
          // exactly: the one reason IS the headline, and no second
          // paragraph repeats it underneath.
          <div data-hero-numeral="" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: 'var(--e-lo)' }} />
            <span
              style={{
                fontFamily: 'var(--e-body)',
                fontSize: 'var(--t-lead)',
                fontWeight: 800,
                letterSpacing: -0.3,
                lineHeight: 1.15,
                color: 'var(--e-ink)',
              }}
            >
              {numeral.missing}
            </span>
          </div>
        )}
      </div>

      <div style={{ width: '100%', padding: '0 24px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ width: '100%', padding: '24px 0 0 0' }}>
          {/* Design pass (2026-08-06): --t-title (34px), the same "one bold
              sentence" step Statement's claim / Verdict's headline /
              QuotePlate's quote / TomorrowPlate's title all use — this claim
              plays the identical editorial role, just on this screen's own
              Hero rather than a numbered section. Precedent (`Verdict.tsx`)
              is explicit that this step is used even for a claim that runs
              several lines — bigger and bolder is the point, not a size
              reserved for short titles. */}
          <p style={{
            margin: 0, fontFamily: 'var(--e-display)', fontSize: 'var(--t-title)', fontWeight: 800,
            letterSpacing: -1, lineHeight: 1.05, color: isPresent(claim) ? 'var(--e-ink)' : 'var(--e-lo)',
          }}
          >
            {isPresent(claim) ? claim.value : '—'}
          </p>
          {/* Dedupe reasons screen-wide (design pass, 2026-08-06): when the
              claim is missing for the SAME reason the numeral just
              explained a few lines above, this stays an honest "—" with no
              repeated sentence. A genuinely distinct reason (e.g. a real
              session with no purpose text filled in) still prints. */}
          {!isPresent(claim) && claim.missing !== heroReason && (
            <p style={quietReason}>{claim.missing}</p>
          )}
        </div>

        <div style={{ width: '100%', padding: '22px 0 0 0' }}>
          <div style={{ width: '100%', height: 1, background: 'var(--e-rule)' }} />
        </div>

        <div style={{ width: '100%', display: 'flex', gap: 10, padding: '16px 0 0 0' }}>
          {stats.map((s) => (
            <StatTile
              key={s.label}
              label={s.label}
              value={s.value}
              unit={s.unit}
              hideReason={!isPresent(s.value) && s.value.missing === heroReason}
            />
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
          margin: 0, fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', fontWeight: 500, lineHeight: 1.5,
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
                  flex: 1, textAlign: 'center', fontFamily: 'var(--e-body)', fontSize: 'var(--t-micro)', fontWeight: 800,
                  letterSpacing: 0.8, color: p.isToday ? 'var(--st-active)' : 'var(--e-quiet)',
                }}
              >
                {p.label}
              </span>
            ))}
          </div>
        </>
      ) : (
        <p style={quietReason}>
          {payoff.missing}
        </p>
      )}

      <div style={{ width: '100%', padding: '26px 0 0 0' }}>
        <WhatThisChanges value={model.whatThisChanges} />
      </div>
    </div>
  )
}

const quietReason: CSSProperties = {
  fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', fontWeight: 500, color: 'var(--e-quiet)', margin: '8px 0 0 0',
}
