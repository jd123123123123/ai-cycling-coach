import { isPresent, type Value } from '../data/value'
import type { Claim } from '../data/useTodayModel'
import { useCopy } from '../i18n/useCopy'

/**
 * "What It Changes" (wZE1f, `01 The Session`): a Rule, then ON YOU / ON
 * THE PLAN rows (Q8hlBw/Oc0V0), each a Rule + 8px/800/ls1.4 accent label +
 * 16px Sora headline + 12px $e-mid detail. Sourced straight from
 * TodayModel's existing `whatThisChanges` (never re-derived here, per the
 * brief). The CTA arrow button (SdW8T) is decorative navigation with no
 * destination route wired into this task and is intentionally not built.
 */
export default function WhatThisChanges({ value }: { value: Value<{ onYou: Claim; onThePlan: Claim }> }) {
  const { t } = useCopy()
  const present = isPresent(value)
  const rows: { label: string; claim: Claim | null }[] = [
    { label: t('onYou'), claim: present ? value.value.onYou : null },
    { label: t('onThePlan'), claim: present ? value.value.onThePlan : null },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {rows.map((row) => (
        <div key={row.label} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ width: '100%', height: 1, background: 'var(--e-hairline)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-label)', fontWeight: 800, letterSpacing: 1.4, color: 'var(--st-active)' }}>
              {row.label}
            </span>
            <span style={{ fontFamily: 'var(--e-display)', fontSize: 'var(--t-body)', fontWeight: 700, letterSpacing: -0.2, lineHeight: 1.3, color: 'var(--e-ink)' }}>
              {row.claim ? row.claim.claim : '—'}
            </span>
            {row.claim && (
              <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', fontWeight: 500, lineHeight: 1.45, color: 'var(--e-mid)' }}>
                {row.claim.detail}
              </span>
            )}
          </div>
        </div>
      ))}
      {!present && (
        <p style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', fontWeight: 500, color: 'var(--e-quiet)', margin: '8px 0 0 0' }}>
          {value.missing}
        </p>
      )}
    </div>
  )
}
