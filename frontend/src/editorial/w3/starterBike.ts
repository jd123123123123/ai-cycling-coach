/**
 * The starter bike, as a URL rather than 112 KB of inlined base64.
 *
 * IT USED TO BE THE FILE. A cut-out product photograph of a stock road bike on
 * a white ground, pasted into this module as a base64 data URL — so every page
 * load carried it in the JavaScript bundle whether or not anything drew it, and
 * the first picture a new rider ever saw belonged to a different app than the
 * near-black studio everything else is shot in.
 *
 * Now a plain path: cached by the browser like any other asset, and replaceable
 * by re-running `backend/scripts/generate_starter_art.py`, which renders it in
 * the house style on the same locked drive-side camera the garage uses.
 */
export const STARTER_BIKE = '/w3/starter-bike.webp'
