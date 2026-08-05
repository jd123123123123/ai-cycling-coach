/**
 * The scrim gradient every photographic plate stacks over its photo/tint
 * layers (Cover, QuotePlate, TomorrowPlate). Built from `var(--e-ground)` at
 * per-stop alpha rather than a literal hex — the pen's own scrim colour IS
 * that state's ground colour (verified: Rest's stops are all `#0A0B05..`,
 * Training's `#05100A..`, Trained's `#120B05..` — exactly `--g-rest` /
 * `--g-training` / `--g-trained`), so building it from `--e-ground` keeps the
 * scrim honestly tied to the state that's actually active rather than a
 * frozen literal, and keeps this file free of raw six-digit hex (the
 * project-wide rule for everything under `editorial/` outside `tokens.css`).
 */
export interface ScrimStop {
  /** 0-100, position along the gradient. */
  pos: number
  /** 0-100, alpha of `--e-ground` at this stop. */
  alpha: number
}

export function scrimGradient(stops: readonly ScrimStop[]): string {
  const parts = stops.map(
    (s) => `color-mix(in srgb, var(--e-ground) ${s.alpha}%, transparent) ${s.pos}%`,
  )
  return `linear-gradient(180deg, ${parts.join(', ')})`
}
