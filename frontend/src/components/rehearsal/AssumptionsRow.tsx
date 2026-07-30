import type { Assumptions, Draft, Effort } from '../../api/rehearsal'
import { SegmentedTabs } from '../ui/SegmentedTabs'
import { glassCardStyle, GLASS_CARD_MARKER } from '../dashboard/glassCard'

/**
 * AssumptionsRow — the three inputs the projection is conditional on.
 *
 * Drafting and weather change the physics. Effort changes what the athlete
 * ATTEMPTS, which is the only reason a blow-up can happen at all: racing a 9 %
 * alpine climb empties W′ and breaks the rider, riding it steadily does not.
 *
 * Effort is deliberately framed as a question — "how will you ride it?" — and
 * never as a recommendation. On the current model racing usually returns a
 * FASTER predicted time, because an emptied rider is capped at CP rather than
 * being lastingly compromised, so any copy nudging toward one setting would be
 * both unearned and, for the athlete who follows it, wrong. The screen asks;
 * the athlete answers; the projection follows.
 */
export default function AssumptionsRow({
  assumptions,
  onChange,
  disabled,
  de,
}: {
  assumptions: Assumptions
  onChange: (patch: { draft?: Draft; effort?: Effort; use_weather?: boolean }) => void
  disabled?: boolean
  de: boolean
}) {
  const draftTabs: readonly { id: Draft; label: string }[] = [
    { id: 'solo', label: de ? 'Allein' : 'Solo' },
    { id: 'small_group', label: de ? 'Kleine Gruppe' : 'Small group' },
    { id: 'bunch', label: de ? 'Großes Feld' : 'Bunch' },
  ]

  const effortTabs: readonly { id: Effort; label: string }[] = [
    { id: 'steady', label: de ? 'Ruhig' : 'Steady' },
    { id: 'fondo', label: 'Fondo' },
    { id: 'race', label: de ? 'Rennen' : 'Race' },
  ]

  return (
    <section
      {...GLASS_CARD_MARKER}
      style={{ ...glassCardStyle, borderRadius: 20, padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <span
        className="eyebrow"
        style={{ fontSize: 11, letterSpacing: '0.18em', fontWeight: 700, color: 'var(--color-ink-2)' }}
      >
        {de ? 'ANNAHMEN' : 'ASSUMPTIONS'}
      </span>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 13.5, fontWeight: 560, color: 'var(--color-ink)' }}>
          {de ? 'Wie fährst du die Strecke?' : 'How will you ride it?'}
        </span>
        <div style={{ overflowX: 'auto', paddingBottom: 2 }}>
          <SegmentedTabs<Effort>
            tabs={effortTabs}
            value={assumptions.effort}
            onChange={(id) => !disabled && onChange({ effort: id })}
            ariaLabel={de ? 'Fahrweise' : 'Effort'}
            indicatorId="rehearsal-effort"
          />
        </div>
        <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--color-muted)', margin: 0 }}>
          {de
            ? 'Deine Angabe, kein Rat — die Vorhersage rechnet nur mit dem, was du vorhast.'
            : 'Your call, not a recommendation — the prediction just follows what you intend to do.'}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 13.5, fontWeight: 560, color: 'var(--color-ink)' }}>
          {de ? 'Windschatten' : 'Drafting'}
        </span>
        <div style={{ overflowX: 'auto', paddingBottom: 2 }}>
          <SegmentedTabs<Draft>
            tabs={draftTabs}
            value={assumptions.draft}
            onChange={(id) => !disabled && onChange({ draft: id })}
            ariaLabel={de ? 'Windschatten' : 'Drafting'}
            indicatorId="rehearsal-draft"
          />
        </div>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={assumptions.use_weather}
        disabled={disabled}
        onClick={() => onChange({ use_weather: !assumptions.use_weather })}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          width: '100%',
          padding: '10px 12px',
          borderRadius: 'var(--radius-pill)',
          border: '1px solid var(--color-rule)',
          background: 'var(--color-paper)',
          cursor: disabled ? 'default' : 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 13.5, fontWeight: 560, color: 'var(--color-ink)' }}>
          {de ? 'Wetter einrechnen' : 'Use the forecast'}
        </span>
        <span
          aria-hidden
          style={{
            width: 40,
            height: 24,
            borderRadius: 999,
            background: assumptions.use_weather ? 'var(--color-ink)' : 'var(--color-rule)',
            display: 'inline-flex',
            alignItems: 'center',
            padding: 3,
            justifyContent: assumptions.use_weather ? 'flex-end' : 'flex-start',
            flexShrink: 0,
          }}
        >
          <span style={{ width: 18, height: 18, borderRadius: 999, background: 'var(--color-paper)' }} />
        </span>
      </button>
    </section>
  )
}
