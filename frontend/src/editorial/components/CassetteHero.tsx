// frontend/src/editorial/components/CassetteHero.tsx
import Cassette from './Cassette'
import { cogIndexFromReadiness, medianOf } from './cassetteScale'
import { useChainShift } from '../motion/useChainShift'
import { useCopy } from '../i18n/useCopy'
import { isPresent, type Value } from '../data/value'

export interface CassetteHeroProps {
  readiness: Value<{ score: number; deltaVsYesterday: number | null }>
  series: Value<number[]>
  todayIso: string
  /** Rendered under the verdict/delta line, e.g. "Heute geht das 17er." */
  caption: Value<string>
}

const VERDICT_KEYS = [
  'cassetteVerdictReady',
  'cassetteVerdictLoaded',
  'cassetteVerdictTired',
  'cassetteVerdictEmpty',
] as const

/** Four bands across ten cogs: 0-1 ready, 2-4 loaded, 5-7 tired, 8-9 empty. */
function verdictKey(index: number) {
  if (index <= 1) return VERDICT_KEYS[0]
  if (index <= 4) return VERDICT_KEYS[1]
  if (index <= 7) return VERDICT_KEYS[2]
  return VERDICT_KEYS[3]
}

export default function CassetteHero({ readiness, series, todayIso, caption }: CassetteHeroProps) {
  const { t } = useCopy()
  const values = isPresent(series) ? series.value : []

  const placement = isPresent(readiness)
    ? cogIndexFromReadiness(readiness.value.score, values)
    : null
  // The marker is the athlete's TYPICAL reading (the median of their own
  // series), not their best — ranking the maximum against the series it
  // came from always lands on cog 0 (percentileRank(max, series) === 1.0),
  // so a "best" marker could never move. See `cassetteScale.ts`'s own
  // `medianOf` doc comment. Owner ruling, 2026-08-07.
  const median = medianOf(values)
  const typicalPlacement = median != null ? cogIndexFromReadiness(median, values) : null

  const { index } = useChainShift(placement?.index ?? null, todayIso)
  const delta = isPresent(readiness) ? readiness.value.deltaVsYesterday : null

  return (
    <div>
      <Cassette activeIndex={index} bestIndex={typicalPlacement?.index ?? null} idSuffix="today" />

      {isPresent(readiness) ? (
        // OWNER RULING 2026-08-07: the numeral that used to sit here (56px,
        // `useCountUp`-animated) is gone — it repeated the SAME reading the
        // Cover's own numeral already shows a few pixels up (Rest/Training/
        // Resting's Cover numeral IS `model.readiness`/derived from it), the
        // one collision the design's own §0 promised would never happen. It
        // also made the visual harness — screenshots are this project's
        // review method — useless for this component: `useCountUp` starts
        // at 0 and only reaches the real value after a live timer fires, so
        // every static frame showed "0". The cog IS the reading; a numeral
        // restating it was redundant even before either defect. Verdict word
        // and delta now read as ONE centred line, a caption under the
        // cassette rather than a value.
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div
            data-testid="cassette-hero-verdict"
            style={{
              fontFamily: 'var(--e-display)', fontSize: 14, fontWeight: 700,
              letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--e-ink)',
            }}
          >
            {t(verdictKey(placement!.index))}
          </div>
          {delta != null && (
            <div data-testid="cassette-hero-delta" style={{ fontSize: 11, color: 'var(--e-mid)' }}>
              <b style={{ color: 'var(--st-active)' }}>{delta > 0 ? `+${delta}` : delta}</b>{' '}
              {t('cassetteSinceYesterday')}
            </div>
          )}
        </div>
      // An EMPTY `missing` reason (as opposed to an absent one — `readiness`
      // is still the missing arm, just with `''` for its reason) is the
      // caller's own signal that this exact sentence already printed
      // elsewhere on the same screen (`TodayView.tsx`'s own
      // `cassetteReasonAlreadyShown` dedup) — render nothing rather than an
      // empty, oddly-padded paragraph.
      ) : readiness.missing ? (
        <p style={{ fontSize: 13, color: 'var(--e-quiet)', textAlign: 'center', padding: '0 24px' }}>
          {readiness.missing}
        </p>
      ) : null}

      {(isPresent(caption) || caption.missing) && (
        <p style={{ fontSize: 13, color: isPresent(caption) ? 'var(--e-mid)' : 'var(--e-quiet)', padding: '12px 24px 0' }}>
          {isPresent(caption) ? caption.value : caption.missing}
        </p>
      )}

      {placement?.basis === 'decile' && (
        <p
          data-testid="cassette-hero-basis"
          style={{ fontSize: 11, color: 'var(--e-quiet)', padding: '6px 24px 0' }}
        >
          {t('cassetteCoarse')}
        </p>
      )}
    </div>
  )
}
