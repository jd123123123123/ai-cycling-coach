# Stage-Hintergründe: Prompt, Szenen, Aufdeckung

Für Codex. Drei Teile: **§1 der Prompt**, mit dem die Hintergründe entstehen, **§2 die Szenen**,
**§3 wie eine Platte im Produkt aufgedeckt wird**. Alles hier ist aus den Skripten gelesen, mit
denen die geprüften Bilder tatsächlich gerendert wurden — nicht abgetippt.

Modell `gemini-3.1-flash-image`, **2K**, **9:16**, gespeichert 1080 × 1935.
Aufruf: `cyclr_studio.edit_image(bike_b64, prompt, key, aspect=cyclr_studio.STAGE_ASPECT)`.
Das Rad geht als **Bild** hinein und wird im Prompt bewusst **nicht** beschrieben — es noch
einmal zu beschreiben lädt das Modell ein, genau das neu zu zeichnen, was pixelgleich bleiben muss.

---

## 1 · Der Prompt

### 1.1 Die Bauteile und ihre Reihenfolge

```
bike_build.edit_prompt([], world=<PROSA>, tier=<SPROSSE>)
  + ENVY_CUES            immer
  + DEADPAN              immer
  + INCIDENT             nur wenn im Bild wirklich etwas passiert
  + MOON_STRUCTURE       nur für Analogie A4 (der Beamte im Sublimen)
  + MOTOR_C              nur für Kurios-Karten (der Ernst ist der Witz)
  + REAL_PLACE           immer
  + RITUAL  ODER  UNTOUCHED    RITUAL nur, wenn der Ort dem Rad etwas hinlegt
  + ILLUSTRATES.format(cond=<BEDINGUNG IN EINEM SATZ>)
  + NO_DISPLAY           immer
```

Längen des zusammengesetzten Prompts, am Beispiel „Die Waschstraße":

```
  bike_build.edit_prompt       8976 Zeichen
  ENVY_CUES                     260 Zeichen
  DEADPAN                       250 Zeichen
  INCIDENT                      299 Zeichen
  MOON_STRUCTURE               1657 Zeichen
  ILLUSTRATES                   354 Zeichen
  UNTOUCHED                     283 Zeichen
  NO_DISPLAY                    493 Zeichen
                             ─────────
  gesamt                     12643 Zeichen / 2179 Wörter
```

Der Löwenanteil ist `bike_build.edit_prompt` — dort stehen Kamera, Rahmen­komposition,
Lichtführung, die Sprossen-Register (`TIER_INTENSITY`) und die `no_additions`-Klausel, die
verhindert, dass dem Rad Flaschenhalter oder Taschen angedichtet werden.

### 1.2 Der vollständige Prompt, wie er gesendet wurde

Das ist wörtlich der String, mit dem die Waschstraße entstanden ist — Sprosse `ernsthaft`,
Analogie A1, mit `INCIDENT` (Bürsten drehen, Wasser läuft) und `MOON_STRUCTURE` (die Saugsäule
als kommunales Objekt).

```text
Take the bicycle from the supplied photograph and put it somewhere new. Keep the SAME BICYCLE — the same frame geometry and proportions, the same paint and finish, the same decals and lettering, the same wheels, tyres and components, seen from the same side. Its SIZE AND PLACEMENT IN THE FRAME ARE NEW, because it now has to stand on real ground: scale it to a believable bicycle in that landscape, which is smaller than it appears in the source photograph, and position it where the instructions below say. Change ONLY the components listed below and leave every other part of the bicycle exactly as it is.



EVERY LISTED PART IS BRAND NEW AND MUST BE FITTED COMPLETELY: clean and uniform over its whole surface, with none of the old part's wear showing through it. A rider paid for these, so a half-applied or patchy result is wrong. Anything NOT listed keeps its existing condition and character.

INTEGRATION MANDATE: every fitted part MUST be structurally integrated into the bicycle's mechanical design. Nothing may float, look pasted on, or keep parts belonging to its previous form. Mounting hardware, brackets, bolts, cable runs and straps must be present and physically plausible, scaled correctly to this frame, and finished so the part looks like it was built for this bicycle. A part that merely hovers in roughly the right place is wrong.

The result must be a photograph of one coherent, physically correct bicycle: new wheels sit in the existing dropouts, a new handlebar on the existing steerer, bags strapped to real mounting points. LOCKED CAMERA: a FLAT SIDE ELEVATION of the bicycle — an orthographic side view, as in a manufacturer's catalogue photograph or a technical drawing. The camera sits exactly level with the bike's centre, perfectly perpendicular to it, with a long lens and no perspective at all.
THE TEST FOR THIS IS THE WHEELS: both are perfect circles of IDENTICAL size, and neither is an ellipse. If the far wheel looks smaller than the near one, or you can see any of the bike's width — the far side of the bars, the far crank, the top of the saddle, the far side of the tyres — the camera has rotated and the render is wrong. From this angle the bicycle is a flat silhouette with no depth showing.
It is seen from its DRIVE SIDE (the right-hand side, so the chainring, chain and rear cassette face the camera) and faces to the RIGHT of frame, centred with clean even padding, nothing cropped. Stand the bicycle, upright and side-on, in this setting: the inside of an automatic car wash, mid-cycle — the bicycle standing on the wet grooved concrete of the wash bay, an enormous soft blue-and-magenta cloth roller brush SPINNING just behind it and FLINGING water and foam outward, sheets of white foam RUNNING down the wet tiled side walls, jets of water crossing overhead in the spray-lit air, a wide rubber curtain hanging at the far end with a slot of bright daylight beyond it, coloured service lamps glowing through the mist, and standing water on the concrete throwing every one of those colours back up. Saturated car-wash blue, magenta highlights, wet concrete grey.
THE MUNICIPAL OBJECT: standing on the wet concrete immediately beside the bicycle, one ordinary coin-operated vacuum post — the squat yellow pedestal with a thick corrugated hose coiled on a hook that stands in every petrol-station forecourt — its yellow paint sun-faded to cream and scuffed down to primer along its base, the hose split and taped, standing in a puddle
BOTH TYRES ARE ON THE GROUND AND BEARING THE WEIGHT. Each contact patch is visibly flattened where the rubber meets the surface, and the surface reacts to it — grit displaced, grass bent and splayed around the tyre, dust pressed down. Directly under each contact patch the light is fully occluded: a tight, nearly black core no wider than the tyre, spreading outward into a soft cast shadow thrown by the key light. Loose material from the ground — blades of grass, grit, a fallen leaf — overlaps the bottom edge of each tyre, so the bicycle is IN the scene rather than pasted over it. There is NO gap, NO floating, and NO uniform grey smudge standing in for a shadow.
The light on the bike matches the light of the place. Everything within that lit pool is ALIVE and deeply saturated — foliage a rich luminous green, real bounce light picking colour off the ground and throwing it back onto the underside of the frame and rims — while the world past it falls away into darkness. Abundant and rewarding to look at, like a jewel lit in a dark room; never dim, flat, washed-out or muddy. There is nobody in the picture: the bicycle stands alone. Premium, high-fidelity 3D render in a warm animated-feature style — richly detailed, beautifully lit and genuinely expensive-looking. Smooth matte materials with subtle surface texture, soft rounded forms, physically-based shading, ray-traced global illumination, gentle ambient occlusion in the creases and a real depth of field. Confident saturated colour under controlled cinematic lighting. NOT a flat vector illustration, NOT a cheap plastic toy render, NOT a cartoon. The bicycle MUST be an isolated, standalone object with NO rider, NO hands, and NO human figures present in the image. It must maintain perfect mechanical geometry but with slightly chunky, premium proportions to match the 3D toy aesthetic. CRITICAL: The wheels and spokes MUST be perfectly sharp, crisp, and static. NO motion blur, NO spinning effect. THE LIGHT IS THE REWARD — this must feel like ARRIVING somewhere, not like documenting a place. Within whatever hour the scene already has: the scene's own key light lays a bright rim along the top tube, the saddle, the bars and the upper curve of both tyres so the bicycle separates from its ground in a clear edge, and throws its shadow LONG across the ground toward the camera. The distance recedes in several clearly separated planes so the depth reads as enormous. A soft bloom on the brightest edges, rich specular highlights across the paint and every polished component, deep saturated luminous colour with TRUE BLACKS — never milky. THE BICYCLE MUST NOT FALL INTO SILHOUETTE: a large soft bounce from the camera side, in the scene's own colour of light, fills its drive side so the frame colour, the decals, the drivetrain and the hubs stay clearly legible and richly detailed while the rim light still separates it. The machine is the brightest, most detailed and most desirable object in the frame. THE LANDMARK IS THE PROOF: whatever names this place is LARGE and PROMINENT, lit by the scene's own light and standing clear of the bicycle's silhouette rather than hidden behind it. COMPOSITION — THIS IMAGE IS A BACKGROUND WITH INTERFACE DRAWN OVER IT, and its left and right edges will be cropped by about a fifth. Treat these four as measurements, not preferences: (1) The bicycle spans NO MORE THAN 60% of the image width, centred horizontally, leaving at least 20% of the width as empty ground and air beyond EACH wheel. (2) The tyres meet the ground at about 72% of the image HEIGHT — low in the frame, near the front of the scene, not floating in the middle of it. (3) The top third of the frame, in a wide central column, is EMPTY SKY or empty distance: a portrait is drawn over it, so no landmark, peak or tower may stand there. Put whatever names the place to the LEFT or the RIGHT of that column. (4) Nothing that matters sits within the outer eighth of the frame on either side. KEEP THE HOUR AND THE WEATHER THE SETTING ABOVE DESCRIBES: if it names night, rain, frost or first light, that is the hour, and nothing below may override it. Where the setting names no particular hour, choose the most beautiful light that place can have. ABSOLUTELY CRITICAL — NO THIRD-PARTY INTELLECTUAL PROPERTY ANYWHERE IN THE IMAGE: no film, game or television characters, no movie posters, no album covers, no book jackets, no team kit, no sponsor boards, no brand logos or wordmarks of any kind on any wall, screen, sign, poster, packaging or vehicle. Walls, screens and signage are blank, abstract or bear only invented, unreadable marks. The ONLY branding permitted anywhere is what is already printed on the bicycle in the source image. If a surface would naturally carry a poster or a logo, leave it empty. REGISTER — REAL PLACE, REAL WEATHER, PROPER LIGHT. Somewhere a committed rider actually goes, at an hour worth photographing: directional light, weather with character, honest atmosphere and depth. Striking, and entirely possible. Still no event, still nothing impossible. ABSOLUTELY CRITICAL — ADD NOTHING TO THE BICYCLE: no bottle cages, no water bottles, no frame bag, no saddle bag, no top-tube bag, no lights, no computer, no pump, no mudguards, no luggage and no accessory of any kind that is not already present in the source image. Reproduce the machine exactly as given — same frame, same components, same decals — adding nothing and removing nothing. Only the SETTING and the LIGHTING change. IT MUST WORK AT THUMBNAIL SIZE: one clear subject, one clear idea, enormous tonal separation between the machine and its ground. IT MUST OWN ONE COLOUR — a single dominant hue across the large areas, every other object a tonal variation of it or near-neutral. REGISTER — PLAY IT COMPLETELY STRAIGHT. A serious, expensive, immaculately lit photograph shot as a premium campaign still. Nothing cartoonish, nothing exaggerated, nothing winking at the viewer, no comic styling. Total material fidelity throughout. THE SCENE IS MID-SOMETHING: at least FIVE things going on besides the bicycle at THREE DEPTHS — close to the lens and out of focus, at the machine's own distance, receding far behind — and at least TWO of them IN MOTION, caught by the shutter. The ground immediately around the bicycle stays clear. THE JOKE OF THIS PICTURE IS BUILT FROM EXACTLY TWO THINGS AND THEY MUST NOT BE BLENDED. FIRST, the setting keeps its FULL, UNREDUCED GRANDEUR — it is genuinely sublime and it is photographed with complete reverence, exactly as it would be if nothing funny were in it. SECOND, standing in that setting is ONE SINGLE PIECE OF ORDINARY MUNICIPAL STREET FURNITURE, described below, of the most banal administrative kind — the sort of object a local council installs and then sends somebody to maintain. IT IS THERE TO SERVE THE BICYCLE OR ITS RIDER, which is the entire point: somebody, at some institution, decided that this place needed provision for a cyclist, and arranged it. IT LOOKS OLD AND LOOKED-AFTER: weathered, faded, scuffed, a little corroded, with the specific wear of an object that has stood outdoors for fifteen years and been repainted once. It is not new, not shiny and not a prop. That wear is what turns a prank into a policy and it is the funniest thing in the frame. HOW IT IS EMPHASISED — AND UNDER-EMPHASISED. It is SMALL in the frame and completely UNMISSABLE: a detail rather than the subject, never centred, never enlarged, never spotlit, standing just beside the bicycle at the bicycle's own distance from the camera so the two obviously belong together. It is lit by the scene's own light with exactly the same seriousness as everything else. There is ONLY ONE of it — no second joke, no other street furniture, no collection of civic objects. NOTHING IN THE PICTURE ACKNOWLEDGES IT. The composition does not point at it, the light does not favour it, and it carries no writing of any kind. The render must not know it is a joke. THE PICTURE HAS TO SHOW THE CONDITION THE RIDE WAS RIDDEN IN, in the air and on the ground rather than in any caption: water — everything wet, everything running, nothing dry anywhere in the frame — visible in the light, in the temperature of the colour, in what the surface is doing and in what the atmosphere is doing, so that somebody who sees the picture understands what was survived before anybody tells them a number. NOTHING IS PLACED ON THE BICYCLE AND NOTHING IS DRAWN ON IT — no cloth, no strap, no tag, no ribbon, no face, no eyes, nothing resting on or hanging from any part of it, and it is not locked or chained to anything. It stands on its own, upright on both wheels, completely unchanged. NO DISPLAY SURFACE ANYWHERE: no screen, no notice board, no framed picture, no poster, no plaque, no inscription, no sign and no illuminated board, and no large blank wall plane or gap in the composition where one could stand. No writing, no numbers and no lettering on any surface — including on the municipal object itself — except what is already printed on the bicycle. No proper nouns are depicted. Nobody is present and nobody is depicted in any image, statue, silhouette or reflection.
```

### 1.3 Die Klauseln einzeln

**`REAL_PLACE` — der Ort muss existieren.** Die Regel, an der zwei Ideen gestorben sind: eine
gebäudegroße Wasserwaage (ein Gegenstand auf Landschaftsgröße ist Cartoon-Logik) und dreißig
Gartenzwerge (eine gestellte Menge ist Unordnung).

```text
THIS IS A REAL PLACE THAT EXISTS AND IT IS PHOTOGRAPHED STRAIGHT. Everything in it is at its
true size, in its true material, at a believable distance from a camera standing on the floor:
an ordinary photograph of somewhere a person could actually walk into today. The humour comes
entirely from a bicycle being in this particular real room, and from what this room does to a
guest — never from anything being enlarged, shrunk, multiplied, staged or arranged for the
picture.
```

**`RITUAL` — genau ein geliehener Gegenstand des Ortes.** Ersetzt `UNTOUCHED`, wo der Ort dem
Rad etwas hinlegt: Handtuch über dem Sattel, Leihschuhe über dem Lenker, Spanngurt auf dem
Oberrohr. Die Grenze ist **nicht** „auf dem Rad / nicht auf dem Rad", sondern *behauptet es
Besitz?* Ein Flaschenhalter tut das, ein Handtuch nicht.

```text
THE MACHINE IS A GUEST HERE, AND IT IS TREATED LIKE ONE. Exactly ONE object that belongs to
THIS PLACE — the one this place hands to everybody who comes in, described below — rests on
the bicycle, laid there naturally by somebody's hand, hanging with its own weight and with its
own creases and dampness. It is the PLACE'S object, borrowed, never the rider's equipment: no
bottle cage, no bag, no light, no computer, no pump, no mudguard and no accessory of any kind
is fitted to the machine, and nothing is bolted, strapped or locked to it. That single
borrowed object covers only a small part of the machine and leaves its frame shape, its paint
and every one of its decals fully visible and fully recognisable. The bicycle still stands
upright on both wheels, unchanged, and the joke is only that this place has treated a bicycle
exactly the way it treats a person.
```

**`UNTOUCHED` — für alle Szenen ohne Ritual.**

```text
NOTHING IS PLACED ON THE BICYCLE AND NOTHING IS DRAWN ON IT — no cloth, no strap, no tag, no
ribbon, no face, no eyes, nothing resting on or hanging from any part of it, and it is not
locked or chained to anything. It stands on its own, upright on both wheels, completely
unchanged.
```

**`MOON_STRUCTURE` — nur für A4.** Erhabener Ort plus ein einziges verwittertes Stück
Behördenmobiliar, das dem Radfahrer dient. Die Verwitterung ist wichtiger als der Gegenstand:
neu ist ein Streich, alt ist eine Verordnung.

```text
THE JOKE OF THIS PICTURE IS BUILT FROM EXACTLY TWO THINGS AND THEY MUST NOT BE BLENDED. FIRST,
the setting keeps its FULL, UNREDUCED GRANDEUR — it is genuinely sublime and it is
photographed with complete reverence, exactly as it would be if nothing funny were in it.
SECOND, standing in that setting is ONE SINGLE PIECE OF ORDINARY MUNICIPAL STREET FURNITURE,
described below, of the most banal administrative kind — the sort of object a local council
installs and then sends somebody to maintain. IT IS THERE TO SERVE THE BICYCLE OR ITS RIDER,
which is the entire point: somebody, at some institution, decided that this place needed
provision for a cyclist, and arranged it. IT LOOKS OLD AND LOOKED-AFTER: weathered, faded,
scuffed, a little corroded, with the specific wear of an object that has stood outdoors for
fifteen years and been repainted once. It is not new, not shiny and not a prop. That wear is
what turns a prank into a policy and it is the funniest thing in the frame. HOW IT IS
EMPHASISED — AND UNDER-EMPHASISED. It is SMALL in the frame and completely UNMISSABLE: a
detail rather than the subject, never centred, never enlarged, never spotlit, standing just
beside the bicycle at the bicycle's own distance from the camera so the two obviously belong
together. It is lit by the scene's own light with exactly the same seriousness as everything
else. There is ONLY ONE of it — no second joke, no other street furniture, no collection of
civic objects. NOTHING IN THE PICTURE ACKNOWLEDGES IT. The composition does not point at it,
the light does not favour it, and it carries no writing of any kind. The render must not know
it is a joke.
```

**`MOTOR_C` — für Kurios.** Belangloses mit vollem Ernst behandeln; das Bild darf nicht wissen,
dass die Leistung klein war.

```text
REGISTER — THE PICTURE DOES NOT KNOW THE ACHIEVEMENT WAS SMALL. It is photographed with
complete, unironic grandeur: the scale monumental, the light reverent, the craft that of an
expensive campaign still. Every surface is materially honest and every proportion is serious.
Nothing in the frame is comic, cartoonish, tilted, exaggerated or winking; no part of the
composition acknowledges that anything is funny. The humour lives entirely OUTSIDE the image,
in the gap between this ceremony and what earned it, and the render's job is to hold the
ceremony perfectly straight.
```

**`ENVY_CUES`**

```text
IT MUST WORK AT THUMBNAIL SIZE: one clear subject, one clear idea, enormous tonal separation
between the machine and its ground. IT MUST OWN ONE COLOUR — a single dominant hue across the
large areas, every other object a tonal variation of it or near-neutral.
```

**`DEADPAN`**

```text
REGISTER — PLAY IT COMPLETELY STRAIGHT. A serious, expensive, immaculately lit photograph shot
as a premium campaign still. Nothing cartoonish, nothing exaggerated, nothing winking at the
viewer, no comic styling. Total material fidelity throughout.
```

**`INCIDENT`**

```text
THE SCENE IS MID-SOMETHING: at least FIVE things going on besides the bicycle at THREE DEPTHS
— close to the lens and out of focus, at the machine's own distance, receding far behind — and
at least TWO of them IN MOTION, caught by the shutter. The ground immediately around the
bicycle stays clear.
```

**`ILLUSTRATES`** — `{cond}` ist die Bedingung in einem Satz, z. B. *„water — everything wet,
everything running, nothing dry anywhere in the frame"*.

```text
THE PICTURE HAS TO SHOW THE CONDITION THE RIDE WAS RIDDEN IN, in the air and on the ground
rather than in any caption: {cond} — visible in the light, in the temperature of the colour,
in what the surface is doing and in what the atmosphere is doing, so that somebody who sees
the picture understands what was survived before anybody tells them a number.
```

**`NO_DISPLAY` — Pflicht.** Ohne sie kommt Schrift ins Bild. Real passiert: „COSMIC VOID",
„ETERNAL GULF", „SUPERMARKET", „KREISSÄGE". Auslöser sind Eigennamen in der Prosa und
Gattungsangaben wie „galaxies and nebulae" — Weltraumgrafik ist beschriftet.

```text
NO DISPLAY SURFACE ANYWHERE: no screen, no notice board, no framed picture, no poster, no
plaque, no inscription, no sign and no illuminated board, and no large blank wall plane or gap
in the composition where one could stand. No writing, no numbers and no lettering on any
surface — including on the municipal object itself — except what is already printed on the
bicycle. No proper nouns are depicted. Nobody is present and nobody is depicted in any image,
statue, silhouette or reflection.
```

### 1.4 Zwei Fallen in der Prosa

- **Farbfolgen.** „orange durch rosé nach grün" liest sich als Verlaufstafel — der erste
  Salzspiegel bekam drei harte senkrechte Bänder. Himmel als **Lichtverhalten** beschreiben:
  „eine einzige durchgehende Abstufung, ohne Kanten".
- **Gegenstände als Fläche.** Die Wasserwaage war „Rad auf gelbem Streifen", bis Dicke, gefräste
  Flanke und ein sichtbares Ende dazukamen.

### 1.5 Der Tausch: eine Szene, viele Fahrer

Pro Fahrer neu zu rendern kostet die Szene (gemessene Umgebungsdrift **55,2**). Statt dessen ein
**kanonisches Rendering je Szene**, und für jeden weiteren Fahrer gehen *Zielbild + dessen Rad*
in einen Tausch. Gemessene Drift **1,7 – 7,9**. Sampling `{'temperature': 0.0, 'top_k': 1.0}` — Determinismus gibt es
bei diesem Modell **nicht**.

```text
You are given two photographs. The FIRST is a finished picture of a bicycle standing in a
place. The SECOND is a different bicycle, photographed alone against a plain background.
Return the FIRST photograph with its bicycle replaced by the bicycle from the SECOND
photograph. Keep everything else in the image exactly the same, preserving the original style,
lighting and composition: the same place, the same ground, the same sky, the same weather, the
same objects in the same positions, the same colour grade, the same camera, the same crop and
the same aspect ratio. The first photograph is the authority for the world. THE MACHINE IS THE
ONE FROM THE SECOND PHOTOGRAPH, REPRODUCED 1:1. Its frame geometry is copied exactly: the same
frame shape and tube profiles, the same head and seat angles, the same wheelbase, the same
stack and reach, the same saddle height and setback, the same handlebar shape, width and drop,
the same crank length and chainring size, the same rim depth, the same tyre width and tread.
Its finish is copied exactly: its own paint, its own gloss or matte, its own decals at their
own size in their own places, its own components and their own colours. It carries exactly the
parts the second photograph shows and no others. It is recognisably that exact bicycle, and a
rider who owns it would identify it immediately. IT STANDS WHERE THE PREVIOUS BICYCLE STOOD:
the same position in the frame, the same size, its tyres meeting the ground at the same
contact points, upright on both wheels, seen from its drive side with the chainring and
cassette facing the camera and pointing to the right of frame. Physically it rests on that
surface with its own weight, both tyres in real contact. THE SCENE'S OWN LIGHT FALLS ON IT,
and that is the only thing about it that comes from the first photograph: the same key
direction and hardness, the same colour temperature, the same rim light along its upper edges,
the same bounce from this ground onto its underside, the same reflections this place would put
on its paint, and its own cast shadow lying across this surface exactly where the previous
shadow lay and shaped by this machine's own silhouette. ITS SURFACES ARE IN THE SAME STATE AS
THE BICYCLE IT REPLACES: as clean, or as dusty, or as wet, to the same degree and in the same
places, reading the first photograph for that and matching it exactly.
```

**Der letzte Absatz ist eine Korrektur.** Eine frühere Fassung verlangte „der Ort markiert das
Rad" — daraufhin hat das Modell auf dem Mond, wo das Original ein sauberes Rad zeigt, **Staub
erfunden**. Die Regel heißt: *das Zielbild entscheidet.* Reif auf den Felgen entsteht im
kanonischen Rendering, nie im Tausch.

---

## 2 · Die Szenen

50 Stück. `A0` kein Witz nur der Ort · `A1` ein Gewerbe verkauft dasselbe · `A2` das Rad
sitzt, wo ein Mensch sitzt · `A3` echt unter Attrappen · `A4` die Behörde war da · `A5` die Zahl
als Gegenstand.

| Szene | Sprosse | Bedingung | Analogie | Gerendert | Erkennungszeichen bei 120 px |
|---|---|---|---|---|---|
| Die Einfahrt | I alltag | 50 km Feierabendrunde | A0 | ✓ | Hecke, Tonne, Abendgold |
| Der Balkon | I alltag | Unter 20 km | A0 |  | Wäschespinne und Geranien |
| Die Backstube | I alltag | Vor 5 Uhr losgefahren | A1 |  | Glühende Ofenmäuler, weiße Bleche |
| Die Tankstelle | I alltag | Nach 22 Uhr losgefahren | A1 |  | Helle Lichtwanne im Schwarzen |
| Der Trockenraum | I alltag | Nass, unter 40 km | A2 |  | Reihe nasser Trikots, Dampf |
| Der Waschsalon | I alltag | Erste Fahrt im Regen | A1 |  | Wand aus drehenden Bullaugen |
| Der Schulhof-Radstand | I alltag | Mit der Crew | A3 |  | Reihe gleicher Lenker |
| Der Liegestuhl | I alltag | Ruhetag gehalten, wie geplant | A2 |  | Liege, Handtuch, Poolreflexe |
| Der Bahnübergang | I alltag | Unter 30 km | A5 |  | Rot-weiße Schranke quer im Bild |
| Die Waschanlage | II ernsthaft | Regen über zwei Stunden | A1 | ✓ | Magenta-blaue Bürsten — der Maßstab |
| Das Planetarium | II ernsthaft | Im Dunkeln gefahren | A1 |  | Sternenkuppel über Sesselreihen |
| Die Kegelbahn | II ernsthaft | 60 km mit unter 20 hm | A5 |  | Gerade Dielen zu hellen Kegeln |
| Der Billardtisch | II ernsthaft | 40 km mit unter 15 hm | A5 |  | Grüner Filz und Kugellampe |
| Die Fähre | II ernsthaft | Mit der Crew, über 80 km | A3 |  | Reihe Räder, helles Rechteck Meer |
| Der Blitzer | II ernsthaft | Schnitt über 35 km/h | A4 |  | Greller Blitz, grauer Kasten |
| Das Solarium | II ernsthaft | Über 30 °C | A2 |  | Violette Röhrenwand |
| Der Sessellift | II ernsthaft | Über 1 000 hm | A2 |  | Rad im Liftsessel über weißem Grund |
| Die Eistonne | II ernsthaft | Unter 5 °C | A2 |  | Eiswürfel im Wasser, weiße Fliesen |
| Der Windkanal | II ernsthaft | Schnitt über 32 km/h | A1 |  | Waagerechte Rauchfäden |
| Der Schuhputzautomat | II ernsthaft | Schotter unter 40 km | A1 |  | Drehende schwarze Bürstenwalzen |
| Die Massageliege | II ernsthaft | Ruhetag über zwei Stunden | A2 |  | Liege mit Papierbezug, Ölfläschchen |
| Der Autoscooter | II ernsthaft | Unter 5 km mit der Crew | A1 |  | Funken am Blechhimmel |
| Die Sauna | III selten | Über 35 °C | A1 |  | Honigholz und weißes Handtuch |
| Die Kryokammer | III selten | 0 °C oder kälter | A1 |  | Blauweißer Nebel über Stahl |
| Das Indoor-Studio | III selten | IF 0,95 oder höher | A3 |  | Violette Spots über Reihen gleicher Räder |
| Hau den Lukas | III selten | IF 0,92 ohne Leistungsmesser | A5 |  | Beleuchteter Turm mit Glocke oben |
| Der Salzspiegel | III selten | Nass und flach | A4 | ✓ | Das Rad zweimal, Naht in der Mitte |
| Der Kühlturm | III selten | 150 km im Dunkeln | A4 |  | Heller Kreis hoch über Beton |
| Das Moorbad | III selten | Schotter über 60 km | A1 |  | Schwarze Wanne, grünweiße Fliesen |
| Das Hotelbett | III selten | Über fünf Stunden | A2 |  | Weiße Bettdecke ums Rad |
| Der Kinosaal | III selten | Über sechs Stunden | A1 |  | Rote Sesselreihen, Staub im Lichtkegel |
| Die Rolltreppe | III selten | 15 % über einen Kilometer | A2 |  | Steil aufsteigende Stufenflucht |
| Der Bambusdom | III selten | Schotter über 80 km | A0 |  | Grüne Säulenhalle |
| Die Reisterrassen | III selten | 2 500 hm mit 20 % Rampe | A0 |  | Hundert gestufte Spiegel |
| Das Gewächshaus | III selten | Über 38 °C im Dunkeln | A1 |  | Beschlagene Glaskuppel von innen |
| Der Mond | IV legendaer | 5 000 Höhenmeter | A4 | ✓ | Graue Fläche, schwarzer Himmel, blauer Punkt |
| Die Schanze | IV legendaer | Rampe über 20 % | A4 |  | Weiße Spur, die steil ins Bild kippt |
| Die Hölle | IV legendaer | Über 40 °C und über 100 km | A4 |  | Orangeglut von unten, schwarzer Fels |
| Die Düne | IV legendaer | 100 km über 35 °C | A4 |  | Eine Kante quer durchs Bild, alles Sand |
| Im Gewitter | IV legendaer | Nass bei IF über 0,9 | A0 |  | Blitz im Einschlag, alles seitlich beleuchtet |
| Die Startrampe | IV legendaer | 200 km | A4 |  | Gitterturm und Dampf über Beton |
| Die Staumauer | IV legendaer | 3 000 Höhenmeter | A4 |  | Senkrechter Betonabsturz |
| Die Sternwarte | IV legendaer | Nacht über 120 km | A1 |  | Offener Kuppelspalt mit Sternen |
| Der Rand der Welt | V mythisch | 300 km in einer Fahrt | A4 | ✓ | Rad auf einer Kante, dahinter Sterne statt Land |
| Das Nordlicht | V mythisch | Nachts unter −10 °C | A0 |  | Grünes Band am Himmel, zweimal |
| Das Meeresleuchten | V mythisch | Nachts über 150 km | A0 |  | Leuchtend blaue Linie im Schwarzen |
| Die Stratosphäre | V mythisch | Everesting — 8 848 hm | A4 |  | Gekrümmter Horizont, schwarzer Himmel |
| Der Gletschertunnel | V mythisch | Unter −10 °C und 2 000 hm | A4 |  | Blau leuchtendes Eis von allen Seiten |
| Die Finsternis | V mythisch | Ereignis, an einem echten Datum | A0 |  | Schwarze Scheibe mit weißem Kranz |
| Das Karussell | V mythisch | Unter 5 km | A1 |  | Glühbirnenkranz und bemalte Pferde |

**Der Daumennagel-Test:** bei 120 px muss *ein* Erkennungszeichen die Bedingung tragen. Die
Waschanlage besteht ihn allein durch die magenta-blauen Bürsten. Eine *Stimmung* besteht ihn
nie — daran sind „Roter Bereich" und „Nach Gefühl" gescheitert.

---

## 3 · Wie eine Platte aufgedeckt wird

Der Moment gehört auf die Feier-Seite (`W3RideCelebrateView`), die schon existiert und beim Wisch
wirklich bucht (`POST /rewards/ride/:id/claim`). Ihre eigene Doktrin gilt weiter: **violett ist
ein Versprechen, lime ist eine Quittung**, und *„sealed shows nothing"* — vor dem Wisch steht
`?` an der Stelle der Zahl. Der Ort folgt derselben Regel: **genannt wird, warum ein Ort wartet
und wie selten er ist — nie welcher.**

### 3.1 Vorbereitung: vier Ebenen statt einer Leinwand

Die Auflösung läuft **ohne JavaScript**. Beim Speichern eines Renderings werden neben der
scharfen Platte drei vorgerasterte Fassungen erzeugt:

```python
from PIL import Image
src = Image.open(plate).convert("RGB")          # 1080 × 1935
for blk in (28, 14, 6):                          # Blockgröße in px
    small = src.resize((max(1, src.width // blk), max(1, src.height // blk)), Image.BOX)
    small.resize(src.size, Image.NEAREST).save(f"{key}-px{blk}.webp", quality=92)
```

Gemessen: Block 28 ≈ 9 kB, Block 14 ≈ 22 kB, Block 6 ≈ 72 kB, scharf ≈ 128 kB. Die groben
Ebenen kosten fast nichts, weil sie fast nur Flächen sind.

Im Markup liegen sie **übereinander**, scharf zuunterst:

```html
<div class="win">
  <img class="base" src="{plate}">
  <img class="l l6"  src="{plate-px6}"  alt="" aria-hidden="true">
  <img class="l l14" src="{plate-px14}" alt="" aria-hidden="true">
  <img class="l l28" src="{plate-px28}" alt="" aria-hidden="true">
</div>
```

### 3.2 Die Abfolge, 9-Sekunden-Schleife

| Zeit | % | Was passiert |
|---|---|---|
| 0 – 1,0 s | 0 – 11 | Die Kiste steht. Naht und Markenzeichen glimmen schwach. |
| 1,0 – 2,2 s | 11 – 24 | **Zittern** in drei Stößen, jeder stärker. Naht und Zeichen glühen auf. |
| 2,2 s | 24,4 | **Einatmen** — Maßstab 1,14, Halo hell. |
| 2,3 s | 25,6 | **Platzen**: Deckel fliegt, 8 Splitter, 2 Ringe, ein Blitz. Haptik. |
| 2,3 – 3,6 s | 25,6 – 40 | **Auflösung** 28 → 14 → 6 → scharf, dazu Sättigung 0,34 → 1, Helligkeit 0,5 → 1, Maßstab 1,05 → 1. |
| 3,6 – 4,2 s | 40 – 47 | Fassung und Text ziehen von unten ein. |
| 4,2 – 7,6 s | 47 – 84 | Stand. Glanzstreifen läuft zweimal über die Platte. |
| 7,6 – 8,4 s | 84 – 93 | Karte geht, Kiste kommt zurück. |

### 3.3 Die Keyframes, wörtlich

```css
/* Die Kiste: ruhen, zittern, einatmen, platzen. Prozente beziehen sich auf 9 s. */
@keyframes boxLife{
  0%{opacity:1;transform:none} 11%{transform:none}
  12%{transform:translate(-4px,1px) rotate(-2.2deg)}
  13.2%{transform:translate(4px,-1px) rotate(2.4deg)}
  14.4%{transform:translate(-3px,0) rotate(-1.6deg)}
  15.6%{transform:translate(3px,1px) rotate(1.8deg)}
  16.8%{transform:none}
  17.8%{transform:translate(-6px,2px) rotate(-3deg)}
  18.8%{transform:translate(6px,-2px) rotate(3.2deg)}
  19.8%{transform:translate(-5px,1px) rotate(-2.6deg)}
  20.8%{transform:translate(5px,-1px) rotate(2.8deg)}
  21.6%{transform:translate(-7px,2px) rotate(-3.6deg) scale(1.02)}
  22.4%{transform:translate(7px,-2px) rotate(3.8deg) scale(1.04)}
  23.2%{transform:translate(-5px,1px) rotate(-2.4deg) scale(1.06)}
  24.4%{transform:translateY(-7px) rotate(0) scale(1.14);opacity:1}
  25.6%{transform:translateY(-16px) scale(1.62);opacity:0}
  95%{opacity:0;transform:scale(.86)} 100%{opacity:1;transform:none}}

/* Die Auflösung: drei Ebenen gehen der Reihe nach, die scharfe bleibt. */
@keyframes l28{0%,26.6%{opacity:1} 30%{opacity:0} 100%{opacity:0}}
@keyframes l14{0%,29.5%{opacity:1} 33.5%{opacity:0} 100%{opacity:0}}
@keyframes l6 {0%,33%{opacity:1}   38.5%{opacity:0} 100%{opacity:0}}
@keyframes dev{0%,25.6%{filter:saturate(.34) brightness(.5)} 40%{filter:none} 100%{filter:none}}

/* Deckel, Splitter, Ringe, Blitz */
@keyframes lidFly{0%,24.4%{opacity:0;transform:none}
  25.2%{opacity:1;transform:translateY(-10px)}
  33%,100%{opacity:0;transform:translateY(-190px) rotate(-26deg)}}
@keyframes shard{0%,24.8%{opacity:0;transform:scale(.4)} 26%{opacity:1;transform:scale(1)}
  34%,100%{opacity:0;transform:translate(var(--tx),var(--ty)) rotate(var(--r)) scale(.15)}}
@keyframes ring{0%,24.8%{opacity:0;transform:scale(.3)} 26%{opacity:.95;transform:scale(.55)}
  34%,100%{opacity:0;transform:scale(2.5)}}
@keyframes flash{0%,24.6%{opacity:0} 25.6%{opacity:.92} 30%,100%{opacity:0}}

/* Karte und Text */
@keyframes cardIn{0%,25.4%{opacity:0;transform:scale(.34) translateY(24px)}
  26.4%{opacity:1;transform:scale(.46) translateY(10px)}
  36%{transform:scale(1.05) translateY(0)} 40%,84%{opacity:1;transform:scale(1)}
  93%{opacity:0;transform:scale(.97)} 100%{opacity:0;transform:scale(.34) translateY(24px)}}
@keyframes riseIn{0%,28%{opacity:0;transform:translateY(13px)}
  44%,88%{opacity:1;transform:none} 93%,100%{opacity:0}}
```

Im Produkt löst der **Wisch** aus, nicht die Zeit: dieselben Keyframes einmalig mit
`animation-fill-mode: forwards`, oder als äquivalente Framer-Motion-Sequenz.

### 3.4 Die Kiste

176 × 176, Radius 26, `linear-gradient(158deg,#252527,#17171A 52%,#101012)`, Rand `#FFFFFF1F`,
vier Nieten, eine Klebenaht über dem oberen Drittel, und darauf das echte Markenzeichen aus
`components/RidrMark.tsx` im **Marken-Lime `#C6F53C`** — nicht im Interface-Säuregrün `#BFFF3C`.
Auf der Kiste steht die Marke, nicht der Akzent.

```html
<svg width="76" height="76" viewBox="0 0 200 200" aria-hidden="true">
  <path d="M54 176v-136h50a36 36 0 0 1 0 72h-50m46 0c32 16 38 40 72 28"
        fill="none" stroke="#C6F53C" stroke-width="13.2"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

### 3.5 Haptik

```js
navigator.vibrate([16])                                  // Raste, pro Viertel beim Ziehen
navigator.vibrate([16,40,16,40,70,120,240])              // beim Auslösen
navigator.vibrate([16])                                  // wenn der Name sitzt
```

Feature-Check `typeof navigator.vibrate === 'function'`, in `try/catch`. Android-Chrome hat sie,
iOS nicht — dort läuft die Bewegung ohne Haptik und nichts bricht.

### 3.6 Die Fassung

Eine Bauform, sechs Fassungen: **die Platte ist heilig, die Fassung spricht.** Innen ändert sich
nie etwas — gleicher Ausschnitt, gleiche Schriftgrößen —, also vergleicht das Auge nur die Rahmen.
Die Leiter ist die **Materialleiter des Radsports**, die jeder Fahrer auswendig kennt.

| Sprosse | Material | Kontur | Bewegung |
|---|---|---|---|
| I alltag | Rohaluminium sandgestrahlt `#1A1A1A` | Fase, starkes Korn | keine |
| II ernsthaft | Eloxal olive `#2C3524` | Farbe mit Metall darunter | Glanzband 9 s |
| III selten | Gebürsteter Stahl + Säurelippe `#59761A` | Bürstung 1 px, Schraubköpfe, Riffelung | Glanzband 7 s |
| IV legendaer | Carbon-Twill + Eloxal-Fase `#BFFF3C` | 2×2-Köpergewebe aus zwei 45°-Rastern | Lichtlauf um die Kante 4,6 s |
| V mythisch | Eloxiertes Titan | Anlauffarben als Kegel im Material | Lichtlauf 3,8 s, Farbwanderung 14 s, Krone |
| kurios | Verchromtes Presswerk `#E8C25A` | Billigblech mit Pressnaht, Rosette | Glanzband 4,2 s, zu schnell — mit Absicht |

Zwei Details tragen mehr als jede Farbwahl: eine **1,2-px-Lichtkante oben und eine dunkle unten**
(was ein gefrästes Bauteil bei Licht von oben macht) und ein **Korn-Overlay im
Überlagern-Modus** — ohne Korn sieht jedes Metall nach Farbverlauf aus. Der Lichtlauf ist ein
drehender `conic-gradient` **unter** dem Materialkörper, der 1,6 px innerhalb der Karte liegt;
man sieht vom Kegel nur diesen Rand.

### 3.7 Was auf dem aufgedeckten Bildschirm steht — und was nicht

- **Keine Punkte.** Kein `✦ 840` über der Platte. Die Zahl war das Versprechen, sie ist bezahlt,
  sie steht im Beleg darunter.
- **Schließen, dreifach:** Griff oben (wischt nach unten), ✕ in abgedunkelter Scheibe mit eigenem
  Rand — auf einem hellen Bild war es vorher unsichtbar —, und ✓ neben TEILEN. Alle drei landen
  auf demselben Schirm: **nichts verfällt**, die Platte liegt in der Garage.
- **Auf der Platte:** Name, Bedingung, der Witz als eigene Zeile, Seltenheit. Sonst nichts.

---

## 4 · Was noch fehlt

- **`scene_unlocks` gibt es nicht.** Ohne diese Tabelle sind „12 von 40" und „1 von 9 Fahrern"
  Behauptungen — bis dahin Zeile weglassen, nicht schätzen.
- **Sprosse `mythisch` kennt der Code nicht.** `bike_build.TIER_INTENSITY` hat vier Rungen.
- **45 von 50 Szenen sind nie gerendert.** Von vier Prüfrenderings sind zwei beim
  ersten Versuch durchgefallen (§1.4). Jede Szene braucht ein Bild vor der Freigabe.
- **`stage_swap.py`** ist fertig samt Tests und wird **von nichts aufgerufen**. Es braucht zwei
  Entscheidungen: welches Rendering die kanonische Vorlage einer Szene ist, und ob der Cache-Key
  Szene × Rad lautet.
