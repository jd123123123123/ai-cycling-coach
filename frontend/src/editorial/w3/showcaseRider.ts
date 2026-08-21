/**
 * The character shown on the rider-onboarding screen before a rider has one.
 *
 * IT WAS 90 KB OF INLINED BASE64 JPEG — a cartoon figure from an older art
 * direction, compiled into the app bundle and shipped to everybody whether they
 * ever opened this screen or not. Two things were wrong with that:
 *
 *  1. IT PROMISED THE WRONG THING. The renderer's own direction moved to a
 *     composed, charcoal-and-acid designer collectible on a dark ground, and
 *     this screen kept advertising a wide-eyed cartoon on grey. The one screen
 *     asking somebody to hand over a photograph of their face was showing them
 *     a character the pipeline no longer makes.
 *  2. INLINE BASE64 CANNOT BE CACHED, and it inflates by a third. A file is
 *     fetched once, cached by the browser, and only by the people who reach
 *     this screen.
 *
 * The image is now what the pipeline ACTUALLY produces: rendered through the
 * real prompt and kept as the reference.
 */
export const SHOWCASE_RIDER = '/w3/example-rider.webp'
