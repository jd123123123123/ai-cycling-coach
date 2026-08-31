/**
 * W3 · THE INVITE A SHARED CARD CARRIES.
 *
 * Every image that leaves this app is an advert somebody's followers actually
 * look at, and until now it named the product but gave them no way in. A card
 * that says "Ridr" and nothing else asks a stranger to find the app, find the
 * sign-up, and find the code — three steps, none of them signposted, and the
 * referral window that pays the sharer never opens.
 *
 * So every exported card prints ONE line: the sharer's own invite link, with
 * their referral code in it.
 *
 * ── WHY A SHORT `/r/:code` PATH AND NOT THE REAL ONE ──────────────────────
 * The working link is `/e/w3-register?ref=CODE`. Printed on a picture that is
 * 30 characters of query string a human has to retype without a single typo,
 * on top of a host that is already long. `/r/CODE` resolves to exactly the
 * same place (see the redirect in `App.tsx`) and is short enough to read off a
 * phone screen. The route is the product of this constraint, not decoration.
 *
 * ── WHY THE CODE IS PRINTED AS PART OF THE LINK ───────────────────────────
 * It is both affordances in one string. Somebody who can tap types the URL;
 * somebody who cannot be bothered types just the six characters into the
 * register screen's own code field, which already accepts a hand-typed code
 * (`W3RegisterPage`, `typedCode`). One line, two ways in.
 *
 * NOTE ON THE HOST. There is no custom domain yet, so `location.host` is the
 * Railway hostname and the printed line is long. The layout measures and
 * shrinks to fit rather than truncating — but the real fix is a short domain,
 * and the day one exists this module is the only place that has to change.
 */

/** The short path that redirects into the register screen with the code. */
export const INVITE_PATH = '/r/'

/** Where the register screen reads a code from, when the link is the long one. */
export const REGISTER_PATH = '/e/w3-register'

/** The full, tappable invite URL — what goes into a share sheet's `url` field. */
export function inviteUrl(code: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  return `${origin}${INVITE_PATH}${encodeURIComponent(code)}`
}

/**
 * What gets PRINTED on a card: no scheme, because `https://` is four wasted
 * characters on an image nobody can click. Host + short path + the raw code.
 */
export function inviteDisplay(code: string): string {
  const host = typeof window === 'undefined' ? '' : window.location.host
  return host ? `${host}${INVITE_PATH}${code}` : `${INVITE_PATH.slice(1)}${code}`
}
