# Stage collection: review candidate

## Current scope

Three rendered compositions are wired for review: Waschanlage (more than two hours in rain), Startrampe (200 km in one ride), Mond (5,000 m ascent in one ride). The 50-scene source catalogue remains available; the other 47 are not released. Existing earned backgrounds stay owned. Fantastical locations are allowed: believable physical contact and an immediately legible achievement matter more than a real-world venue.

## Bicycle and world

The authoritative scene and original rider bicycle go into the existing image edit provider. Claude's swap prompt is extracted verbatim from the Cassette `tausch.py` AST. The scene dictates illumination, weather and surface condition; the bicycle is supplied as an image.

Each canonical scene is normalized once to 1080 × 1920, a wheel midpoint at 50% width, wheelbase at 52% width, and ground contact at 73.5% height. The original cutout is placed on this exact geometry in every output, rather than placed separately in the UI. Camera alignment outside tolerance is rejected.

Cassette's silhouette-and-shadow merge is now called by the background render service. A clean restoration plate removes candidate frame edges and spokes before original geometry is restored. This fixes visible ghost spokes that the original high-pass score did not catch. Low-frequency scene lighting is transferred to the original bicycle. Contact/cast shadows from the generated candidate remain inside the allowed mask. Protected world pixels are restored exactly; final encoding is lossless WebP. These checks are useful guards, not proof that arbitrary generated reflections or all physics are correct. The three reference images were visually inspected; another rider's generated result can still need review.

Render keys include rider, original asset/version, scene bytes, clean restoration bytes and renderer revision. Only checked `ok` images appear as the rider's scene. Pending/failed results keep the original bicycle. Atomic database leases deduplicate concurrent renders. Provider work runs outside the API event loop and holds no database connection while generating.

## Ownership and celebration

Existing RiderBackdrop rows are the permanent unlock ledger. New rows are inserted idempotently; missing facts never qualify. Unlocks remain even when image generation fails. Shared stories use the same complete checked image, never an independent bicycle overlay. No population rarity percentage, artificial countdown or revocation.

The reveal follows a one-shot 8.4-second sequence: rest, three increasing shakes, illuminated seam, breath, lid/shards/rings, 28 → 14 → 6 → sharp development, text arrival and light sweep. Reduced motion reveals immediately. Closing is always available. Unsupported haptics are ignored.

Collectibles use a consistent photographic frame, quiet W3 typography, visible rarity labels and differentiated material rims. All images retain the same aspect ratio and bicycle position.

## Validation and publishing

Local review: http://127.0.0.1:5205/review-scenes.html. Preview achievements are explicitly synthetic; the saved reference bicycle is used. Generated source assets were made with the built-in image tool and then passed through the guarded Cassette workflow; production uses the app's existing image provider. Exact composition/edit prompts are in the task tool history and the two source documents.

62 focused backend tests passed before the final visual-only iteration, including same-position assertions, missing-input rejection, cleanup, ownership, 200 km boundary and resync idempotency. Eight hero view-model tests, frontend type check and production build passed. The plan deployment proceeds separately. This scene collection is a review candidate, not approved for deployment yet.

## Collection refinement — 14 September

Full-art portraits now sit above a separate typographic caption. Thin material edges replace patterned carbon and thick neon frames. Rarity uses a compact pill with restrained aluminium, sage, blue-steel, champagne and titanium tones. The original RIDR vector sits on the photoreal rendered case and the earned collection cards. Motion drives case perspective and whole-dialog anticipation. A quiet reflection and a short tremor precede the 3.6-second case opening; image development and the final light sweep complete the 8.4-second reveal. Reduced-motion users see the result immediately. Browser inspection verified the collection and completed reveal, including an always-visible close control.

## Result hierarchy, review and invitation

Four synthetic personas were represented by two independent reviewers: everyday cyclist, performance cyclist, premium collector and newcomer. These were heuristic code/concept critiques, not real user testing or measured scores. They identified the hidden reward identity, unmet-vs-earned threshold ambiguity, action delay and short-screen text collision. Result copy now identifies a bike backdrop, marks the milestone as completed, keeps actions available once the image appears, and shows rarity separately. The user then explicitly preferred the humorous Houston headline over the scene name; the name remains subordinate. Mobile results fill the available viewport and crop scenery consistently around the complete bicycle. Legendary scenes retain slow atmospheric light and a material edge; reduced motion disables these effects.

The rendered case uses a single 800 × 754 coordinate system. Its visible seam was sampled from the image; complementary lid/body masks preserve the closed composition, including clasp outlines, with no delayed second lid. The original RIDR vector stays on the front panel.

Personal invitation uses the existing authenticated /referrals/mine code and /r/:code route. The detail footer links to it, the exported image prints the full host and referral path, and native sharing includes the URL. Local preview uses an explicitly synthetic DEMO26 code. No code is invented for production; sharing retries retrieval if necessary.

Scene deployment remains pending visual approval after the subsequent mobile/animation revisions. The Plan release c99d66a was independently deployed successfully as Railway 0a2624c2-2a29-4b5e-b0cc-efbc189e1563. Its full commit chain must be preserved before any scene deployment.

## Integrated validation checkpoint

Scene commits e0294f8/e14f00c are combined with the complete production Plan chain (17f16ef, 8ed9068, 3d07ce8, c99d66a cherry-picked as 3e5f2c1, 422d4f4, bbe0bfb, 288fdc6). After integration, 82 focused backend tests passed, including plan-state/custom-goal and scene ownership/render guards. Twelve invitation/hero view-model tests passed. TypeScript and production build passed, with the existing large-map chunk warning. This is still a local scene review build; no scene deployment occurred.

The user requested another visual challenge after the Houston headline change and the removal of floating particles. An independent reviewer is inspecting the actual preview, not only the source. A separate agent is creating 50 additional Easter-Egg concepts and a separate isolated worktree is redesigning the profile after a four-perspective concept critique. Neither work item is automatically included in the scene release.
