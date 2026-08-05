import { Undo2, X } from 'lucide-react'
import { useCopy } from '../i18n/useCopy'
import Sheet from './Sheet'

/**
 * Transcribed from tEnIQ ("Flagship · Back To Session Done · EDITORIAL II"),
 * `Sheet` (pLofn). `Sheet.tsx`'s own doc comment covers the scrim/panel
 * geometry shared with `SwitchDayTypeSheet`; this file's own diffs from
 * that sibling frame:
 *
 *  - Swap (S45ic8): gap 12, **no `alignItems`** (defaults to `start`) —
 *    verified against mBvke's own Swap (tSb9l), which DOES set
 *    `alignItems: center`. An exact, deliberate difference between the two
 *    frames, kept rather than smoothed to match its sibling.
 *  - Col FROM/TO (n5UgR/Bp3EZ): V value (ErkBN/BAMiF) is font-display,
 *    **fontSize 21** (not 24 — mBvke's own size), letterSpacing -0.8 (not
 *    -1), lineHeight 1.05. FROM's fill #00E5FF is exactly `--st-resting`;
 *    TO's #FF5E00 is exactly `--st-trained`. Fixed in this direction only —
 *    the brief's own interface (`{ open, onConfirm, onClose }`, no
 *    `current`) has no branch, matching the pen: there is one frame, one
 *    transition, "Recovering → Session Done".
 *  - SwapIcon (p0Ia4L): 22×22, icon `undo` (→ lucide `Undo2`, same
 *    substitution as `DayRail`), fill #4A5058 → `--e-lo`.
 *  - Body (HAejq): fontSize 14, weight 500, lineHeight 1.5, fill #8A9099 →
 *    `--e-mid`. Pen copy again names data this component doesn't receive
 *    ("nothing you've already logged is lost" — kept, since it's true by
 *    construction of the override mechanism, not a fabricated number);
 *    see `sheetBackBody` in copy.ts.
 *  - Primary (FgTSz): height 56, cornerRadius 100, fill #FF5E00 →
 *    `--st-trained` (the pen's own literal, not `--st-active` — this sheet
 *    always proposes the Trained accent regardless of the CURRENT day
 *    state's own active colour). Shadow offset {0,6} blur 28, colour
 *    #FF5E003D (~24%, same `color-mix` treatment as the sibling sheet for
 *    the same reason — no existing `--st-a*` stop is 24%). Icon (s4i717)
 *    16×16 fill #04060A → `--e-on-accent`. Label (uaB05) fontSize 12,
 *    weight 800, letterSpacing 1.3, fill #04060A → `--e-on-accent`,
 *    content literally "BACK TO SESSION DONE" — the EXACT string
 *    `DayRail`'s own action-pill label uses for `resting`/`evening`
 *    (`dayRailBackToDone`), reused rather than duplicated.
 *  - Ghost (p776n): height 56, cornerRadius 100, stroke #FFFFFF1F → `--e-
 *    rule`. Label (Lg4Rx) fontSize 12, weight 800, letterSpacing 1.3, fill
 *    #8A9099 → `--e-mid`.
 *
 * `onConfirm` takes no argument — the direction is fixed (`resting →
 * trained`), so the controller wires it as
 * `onConfirm={() => setOverride('trained')}`.
 */
export interface BackToSessionDoneSheetProps {
  open: boolean
  onConfirm: () => void
  onClose: () => void
}

export default function BackToSessionDoneSheet({ open, onConfirm, onClose }: BackToSessionDoneSheetProps) {
  const { t } = useCopy()

  return (
    <Sheet open={open} onClose={onClose} panelBackground="var(--e-sheet-back-bg)">
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: 44, height: 4, borderRadius: 'var(--radius-pill)', background: 'var(--d-2)' }} />
      </div>
      <div style={{ height: 26 }} />
      <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--e-body)', fontSize: 9, fontWeight: 800, letterSpacing: 1.7, color: 'var(--e-quiet)' }}>
          {t('sheetChangeDayStateHeader')}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('sheetClose')}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex' }}
        >
          <X size={18} color="var(--e-lo)" />
        </button>
      </div>
      <div style={{ height: 22 }} />
      <div style={{ display: 'flex', width: '100%', gap: 12 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={{ fontFamily: 'var(--e-body)', fontSize: 9, fontWeight: 800, letterSpacing: 1.6, color: 'var(--e-lo)' }}>
            {t('sheetFromLabel')}
          </span>
          <span style={{ fontFamily: 'var(--e-display)', fontSize: 21, fontWeight: 800, letterSpacing: -0.8, lineHeight: 1.05, color: 'var(--st-resting)' }}>
            {t('sheetStateRecoveringTitle')}
          </span>
        </div>
        <Undo2 size={22} color="var(--e-lo)" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={{ fontFamily: 'var(--e-body)', fontSize: 9, fontWeight: 800, letterSpacing: 1.6, color: 'var(--e-lo)' }}>
            {t('sheetToLabel')}
          </span>
          <span style={{ fontFamily: 'var(--e-display)', fontSize: 21, fontWeight: 800, letterSpacing: -0.8, lineHeight: 1.05, color: 'var(--st-trained)' }}>
            {t('sheetStateSessionDoneTitle')}
          </span>
        </div>
      </div>
      <div style={{ height: 22 }} />
      <div style={{ width: '100%', height: 1, background: 'var(--e-rule)' }} />
      <div style={{ height: 20 }} />
      <p style={{ margin: 0, width: '100%', fontFamily: 'var(--e-body)', fontSize: 14, fontWeight: 500, lineHeight: 1.5, color: 'var(--e-mid)' }}>
        {t('sheetBackBody')}
      </p>
      <div style={{ height: 26 }} />
      <button
        type="button"
        onClick={onConfirm}
        style={{
          width: '100%',
          height: 56,
          borderRadius: 'var(--radius-pill)',
          border: 'none',
          cursor: 'pointer',
          background: 'var(--st-trained)',
          boxShadow: '0 6px 28px color-mix(in srgb, var(--st-trained) 24%, transparent)',
          display: 'flex',
          gap: 8,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Undo2 size={16} color="var(--e-on-accent)" />
        <span style={{ fontFamily: 'var(--e-body)', fontSize: 12, fontWeight: 800, letterSpacing: 1.3, color: 'var(--e-on-accent)' }}>
          {t('dayRailBackToDone')}
        </span>
      </button>
      <div style={{ height: 10 }} />
      <button
        type="button"
        onClick={onClose}
        style={{
          width: '100%',
          height: 56,
          borderRadius: 'var(--radius-pill)',
          background: 'transparent',
          border: '1px solid var(--e-rule)',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <span style={{ fontFamily: 'var(--e-body)', fontSize: 12, fontWeight: 800, letterSpacing: 1.3, color: 'var(--e-mid)' }}>
          {t('sheetStayInRecoveryCta')}
        </span>
      </button>
    </Sheet>
  )
}
