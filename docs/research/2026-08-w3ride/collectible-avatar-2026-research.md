# Collectible avatar / bike customization — the 2026 best-practice build

**Date:** 2026-08-12 · **Method:** four parallel web-research agents (image-edit models; identity-preservation & try-on science; image→3D & 3D-native; production architecture & law), each citing sources. Vendor/benchmark figures are marked ⚠️ where not primary-sourced.

**Question:** the user proposed — instead of Blender 3D — generating a base rider image + a base bike image + a backlog of accessory images, then using a model to composite "put these glasses on this rider." Is that the right 2026 approach, and exactly how should it be built?

**Answer: yes — that instinct is the 2026 best call.** But three corrections turn it from fragile to solid, and one legal finding reshapes the rider half.

---

## The four findings, converged

All four agents independently landed on the same architecture. The consensus:

### 1. It's an *image-edit* model, single-pass, from a canonical base — never a chained "LLM combine"

- The primitive is **instructed multi-image composition**: `{canonical base + N accessory reference images + one text instruction} → one image`. Modern frontier image models take multiple reference images natively.
- **Never chain edits** (glasses → then helmet → then jersey). Multiple 2026 papers (FreqEdit, "Why Do DiT Editors Drift?", AnchorEdit) show iterative edits **accumulate identity drift** — high-frequency detail loss + error accumulation compounding per turn. Always recompose the *full equipped set against the canonical base in one pass* when the loadout changes. This sidesteps drift entirely.
- Evidence base: **GEditBench v2** (2026) scores edits with a judge that *spatially decouples edited vs untouched regions* — i.e. it measures the exact "change nothing else" property, and correlates ρ≈0.93 with human arena rankings.

### 2. The model ranking that matters (identity preservation, not just prompt-following)

| Model | Consistency (keeps base identical) | Cost/image | Latency | Licensing | Verdict |
|---|---|---|---|---|---|
| **Gemini 3 Pro Image "Nano Banana Pro"** | **#1** (GEditBench v2 Elo ~1108) ⚠️ | ~$0.067 std / ~$0.034 batch ⚠️ | 2–5 s | commercial OK; SynthID watermark on every image | **primary pick** |
| **Seedream 4.5** (ByteDance) | good (~1030), best raw quality | **$0.03–0.04** | 2–3 s | commercial via API | cheap/fast fallback |
| **FLUX.2 klein** (Apache-2.0) | open-source consistency leader (~1039–1070) | self-host / free | GPU-bound | Apache-2.0 | own-the-pipeline + house-style LoRA |
| **Flux Schnell** (via fal) | lower, fine for stylised | **~$0.001–0.003** | <1 s | commercial | cheapest hero-render / fallback |
| **GPT Image (1.5/2)** | **worst consistency (~846)** — re-renders whole image | ~$0.005–0.21 | slower | commercial; gpt-image-1 **deprecates 2026-10-23** | ❌ disqualified for "keep base identical" |

**The GPT-image finding is the load-bearing one for us:** OpenAI is what this codebase already has wired, and it is the *wrong* model for this job — best at following instructions, worst at leaving the rest of the image untouched. So the bike-studio seam I built (which defaults to OpenAI) must point at Gemini/Seedream/Flux, not gpt-image.

### 3. Technique: canonical reference, NOT per-user training

- The rider is a **house-authored canonical character, identical for everyone** — so "learn this user's face" (per-user DreamBooth/LoRA) is a **category error**. The problem is *consistency from one fixed reference*, which reference-conditioned in-context models (Kontext / UNO / Nano Banana) solve zero-shot.
- Optional: **one house-style LoRA** (10–50 images, trained once) on an open model to lock the glossy look — strongest style repeatability, only available on open weights (FLUX.2/Qwen). Not per-user.
- **Virtual try-on (VTON) does NOT solve accessories.** That research (IDM-VTON, CatVTON) is almost entirely torso-garment warping; glasses/helmets are out of scope (only niche work like Garments2Look touches accessories; eyewear ships as AR overlay in practice). So "it's basically try-on" was too optimistic — the real technique is **masked in-context composition**.

### 4. 2D-composite beats 3D-native for v1 — decisively

| | 2D composite (recommended v1) | 3D-native |
|---|---|---|
| Asset-authoring burden | **Low** (prompt + reference art) | **High** (rig, UV, material slots, part segmentation, LODs) |
| Swappability | easy visually; each combo a fresh gen | true slot system — *but you must build the slots* |
| "1:1 real bike" | stylised likeness | ~85–95% shape ⚠️, simplifies spokes/cassette/cabling |
| Maturity for a mobile app | **ship now** | wardrobe-SDK gap |

- **Ready Player Me — the go-to 3D wardrobe SDK — was acquired by Netflix and shut its public APIs on 2026-01-31.** Remaining 3D options are Unity-only (Genies) or ~$800/mo (Avaturn). 3D reintroduces exactly the authoring cost the user wants to avoid; image→3D generators output *one fused mesh*, not a slot system.
- Keep 3D as a **deliberate phase-2** only if the collectible must rotate/animate; if so, Meshy (GLB + free auto-rig) or Tripo + AI part-segmentation, mesh over Gaussian-splat.

---

## The legal finding that reshapes the rider (not the bike)

**Selfies are biometric data and radioactive.** Lensa/Prisma faced an Illinois **BIPA** class action for taking facial geometry from user selfies without written consent; GDPR treats face data as special-category. Requirement: **written consent + retention/deletion policy before capture.**

**Design consequence:** split the two halves of the feature by risk.
- **Bike photo → render: low risk, ship it.** No biometrics. (This is the Bike Studio I already built.)
- **Rider avatar: default to a stylised, non-photoreal, *house-authored* rider the user customizes with parts.** Make selfie-to-rider a strictly **opt-in** path gated behind explicit biometric consent, ephemeral, never used for training. Given the canonical-character finding above, we *want* a preset rider anyway — so the privacy-safe design and the technically-correct design are the same design.

---

## The recommended build (evidence-based)

**Pipeline** (per the production agent's reference architecture):
```
equip loadout → loadout_hash = sha256(base_id + sorted(parts) + style_ver + model_ver)
  → cache lookup (KV: hash → CDN url)
      hit  → return instantly, $0
      miss → enqueue async job → moderate inputs
           → single-pass compose {canonical base + equipped part refs + style prompt}
             on Gemini 3 Pro Image (fallback Seedream/Flux)
           → moderate output → keep C2PA/SynthID → write to object store/CDN
           → KV[hash] = url → push to client
```

**Seven load-bearing rules:**
1. **Single-pass composition from the canonical base** every time; never chain edits.
2. **Cache by loadout-hash (content, not user)** — two riders with the same look share one image. Cost is paid once per *distinct combo*: ~$0.03 each → **~$0.30–$1.00 lifetime per engaged user** ⚠️, trivial vs LTV.
3. **Model = Gemini 3 Pro Image** (consistency leader), Seedream 4.5 / Flux-Schnell as cheaper fallbacks. **Not gpt-image.**
4. **Canonical reference + fixed style block**, optional single house-style LoRA. No per-user training.
5. **Async job + webhooks + Batch API** (50% off) to pre-generate popular loadouts; idempotency key = (user + input hash + params).
6. **Deterministic sprite-composite fallback** — pre-rendered base + part layers — so the feature works *even with no model provisioned* (this is also our honest "image model unavailable" state today) and never blocks equip on a slow/failed generation.
7. **Move storage off base64-on-user-row** to object store + CDN, keeping only `loadout_hash → url`. Selfie path opt-in with BIPA/GDPR consent; moderate both input and output; preserve provenance watermarks.

**How this maps to what's already built:** the Bike Studio seam (`bike_render.py`, gated on `IMAGE_MODEL`) generalizes to `compose(base, parts[], instruction)`; flip the model target from OpenAI to Gemini, add the loadout-hash cache + object storage, and add the sprite-composite fallback (which the current honest placeholder already foreshadows).

---

## Unknowns / to confirm before spending
- All Elo/price/latency figures marked ⚠️ are vendor/aggregator, not always primary — confirm on live provider pricing pages before budgeting.
- Nano Banana Pro's **SynthID watermark** ships on every image — harmless for a game avatar, but note it's non-removable.
- gpt-image-1 **deprecates 2026-10-23** — don't build on it even as a fallback; target gpt-image-2 only if forced onto OpenAI (and it's still the worst on consistency).
- Newest arXiv IDs surfaced (2026 datestamps) are preprints the agents couldn't fully vet.

**Sources:** GEditBench v2 (arxiv 2603.28547 + leaderboard); InfiniteYou / UNO (ByteDance, ICCV 2025); FLUX.2 (bfl.ai); Seedream 4.5 & Nano Banana Pro (OpenRouter/fal/Google); VTON comparison (fashn.ai); Garments2Look (ACM-MM 2025); RPM shutdown (Variety/TechCrunch, Jan 2026); Lensa BIPA suit (PrivacyWorld); Gemini pricing (ai.google.dev); C2PA/SynthID (openai.com, Google). Full URLs in the agent transcripts.
