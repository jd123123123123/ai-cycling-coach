# Living hero + exchangeable components — generative figure system (2026)

**Date:** 2026-08-12 · **Branch:** `cassette-reward-layer` · **Status:** design, pending review
**Grounded in:** `docs/research/2026-08-w3ride/collectible-avatar-2026-research.md` (four-axis 2026 web research)
**Supersedes** the *rendering* half of `2026-08-11-garage-composable-figures-design.md` (slot-layered 3D → generative compose). The **RideCoin economy** in that spec is unchanged and still governs earning/spending.

---

## 1. The vision

A **living hero** on the Today screen: the rider's own **bike** + their own **rider avatar**, composed into a **scene whose mood matches the day's training state** (rest day = calm studio; threshold day = intense effort). Riders customize both figures from an **exchangeable component library** — glasses, helmet, jersey; tires, wheels, frame paint — and the hero updates to reflect what they've equipped.

Two source photos, each converted once into the W3 collectible style:
- **Bike photo → bike render** (low risk, ship freely).
- **Selfie → rider avatar** (biometric; opt-in + consent — see §6).

---

## 2. The one hard truth to set expectations on

Generative rendering produces a **recognizable stylised likeness, not a spec-exact 1:1 copy.** The bike keeps its colours/type/build; fine parts (spokes, cassette, cabling) simplify. The rider keeps their rough look, stylised. This is correct and desirable for a glossy collectible; it is *not* a literal replica, and no 2026 method delivers one. All product copy must say "your bike, W3-style" — never "exact 3D model."

---

## 3. Architecture — the seven rules (from the research)

1. **Canonical base is frozen.** One approved bike render + one approved rider avatar per user, generated once, cached forever. These are the single source of truth.
2. **Single-pass composition from the canonical base — never iterative.** Any customized image = `compose(canonical base + ALL equipped part refs + instruction)` in one call. Never edit an edited image (drift compounds; proven in 2026 literature).
3. **Cache by content hash, not per user.** `key = sha256(base_id + sorted(equipped_parts) + scene_mood + style_ver + model_ver)`. Two riders with the same look share one image. Cost is paid **once per distinct combo** (~$0.03), ≈ **$0.30–$1.00 lifetime per engaged user**.
4. **Model = Gemini 3 Pro Image ("Nano Banana Pro")** — the 2026 consistency leader (keeps the base identical while editing). Fallbacks: Seedream 4.5 / Flux-Schnell (fal). **Explicitly NOT gpt-image** — it re-renders the whole frame (worst consistency), disqualifying for "keep the base identical." (This reverses the provider the current seam defaults to.)
5. **No per-user training.** The rider is one canonical character; consistency comes from reference-conditioning, not a per-user LoRA. Optional: one *house-style* LoRA (open model) to lock the glossy look.
6. **Deterministic fallback always exists.** A pre-composited sprite (base image + flat part layers) renders instantly with no model — the guaranteed baseline and the honest "image model unavailable" state. The AI hero is an *enhancement*, never a hard dependency; it never blocks equipping.
7. **Async + cache.** Generation runs off a job queue with webhook-on-complete; the UI shows the cached/placeholder immediately and swaps in the hero when ready. Pre-generate popular loadouts via Batch API (50% off).

---

## 4. Data model

```ts
// A canonical figure, generated once from the user's photo.
Figure = { id, kind: 'bike'|'rider', baseImageUrl, analysis, styleVer, createdAt }

// A cosmetic part the user can equip. `refImageUrl` is the library art the
// compositor conditions on. Parts are house-authored images, not 3D.
Part = { id, figure: 'bike'|'rider', slot, label, refImageUrl, priceRideCoin, unlock }
  slot(rider) = glasses | helmet | jersey | gloves
  slot(bike)  = tires | wheels | frame_paint | saddle | bar_tape

Loadout = { [slot]: partId }                     // one per figure per user
Equipped = { rider: Loadout, bike: Loadout }

// A cached generated image, keyed by content.
Render = { loadoutHash, url, kind: 'figure'|'hero', mood?, createdAt }
```

**Scene moods** — a small finite set keyed to the app's existing `useDayState` + intensity, so heroes are ~6 buckets (generate-once-cache), not a daily spend:

| Day state | Scene mood |
|---|---|
| rest / non-training | calm studio backdrop (the reference render) |
| endurance | open road, warm light |
| threshold | dramatic, high-contrast effort |
| vo2 / peak | explosive, motion blur |
| recovery | soft, muted |
| evening | dusk tones |

---

## 5. The compose primitive & pipeline

```
compose(base_image, ref_images[], instruction, style_refs[]) -> image | null(status)
```
- **Rider composite:** `compose(canonical_rider, [equipped part refs], "put these on the rider, change nothing else", [house_style])`
- **Bike composite:** same with the bike.
- **Hero:** `compose(rider_composite + bike_composite, [], "<mood> scene, rider on bike", [house_style])` — or a single multi-ref pass from the two canonicals + parts + mood.

Request flow (production):
```
equip change → loadoutHash → cache lookup
   hit  → serve CDN url (instant, $0)
   miss → enqueue job → moderate inputs → compose on Gemini
        → moderate output → keep C2PA/SynthID → object store + CDN
        → cache[hash]=url → push to client
```
Storage: **object store + CDN, pointer only** on the user row (`hash → url`). Migrate off base64-on-user-record (it defeats CDN caching).

---

## 6. Consent, safety, rights (must-do)

- **Bike photo:** no biometrics — moderate input, otherwise ship.
- **Selfie → rider:** biometric data (Lensa/Prisma hit with a BIPA class action for this). Requires **explicit written consent + retention/deletion policy before capture**; GDPR special-category. Design: **opt-in, ephemeral, never used for training**, stylised (non-photoreal) output. Offer a **"pick a preset rider"** alternative so the feature works without any face upload.
- **Moderate both input and output** (photo in, generated image out).
- **Preserve provenance** (C2PA / SynthID watermarks; Nano Banana Pro's is non-removable — fine for a game avatar, note it).
- **Rights:** provider assigns output usage to us but prohibits real-person likenesses of third parties; the rider is the user's own consented likeness only.

---

## 7. How it maps to what's already built

- **Today hero seam:** the W3 Today screen already renders a bike-hero placeholder keyed to `model.state`; this replaces it with the cached scene-hero for today's state. No new hook.
- **Bike Studio** (`bike_render.py` + `POST /garage/bike/render`): generalizes into the `compose()` primitive; the honest "image model unavailable" placeholder becomes the deterministic sprite fallback (rule 6).
- **RideCoin economy** (prior spec): unchanged — parts are bought/equipped with RideCoin; equipping triggers a (cached) recompose.
- **Provider repoint:** the seam moves from OpenAI → configurable provider (Gemini primary), gated on a key.

---

## 8. Phasing

1. **Provider repoint + compose primitive** — configurable image provider (Gemini/fal), `compose()`, honest gated fallback. *(This spec's companion code change.)*
2. **Bike render live** — the lowest-risk half; verify a real bike render once a key lands.
3. **Component library + loadout + cache** — parts catalog, equip, cache-by-hash, RideCoin spend.
4. **Rider avatar** — consent-gated selfie path + preset-rider alternative.
5. **Living hero** — the ~6 mood buckets, generate-once-cache, wired into Today by day-state.

## 9. Out of scope
Literal spec-exact 1:1 replicas; 3D meshes / rotate-animate (phase-2 only, per research — RPM's shutdown removed the easy 3D wardrobe path); per-user LoRA; iterative/chained editing.

## 10. Open decisions for the owner
- **Selfie vs preset rider** as the default (privacy posture).
- **Provider**: Gemini (best consistency, watermark, ~$0.067) vs fal/Flux (cheapest) vs self-host FLUX.2 (own the pipeline + style LoRA).
- Acceptance that **"1:1" means stylised likeness**, in product copy.
