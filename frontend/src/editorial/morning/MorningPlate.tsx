import { scrimGradient, type ScrimStop } from '../components/plateScrim'

/**
 * The full-bleed photographic layer of a deck chapter.
 *
 * `Cover` and `QuotePlate` both size themselves to a fixed per-state photo
 * envelope (462px, 322px) because they are plates sitting IN a scrolling
 * page. Here the photograph is not a plate on a page — it is the page. So
 * this fills its chapter absolutely (see `.m-plate`) and the chapter's own
 * 100dvh drives the height, which is the one thing those two components
 * cannot be asked to do without breaking every screen that already uses them.
 *
 * The stack itself is theirs, unchanged and for their reasons: photo, grey
 * saturation wash, state-tinted colour wash, scrim. The photo is its own
 * layer because `mix-blend-mode` composites against a backdrop and cannot act
 * on its own parent's background.
 */
export type PlateKind = 'open' | 'close'

/** Two scrim shapes, one per job.
 *
 *  `open` is legible at BOTH ends — the chapter rail rides over the top of it
 *  and the headline sits at the bottom — with the photograph allowed to
 *  breathe through the middle third.
 *
 *  `close` is the reverse weighting: a quote at the top, then a long dark run
 *  under the claim, the body and the CTA, which need the most contrast of
 *  anything in the deck.
 *
 *  CORRECTED against a render at 390×844: `close` originally released to 34%
 *  by a quarter of the way down, which put the quote's attribution line on the
 *  brightest fog in the photograph — measurably unreadable. The plate holds
 *  62% through the whole quote block now. The photograph gives up nothing
 *  worth having; its subject is the lower two thirds. */
const SCRIM: Record<PlateKind, ScrimStop[]> = {
  open: [{ pos: 0, alpha: 84 }, { pos: 26, alpha: 54 }, { pos: 50, alpha: 16 }, { pos: 74, alpha: 60 }, { pos: 100, alpha: 97 }],
  close: [{ pos: 0, alpha: 86 }, { pos: 24, alpha: 62 }, { pos: 42, alpha: 30 }, { pos: 72, alpha: 86 }, { pos: 100, alpha: 99 }],
}

export default function MorningPlate({ photoUrl, kind }: { photoUrl?: string | null; kind: PlateKind }) {
  return (
    <div className="m-plate" data-plate={kind} aria-hidden="true">
      {photoUrl && (
        <>
          <div data-photo style={{ position: 'absolute', inset: 0, background: `center / cover no-repeat url(${photoUrl})` }} />
          <div data-photo-layer style={{ position: 'absolute', inset: 0, background: 'var(--e-photo-sat-cover)', mixBlendMode: 'saturation' }} />
          <div data-photo-layer style={{ position: 'absolute', inset: 0, background: 'var(--e-photo-tint-cover)', mixBlendMode: 'color' }} />
        </>
      )}
      <div data-scrim style={{ position: 'absolute', inset: 0, background: scrimGradient(SCRIM[kind]) }} />
    </div>
  )
}
