# The W3 house style

*The register Thomas Pomarelle's W3+RIDE work is drawn in, as it exists in
`w3.pen` and in `frontend/src/editorial/w3/`. Written down 2026-08-24 from the
pen frames `kVACs` (08 CHALLENGES), `i3tIj` (13 PLAN) and `l4QUjL` (14 PLAN
ZIEL) — the three newest frames, which are where the language actually settled —
and from the W3+RIDE case study art direction.*

This is not a list of preferences. It is the small set of decisions that make a
W3 screen recognisable, and the specific ways a screen stops being one.

---

## 1. The ground, and what lies on it

**There is one ground and it runs the length of the page.** `T.bg` `#0B0B0B`.
Sections do not paint a background — a band that repaints the ground turns the
page into a stack of opaque surfaces instead of one surface with things on it,
and it cuts off any colour the top of the page takes from a hero.

**Cards are lit, not framed.** One tone (`lux()` → `T.heroDock`), a generous
radius (28), one soft shadow, and *no border*. Depth comes from a tone step and
from light. The moment a card draws its own edge, a screen of cards reads as a
stack of boxes.

**A tile inside a card is one step brighter** (`luxTile()` → `T.tile`, radius
20), never bordered. Curvature stays in the same family: a 20 inside a 28.

**Hairlines suggest, they do not state.** `hairline()` is `T.rule` at 0.55
opacity, used only where two blocks genuinely need separating. In an idiom with
no drawn edges, a divider at full weight becomes the loudest line on screen.

## 2. Colour is spent, not spread

`T.acid` `#BFFF3C` is the brand. It is a currency with a small budget:

- the one word the headline turns on,
- **one** hero numeral per card,
- the lit part of a meter,
- the primary action,
- the earned state of a thing you can earn.

That is the whole list. Two acid numbers competing inside one card is the most
common way a W3 screen goes wrong, and it reads as cheap immediately.

**A chapter may take a second accent.** Pen frame `kVACs` runs `01 — DAS
KOLLEKTIV` in acid and `02 — DEINE CREW` in violet, and the violet chapter's
eyebrow, bar *and* percentage all take it. One chapter, one accent, applied
consistently — not a rainbow of section colours.

**The text ladder is three rungs and only three:** `T.ink` states,
`T.mid` supports, `T.quiet` labels. Anything below `T.quiet` is invisible on
this ground; anything between rungs is a fourth grey nobody asked for.

**No raw hex, anywhere.** `editorial/__tests__/isolation.test.ts` enforces it.
`w3tokens.tsx` is the only palette. A tint invented at a call site is how a
design system grows a sixth blue.

## 3. Type: one family, five sizes, two weights of meaning

One family — Inter Tight (`FONT`). Every numeral that changes is `TNUM`.

| role | size / weight / tracking | colour |
|---|---|---|
| Display headline | 38–44 · 700 · −1.4 · lh 1.05 | ink **+ one acid word** |
| Hero numeral | 56–72 · 700 · −2.4 · tabular | acid (once per card) |
| Section title | 20–24 · 700 · −0.5 | ink |
| Body / support | 12–13 · 600 · lh 1.45 | mid |
| Chapter eyebrow | 10 · 700 · +1.4 · UPPER | the chapter's accent |
| Micro label | 8.5–9 · 700 · +0.9 · UPPER | quiet |

**The two-weight headline is the signature.** The sentence in `T.ink`, the one
word it turns on in `T.acid`, on its own line:

> Ziele mit
> **Auszahlung.**

The accented word is the *point of the page*, not merely its last word. It gets
a full stop; the first line does not.

**The hero numeral takes its unit at a third of its size**, sitting on the
baseline beside it — `47` big, `%` small. The unit is never the same size as
the number it belongs to.

## 4. The composition

Every W3 screen is the same five moves:

1. **Status bar → top bar.** Round glass buttons in the corners, a 10px
   uppercase micro title dead centre in `T.quiet`. The micro title names the
   screen so the display headline doesn't have to.
2. **The opening.** Eyebrow → two-weight headline → a deck of at most two lines
   in `T.mid`. *The page states its thesis before it shows a number.*
3. **The ledger.** Three columns, hairline verticals between them, a big value
   over a tiny quiet label. The entire page in three numbers.
4. **Numbered chapters.** `01 — `, `02 — `, `03 — `. The ordinal is the whole
   trick: it turns a stack of sections into a sequence with an end.
   **Chapters must not all be the same shape** — one hero card, one list, one
   grid. A page where every chapter is a card of rows is a page that reads as a
   settings screen.
5. **The close.** One full-width acid pill (uppercase near-black label + arrow),
   and one quiet caption under it saying what is waiting.

## 5. The hero card

The signature object. Radius 28, clipped, `lux`.

- **An art panel on top**, 170–200 tall, full-bleed, carrying its own light — a
  radial acid bloom behind an emblem, or a painted night sky. Not a photograph
  cropped into a box.
- **Glass pills float in its corners**: `● LIVE`, `9 TAGE ÜBRIG`, `12.480
  FAHRER`. Near-black at ~72% with a backdrop blur, 8.5px/700/+0.9 uppercase,
  radius 100. Two at most, in opposite corners.
- **The body reads top-down in one order**: title (22/700/−0.6) → the giant
  numeral → the meter → an **inset tile** carrying the single fact that matters,
  its label left behind an accent icon, its value right in the accent.

## 6. Meters

Two, and picking the wrong one is a real error.

- **Segment meter** — for a thing you can *count*: days of a month, badges of a
  set. Lit steps are 10px acid, unlit are 5px `T.d1` stubs, gap 3. Twenty
  notches cannot express 41%; don't ask them to.
- **Continuous bar** — for a *proportion*. 5–6px, `T.d1` track, accent fill,
  radius 100, with the percentage stated in text beside it.

Both grow from zero the first time they enter view (`useInView` / `Reveal`) and
**never re-animate**. A bar the rider has already read must not empty itself
when they scroll back up. Never `whileInView` — it resolves immediately in this
app and every bar is full before the rider arrives.

## 7. Motion

`EASE = [0.22, 1, 0.36, 1]`, 0.55s. Bands lift 14px and fade in, once. One slow
pulse is permitted on a single hero emblem and nowhere else. Everything checks
`prefers-reduced-motion`, and a reduced-motion rider gets *no* cross-fade
either — a reveal that still fades is still motion.

## 8. The honesty contract

This belongs in the style guide because in this app it is a visual rule.

- Every number resolves to a real value or to `DASH` (`—`). Never a plausible
  placeholder, never a rounded guess.
- A locked thing shows its *real* remaining distance, or it shows nothing.
- **A fabricated section does not get design polish — it gets deleted.** The
  Wins page carried invented community pools with cover art and a "top 8 % of
  the community" nobody computed. The fix was not a better gradient.

---

## Checklist before calling a W3 screen done

- [ ] One ground; no band paints its own background.
- [ ] No card has a border.
- [ ] Acid appears in at most one numeral per card.
- [ ] The headline is two weights, and the accented word is the page's point.
- [ ] Chapters are numbered and *differently shaped*.
- [ ] Every unit is smaller than its number.
- [ ] Segment meter for countables, continuous bar for proportions.
- [ ] No raw hex (`npx vitest run src/editorial/__tests__/isolation.test.ts`).
- [ ] Every number is real or `—`.
- [ ] Rendered at 390×844 and looked at, not just type-checked.
