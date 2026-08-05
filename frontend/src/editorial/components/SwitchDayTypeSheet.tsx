import { ArrowLeftRight, X } from 'lucide-react'
import type { DayState } from '../state/dayState'
import { useCopy } from '../i18n/useCopy'
import type { CopyKey } from '../i18n/copy'
import Sheet from './Sheet'

/**
 * Transcribed from mBvke ("Flagship · Switch Day Type · EDITORIAL II"),
 * `Sheet` (NfM70). Every value below is node path → value from that read;
 * `Sheet.tsx`'s own doc comment covers the scrim/panel geometry shared with
 * `BackToSessionDoneSheet`.
 *
 *  - GrabWrap→Grabber (f9Ghxh): 44×4, cornerRadius 100 (pill), fill
 *    #FFFFFF2B — exact match for the existing `--d-2` token, reused rather
 *    than a new one.
 *  - Head (fmwEi): justify space-between/align center. Key text (ewlxe):
 *    fontSize 9, weight 800, letterSpacing 1.7, fill #767D87 → `--e-quiet`.
 *    Close icon (fMoK0): 18×18, fill #4A5058 → `--e-lo`. Substituted lucide
 *    `X` for Material Symbols "close" — no such font is loaded, same
 *    substitution rationale as `DayRail`'s icons.
 *  - Swap (tSb9l): gap 12, **alignItems: center** (present in this frame,
 *    absent in tEnIQ's own Swap row — an exact, verified difference, not a
 *    copy/paste error smoothed over).
 *    - Col FROM/TO (VgKrk/eZ5lY): gap 7. K label (c645j/XpYuk): fontSize 9,
 *      weight 800, letterSpacing 1.6, fill #4A5058 → `--e-lo`. V value
 *      (GfCoG/ubsXE): font-display, fontSize 24, weight 800,
 *      letterSpacing -1, lineHeight 1.05. FROM's fill #C8FF00 is exactly
 *      `--st-rest`; TO's #2BE68F is exactly `--st-training` — both existing
 *      day-state accent tokens, not new ones. Read dynamically from
 *      `STATE_ACCENT` below since either state can be the FROM or the TO
 *      depending on `current`.
 *    - SwapIcon (p8HKk): 22×22, icon `swap_horiz`, fill #4A5058 → `--e-lo`.
 *  - Rule (ttFCN): height 1, fill `$e-rule` → `--e-rule`.
 *  - Body (cDqXH): fontSize 14, weight 500, lineHeight 1.5, fill #8A9099 →
 *    `--e-mid`. The pen's own copy names concrete numbers ("412 TSS",
 *    "Thursday") this component has no data for — see `sheetSwitchBody*` in
 *    `copy.ts` for the honest, data-free rewrite (missing-data rule).
 *  - Primary (W00D78): height 56, cornerRadius 100 (pill), fill = the
 *    TARGET state's own accent (#2BE68F here = `--st-training`; the mirror
 *    frame going the other direction would use `--st-rest`), shadow
 *    offset {0,6} blur 28 colour = that same accent at #..3D (≈24% alpha,
 *    61/255) — no existing `--st-a*` token lands on 24% (07/12/28/40 are
 *    the only stops), so it's mixed inline via `color-mix` against the
 *    accent variable rather than adding a fifth alpha token for one usage.
 *    Icon (dwqd9): 16×16, fill #04060A → `--e-on-accent`. Label (C2EbZ):
 *    fontSize 12, weight 800, letterSpacing 1.3, fill #04060A →
 *    `--e-on-accent`.
 *  - Ghost (dwwz7): height 56, cornerRadius 100, stroke #FFFFFF1F width 1 →
 *    `--e-rule`. Label (x3yoH): fontSize 12, weight 800, letterSpacing 1.3,
 *    fill #8A9099 → `--e-mid`.
 *
 * Interface matches the brief exactly: `current` is the day's state before
 * the swap (only `rest`/`training` are switchable — the day-state override
 * is bounded to those two by `DayRail`'s own action pill, which only ever
 * offers "MAKE IT A TRAINING DAY"/"MAKE IT A REST DAY"). `onPick` receives
 * the TARGET state — the opposite of `current` — which is exactly the
 * shape `useDayState().setOverride` already takes, so wiring is a direct
 * pass-through with no adapter.
 */
export type SwitchableDayState = Extract<DayState, 'rest' | 'training'>

export interface SwitchDayTypeSheetProps {
  open: boolean
  current: SwitchableDayState
  onPick: (state: SwitchableDayState) => void
  onClose: () => void
}

const STATE_LABEL_KEY: Record<SwitchableDayState, CopyKey> = {
  rest: 'sheetStateRestTitle',
  training: 'sheetStateTrainingTitle',
}

const STATE_ACCENT: Record<SwitchableDayState, string> = {
  rest: 'var(--st-rest)',
  training: 'var(--st-training)',
}

const KEEP_CTA_KEY: Record<SwitchableDayState, CopyKey> = {
  rest: 'sheetKeepRestCta',
  training: 'sheetKeepTrainingCta',
}

function otherState(s: SwitchableDayState): SwitchableDayState {
  return s === 'rest' ? 'training' : 'rest'
}

const kLabelStyle = {
  fontFamily: 'var(--e-body)',
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: 1.6,
  color: 'var(--e-lo)',
} as const

export default function SwitchDayTypeSheet({ open, current, onPick, onClose }: SwitchDayTypeSheetProps) {
  const { t } = useCopy()
  const target = otherState(current)
  const primaryKey: CopyKey = target === 'training' ? 'sheetSwitchToTrainingCta' : 'sheetSwitchToRestCta'
  const bodyKey: CopyKey = target === 'training' ? 'sheetSwitchBodyToTraining' : 'sheetSwitchBodyToRest'
  const targetAccent = STATE_ACCENT[target]

  return (
    <Sheet open={open} onClose={onClose} panelBackground="var(--e-sheet-switch-bg)">
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
      <div style={{ display: 'flex', width: '100%', gap: 12, alignItems: 'center' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={kLabelStyle}>{t('sheetFromLabel')}</span>
          <span
            style={{
              fontFamily: 'var(--e-display)',
              fontSize: 24,
              fontWeight: 800,
              letterSpacing: -1,
              lineHeight: 1.05,
              color: STATE_ACCENT[current],
            }}
          >
            {t(STATE_LABEL_KEY[current])}
          </span>
        </div>
        <ArrowLeftRight size={22} color="var(--e-lo)" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={kLabelStyle}>{t('sheetToLabel')}</span>
          <span
            style={{
              fontFamily: 'var(--e-display)',
              fontSize: 24,
              fontWeight: 800,
              letterSpacing: -1,
              lineHeight: 1.05,
              color: targetAccent,
            }}
          >
            {t(STATE_LABEL_KEY[target])}
          </span>
        </div>
      </div>
      <div style={{ height: 22 }} />
      <div style={{ width: '100%', height: 1, background: 'var(--e-rule)' }} />
      <div style={{ height: 20 }} />
      <p style={{ margin: 0, width: '100%', fontFamily: 'var(--e-body)', fontSize: 14, fontWeight: 500, lineHeight: 1.5, color: 'var(--e-mid)' }}>
        {t(bodyKey)}
      </p>
      <div style={{ height: 26 }} />
      <button
        type="button"
        onClick={() => onPick(target)}
        style={{
          width: '100%',
          height: 56,
          borderRadius: 'var(--radius-pill)',
          border: 'none',
          cursor: 'pointer',
          background: targetAccent,
          boxShadow: `0 6px 28px color-mix(in srgb, ${targetAccent} 24%, transparent)`,
          display: 'flex',
          gap: 8,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ArrowLeftRight size={16} color="var(--e-on-accent)" />
        <span style={{ fontFamily: 'var(--e-body)', fontSize: 12, fontWeight: 800, letterSpacing: 1.3, color: 'var(--e-on-accent)' }}>
          {t(primaryKey)}
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
          {t(KEEP_CTA_KEY[current])}
        </span>
      </button>
    </Sheet>
  )
}
