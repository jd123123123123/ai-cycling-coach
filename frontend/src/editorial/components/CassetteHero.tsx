// frontend/src/editorial/components/CassetteHero.tsx
import Cassette from './Cassette'
import { cogIndexFromReadiness } from './cassetteScale'
import { useChainShift } from '../motion/useChainShift'
import { useCountUp } from '../motion/useCountUp'
import { useCopy } from '../i18n/useCopy'
import { isPresent, type Value } from '../data/value'

export interface CassetteHeroProps {
  readiness: Value<{ score: number; deltaVsYesterday: number | null }>
  series: Value<number[]>
  best: Value<number>
  todayIso: string
  /** Rendered under the numeral, e.g. "Heute geht das 17er." */
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

export default function CassetteHero({ readiness, series, best, todayIso, caption }: CassetteHeroProps) {
  const { t } = useCopy()
  const values = isPresent(series) ? series.value : []

  const placement = isPresent(readiness)
    ? cogIndexFromReadiness(readiness.value.score, values)
    : null
  const bestPlacement = isPresent(best) ? cogIndexFromReadiness(best.value, values) : null

  const { index } = useChainShift(placement?.index ?? null, todayIso)
  const score = useCountUp(isPresent(readiness) ? readiness.value.score : null, 600)
  const delta = isPresent(readiness) ? readiness.value.deltaVsYesterday : null

  return (
    <div>
      <Cassette activeIndex={index} bestIndex={bestPlacement?.index ?? null} idSuffix="today" />

      {isPresent(readiness) ? (
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 14 }}>
          <div
            data-testid="cassette-hero-numeral"
            style={{
              fontFamily: 'var(--e-display)', fontSize: 56, fontWeight: 800,
              lineHeight: 0.78, letterSpacing: '-0.05em', color: 'var(--st-active)',
            }}
          >
            {score ?? readiness.value.score}
          </div>
          <div style={{ paddingBottom: 8 }}>
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
              <div data-testid="cassette-hero-delta" style={{ fontSize: 11, color: 'var(--e-mid)', marginTop: 5 }}>
                <b style={{ color: 'var(--st-active)' }}>{delta > 0 ? `+${delta}` : delta}</b>{' '}
                {t('cassetteSinceYesterday')}
              </div>
            )}
          </div>
        </div>
      ) : (
        <p style={{ fontSize: 13, color: 'var(--e-mid)', textAlign: 'center', padding: '0 24px' }}>
          {readiness.missing}
        </p>
      )}

      <p style={{ fontSize: 13, color: 'var(--e-mid)', padding: '12px 24px 0' }}>
        {isPresent(caption) ? caption.value : caption.missing}
      </p>

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
