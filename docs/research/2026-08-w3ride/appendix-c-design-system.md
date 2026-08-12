# W3:Ride — Design System Extraction

Reverse-engineered from the shipped Android app (`io.w3ride.w3ride`, **v0.14.6**, Expo SDK 49 / React Native)
plus two marketing screenshots.

**Sources**
- `resources/assets/index.android.bundle` (13 MB minified JS) — the design token module is **module `1356`**, the
  typography components are **`1357`** (base `Text`) and **`1628`** (`Title`), semantic theme is **`1359`**.
- `resources/res/values/colors.xml`, `resources/res/raw/*.ttf`, `resources/res/drawable-mdpi/assets_images_*`
- `resources/assets/app.config`
- `/Users/jannisdeters/Downloads/w3-ride.jpg`, `/Users/jannisdeters/Downloads/w3-ride-app.jpg`

**Evidence legend** — `[HARD]` = literal extracted from the bundle or from res/. `[EYE]` = read off a screenshot,
approximate. Nothing below is invented.

> ⚠️ Version caveat: the marketing screenshots show surfaces (circular "Next milestone" rings, a Badges rail with
> "SEE ALL") whose copy strings do **not** exist in this bundle (`"Next milestone"` → 0 hits, `"SEE ALL"` → 0 hits).
> Those two components are documented `[EYE]`-only. Everything else is from shipped code.

---

## 1. Colour palette

### 1.1 The raw token object `[HARD]`

Verbatim from bundle module `1356` (`e.default={colors:{…},spacing:{…}}`). This is the entire design-token file —
there is no other palette in the app.

| Token | Hex | Where it's actually used (usage counts from the bundle) |
|---|---|---|
| `blackTrue` | `#000000` | true black, rare (4 bg uses) |
| `black` | `#0F0F0F` | **the card/surface colour** — 37 backgrounds, 91 foregrounds. Note: *darker than the page* |
| `dark` | `#252525` | **the page background in dark mode**; also disabled button fill |
| `gray900` | `#1F1F1F` | 1 use |
| `gray800` | `#1B1B1B` | "How it works" explainer card fill (9 uses) |
| `gray700` | `#2E2E2E` | dark-mode `tint`, Android ripple on dark buttons (14 bg uses) |
| `gray600` | `#C2C2C2` | disabled button text; referral-card placeholder fill |
| `gray500` | `#F1F1F1` | light-mode inner background |
| `white` | `#FFFFFF` | primary text on dark (157 foreground uses — the #1 colour) |
| **`green600`** | **`#B5FF23`** | **THE brand accent.** 70 fg / 31 bg uses. Launcher icon bg, splash bg, `colorPrimaryDark`, `accent` in *both* light and dark themes |
| `green500` | `#C8FF59` | softer lime, secondary |
| `green700` | `#006B5A` | deep teal-green |
| `green800` | `#8AB03E` | pressed/ripple state of the lime button |
| `green900` | `#193F39` | dark green, meter track base |
| **`purple700`** | **`#854BFF`** | **the violet accent.** CTA fill, chips, ride-card fill, claim overlay |
| `purple500` | `#E6CDFF` | lavender — the `$POWER` glyph tint, purple meter fill (19 fg uses) |
| `purple900` | `#14003E` | deep violet background |
| `red500` | `#FF656E` | `danger` |
| `red700` | `#B44C51` | danger, muted |
| `orange500` | `#FF8754` | orange meter variant |
| `yellow500` | `#FFEF98` | pale yellow |
| `yellow600` | `#FFE24A` | yellow |
| `yellow700` | `#FFAF65` | amber |
| `yellow800` | `#FFBC25` | scratch-card "recycle ride" surface |
| `blue700` | `#516E83` | blue meter variant |
| `teal500` | `#1C4449` | — |
| `teal700` | `#1c4449b3` | 8-digit ARGB-ish literal, i.e. teal @ 70% |
| `brown500` | `#D1B0A1` | — |

### 1.2 Semantic theme (module `1359`) `[HARD]`

```
light: accent green600, text black(#0F0F0F), background white,
       backgroundInner gray500(#F1F1F1), tint gray500,
       tabBarBackground white, tabIconDefault/Select black
dark:  accent green600, text white,       background dark(#252525),
       backgroundInner black(#0F0F0F), tint gray700(#2E2E2E),
       tabBarBackground black(#0F0F0F), tabIconDefault/Select white
```

Two things worth stealing:
1. **The accent is theme-invariant.** `#B5FF23` is the accent in light *and* dark. The brand never dims.
2. **Surfaces are darker than the page** in dark mode (`#0F0F0F` card on `#252525` page) — the inverse of the
   usual Material elevation model. Cards read as *holes* punched in the page, not as raised planes. This is why
   the profile screen looks like a stack of black tiles floating on charcoal.

App-level defaults: `userInterfaceStyle: "dark"` on iOS, Android and root `[HARD, app.config]`. There is no
in-app theme switch surfaced; light tokens exist but the product ships dark.

### 1.3 Android resource colours `[HARD]`

```xml
<color name="colorPrimaryDark">#b5ff23</color>
<color name="iconBackground">#b5ff23</color>
<color name="splashscreen_background">#b5ff23</color>
<color name="colorPrimary">#023c69</color>   <!-- Expo template leftover, unused -->
```
`app.config`: `splash.backgroundColor: "#B5FF23"`, `android.adaptiveIcon.backgroundColor: "#B5FF23"`.
**The app boots as a full-bleed lime screen** with a black glyph — the single loudest brand move it makes.

### 1.4 Alpha / overlay recipes `[HARD]`

These recur verbatim and are effectively tokens:

| Recipe | Value | Use |
|---|---|---|
| Scrim over hero art | `rgba(0,0,0,0.75)` | stat strip + referral-card info bar |
| Half scrim | `rgba(0,0,0,0.5)` | ride-card stat chips |
| Claim overlay | `rgba(133,75,255,0.75)` | = `purple700 @ 75%`, the "CLAIM NOW" veil on a referral card |
| Meter track (green) | `rgba(181,255,35,0.3)` | = `green600 @ 30%` |
| Meter track (purple) | `rgba(230,205,255,0.3)` | = `purple500 @ 30%` |
| Meter track (orange) | `rgba(255,135,84,0.3)` | = `orange500 @ 30%` |
| Meter track (blue) | `rgba(25,63,57,0.3)` | = `green900 @ 30%` |
| Meter track (on white) | `rgba(255,255,255,0.5)` | `whiteContainer` variant |
| Tier chip fill | `rgba(125,125,125,0.3)` | neutral grey glass |
| Dark count badge | `rgba(255,255,255,0.3)` | section-count circle on dark |

**The track rule is mechanical: every progress track is its own fill colour at 30% alpha.** One line of code,
four variants, always self-consistent. Worth copying.

### 1.5 Gradients `[HARD]`

| Gradient | Stops | Use |
|---|---|---|
| Rarity meter | `#7946E3 → #E6CDFF`, horizontal (`x:0→1, y:.5`) | bike-rarity bar. `#7946E3` is a **hardcoded one-off** — it is *not* in the token file |
| Rarity meter (top tier) | `rgba(255,255,255,0.1) → #FFFFFF` | best-rarity bike |
| Power meter | `rgba(181,255,35,0.1) → #B5FF23` | |
| Showroom "metal" | `#9ca1a4 0% → #9ca1a4 50% → #ecf2f4 80% → #ecf2f4 100%` | onboarding bike-showroom backdrop — a hard-stopped horizon, not a blend |
| Hero image scrims | `transparent → rgba(0,0,0,0.95) → rgba(0,0,0,0.9) → rgba(0,0,0,0.6)` and simpler `transparent → rgba(0,0,0,0.8)` | full-bleed avatar/bike photography |

### 1.6 Colours read off the screenshots only `[EYE]`

- Profile hero bike render backdrop: deep indigo-blue ≈ `#1A2A6E`, pastel pink hills ≈ `#F49BC8`, mint ≈ `#6FE3B8`.
  These are baked into the **3D-rendered NFT artwork**, not UI tokens.
- The "Silver Tier" tile glyph and the badge medallion rims read as `#B5FF23` and `#C9B6E8` — consistent with
  `green600` / `purple500`.

---

## 2. Typography

### 2.1 Fonts shipped `[HARD]`

`res/raw/` and the bundle's asset registry contain exactly four app fonts:

| File | Registered as | Asset name |
|---|---|---|
| `assets_fonts_worksansregular.ttf` | `'work-sans'` | WorkSans-Regular |
| `assets_fonts_worksansmedium.ttf` | `'work-sans-med'` | WorkSans-Medium |
| `assets_fonts_worksanssemibold.ttf` | `'work-sans-semi'` | WorkSans-SemiBold |
| `assets_fonts_icons_icomoon.ttf` | `icomoon` | custom icon font (§5) |

Loaded together at boot before the splash hides:
```js
await Font.loadAsync({'work-sans':…, 'work-sans-med':…, 'work-sans-semi':…, icomoon:…})
```
The 17 `@expo/vector-icons` fonts are also in the APK but only FontAwesome5, FontAwesome, Ionicons and
MaterialCommunityIcons are actually referenced.

**There is no Bold.** SemiBold is the heaviest weight in the product. Big numbers get their presence from
*size*, never from weight.

### 2.2 The base text style `[HARD]` (module `1357`)

```js
text:        { fontSize: 18, fontFamily: 'work-sans-med', letterSpacing: -0.94 }
textBold:    { fontFamily: 'work-sans-semi' }   // <Text bold>
textRegular: { fontFamily: 'work-sans' }        // <Text regular>
```

Two signature decisions:
- **Default body is 18px** — unusually large for a mobile app. Everything reads a size up.
- **A global `letterSpacing: -0.94px`** — a fixed pixel value, not em-relative, applied to *every* `Text`.
  At 18px that's ≈ −0.052em; at the 90px claim number it's visually nothing. Net effect: body copy is
  noticeably tight/optical, display numerals stay normal. This one negative-tracking constant is the most
  distinctive typographic fingerprint in the app.

### 2.3 Type scale `[HARD]`

Named scale (module `1628`, the `Title` component; `type="h1".."h5"`):

| Token | Size | Line height | Ratio |
|---|---|---|---|
| `h1` | 40 | 42.25 | 1.056 |
| `h2` | 36 | 38 | 1.056 |
| `h3` | 30 | 31.68 | 1.056 |
| `h4` | 26 | 27.46 | 1.056 |
| `h5` | 20 | 20 | 1.0 |
| `title` (wrapper) | inherits | — | `fontWeight:'500'`, `marginBottom: 15` |
| `subtitle` | 18 | 21 | `fontWeight:'500'`, `opacity: 0.4` |

**Every heading uses a ~1.056 line-height ratio.** Headings are set essentially solid — a deliberate, poster-like
tightness that pairs with the negative tracking.

Ad-hoc sizes actually present in styles, ranked by frequency:
`18 (39×) · 14 (39×) · 12 (34×) · 16 (31×) · 20 (29×) · 40 (19×) · 30 (16×) · 9 (11×) · 26 (10×) · 11 (9×) · 24 · 22 · 32 · 13 · 10 · 36 · 21 · 25`
plus display one-offs: **44, 45, 48, 50, 60, 65, 75, 87, 90, 109**.

Practical scale to rebuild with:
`9 / 10 / 11 / 12 / 13 / 14 / 16 / 18(body) / 20 / 26 / 30 / 36 / 40` then a free display tier `44–109`
for reward moments.

Line heights are mostly authored as literal decimals derived from the size (`27.46`, `31.68`, `42.4`, `23.46`,
`18.77`) rather than a multiplier — i.e. designed in Figma and transcribed.

### 2.4 Casing & micro-type `[HARD]`

- `textTransform:'uppercase'` appears **41 times and is the only transform used** — no capitalize, no lowercase.
- Uppercase is reserved for: metadata labels (10–12px), button labels on reward CTAs, tier names, the referral
  code (40px), and the "CLAIM NOW"/"COOLDOWN"/"DONE" action words.
- Metadata pattern: `fontSize: 10–11, textTransform:'uppercase', opacity: 0.6` (or `0.4`) — e.g. the
  `POWER CLAIMED / TOTAL DISTANCE / TOTAL RIDES` strip.
- The referral code (`HYXBS9`) is **not monospace** — it's Work Sans at `fontSize:40, lineHeight:42.4,
  textTransform:'uppercase', textAlign:'center'`. Its monospaced *look* is just uppercase Work Sans at display
  size. (The only `fontFamily:'monospace'` in the bundle belongs to a markdown renderer's default `<code>` style.)

---

## 3. Spacing, radii, elevation

### 3.1 Spacing tokens `[HARD]`

The entire spacing system, from module `1356`:
```js
spacing: { padding: 16, marginTitle: 15, marginBlock: 30 }
```

Three numbers. Everything else is derived by multiplying them inline — these exact expressions recur throughout:

| Expression | Value | Meaning |
|---|---|---|
| `spacing.padding` | 16 | the unit. Card padding, screen gutter |
| `spacing.padding / 2` | 8 | tight gutter, chip padding, grid gaps |
| `0.25 * spacing.padding` | 4 | hairline gap |
| `1.5 * spacing.padding` | 24 | generous block padding |
| `3 * spacing.padding` | 48 | hero top offset |
| `spacing.marginTitle` | 15 | space under any heading |
| `spacing.marginBlock` | 30 | space between page sections |
| `0.75 * spacing.marginBlock` | 22.5 | |
| `0.25 * spacing.marginBlock` | 7.5 | |

**Rhythm: 4 / 8 / 15 / 16 / 24 / 30 / 48.** Note 15 and 16 coexist — heading spacing (15) and box spacing (16)
are deliberately different tracks.

### 3.2 Radii `[HARD]`

Frequency across all `borderRadius:` literals:
`8 (40×) · 50 (12×) · 32 (10×) · 15 (8×) · 10 (8×) · 20 (7×) · 45 (7×) · 6 (6×) · 4 (5×) · 13/14 (4× each) · 30 · 23 · 16 · 12 · 42 · 19 · 100 …`

The system underneath:

| Role | Radius | Evidence |
|---|---|---|
| Base card | **10** | `Card` component (module `1619`) |
| Nested / inner panel | **8** | stat bar inside a hero card; most common value overall |
| Media tile / avatar card | **4** | referral reward card |
| Hero / ride card | **15** | ride card, recycle reward box |
| Bar & meter | **32** | `Meter` container + fill (so a 7px bar is fully pill-capped) |
| Pill / button | **50** | `Button` container + surface |
| Bespoke pills | 26, 29, 30, 40, 45, 56, 63 | authored as `height/2` per component rather than tokenised |
| Circle | `size/2` | avatar `186 → 93`; tier icon chip `26 → 13`; count badge `41 → 20.5`; swipe knob `42 → 21` |

**The tell:** pills are not one token. Radius is set to exactly half the element's height each time
(`41→20.5`, `52→26`, `42→21`), so nothing is ever *nearly* round.

### 3.3 Elevation & borders `[HARD]`

- `elevation:` appears 43× but almost entirely inside React Navigation / Material library code.
  **The app's own cards have no shadow and no elevation** — separation is done purely with the
  card-darker-than-page inversion and with scrims.
- `borderWidth` values in use: `1` (18×), `1.2`, `1.5`, `2`, `3`, `3.5`, `4`, `0.767`.
- One notable border: the "unclaimed reward" box uses `borderStyle:'dashed', borderWidth:3,
  borderColor: purple500` over `rgba(0,0,0,0.45)` — a dashed violet outline as the universal "not yet yours" signal.
- Opacity ladder actually used: `1 / 0.8 / 0.7 / 0.65 / 0.6 / 0.5 / 0.4 / 0.3 / 0.25 / 0.15 / 0.12 / 0`.
  De-emphasis is done with **opacity, never with a grey token** — `0.4` and `0.6` are the workhorses
  (subtitle = `0.4`, metadata label = `0.6`, inactive tab icon = `0.2`).

---

## 4. Component inventory

All numbers `[HARD]` unless flagged.

### 4.1 `Card` — the base surface (module `1619`)
```
padding: 16 · borderRadius: 10
backgroundColor: theme.backgroundInner  (dark: #0F0F0F, light: #F1F1F1)
```
Eleven lines of code. Every panel in the app is this plus an override.

### 4.2 `Button` — pill CTA (module `1355`)
```
container: borderRadius 50, overflow hidden
surface:   flexDirection row, center/center, borderRadius 50,
           paddingVertical 12, paddingHorizontal 14
           bg = black (#0F0F0F) by default
label:     fontSize 18, color white, textAlign center
icon:      size 28, marginEnd 10   (FontAwesome5 via `icon=` or icomoon via `w3icon=`)
```
Variants:
- `color="green"` → bg `green600 #B5FF23`, label `black #0F0F0F`, Android ripple `green800 #8AB03E`
- `color="danger"` → label `red500 #FF656E`
- `disabled` → bg `dark #252525`, label `gray600 #C2C2C2`, container `opacity 0.6`
- pressed → iOS `opacity 0.65`; Android uses ripple instead
- default ripple `gray700 #2E2E2E`

Common width overrides: `minWidth: 263` (share code), `minWidth: 266`.

**The colour flip is the semantic.** Violet `purple700` = *pending / your claim is coming*.
Lime `green600` = *settled / earned*. The referral detail screen swaps the same pill between
`{bg purple700, label white}` "Your reward" and `{bg green600, label black}` "Total earned"
with a 26px label — the single clearest state-through-colour move in the product.

### 4.3 `Meter` — linear progress bar (module `1620`)
```
props: amount, max, height = 7, color = 'green'|'purple'|'orange'|'blue', whiteContainer
track: width '100%', height, borderRadius 32, overflow hidden, bg = fill @ 30% alpha
fill:  absolute top/left, height '100%', borderRadius 32, width = clamp(amount/max) as a %
```
Fill colours: green→`#B5FF23`, purple→`#E6CDFF`, orange→`#FF8754`, blue→`#516E83`.
`whiteContainer` forces the track to `rgba(255,255,255,0.5)`.
A 7px bar at radius 32 = a capsule. Width is animated by React state, not Reanimated.

### 4.4 `StatCard` — the 3-up stat tile (module `2684`)
Exactly the `POWER CLAIMED / TOTAL DISTANCE / TOTAL RIDES` strip in the referral screenshots.
```
extends Card (padding 16, radius 10)
bg:     rgba(0,0,0,0.75)      ← glass over the full-bleed avatar behind it
flex:   1, alignItems center, marginEnd 8
icon:   icomoon, size 26, color green600, marginBottom 8
title:  fontSize 11, uppercase, color white, opacity 0.6, numberOfLines 1, adjustsFontSizeToFit
value:  fontSize 13 / lineHeight 16, color white
```
Anatomy top→bottom: **lime icon → dim uppercase label → white value.** Icon-first, label second, number last —
the inverse of a normal KPI tile, and it works because the icon is the loudest element.

### 4.5 Currency chip / balance readout
Two shapes, both `[HARD]`:

*Header balance (home screen):*
```
label pill: bg purple700, borderRadius 20, paddingV 6, paddingH 9, marginBottom 8
label text: 12/14, white, uppercase, centered   e.g. "$POWER BALANCE"
value row:  icon (marginRight 6.53) + number at fontSize 26 / lineHeight 29
```
*Inline balance (ride card):*
```
bg black, paddingV 5, paddingH 20, borderRadius 30, maxWidth 75% of card
glyph + number at fontSize 30, marginLeft 6
```
The number is animated with a **`CountUp` over 2 s** on the home screen.

Currency naming in copy is always `$Power` / `$Cyclr` — dollar-prefixed, title-case
(`"Convert $Power to $Cyclr"`, `"$POWER BALANCE"`).

### 4.6 Tier chip + identity row (module `1630`)
```
avatar:        186 × 186, borderRadius 93, overflow hidden, image cover
username pill: bg green600, borderRadius 29, padding 6, marginTop -24 (overlaps the avatar),
               maxWidth 300, row/center
 └ tier glyph: bg black, 26 × 26, borderRadius 13, marginRight 8,
               icomoon `getTierIconName(tier)` at size 16, colour white
 └ username:   fontSize 20 / lineHeight 23, color black, marginRight 8
tier chip:     bg rgba(125,125,125,0.3), paddingH 16, paddingV 4, marginTop 2, borderRadius 12
 └ tier name:  fontSize 10, uppercase, white, centered
```
`getTierIconName` (module `1631`) maps tier → glyph:
`pro→tier-pro · expert→tier-expert · enthusiast→tier-enthusiast · funseeker→tier-funseeker ·
rookie→tier-rookie · default→tier-tutorial`.
The tier ladder is drawn as **stacked chevrons** (1/2/3 nested chevrons for enthusiast/expert/pro), a diamond
outline for funseeker, a ring for rookie, and a single flat bar for tutorial — i.e. rank legible at 16px
with no text.

`[EYE]` The profile screenshot shows a variant where avatar and tier live as two adjacent square tiles rather
than the stacked pill above — likely a later layout of the same parts.

### 4.7 Avatar reward card w/ timer (module `2678`) — the referral grid unit
```
outer:      borderRadius 4, overflow hidden, width '49%' in a 2-col FlatList
            (columnWrapper: justifyContent 'space-between')
inner:      bg gray600 placeholder, minHeight 210, padding 4,
            justify flex-end (content sits at the bottom), radius 4, overflow hidden
bgImage:    absolute fill — the rider's 3D avatar render
name pill:  bg purple700 (or black once completed), paddingV 4, paddingH 16,
            borderRadius 50, marginBottom 4, zIndex 3
            completed variant prefixes a FontAwesome5 "check" at 14px in green600
name text:  12 / 14, white, centered
info bar:   alignSelf stretch, row, space-between, bg rgba(0,0,0,0.75),
            padding 8, borderRadius 8, zIndex 3
 ├ left  = countdown: icomoon "clock" 12px white + <Countdown> at fontSize 11 (hideMinutes)
 └ right = value:     "+{power}" at 13px white  +  icomoon "power" 13px in purple500
claim veil (when claimable): absolute fill, bg rgba(133,75,255,0.75),
            centered Ionicons "gift-outline" 40px white inside an 80px circle,
            label "Claim now" at 16/18, white, uppercase
```
Three states in one card — **live (timer + accruing value) / claimable (violet veil + gift) / settled
(black pill + check + total)** — and the whole state machine is legible from a 49%-width thumbnail.

### 4.8 Full-bleed detail screen (module `2683`)
```
inner:      minHeight 812, paddingH 8, justify flex-end, overflow hidden
bgImage:    absolute fill, transform [scale 1.1, translateX 8]   ← deliberately over-scaled & nudged
bgGradient: absolute fill, transparent → rgba(0,0,0,…)
name pill:  bg black, paddingH 12, paddingV 8, borderRadius 40, maxWidth 250,
            marginBottom 8, text 18 white
stat strip: row of 3 StatCards, marginBottom 8
CTA:        Button, bg purple700 → green600 on settle, label fontSize 26
countdown:  icomoon "clock" 28px + <Countdown>, marginLeft 8, marginTop 12
```
The `scale: 1.1` on the background is intentional — the avatar art is cropped past the bezel so it never
reads as a photo pasted into a frame.

### 4.9 Ride card + carousel (home screen)
Library: **`react-native-reanimated-carousel`** `[HARD — the bundle embeds the worklet's source path
`node_modules/react-native-reanimated-carousel/src/Carousel.tsx`]`.
```
carousel container: marginTop 48 (3 × padding), marginBottom 30
rideCard:  bg purple700, borderRadius 15, padding 14, width/height from screen metrics,
           justify space-between, alignSelf center, overflow hidden
 ├ bg image absolute fill, cover, zIndex 1
 ├ power pill: bg black, paddingV 5 paddingH 20, radius 30, maxWidth 75%, text 30, zIndex 3
 └ stat chips: bg rgba(0,0,0,0.5), paddingV 2.5 paddingH 6, radius 20, text 12/14, marginLeft 4
claim overlay: absolute fill, bg purple700, opacity 0 → animated in
 ├ watermark icon 320 × 320 at left:-160, opacity 0.15   ← half-off-canvas glyph as texture
 ├ claim number: fontSize 90, white, centered
 └ claim title:  fontSize 30, black, centered
recycle/scratch state: bg yellow800 #FFBC25, padding 24/16,
 ├ title 44 / 51 black, body 32 / 37 black @ opacity 0.5
 └ reward box: bg dark #252525, radius 15, border 1, minHeight 60%
     └ "not yet claimed" variant: bg rgba(0,0,0,0.45), borderStyle dashed, borderWidth 3,
        borderColor purple500
     └ reward title 65px white, reward power text 36px, radius 56
```
Cards exit with `FadeOutDown.duration(500)`.

`[EYE]` The dot indicator under the bike carousel on the profile screen is a row of ~4 small circles,
active one lime/white and inactive ones dimmed — no dedicated pagination component exists in this bundle
(`Pagination` / `dotStyle` → 0 hits), so it is drawn ad-hoc from the same `meterBubble` primitive:
`width 7, height 7, borderRadius 14, marginLeft 2.5, bg green600, opacity 0.3 → 1 when active` `[HARD, module 1618]`.

### 4.10 Slide-to-claim (module `1747`) — the signature control
```
track:  width 151, height 52, borderRadius 26, borderWidth 1 (colour = the action colour),
        padding 4, position relative
knob:   42 × 42, borderRadius 21, absolute top 4 left 4, overflow hidden, zIndex 3
 ├ knob base layer: full-bleed action colour @ opacity 0.3
 ├ knob active layer: full-bleed action colour, height animated 0→100% as cooldown expires
 └ knob icon: FontAwesome5 or icomoon at 18.28px, colour black
labels: fontSize 11 / lineHeight 11.66, uppercase.
        Two crossfading lines — "SLIDE TO" + <ACTION>, and a completed label
        that slides in from translateX 8 → −24 with opacity 0 → 1
gesture: PanGestureHandler + Reanimated; H_SWIPE_RANGE = 100px;
        release past ~78.66px (≈79%) commits with withTiming, otherwise springs back.
        RTL mirrors the threshold to 28.83px.
cooldown: when `endDateTime` is set the "SLIDE TO" label is replaced by a live countdown and the
        action word becomes "COOLDOWN"; the knob's fill height = 42 × (1 − remaining/24h),
        so **the knob visibly refills over 24 hours**.
```
This is the best idea in the app: the primary action and the cooldown timer are the *same object*.
You don't read how long is left — you watch the button fill back up.

### 4.11 Scratch-to-reveal reward (Skia)
```
full-screen ScratchCard (width/height = window), Skia canvas mask
scratch layer:  ImageBackground + two stacked FontAwesome faGift icons —
                168px in purple700, and 140px in rgba(0,0,0,0.25) offset behind it
                (a hard "shadow" made of the same glyph at a smaller size)
                + label "Scratch to reveal"
reward layer:   ImageBackground (power-coins-falling.png) + reward box
                "You Won!" + icomoon "power" at size 43 in black + the amount,
                numberOfLines 1 + adjustsFontSizeToFit  (so any magnitude fits on one line)
on complete:    Reanimated `FadeInDown.duration(500)` reveals a green "DONE" Button
```
Copy: `"Scratch to Play"` / `"Scratch to reveal"` / `"You Won!"` / `"DONE"`.

### 4.12 Bubble/particle burst (module `1748`)
```
numberOfBubbles 25 · sizeRange {min 4, max 30} · explosionSpeed 350ms · floatSpeed 3000ms
minTopDelta 0.3 · origin = screen centre · colour = white
per-bubble randomised leftDelta, topDelta, swingDelta (a sine swing while floating)
```
Classic `Animated.sequence` (not Reanimated). Fires on reward/claim.

### 4.13 "How it works" explainer card (module `2677`)
```
Card with backgroundColor override → gray800 #1B1B1B, marginBottom 30
 ├ Title type="h4"  → 26 / 27.46   e.g. "How it works:"
 └ body Text at default 18 with style { opacity: 0.8 }
```
Note the explainer uses `gray800 #1B1B1B` — a *different* surface from the standard `#0F0F0F` card, so the
"read me" block is one step lighter than everything around it. Deliberate and easy to miss.

### 4.14 Section header with count badge (module `2677`)
```
row, align center, marginBottom 16, bg = navigation theme background (so it can stick)
 ├ count badge: bg purple700, 41 × 41, borderRadius 20.5, centered,
 │              number at fontSize 30, white       (dark variant: rgba(255,255,255,0.3))
 └ title: fontSize 20 / lineHeight 23.46
```
Matches the "④ Active rewards" / "② Completed Referrals" headers exactly.

### 4.15 Referral code block (module `2677`)
```
codeContainer: position relative, align center, paddingTop 22.5, marginTop 7.5,
               marginBottom 30, overflow hidden
codeText:      fontSize 40 / lineHeight 42.4, uppercase, centered, marginBottom 16
codeButton:    Button with bg purple700, minWidth 263, icon "user-friends"
"Code copied!" toast: absolute top 4, full width, zIndex 2,
               Animated.timing translateY −24 → 0 over 200ms, auto-hides after 2500ms
```
The copy confirmation slides down *from under the code*, inside the same clipped container — a self-contained
micro-interaction with no global toast system.

### 4.16 Rewards banner (module `1635`)
```
row/center, bg black, padding 13, borderRadius 30
 ├ FontAwesome faStars 22px white, marginRight 4   (only when rewards are waiting)
 ├ label 18px white — "New Ride Rewards" / "Rides Available"
 └ button: bg green600, paddingV 6 paddingH 16, borderRadius 63, marginLeft 12,
           label "Open" 18px black uppercase
```

### 4.17 Tab bar
5 tabs, **icons only** (`tabBarShowLabel: false`), no custom bar style — background from
`theme.tabBarBackground` (`#0F0F0F` dark / white light), active & inactive tint both = `theme.tabIconSelect`
(white on dark). **Inactive state is expressed as `opacity: 0.2`** on the icon (0.4 for Events), not as a
different colour.

| Tab | Icon | Set |
|---|---|---|
| Dashboard | `home-outline` | icomoon |
| LeaderBoard | `trophy` | icomoon |
| Events | `faFlagCheckered` | FontAwesome |
| Marketplace | `store` | icomoon |
| Settings | `cog-outline` | icomoon |

### 4.18 Progress rings `[EYE] — not in this bundle`
The profile screenshot shows two side-by-side milestone cards, each with a ~64px circular track, a lime arc,
a centred percentage (`50%`, `73%`), and to the right a two-line label ("Next milestone" + an icomoon `bike`
or `tachometer` glyph and the target, e.g. "25 rides", "200…"). Copy strings for these do not exist in
v0.14.6. Rebuild them as: circular equivalent of §4.3 — track = accent @ 30% alpha, arc = accent at 100%,
round line caps, percentage centred at ~14–16px, on the standard `#0F0F0F` card at radius 10.

### 4.19 Badge medallion `[EYE] — not in this bundle`
Horizontally-scrolling rail on the profile screen. Each item: a ~96px circle on a black rounded tile,
containing a single flat glyph (a lime spoked wheel, a lavender asterisk, a lime bicycle) with a thin
concentric rim, and a 12–14px caption under the tile ("25 rides streak", "600K Power", "200+ miles").
Badges are **server-driven** in shipped code — the Redux `badgesSlice` stores `badges` fetched from
`GET user/current/summary` `[HARD]`, so the artwork is remote imagery, not local vectors. Note the caption
in the screenshot reads *"25 rides streal"* — a live typo in the marketing asset.

---

## 5. Iconography

### 5.1 The custom icomoon set — all 31 glyphs `[HARD]`

Extracted from the embedded IcoMoon `selection.json` (`setId: 3`), with their PUA codepoints.
Registered via `createIconSetFromIcoMoon` (module `1186`).

| Codepoint | Name | | Codepoint | Name |
|---|---|---|---|---|
| `` (59648) | `bike` | | `` (59664) | `lightning-bolt-outline` |
| `` (59649) | `clock` | | `` (59665) | `podium-outline` |
| `` (59650) | `cog-outline` | | `` (59666) | `tachometer-2` |
| `` (59651) | `cyclr` | | `` (59667) | `road` |
| `` (59652) | `flag-outline` | | `` (59668) | `stopwatch` |
| `` (59653) | `frame-outline` | | `` (59669) | `store` |
| `` (59654) | `handlebars-outline` | | `` (59670) | `trophy` |
| `` (59655) | `home-outline` | | `` (59671) | `tier-expert` |
| `` (59656) | `lock` | | `` (59672) | `tier-enthusiast` |
| `` (59657) | `power` | | `` (59673) | `tier-funseeker` |
| `` (59658) | `refresh` | | `` (59674) | `tier-rookie` |
| `` (59659) | `seat-outline` | | `` (59675) | `tier-tutorial` |
| `` (59660) | `tachometer` | | `` (59676) | `tier-pro` |
| `` (59661) | `wheel-outline` | | `` (59677) | `ticket` |
| `` (59662) | `coin-outline` | | `` (59678) | `google-fit` |
| `` (59663) | `distance` | | | |

**What the names give away** (this is a product map, not just an icon list):
- **Bike-part vocabulary**: `frame-outline`, `handlebars-outline`, `seat-outline`, `wheel-outline` —
  the NFT bikes are componentised, so parts are individually upgradeable/tradeable.
- **Six-rung tier ladder**: `tutorial → rookie → funseeker → enthusiast → expert → pro`.
- **Three currencies/objects**: `power`, `cyclr`, `ticket` (raffle), plus a generic `coin-outline`.
- **Ride telemetry**: `distance`, `road`, `tachometer` + `tachometer-2` (avg vs max speed), `stopwatch`, `clock`.
- **Surfaces**: `home-outline`, `store`, `trophy` (leaderboard), `podium-outline` (rank), `flag-outline`
  (events), `cog-outline`, `lock` (gated content), `refresh` (recycle a ride), `google-fit` (tracker connect).

Usage frequency: `power` 25× · `cyclr` 11× · `clock` 8× · `tachometer-2`/`road`/`distance` 4× each.

### 5.2 The two currency glyphs `[HARD — verified by reading the PNGs]`

| | `$POWER` | `$CYCLR` |
|---|---|---|
| Glyph | **8-point asterisk / starburst** — eight equal tapered rays from a small hub | **4-armed pinwheel / crank** — four blunt, slightly-rotated arms around a circular hole |
| icomoon name | `power` | `cyclr` |
| Default tint in code | **`purple500 #E6CDFF`** (lavender) — 11 of 15 tinted usages; `black` inside lime containers | **`green600 #B5FF23` / `green500 #C8FF59`** |
| Coin asset | `icon-asterisk.png` — the asterisk in **lime with a white glow rim** on a black disc | `green-cyclr-token.png` — black pinwheel on a **lime disc with an offset black backing disc** (a fake 3D edge) |
| Flat mark | `icon-power.png` (lavender), `icon-power-white.png` | `cyclr-logo-green.png` (lime) |

The `cyclr` pinwheel **is the app's launcher icon** — `ic_launcher_foreground.png` is that black mark on
`#B5FF23`, matching `iconBackground` / `splashscreen_background`. Brand mark = the premium currency.

Correction to the common reading of the screenshots: it's the **CYCLR** mark that is the four-armed
lime shape, and **POWER** that is the asterisk. The asterisk ships in both lime (coin) and lavender
(inline text) — code tints it `purple500` in running text, which is why `+9786,2 ✳` reads lavender in the
referral grid but the profile hero asterisk reads lime.

### 5.3 Third-party icon sets in use `[HARD]`
FontAwesome 5 (`check`, `user-friends`, `faStar`, `faStars`, `faGift`, `faPartyHorn`, `faFlagCheckered`),
Ionicons (`gift-outline`), MaterialCommunityIcons, AntDesign. All 17 `@expo/vector-icons` fonts are in the APK
but most are dead weight.

### 5.4 Other bundled art `[HARD]`
`bike-outline.png` (195×110), `bike-dotted.png`, `blank-bike.png`, `bike-w3ride.png`, `rider-w3ride.png`,
`rider-blank-male.png` (800×800), `rider-blank-female.jpg` (2000×2000), `power-coins-falling.png` +
`…-large.png`, `golden-ticket.png` + `…-tall.png`, `convert-arrows-green.png` / `…-purple.png`,
`question-cluster.png` / `…-purple.png`, `star-white.png`, `icon-smile.png`, `icon-lock.png`,
`paint-rectangle.png`, `spoked-horizontal-white.png`, `w3ride-logo-text.png` / `…-white.png` (284×47 as laid out),
`onboarding-{cyclr,offers,token,watch}.jpg`, `strava-icon`, `google-fit-icon`, `health-kit-icon`,
and partner logos `nike / adidas / amazon / athleta`.

**Every important asset ships in a green *and* a purple variant** (`convert-arrows`, `question-cluster`,
`icon-power`) — the two-accent system is committed to at the asset level, not just in CSS.

---

## 6. Motion & feel

### 6.1 Libraries present `[HARD]`
| Library | Evidence | Role |
|---|---|---|
| **react-native-reanimated** | 612 refs; `useSharedValue` 60×, `withTiming` 264×, `withSpring` 28× | the motion backbone |
| **react-native-reanimated-carousel** | worklet source path embedded | the ride/bike carousels |
| **@shopify/react-native-skia** | 31 refs; `Canvas`, `BlurMask` 13×, `RadialGradient` 28×, `SweepGradient` 14×, `RuntimeShader` 15× | scratch-card mask, glows |
| **react-native-gesture-handler** | `PanGestureHandler` | slide-to-claim |
| **expo-linear-gradient** | `LinearGradient` 45× | scrims, rarity meters, showroom |
| **moti** | 61 refs | present but no `MotiView` usage found — likely transitive |
| **expo-haptics** | 2 refs | minimal |
| **Lottie** | **0 refs** | — |
| **Rive** | 2 refs (string only) | not used |

**There are no Lottie JSON files and no `.riv` files in the APK.** All motion is code-driven — Reanimated
worklets and Skia — plus pre-rendered PNG artwork (`power-coins-falling.png`) used as a static "burst" image
rather than an animation.

### 6.2 The timing vocabulary `[HARD]`
| Duration | Where |
|---|---|
| 200 ms | "Code copied!" toast slide (`Animated.timing`, translateY −24 → 0) |
| 350 ms | bubble explosion |
| 500 ms | `FadeInDown` (DONE button after scratch), `FadeOutDown` (ride card exits) |
| 800 ms | onboarding `FadeIn` / `FadeOut`, showroom `withTiming` reveals |
| 1800 ms | deliberate onboarding hold (`await wait(1800)`) before the next beat |
| 2000 ms | `CountUp` on the power balance |
| 2500 ms | copied-toast auto-dismiss |
| 3000 ms | bubble float |
| 24 h | the slide-to-claim knob refill |

`FadeInDown` / `FadeOutDown` / `FadeIn` / `FadeOut` are the only named Reanimated entering/exiting presets used.
There is no shared-element transition, no spring on layout, no parallax.

### 6.3 The four signature moments
1. **Scratch to reveal** — a full-screen Skia scratch mask over a violet gift glyph; scratching uncovers
   `You Won!` + the power amount over falling-coins art; a lime `DONE` fades in from below.
2. **Slide to claim** — a 151×52 pill whose 42px knob you drag 100px; on cooldown the same knob refills
   from empty over 24 h.
3. **Claim overlay on the ride card** — the card floods `purple700`, a 320px watermark glyph slides half off
   the left edge at 15% opacity, and the reward number lands at **90px**.
4. **Count-up balance** — the header `$POWER BALANCE` ticks from old to new over 2 s whenever it changes.

---

## 7. Tone of voice

All quotes `[HARD]` — extracted verbatim from JSX text nodes in the bundle.

**Register: an enthusiastic crypto-native brand manager doing hype-marketing copy, with a cyclist's
vocabulary bolted on.** It is *not* coach-like — there is no training advice anywhere. It sells.

**Hype / second-person sell:**
- *"Are you ready to win some incredible gifts? Don't miss your chance to score some amazing prizes by securing your raffle tickets today!"*
- *"Whether you're racing or just enjoying a leisurely ride, elevate your performances with a new bike."*
- *"Take a look at our store, the one-stop place to upgrade your bike ranking, your rewards and your style."*
- *"Are you looking for a unique look to complete your profile? Or simply on the hunt for your new one? You have come to the right place."*

**Crypto-native, stated plainly and repeatedly:**
- *"Thanks to blockchain technology, you have now complete access to your digital assets. The proof of ownership gives you the ability to buy, sell or trade them at any given point."*
- *"Just like the bike collection, your are the true owner of your digital avatar."* (sic — "your are")
- *"With a trillion of possibilities and only 8088 bikes selected, our unique process of creation ensures that no two bikes are the same in the collection."*
- *"Your digital avatar is how you want to express yourself in the W3:Ride metaverse."*
- *"Convert $Power to $Cyclr for unlocking enhanced rewards. This action can not be reversed and is permanent."*

**Warm, buddyish onboarding:**
- *"Welcome to W3:Ride!"* / *"Let's have a quick tour to get you all set."*
- *"You like your bike? Well, then there's a good chance that you'll like your avatar as well."*
- *"…they've all been carefully crafted and are all unique. Just like you."*
- *"Good luck!"* · *"Please be patient while joining."* · *"It can take some time to complete the process."*

**Collective / community framing:**
- *"Let's use the community riding power to go twice the distance around the globe. That's 80.150Km to ride! Are you ready for this challenge?"*
- *"Congrats to this week's raffle winners!"*
- *"Pick a map that fits your goals and start earning! From casual commuters to pro-cyclists, there's something for everyone."*

**Mechanics stated flatly when money is involved** (the register drops to plain instruction):
- *"Recruit new riders and earn a 10% bonus on every ride they claim for 30 days when signing up."*
- *"The total amount of your bonus will be available for you to claim at the end of the 30 days period."*
- *"In order to claim rewards, please ensure all tracked rides are set to public."*
- *"The rarity of your bike spans from 16 to 1.75 (the lower the number, the better), and has an impact on the earning formula."*

**Empty states are prompts to act, never dead ends:**
- *"You have no completed referrals yet. Invite your friends, local bike shop or club and start earning extra $Cyclr!"*
- *"You need to invite a friend first."*
- *"You need to go on a ride first to see data in this section."*

**Errors are casual and lowercase-energy:**
- *"Couldn't log out!"* / *"Please try again."*
- *"Couldn't find this event."* · *"No bikes found."* · *"No campaign found."*
- *"This ride has been flagged as invalid. Please contact support@w3ride.io if you feel this is in error."*

**Verbal tics:** currencies always dollar-prefixed (`$Power`, `$Cyclr`); "riders" not "users"; "claim" is the
universal verb for receiving value (claim rides, claim rewards, claim now); "earn" for accrual; ride is the
unit of everything. Copy is lightly unproofed (`"your are"`, `"25 rides streal"`, `"80.150Km"` with a
European decimal in an English sentence).

---

## 8. Five moves worth stealing

1. **Inverted surface depth.** Cards (`#0F0F0F`) are *darker* than the page (`#252525`), with zero shadow.
   Panels read as cut-outs, and lime pops harder against the deeper black than it would against grey.
2. **One accent that never dims.** `#B5FF23` is the accent in light theme, dark theme, the splash screen, and
   the launcher icon background. The app opens as a full lime screen.
3. **Two accents = two states, not two brand colours.** Violet `#854BFF` means *pending / promised*;
   lime `#B5FF23` means *earned / settled*. The same pill flips between them, and every art asset ships in both.
4. **A 30%-alpha-of-itself track.** Every meter's track is its own fill at 30% opacity — one rule, four colour
   variants, always harmonious, no separate "track grey" token to maintain.
5. **The button *is* the timer.** Slide-to-claim's 42px knob refills over 24 hours: the primary action, its
   disabled state, and the countdown are a single object rather than a button plus a label.

*(Runner-up: a global `letterSpacing: -0.94px` on every `Text` and heading line-heights pinned at ~1.056× — the
type is set like a poster, not like an app.)*
