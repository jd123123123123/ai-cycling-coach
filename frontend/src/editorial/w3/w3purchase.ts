import { AxiosError } from 'axios'

/**
 * Why a purchase failed, in the rider's language.
 *
 * FAILURES ARE TRANSLATED, NOT SWALLOWED. A purchase can fail for three honest
 * reasons and each one gets its own sentence — a rider who just watched a
 * "kaufen" button do nothing has no way to tell "you're broke" from "the
 * request died", and guessing on their behalf is how a shop loses trust.
 *
 * Lifted out of the retired catalogue shop when that screen was removed: the
 * screen is gone, the three failures are not, and the places gallery was
 * swallowing all of them silently.
 */
export function purchaseError(
  err: unknown,
  item: { price: number } | null,
  balance: number | null,
): string {
  const nf = new Intl.NumberFormat('de-DE')
  const status = err instanceof AxiosError ? err.response?.status : undefined
  if (status === 402) {
    const short = item && balance != null ? item.price - balance : null
    return short != null && short > 0
      ? `Dir fehlen noch ${nf.format(short)} RideCoin.`
      : 'Dafür reicht dein Guthaben nicht.'
  }
  if (status === 409) return 'Das gehört dir bereits.'
  if (status === 404) return 'Das gibt es nicht mehr.'
  return 'Der Kauf hat nicht geklappt. Versuch es gleich noch einmal.'
}
