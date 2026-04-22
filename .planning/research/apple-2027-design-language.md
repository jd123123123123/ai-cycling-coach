# Apple-like in 2027: Design Language Research for a Web App

Target: a React + Tailwind cycling coach PWA that feels like something Apple would ship in 2027. Web-first. Native iOS notes where relevant. This document is tokens and numbers over adjectives.

---

## Executive Summary: What "Apple-like 2027" concretely means

1. **Material is the chrome.** The app surface is layered translucent glass (Liquid Glass, iOS 26). Nav bars, cards, modals, floating controls render as frosted translucency over a content canvas. Backdrop blur 20–40px; saturation boost 140–180%; background tint at 60–75% opacity. No solid opaque chrome anywhere except deliberate "content" surfaces.
2. **Spring physics, not duration curves.** Motion is driven by response/damping pairs that feel continuous across gesture handoffs. Default feel: response 0.55, damping 0.825. Interactive feel (chat send, tap feedback): response 0.15, damping 0.86. Any animation longer than 500ms that doesn't represent a real system transition feels broken.
3. **Semantic type + density.** Five-step type scale anchored on 17px body. SF Pro Text ≤19pt, SF Pro Display >19pt (web: `-apple-system` stack with Inter Variable fallback). Line-heights tight (1.1–1.3) for display, generous (1.45–1.55) for body. Weights hover around 400 body, 590 emphasis, 700 display.
4. **Glanceability hierarchy from watchOS.** Every view has one "complication": a single data point that earns hero real estate. Readiness score. Today's focus. Streak. One number, one verb, one color. The rest cascades as secondary/tertiary label hierarchy at 60%/30%/20% opacity of the primary label color.
5. **Ambient AI surfaces.** Apple Intelligence styling (iridescent gradients: purple `#BC82F3` → pink `#F5B9EA` → blue `#8D9FFF` → warm `#FFBA71`, animated 3–6s loop) marks AI-generated or AI-acting surfaces. The coach chat, AI insights, and Siri-style prompts all use this treatment. By 2027, this is the most recognizable "shipped by a modern Apple team" tell.

---

## 1. Design Tokens

### 1.1 Color System (semantic, light/dark)

Adopt Apple's semantic naming. Map to CSS variables; Tailwind theme extension consumes them.

**Backgrounds (layer stack, back → front):**

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg-canvas` (systemBackground) | `#FFFFFF` | `#000000` | App root |
| `--bg-elevated` (secondarySystemBackground) | `#F2F2F7` | `#1C1C1E` | Cards, panels |
| `--bg-elevated-2` (tertiarySystemBackground) | `#FFFFFF` | `#2C2C2E` | Modals, nested cards |
| `--bg-grouped` (systemGroupedBackground) | `#F2F2F7` | `#000000` | Settings/list views |

**Labels (foreground hierarchy, opacity-based):**

| Token | Light | Dark |
|---|---|---|
| `--label-1` | `#000000` (100%) | `#FFFFFF` (100%) |
| `--label-2` (secondary) | `#3C3C43` @ 60% → `#3C3C4399` | `#EBEBF5` @ 60% → `#EBEBF599` |
| `--label-3` (tertiary) | `#3C3C43` @ 30% → `#3C3C434D` | `#EBEBF5` @ 30% → `#EBEBF54D` |
| `--label-4` (quaternary) | `#3C3C43` @ 18% → `#3C3C432E` | `#EBEBF5` @ 18% → `#EBEBF52E` |

**Separators & fills:**

| Token | Light | Dark |
|---|---|---|
| `--separator` | `#3C3C434A` | `#54545899` |
| `--separator-opaque` | `#C6C6C8` | `#38383A` |
| `--fill-1` | `#78788033` | `#7878805C` |
| `--fill-2` | `#78788029` | `#78788052` |

**Accent colors (iOS system palette, dark mode values are brighter):**

| Token | Light | Dark |
|---|---|---|
| `--accent-blue` | `#007AFF` | `#0A84FF` |
| `--accent-green` | `#34C759` | `#30D158` |
| `--accent-red` | `#FF3B30` | `#FF453A` |
| `--accent-orange` | `#FF9500` | `#FF9F0A` |
| `--accent-yellow` | `#FFCC00` | `#FFD60A` |
| `--accent-teal` | `#5AC8FA` | `#64D2FF` |
| `--accent-indigo` | `#5856D6` | `#5E5CE6` |
| `--accent-purple` | `#AF52DE` | `#BF5AF2` |
| `--accent-pink` | `#FF2D55` | `#FF375F` |

**Cycling-coach domain mapping:**
- Readiness (high/primed): `--accent-green` `#30D158`
- Readiness (moderate): `--accent-yellow` `#FFD60A`
- Readiness (low/recovery): `--accent-orange` `#FF9F0A`
- Readiness (overreaching): `--accent-red` `#FF453A`
- AI surface (coach, insight): gradient `#BC82F3 → #F5B9EA → #8D9FFF → #FFBA71`
- Power/cycling brand accent: `--accent-blue` `#0A84FF`

**Apple Intelligence gradient stops (for AI surfaces):**
```
purple:  #BC82F3
pink:    #F5B9EA
blue:    #8D9FFF
warm:    #FFBA71
magenta: #C686FF  (alt)
coral:   #FF6778  (alt)
```
Animate stop positions on a 3–6s loop with `ease-in-out`. Conic or linear gradient, 135° angle, plus a thin inner stroke (`rgba(255,255,255,0.35)`) to mimic the Apple Intelligence border glow.

### 1.2 Typography

**Font stack (web):**
```
font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text",
             "SF Pro Display", "Inter Variable", system-ui,
             "Segoe UI", Roboto, sans-serif;
font-family-rounded: ui-rounded, "SF Pro Rounded", "Nunito",
                     system-ui, sans-serif;
font-family-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
```

Non-Apple devices won't get SF Pro. Inter Variable is the closest metric-compatible fallback. Use `font-feature-settings: "ss01", "cv11";` with Inter to approximate SF's geometric forms.

**Scale (Apple Dynamic Type defaults, mapped to px):**

| Style | Size | Line-height | Weight | Tracking |
|---|---|---|---|---|
| Large Title | 34px | 41px (1.21) | 700 | -0.4px |
| Title 1 | 28px | 34px (1.21) | 700 | -0.26px |
| Title 2 | 22px | 28px (1.27) | 700 | -0.26px |
| Title 3 | 20px | 25px (1.25) | 600 | -0.45px |
| Headline | 17px | 22px (1.29) | 600 | -0.43px |
| Body | 17px | 22px (1.29) | 400 | -0.43px |
| Callout | 16px | 21px (1.31) | 400 | -0.32px |
| Subheadline | 15px | 20px (1.33) | 400 | -0.24px |
| Footnote | 13px | 18px (1.38) | 400 | -0.08px |
| Caption 1 | 12px | 16px (1.33) | 400 | 0 |
| Caption 2 | 11px | 13px (1.18) | 400 | +0.07px |

**For hero numbers (readiness score, FTP, TSS):** use SF Pro Rounded (or `ui-rounded`) at 48–96px, weight 700, tracking -0.02em, line-height 1.0. This is the Fitness app / Activity ring center number look.

**Switch rule:** ≤19px → Text optical variant; >19px → Display optical variant. With Inter Variable, toggle `font-optical-sizing: auto`.

### 1.3 Spacing

iOS uses an 8pt base grid with 4pt half-steps. Apple's own apps hover around: 16px card padding, 20px horizontal safe area, 8px tight gaps, 24px section gaps.

| Token | Value | Use |
|---|---|---|
| `space-0.5` | 2px | Hairline offsets |
| `space-1` | 4px | Icon ↔ label |
| `space-2` | 8px | Tight stack |
| `space-3` | 12px | Related items |
| `space-4` | 16px | Card padding, default gap |
| `space-5` | 20px | Screen horizontal padding |
| `space-6` | 24px | Section spacing |
| `space-8` | 32px | Major blocks |
| `space-10` | 40px | Hero padding |
| `space-12` | 48px | Page-level |

### 1.4 Radii

Apple uses concentric corners: outer radius = inner radius + padding. iOS 26 leans into fully-pilled controls and larger card radii.

| Token | Value | Use |
|---|---|---|
| `radius-xs` | 6px | Pills, chips (text-height-based) |
| `radius-sm` | 10px | Buttons, inline controls |
| `radius-md` | 14px | Inputs, list rows |
| `radius-lg` | 20px | Cards |
| `radius-xl` | 28px | Sheets, modals |
| `radius-2xl` | 36px | Full-bleed panels |
| `radius-pill` | 9999px | Segmented controls, status pills |

Control height → radius rule: `height / 2` for pills, `height * 0.4` for soft-squircle buttons. iOS button at 44pt tall → 16–20px radius.

### 1.5 Shadows & Elevation

Apple shadows are soft, low-offset, high-blur. Never neutral gray — always a tinted shadow to pick up ambient color.

```
--shadow-1: 0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.06);
--shadow-2: 0 4px 12px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.04);
--shadow-3: 0 12px 32px rgba(0,0,0,0.12), 0 4px 8px rgba(0,0,0,0.06);
--shadow-4: 0 24px 64px rgba(0,0,0,0.18), 0 8px 16px rgba(0,0,0,0.08);
--shadow-glass-rim: inset 0 1px 0 rgba(255,255,255,0.30),
                    inset 0 -1px 0 rgba(0,0,0,0.04);
```

Dark mode: reduce blur by ~25%, add a `inset 0 1px 0 rgba(255,255,255,0.06)` rim light on glass.

### 1.6 Glass / Material System

Apple's SwiftUI materials map to approximate CSS as follows (measured from rendering, not documented API):

| Material | backdrop-filter | background |
|---|---|---|
| ultraThin | `blur(10px) saturate(160%)` | `rgba(255,255,255,0.55)` light / `rgba(0,0,0,0.40)` dark |
| thin | `blur(20px) saturate(170%)` | `rgba(255,255,255,0.65)` light / `rgba(0,0,0,0.55)` dark |
| regular | `blur(30px) saturate(180%)` | `rgba(255,255,255,0.72)` light / `rgba(0,0,0,0.65)` dark |
| thick | `blur(40px) saturate(190%)` | `rgba(255,255,255,0.80)` light / `rgba(0,0,0,0.75)` dark |
| ultraThick | `blur(50px) saturate(200%)` | `rgba(255,255,255,0.88)` light / `rgba(0,0,0,0.85)` dark |

**Liquid Glass (iOS 26) additions over plain material:**
- `depth` 0–20 → we can fake with layered inner shadows; keep ≤20 or legibility dies
- `frost` 10–25 → controls the "milky" overlay; >30 reads as cheap plastic
- Specular highlight: a thin diagonal gradient overlay `linear-gradient(135deg, rgba(255,255,255,0.25) 0%, transparent 40%, transparent 60%, rgba(255,255,255,0.10) 100%)` animated subtly on interaction
- Inner text lift: `filter: drop-shadow(0 0 6px rgba(255,255,255,0.30))` on text sitting on glass, or an inner shadow on the text layer

Glass surfaces should always sit over a **content canvas with color** — glass over pure white or pure black is visually dead. For our app, put a gradient mesh or low-frequency noise behind glass panels (e.g., a subtle `radial-gradient(circle at 20% 10%, #0A84FF15, transparent 50%), radial-gradient(circle at 80% 80%, #30D15810, transparent 50%)`).

---

## 2. Motion System

### 2.1 Spring tokens (preferred — use `react-spring`, Framer Motion, or `animejs` with spring config)

| Token | Response | Damping | Feel |
|---|---|---|---|
| `spring-smooth` | 0.55 | 0.825 | SwiftUI default `.spring()`. Card expand, nav push. |
| `spring-snappy` | 0.35 | 0.90 | Button press release, tab switch. |
| `spring-interactive` | 0.15 | 0.86 | SwiftUI `interactiveSpring`. Chat send, drag handoff. |
| `spring-gentle` | 0.80 | 0.95 | Hero number count-up, ambient reveals. |
| `spring-bouncy` | 0.45 | 0.65 | Celebratory (streak increment, ring close). Use sparingly. |

Framer Motion mapping: `{ type: "spring", stiffness: k, damping: c }` where `k = (2π/response)²` and `c = 2 × damping × √k`. For spring-smooth: stiffness ≈ 130, damping ≈ 19. For spring-interactive: stiffness ≈ 1754, damping ≈ 71.

### 2.2 Easing curves (when a spring is wrong — e.g., deterministic timelines, chart draws)

| Token | cubic-bezier | Duration | Use |
|---|---|---|---|
| `ease-standard` | `cubic-bezier(0.4, 0.0, 0.2, 1)` | 200–300ms | Most UI transitions |
| `ease-decelerate` | `cubic-bezier(0.0, 0.0, 0.2, 1)` | 250–350ms | Content entering screen |
| `ease-accelerate` | `cubic-bezier(0.4, 0.0, 1, 1)` | 200–250ms | Content leaving screen |
| `ease-apple-default` | `cubic-bezier(0.25, 0.1, 0.25, 1)` | 250–400ms | Generic "Apple feel" |
| `ease-apple-spring-ish` | `cubic-bezier(0.175, 0.885, 0.32, 1.275)` | 400–600ms | Overshoot (use sparingly) |
| `ease-chart-draw` | `cubic-bezier(0.65, 0, 0.35, 1)` | 600–900ms | One-time chart reveal |

### 2.3 Duration ladder

- **Micro (80–150ms):** hover, tap feedback, focus rings
- **Short (200–300ms):** tab switches, toggle, accordion, tooltip
- **Medium (350–500ms):** card expand, modal open, route transition
- **Long (600–900ms):** chart draw-on, celebratory flourish, first-load hero reveal
- **>1000ms:** ONLY if it represents data (count-up, ring fill, progress)

Rule: anything over 500ms that isn't data-driven feels broken. Apple HIG is explicit about this.

### 2.4 Staggers

List/grid enter: 30–50ms stagger per item, capped at 10 items (after that, fade whole group). Chart series: 80–120ms stagger.

### 2.5 "Haptic" visual micro-feedback (web substitute for iOS haptics)

Web can't vibrate (reliably — Vibration API is Android-biased). Substitute with visual micro-pulses:

- **Light tap (would be `.impactLight`):** 1.02 scale pulse over 120ms, spring-snappy. Plus a 2px outline flash at 40% accent opacity, fading in 80ms, out 150ms.
- **Medium tap:** 1.04 scale + ring color pulse (luminance up 8%) + optional micro-shadow lift (shadow-1 → shadow-2) for 180ms.
- **Success (ring close, workout complete):** 1.08 scale spring-bouncy + accent glow (`box-shadow: 0 0 0 0 accent → 0 0 24px 8px accent00`) over 500ms.
- **Error:** horizontal shake, 6px amplitude, 3 oscillations, 280ms total, cubic-bezier(0.36, 0.07, 0.19, 0.97).

---

## 3. Component Patterns (mapped to our existing components)

### 3.1 `ReadinessHero`
**Apple would render it as:** a full-bleed glass panel (`--bg-elevated` base, then a `thin` material overlay) with one hero number (e.g., 78) in SF Rounded, 72–96px, weight 700, accent color keyed to score. A single-word verb under it ("Primed", "Hold back", "Recover"). Below: three micro-complications in a row (HRV, sleep, strain) each 12–13px caption + 17px value. Background: a subtle radial gradient keyed to the accent color at 10% opacity.

- Number count-up on mount: 1.2s, `ease-chart-draw`, from 0 to target
- Verb: fades in 200ms after number hits 80% of target
- Background gradient: shifts hue with score over 400ms when data refreshes
- Tap: spring-snappy 1.02 pulse + haptic-visual ring flash

### 3.2 Activity cards (`RecentActivities`, `PrescribedWorkoutCard`)
**Apple treatment:** list rows on `--bg-elevated`, 14–16px radius, 16px padding, separator hairline between rows (`--separator`, 0.5px on retina). Left: a 32px circular icon (SF Symbol equivalent — use Lucide `bike`, `activity`, `zap`). Middle: 17px headline + 13px footnote (label-2). Right: the metric in SF Rounded, 20–22px, weight 600, accent-colored.

No borders, no card shadows, just separator hairlines inside a glass panel. "Cards that aren't cards" — the Apple Health list look.

### 3.3 Charts (power curves, polarized distribution)
**Apple rules:**
- No gridlines. Use label-3 for axis tick labels only.
- Gradient fills under area charts: `linear-gradient(180deg, accent 0%, accent00 85%)` with the stroke at full accent.
- Rounded line caps and joins.
- Data-point circles ONLY on hover/selection, 8px diameter, white fill + 2px accent stroke + shadow-2.
- Axis labels: 11–12px, label-3.
- Animate draw-on first render only: 900ms, `ease-chart-draw`, stroke-dashoffset technique.
- For polarized distribution (zones): stacked bars with 4px radius tops, 2px gap between stacks. Each zone in its accent.

### 3.4 Chat (coach conversation)
**Apple treatment (Messages app + Apple Intelligence prompt):**
- User bubbles: right-aligned, `--accent-blue` bg, white text, radius 20px with a 6px "tail" bottom-right corner (asymmetric radius).
- Coach bubbles: left-aligned, `--bg-elevated-2`, label-1 text, radius 20px / 6px tail bottom-left.
- AI-actively-thinking indicator: the Apple Intelligence gradient border, animated, pulsing 1.5s cycle, around the input field or a pending bubble.
- Input field: pill (radius 9999px), 44px tall, glass material (thin), inner placeholder at label-3. When focused or Apple Intelligence is invoked, animate a gradient outline (the iridescent stack).
- Send button: 32px circle, `--accent-blue`, arrow-up icon. Spring-interactive on tap.

### 3.5 Week strip / compliance strip
**Apple treatment:** a horizontal row of 7 small complication-style cells. Each cell = a small activity ring (SVG stroke, 28–36px, 4px stroke width) with day letter below (11px caption). Completed = filled ring in accent-green. In-progress = partial fill. Missed = dashed `--separator-opaque` ring. Today = ring with a 1.5px white inner offset (highlight).

### 3.6 Navigation
**Apple 2027 treatment:** bottom tab bar on mobile (4–5 tabs max), top segmented control on desktop. Both rendered in `regular` material. Active tab: label-1 color + tiny 3px filled pill indicator or a subtle background shape at 14px radius in `--fill-1`. Labels: 11px, weight 590 active / 500 inactive. Icons: 24px, Lucide, stroke 1.75.

---

## 4. Watch Complication Hierarchy (applied to our dashboard)

Apple Watch teaches: a single view earns one hero data point. Average glance is <3 seconds. Content >20 characters in a complication loses 38% engagement.

**Apply to our dashboard:**
1. **Hero slot (one only):** the readiness score. Big number, color, verb.
2. **Prime complications (2–3 max):** today's prescribed workout (one-line), streak count, days-to-goal event.
3. **Secondary strip (4–7 items):** week strip, yesterday's sport metrics, HRV trend micro-chart.
4. **Everything else:** below the fold, tab-gated, or behind a "Details" disclosure.

Rule of thumb: if you can't describe a card's core data in ≤20 characters, it's not a hero card.

---

## 5. Dynamic Island / Live Activity patterns (web equivalent)

Dynamic Island = "ambient persistent status that expands on demand." Web equivalent = a top-centered pill that docks to the viewport, expands on hover/click, collapses when the underlying activity ends. Fixed position, glass material, no shadow, 8px from top, radius-pill, scales via spring-smooth.

**Use cases for our app:**
- A workout syncing from Garmin (spinner + "Syncing Morning Ride…" → expands to show progress)
- A live activity in progress (if we ever add start-workout)
- An Apple Intelligence "thinking" status when the coach is composing ("Analyzing your last 14 days…" with iridescent border)

States: compact (just icon + pulse), expanded (full label + action), minimized (dot-only, 12px).

By 2027: expect iOS 27's Siri to expand from Dynamic Island with a glowing numeral cursor and "Search or Ask" prompt. Mirror this for our coach: a persistent "Ask the coach" pill that expands into a full prompt input when tapped.

---

## 6. Web-achievable vs Native-only

### Fully web-achievable
- All color tokens, typography scale, spacing, radii, shadows
- `backdrop-filter: blur()` + saturation — supported in all modern browsers (Safari since 9, Chrome since 76, Firefox since 103)
- Spring physics via Framer Motion / react-spring
- Apple Intelligence gradient + animated border
- SF Pro fallback (on Apple devices, via `-apple-system`)
- Lucide / Phosphor icons at stroke 1.5–2
- Visual "haptic" pulse substitutes
- Count-up numbers, chart draw-on animations
- Activity-ring-style SVG circles with stroke-dashoffset
- Glass layering, concentric radii
- Dynamic-Island-style docked pill

### Hard on web (possible but costly)
- True Liquid Glass lensing / refraction of content behind glass — requires WebGL shader (three.js + custom fragment shader) or `@property` + mask tricks. Can approximate with CSS `backdrop-filter: blur() saturate()` + a diagonal specular gradient overlay. Good enough at 80% of the feel.
- SF Pro on non-Apple devices — requires self-hosting SF Pro (Apple's license is ambiguous at best; most teams use Inter Variable as a near-metric fallback)
- SF Symbols on web — license forbids web distribution. Use Lucide (closest stroke-weight match) or Phosphor (multi-weight). Map common SF Symbol names → Lucide equivalents in a single `iconMap.ts`.
- Optical sizing transition at 19pt — Inter Variable has optical sizing axis (`opsz`); SF Pro Text/Display boundary can be simulated with `font-optical-sizing: auto` but isn't pixel-identical.
- Real haptics — the Vibration API is not on iOS Safari (ever) and unreliable on Android.
- True reduce-motion respect that also scales spring responses — doable but requires plumbing `prefers-reduced-motion` into every motion token.

### Native-only (what we'd gain going native iOS later)
- **Real haptics** (Core Haptics): impact, selection, notification, continuous patterns. Massive UX win for a fitness app.
- **SF Symbols** (10k+ icons, all weights, all scales, animated variants in iOS 17+).
- **True Liquid Glass material** with real-time lensing, specular that responds to device tilt, adaptive shadows. Can't replicate without GPU shader budget we'd never spend on web.
- **Live Activities + Dynamic Island** — actual OS integration for in-progress rides, not a fake top pill.
- **Complications** on Apple Watch — readiness as a watch face complication.
- **HealthKit bidirectional** — write workouts, read live HR during a ride.
- **Background refresh + push via APNs** — update readiness overnight, notify on bad HRV.
- **Interactive widgets** (iOS 17+) — tap "Log Ride" from home screen.
- **Dynamic Type accessibility** — users' system text size automatically scales the whole app.
- **SwiftUI `Material` API** — built-in ultraThin/thin/regular/thick/ultraThick with correct vibrancy and system-coordinated performance.
- **Spring `.interactiveSpring()`** with real gesture handoff continuity — on web this is approximation only.
- **Apple Intelligence on-device** — free Siri/Writing Tools integration, no OpenAI cost for certain coach interactions.

---

## 7. iOS 26 → 2027 projection (what to design for now)

Signals from WWDC 2025 (Liquid Glass), iOS 26, visionOS, and iOS 27 rumors:

- **Glass is the default, not a special effect.** Every surface layer becomes translucent over a content canvas. By 2027 expect glass to be assumed; flat-solid chrome will read as dated.
- **Ambient AI status expands from Dynamic Island.** iOS 27's Siri redesign (glowing numeral cursor, "Search or Ask" prompt that expands from the island) is the tell: AI surfaces will be persistent, glanceable, and expandable. Design the coach as an always-available ambient presence, not a separate tab.
- **Visual Intelligence / multimodal inputs.** iOS 27 adds nutrition-label reading, auto-ticket capture, auto-contact adding. For us: an "add a photo of your whiteboard plan" button, or drop-in image-to-workout parsing, is on-brand for 2027.
- **Snow Leopard year → polish over novelty.** iOS 27 is expected to consolidate the iOS 26 redesign. Translation: nail the iOS 26 language (glass, springs, Intelligence gradient) now; don't chase a third new material.
- **visionOS-influenced depth.** Expect stronger z-axis treatment: modals lifting from the canvas with real parallax, hover-to-focus on desktop pointer. We can fake parallax on web with `transform: translate3d()` tied to pointer/scroll.
- **Multi-device continuity surfaces.** iOS 27 lays groundwork for foldable iPhone. Design fluid layouts (not fixed breakpoints) — min/max clamps, container queries, content that gracefully reflows across 375px / 744px / 1024px.

---

## 8. Implementation notes for our stack

### Tailwind config additions (conceptual)
- Extend `theme.colors` with the semantic tokens mapped to CSS variables so dark mode flips via `.dark` class.
- Extend `theme.boxShadow` with shadow-1..4 and glass-rim.
- Extend `theme.borderRadius` with xs/sm/md/lg/xl/2xl/pill.
- Extend `theme.fontFamily` with `sans` (system stack), `rounded` (SF Pro Rounded), `mono`.
- Extend `theme.fontSize` with `[fontSize, { lineHeight, letterSpacing, fontWeight }]` tuples per Apple scale.
- Extend `theme.backdropBlur` with 10, 20, 30, 40, 50 → ultra-thin through ultra-thick.
- Extend `theme.transitionTimingFunction` with apple-default, apple-decel, apple-accel.

### Motion library choice
- Framer Motion for most springs (`type: "spring", stiffness, damping`).
- Tailwind's built-in `transition-*` only for hovers/focus (micro).
- For chart draw-on, use `framer-motion` `motion.path` with `pathLength` or `react-spring` on stroke-dashoffset.

### Icon library
- Lucide as primary (closest stroke-weight match to SF Symbols). Stroke 1.75 default, 2 for small contexts.
- Phosphor as secondary when we need multi-weight (e.g., bold fill for selected tab icons).
- Build `iconMap.ts` with SF Symbol name → Lucide component, so if we ever ship native, it maps cleanly.

### Fonts
- Primary: system stack (`-apple-system` first). On Apple devices, this IS SF Pro.
- Fallback: self-host Inter Variable (OFL license) for non-Apple. Use `font-optical-sizing: auto`.
- Rounded: `ui-rounded` first, then self-host Nunito Variable as fallback.

---

## 9. References

- [Apple HIG: Motion](https://developer.apple.com/design/human-interface-guidelines/motion)
- [Apple HIG: Activity Rings](https://developer.apple.com/design/human-interface-guidelines/activity-rings)
- [Apple HIG: Complications](https://developer.apple.com/design/human-interface-guidelines/complications)
- [Apple HIG: SF Symbols](https://developer.apple.com/design/human-interface-guidelines/sf-symbols)
- [Apple Newsroom: Liquid Glass (WWDC 2025)](https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/)
- [Liquid Glass — Wikipedia](https://en.wikipedia.org/wiki/Liquid_Glass)
- [Liquid Glass 2026 — expertappdevs](https://medium.com/@expertappdevs/liquid-glass-2026-apples-new-design-language-6a709e49ca8b)
- [visionOS design guide — think.design](https://think.design/blog/the-complete-guide-to-designing-for-visionos/)
- [iOS 26 visionOS-inspired elements — MacRumors](https://www.macrumors.com/2025/05/30/ios-26-visionos-inspired-design-elements/)
- [iOS 27 rumors & Siri redesign — MacRumors roundup](https://www.macrumors.com/roundup/ios-27/)
- [iOS 27 Apple Intelligence features — MacRumors](https://www.macrumors.com/2026/04/16/4-new-apple-intelligence-features-ios-27/)
- [Apple WWDC26 rumors — The Gadget Flow](https://thegadgetflow.com/blog/apple-wwdc26-rumors-ai-expansion-siri-redesign-and-ios-27-plans/)
- [iOS Dark Color Cheat Sheet — Sarunw](https://sarunw.com/posts/dark-color-cheat-sheet/)
- [iOS Semantic Colors — Medium](https://pangea25.medium.com/ios-semantic-colors-9cf0fa995df1)
- [Apple Colors — mar.codes](https://mar.codes/apple-colors)
- [SwiftUI Spring Animations reference — GetStream](https://github.com/GetStream/swiftui-spring-animations)
- [Apple `spring(response:dampingFraction:)`](https://developer.apple.com/documentation/swiftui/animation/spring(response:dampingfraction:blendduration:))
- [SF Pro Fonts — Apple Developer](https://developer.apple.com/fonts/)
- [Leveraging System Fonts on the Web — Jim Nielsen](https://blog.jim-nielsen.com/2020/system-fonts-on-the-web/)
- [Apple Intelligence Glow Effect — livsycode](https://livsycode.com/swiftui/an-apple-intelligence-style-glow-effect-in-swiftui/)
- [12 AI Design Trends from WWDC 2024 — Medium](https://medium.com/@AIDesignAward/12-ai-design-trends-of-the-2024-wwdc-apple-intelligence-2ff959752305)
- [Design dynamic Live Activities — WWDC23](https://developer.apple.com/videos/play/wwdc2023/10194/)
- [Liquid Glass CSS recreation — DEV](https://dev.to/kevinbism/recreating-apples-liquid-glass-effect-with-pure-css-3gpl)
- [Animate with springs — WWDC23](https://developer.apple.com/videos/play/wwdc2023/10158/)
