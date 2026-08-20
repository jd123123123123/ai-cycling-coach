/**
 * The first picture in the app, as a URL rather than inlined base64.
 *
 * IT USED TO BE A STOCK PHOTOGRAPH of a road cyclist, pasted into this module
 * as a data URL — a different app's art on the one screen that sets the
 * expectation for every screen after it, and ~117 KB riding inside the
 * JavaScript bundle on every single page load whether or not anyone saw it.
 *
 * Now the house's own character on the house's own ground, rendered by
 * `backend/scripts/generate_starter_art.py` and cached by the browser like any
 * other asset. The figure sits low in a tall frame because the headline and the
 * button are drawn over the top half.
 */
export const W3_ONBOARD_HERO = '/w3/onboard-hero.webp'
