# UI · Visual & Motion Backlog — 2026 & Beyond

> Lens: world-class UI / motion design. Research + ideation only — **no code changes.**
> Scope: bike-only AI cycling coach, mobile-first (390×844), dark WHOOP-grade surface system.

## Design direction

The app already owns a genuinely premium foundation: a near-black surface hierarchy (`#0A0C0F` → `#2A313A`), a confident coral accent, a metric palette borrowed from Apple Rings / WHOOP, Sora tabular numerals, glass rims, film grain, and a genuinely showstopping Wrapped layer built on hand-written WebGL shaders (iridescent / topo / burst / globe / plasma / ascent). The gap between "very good" and "2026 WOW" is not more color or more cards — it is **motion continuity, material honesty, and a handful of signature moments that feel alive and physical.** The direction: make the readiness score the emotional hero of every session, let numbers *earn* their reveal, treat data-viz as choreography rather than static SVG, and push the shader/generative-art language (today quarantined in Wrapped) tastefully into one or two everyday surfaces. Bold where it counts (the hero, the celebrations, the ride map), quiet everywhere else — a coaching app must stay calm, legible, and fast.

---

## Theme 1 — The Hero / Readiness Moment

### 1. Living Readiness Ring · Today (hero)
The recovery/readiness ring is the single most-viewed pixel in the app; today it draws on with `ring-reveal` and a `tip-glow-pulse` head. Elevate it to a *living* object: a slow conic-gradient sheen that orbits the arc once every ~6s, a breathing 1–2px radial bloom keyed to the score band (green calm, amber restless, red tense), and a faint particle/ember at the arc tip that trails when the score is high. On first paint each morning the ring should sweep from 0 → value with an ease-out spring while the number counts up in lockstep. **Improvement:** turns a static gauge into the emotional anchor of the day — the reason to open the app. **Effort:** M. **Vibe:** WHOOP recovery ring meets Apple Watch "breathe," Oura readiness pulse.

### 2. Score Count-Up with Odometer Digits · Today / Recovery
Every hero metric (readiness, CTL, ramp, VO2) should count up on entrance using the existing `score-enter` spring, but with a per-digit odometer roll (digits slide vertically like a mechanical counter) and Sora tabular figures so nothing reflows. Pair with a single soft haptic tap on settle (iOS PWA `navigator.vibrate` fallback). **Improvement:** perceived precision + delight; makes data feel *arrived at*, not printed. **Effort:** S. **Vibe:** Robinhood/Copilot Money number reveals, Vercel dashboard count-ups.

### 3. Readiness Aura Background · Today
Let the day's readiness tint the whole Today background subtly — replace the fixed green/blue radial page glow with one whose hue and intensity map to today's score (verdant wash when ready, muted amber-grey when strained). Animate the crossfade over ~1.2s on load. Keep it below 6% opacity so text contrast never suffers. **Improvement:** the app *feels* different on a good day vs a bad day before you read a word — pre-attentive coaching. **Effort:** M. **Vibe:** iOS 18 wallpaper tinting, Gentler Streak's mood-lit surfaces.

### 4. Rest-Day Mode as a Distinct Material · Today (Rest Day)
The Rest-Day variant should feel unmistakably different, not just different copy — soften every corner radius one step, drop accent saturation, swap the hero ring for a calm horizon/breathing gradient, and slow all easings ~30%. A "recover, don't grind" material. **Improvement:** empathy-first framing (a MEMORY moat) rendered visually; reduces guilt-driven over-training. **Effort:** M. **Vibe:** Gentler Streak rest days, Headspace calm states.

---

## Theme 2 — Micro-interactions & Haptics

### 5. Tactile Press Physics on Every Card · Global
The global `:active { scale(0.98) }` is a good start but uniform. Give cards weight: press-down should be spring-damped (scale + 1px inset shadow deepen), release should overshoot slightly. Large hero cards depress less than small chips (mass metaphor). **Improvement:** the whole app feels physical and responsive to touch. **Effort:** S. **Vibe:** iOS home-screen icon press, Things 3 row taps.

### 6. Pull-to-Refresh as a Cadence Spinner · Today / History
Replace any default refresh with a branded gesture: as you pull, a bike crank/chainring rotates proportional to drag distance, ticks past a threshold, then spins into a sync. On release, the coral accent "charges" the ring. **Improvement:** a signature branded moment on the most repeated gesture. **Effort:** M. **Vibe:** Strava's pull states, Peloton's loading cadence.

### 7. Toggle & Segment Morphs · Global (tabs, filters, unit switches)
The V3 tab bar and History/Recovery segment switches should use a shared-element "pill" that physically slides between options with a spring, its width morphing to the label, plus a sub-frame color bleed. Selected-tab icon does a tiny scale-punch on landing. **Improvement:** navigation feels intentional and premium; kills the "instant swap" cheapness. **Effort:** S. **Vibe:** iOS segmented controls, Family/Arc tab morphs.

### 8. Haptic Vocabulary · Global
Define a small, consistent haptic language: light tick on selection, soft double-pulse on a PR/breakthrough, a rising ramp on Wrapped reveals, a warning buzz on "don't train" verdicts. Wire through one util so it's honest and centralized (respect a settings opt-out). **Improvement:** the coach speaks through touch — memorable, accessible, brand-defining. **Effort:** M. **Vibe:** Apple Fitness+ ring-close haptic, Duolingo streak buzz.

### 9. Long-Press Metric Peek · Today / Recovery / Load & Form
Long-press any metric to summon a floating glass "peek" card — a 14-day sparkline, the definition in plain language, and how it was computed — that scales up from the touch point and dismisses on release. **Improvement:** progressive disclosure without navigation; teaches the science (a moat) on demand. **Effort:** M. **Vibe:** iOS context menus, Things 3 quick-find peek.

---

## Theme 3 — Motion & Page Transitions

### 10. Shared-Element Continuity · Today → Workout Detail, History → Ride Recap
When a plan card or ride row is tapped, its thumbnail/title/ring should *fly* into position on the destination screen rather than a hard cut (the pen literally annotates "the card and the detail screen mirror the same workout, so nothing feels disconnected" — honor it in motion). Use FLIP with framer-motion `layoutId`. **Improvement:** spatial coherence; the app feels like one continuous surface, not a stack of pages. **Effort:** L. **Vibe:** iOS App Store card expansion, Family app hero transitions.

### 11. Directional Tab Transitions · Global bottom nav
Tabpanel entrances currently fade-up uniformly. Make them directional — moving right in the nav slides content in from the right, left from the left — so the bottom-nav geography is felt. Keep it short (250ms, `ease-spring`). **Improvement:** builds a mental map of the app; reduces disorientation. **Effort:** S. **Vibe:** iOS UINavigationController, Linear's directional routing.

### 12. Staggered Card Cascade on Tab Enter · Global
The `card-enter` keyframe exists; wire it as a real stagger (each card +40ms) on every tab mount so surfaces assemble top-to-bottom like a dealer laying cards. Cap total at ~350ms so it never feels slow. **Improvement:** every screen entrance gets a beat of choreography — premium, not busy. **Effort:** S. **Vibe:** Vercel/Linear dashboard mounts, iOS widget gallery.

### 13. Scroll-Driven Reveals & Parallax Headers · History / Season / Ride Recap
Long analytical pages should animate on scroll-into-view (charts draw as they enter the viewport using `ease-chart-draw`) and let the top hero (season header, ride map) parallax subtly against the scrolling content. **Improvement:** turns long-scroll data pages into a guided narrative. **Effort:** M. **Vibe:** Apple product pages, Strava year-in-sport scroll.

---

## Theme 4 — Data-Viz That Feels Alive

### 14. Charts That Draw Themselves · PMC, Power Profile, Load charts
Every line/area chart (PMC fitness-freshness, power-duration curve) should animate its path with a stroke-dashoffset draw and a gradient fill that wipes in behind it, using `--ease-chart-draw`. The latest data point gets a pulsing "you are here" dot. **Improvement:** data feels current and hard-won; the eye is led to the present moment. **Effort:** M. **Vibe:** Robinhood chart draw, Whoop strain curve.

### 15. Live Zone Bars with Overshoot & Shine · Train / Ride Recap
The zone/interval bar charts (already using zone colors) should grow from baseline with a spring overshoot, staggered left-to-right, and carry a faint vertical shine gradient that matches each zone's hue. Tapping a bar lifts it and reveals its exact watts/time. **Improvement:** makes the workout structure legible and satisfying to scan. **Effort:** S. **Vibe:** Apple Fitness+ effort bars, Zwift zone graphs.

### 16. Power-Duration Curve as a Signature Chart · Power Profile
Make the mean-max power curve the app's iconic chart: a luminous coral-to-violet gradient stroke over a faint cohort-benchmark band, with your PRs marked as glowing nodes that twinkle in on load, and a draggable scrubber that reads out duration → watts → W/kg with the number odometer-rolling. **Improvement:** a hero data object worth screenshotting; anchors the "aspiring racer" persona. **Effort:** L. **Vibe:** WKO5/Intervals.icu power curve, but consumer-beautiful.

### 17. HoverBars → TouchBars · Global charts (mobile)
The existing HoverBars pattern is desktop-hover; on mobile, give every bar/point chart a draggable finger-scrubber with a floating value tooltip that tracks the touch and a haptic tick as it crosses each data point. **Improvement:** analytical depth without a desktop dependency (mobile-only is the priority). **Effort:** M. **Vibe:** Apple Health scrubbing, Copilot Money charts.

### 18. Sparkline Micro-trends Everywhere · Metric rows
Every numeric metric row (HRV, RHR, CTL, sleep) should carry a tiny inline sparkline that draws on mount and tints by trend (forest up-good / amber flat / alert down-bad, respecting metric polarity). **Improvement:** trend-at-a-glance density that reads as "serious tool." **Effort:** S. **Vibe:** WHOOP metric rows, Bloomberg terminal restraint.

---

## Theme 5 — Depth, Material & Generative Art

### 19. Glass Materiality Pass · Global (sheets, nav, sticky bars)
Audit every "glass" surface (tab bar already uses `#1A1F26E6` + blur, sheets, sticky readiness bar) to a consistent recipe: backdrop blur + a 1px top-rim highlight (`--shadow-glass-rim`) + a hair of inner noise so it reads as frosted glass over content, not flat translucent panels. Content should visibly refract/darken as it scrolls under. **Improvement:** coherent depth system; the app gains a tactile sense of layers. **Effort:** M. **Vibe:** visionOS materials, iOS 18 sheets.

### 20. Generative Ride Thumbnails · History / Ride Recap
Push the existing generative-SVG thumbnails further: render each ride as a unique route-trace glyph over a shader-lite gradient keyed to the ride's character (climb = warm/vertical, endurance = cool/flowing, intervals = pulsed). No two rides look alike. **Improvement:** a history feed that feels like a gallery of your rides, not a spreadsheet. **Effort:** M. **Vibe:** Strava's route heat art, Spotify canvas.

### 21. Tasteful Shader on the Coach Surface · AI Coach
The Wrapped shaders are quarantined; bring one home. Give the AI Coach header a slow, low-opacity `iri` shader wash (the same `ai-gradient` energy but living) that gently intensifies while the coach is "thinking"/streaming, then calms. Strictly behind text, reduced-motion aware. **Improvement:** the AI surface feels genuinely intelligent and alive — differentiates from static chat UIs. **Effort:** M. **Vibe:** Arc Max shimmer, ChatGPT/Claude thinking states.

### 22. Film-Grain & Gradient-Mesh Consistency · Global
The `.paper-grain` and mesh-gradient tokens exist but are unevenly applied. Establish a rule: hero/celebration surfaces get grain + mesh; utility cards stay clean. Add one subtle animated mesh-gradient (very slow drift) to the Today hero card background so even the "calm" surface has life. **Improvement:** removes flatness/banding on OLED dark; adds analog warmth. **Effort:** S. **Vibe:** Stripe gradient mesh, film-grain revival trend.

---

## Theme 6 — Ride Map & Route Artistry

### 23. Ride Map as Hero Art · Ride Recap / Ride Analysis
Treat the route map as a designed object, not a Google tile: dark custom map style, the track drawn as a glowing gradient line colored by effort/power (blue easy → coral hard), animated to trace the ride start-to-finish on open, with elevation shading beneath. Elevation profile below mirrors the same gradient. **Improvement:** the recap's centerpiece becomes screenshot-worthy — organic sharing. **Effort:** L. **Vibe:** Strava 3D flyover, Wandrer/FATMAP route art.

### 24. Climb Companion Live HUD Polish · Climb Companion / Live Ride
The gradient-profile HUD should feel like a race dashboard: the upcoming gradient rendered as a lit 3D-ish ramp you're "climbing into," current-position marker with a comet trail, and color that shifts with gradient severity. Numbers big, Sora, glanceable at speed. **Improvement:** a differentiated on-bike moment for the roadbike-first moat. **Effort:** L. **Vibe:** Wahoo/Karoo climb pages, but cinematic.

---

## Theme 7 — Shareable / Wrapped Visuals

### 25. Wrapped Motion & Auto-Advance Story Engine · Weekly Wrapped / Year
The shader cards are stunning but should *play*. Add Instagram-Stories mechanics: segmented progress bars, tap-to-advance / hold-to-pause, auto-advance timing, and per-card entrance chore (numbers count up, routes trace, the Everest stack builds bottom-up, the globe rotates to your route). Each card ends on a held "beauty frame" ready to screenshot/share. **Improvement:** transforms a gallery into a viral, emotionally-paced experience. **Effort:** L. **Vibe:** Spotify Wrapped, Strava Year in Sport.

### 26. One-Tap Branded Share Cards · Wrapped / PR Celebration / Ride Recap
Every celebration and Wrapped card gets a "Share" that renders a clean, watermarked 9:16 image (or short video of the shader) with the athlete's stat, a tasteful app mark, and safe margins for social crops. Confetti/burst baked into the still. **Improvement:** free acquisition loop; every PR becomes marketing. **Effort:** M. **Vibe:** Strava share cards, Duolingo streak shares.

### 27. Breakthrough Celebration Choreography · PR / New Record overlay
The confetti overlay exists; make it earn the moment — a beat of anticipation (screen dims, ring winds up), then a burst-shader bloom + physics confetti + rising haptic + the number slamming in with the odometer. Auto-generate a share card at the peak. **Improvement:** the dopamine payoff that keeps athletes chasing PRs. **Effort:** M. **Vibe:** Apple Watch ring-close, Duolingo level-up.

---

## Theme 8 — Empty, Loading & Onboarding Delight

### 28. Skeletons That Become the Content · Global loading
Replace generic shimmer blocks with shape-matched skeletons that morph into the real content when data lands (a ghost ring that fills to the real readiness ring, ghost bars that grow to real values). The shimmer sweep should match the coral accent hue faintly. **Improvement:** perceived speed + continuity; loading becomes part of the reveal. **Effort:** M. **Vibe:** Facebook/Linear skeletons done cinematically.

### 29. Empty States With Personality · History / Achievements / Season
First-run and empty surfaces should show a bespoke generative illustration (a lone route glyph waiting to be drawn, an empty jersey/podium) with warm coach copy and a single clear CTA — never a cold "No data." Animate the illustration subtly on mount. **Improvement:** onboarding warmth; converts empty screens into motivation. **Effort:** M. **Vibe:** Headspace empty states, Things 3 illustrations.

### 30. Onboarding as a Cinematic Reveal · Onboarding 1–3 (Connect / Numbers / Goal)
The three-step onboarding should build the athlete's identity visually — as they enter FTP/goal, a live preview of *their* readiness ring / power curve / season timeline assembles in real time, culminating in a "here's your season" hero. Progress dots animate; each step transitions with shared elements. **Improvement:** first-session wow + investment; dramatically improves activation. **Effort:** L. **Vibe:** Oura/Whoop onboarding, Cash Card setup.

---

## Theme 9 — Typography, Rhythm & Theming

### 31. Numeric Typography System · Global
Codify a numeral hierarchy: Sora tabular for hero figures (with `-0.03em` tracking already in `.num-display`), JetBrains Mono for dense/technical readouts (watts, HR, pace), and units always set smaller, lighter, and baseline-aligned to the figure. Add a subtle weight-transition when a live number changes. **Improvement:** the "instrument-grade" precision that signals a serious tool. **Effort:** S. **Vibe:** WHOOP/Garmin numerals, Braun instrument dials.

### 32. Vertical Rhythm & Section Cadence · Global
Establish a strict spacing scale and section-eyebrow rhythm (the `.eyebrow` style exists — apply it consistently) so every screen breathes on the same grid. Group related cards under quiet section headers with generous top-space. **Improvement:** calm, editorial legibility; the antidote to card-clutter as the app grows. **Effort:** M. **Vibe:** Apple Health information architecture, Linear spacing.

### 33. Time-of-Day & Seasonal Theming · Global
Shift the page ambient gradient and accent warmth by time of day (cool dawn, warm dusk) and optionally by season/target-event proximity (a subtle "race week" intensification). Fully within the dark system — never a light flip. Respect a manual override. **Improvement:** the app feels aware of *when* you're training; quiet magic. **Effort:** M. **Vibe:** iOS dynamic wallpaper, Bevel's time-aware surfaces.

### 34. Iconography & Motion-Icon Set · Global
Audit toward one consistent icon family (the pen mixes Material Symbols weights) and give key state-change icons micro-animation: the sync icon spins on refresh, the heart/recovery icon beats at the athlete's RHR, the bolt pulses on a power PR. **Improvement:** cohesion + tiny moments of life on functional controls. **Effort:** M. **Vibe:** Lottie micro-icons, Apple SF Symbols animations.

---

## Theme 10 — Accessibility of Motion & Contrast

### 35. Reduced-Motion Parity Pass · Global
`prefers-reduced-motion` is handled in CSS and the shader freezes gracefully — extend the same discipline to every new item here: count-ups snap to final, parallax disables, celebrations become a tasteful static burst frame, shared-element flights become clean crossfades. Ship a designed "still" version of each signature moment, not just "motion off." **Improvement:** the WOW stays inclusive; no vestibular harm. **Effort:** M. **Vibe:** Apple's reduce-motion craftsmanship.

### 36. Contrast & Focus Guardrails on Living Surfaces · Global
Any animated/shader/aura background under text must guarantee AA contrast at all animation phases (the muted token was already bumped for AA — protect it). Add a max-luminance clamp and a scrim behind text over shaders; keep the visible focus ring (already present) intact across new interactive elements. **Improvement:** beauty that never costs legibility — the mark of world-class, not just flashy. **Effort:** S. **Vibe:** WCAG-forward design systems, Stripe's accessible gradients.

---

## Suggested sequencing

- **Quick signature wins (S, do first):** #2 count-ups, #5 press physics, #7 toggle morphs, #12 card cascade, #15 zone bars, #18 sparklines, #31 numerals.
- **Signature moments (M):** #1 living ring, #3 readiness aura, #8 haptics, #14 chart draw, #19 glass pass, #25/#26/#27 Wrapped & celebrations.
- **Big bets (L):** #10 shared-element transitions, #16 power curve, #23 ride-map art, #24 climb HUD, #30 cinematic onboarding.
- **Always-on guardrails:** #35 reduced-motion parity and #36 contrast must ship *with* each item, not after.
