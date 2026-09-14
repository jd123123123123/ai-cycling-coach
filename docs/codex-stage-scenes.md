# Stage-Szenen — Übergabe an Codex

Stand 11.09.2026. Alles hier ist entschieden und freigegeben; die offenen Punkte stehen in
**§8** und sind ausdrücklich als offen markiert. **Fünf von fünfzig Szenen sind gerendert und
geprüft**, die anderen fünfundvierzig sind Prosa — und Prosa ist kein Beweis (§9).

---

## 1 · Auftrag, in Reihenfolge der Abhängigkeit

| # | Schritt | Blockiert |
|---|---------|-----------|
| 1 | `Backdrop`/`Scene` um `tier`, `axis`, `op`, `threshold`, `joke_de`, `sign_de`, `ritual_de`, `analogy` erweitern (§3.1) | alles andere |
| 2 | Die 50 Szenen aus §4 einsetzen und die 11 alten `backdrops.CATALOGUE`-Einträge zuordnen oder ablösen (§3.3) | Fortschritt, Fassungen |
| 3 | Tabelle `scene_unlocks` (athlete_id, scene_id, activity_id, unlocked_at) + Zähler pro Szene | „12 von 40", Seltenheitszeile |
| 4 | Renderpfad: Szene → **ein** kanonisches Bild (§6), danach pro Fahrer nur noch Tausch (§7) | Feier-Seite, Erfolge |
| 5 | Fassungen (§5.1), Feier-Seite (§5.2), Erfolge-Seite (§5.3) | — |

**Grundsatz über allem:** ein fehlender Fakt schaltet nie etwas frei. `unlocked_by` muss
`False` liefern, wenn das Feld `None` ist — Regel 4 aus `earn_modifiers.py`, hier unverändert.

---

## 2 · Warum die Szenen witzig sind (nicht ändern ohne Rückfrage)

Fünf Analogien, sortiert danach, **wie schnell ein Betrachter sie kapiert**. Der Rang ist
wichtiger als die Cleverness: die ersten zwei brauchen kein Vorwissen, kein Wortspiel und
keinen zweiten Gedanken.

| Code | Analogie | Beispiel | Kapierzeit |
|------|----------|----------|------------|
| `A2` | **Der Platz eines Menschen** — das Rad sitzt, wo ein Mensch sitzt | Sessellift, Solarium, Hotelbett, Eistonne | sofort |
| `A3` | **Echt unter Attrappen** — ein echtes Rad unter vielen Nachbildungen | Indoor-Studio, Schulhof-Radstand, Fähre | sofort |
| `A1` | **Verkauft dasselbe** — ein Gewerbe nimmt Geld für genau diese Erfahrung | Waschanlage, Sauna, Kryokammer | eine Sekunde |
| `A5` | **Die Zahl als Gegenstand** — die Bedingung wird ein sichtbares Ding | Kegelbahn = flach, Kirmesglocke = Intensität | eine Sekunde |
| `A4` | **Die Behörde war da** — erhabener Ort + ein verwitterter Amtsgegenstand | Mond + Parkuhr | ein Gedankenschritt → nur Sprosse IV/V |
| `A0` | **Kein Witz, nur der Ort** | Einfahrt, Nordlicht | — |

**Die erzeugende Frage** (nicht die beschreibende): *Welches Gewerbe verkauft die Erfahrung,
die diese Fahrt dir geschenkt hat?* Sie bleibt freundlich, weil sie **das Geschäft entwertet,
nie die Fahrt** — die Pointe geht gegen die Zahlenden.

### Drei harte Prüfungen

1. **Der Ort muss existieren.** *Könnte man hinfahren und das Bild genauso machen?* Ein
   Gegenstand auf Landschaftsgröße ist Cartoon-Logik; eine gestellte Menge ist Unordnung.
   Beides wurde gestrichen (eine gebäudegroße Wasserwaage, dreißig Gartenzwerge).
2. **Der Daumennagel-Test.** Bei **120 px** muss *ein* Erkennungszeichen die Bedingung tragen
   (`sign_de`). Die Waschanlage besteht ihn allein durch die magenta-blauen Bürsten. Eine
   *Stimmung* besteht ihn nie — „dunkle Halle mit rotem Licht" ist ein roter Fleck.
3. **Nichts im Bild weiß vom Witz.** Kein Scheinwerfer auf den Gag, keine Anordnung um das
   Rad, kein Blick darauf. Ein Ort, der auf das Rad *reagiert*, macht es zur Attraktion statt
   zum Gast.

### Die Besitzgrenze — wichtig, weil eine ältere Klausel hier falsch war

Ein **Flaschenhalter behauptet Besitz**: das Rad ist ein Protokoll dessen, was der Fahrer
wirklich hat, und erfundene Anbauteile machen daraus eine Fiktion. Ein **Saunahandtuch gehört
dem Ort** und ist geliehen. Die Trennlinie heißt nicht „auf dem Rad / nicht auf dem Rad",
sondern **behauptet es Besitz?** Genau ein geliehener Gegenstand (`ritual_de`) ist erlaubt und
ist in 13 der 50 Szenen das Lustigste im Bild.

---

## 3 · Backend

### 3.1 Neue Felder

```python
@dataclass(frozen=True)
class Scene:
    id: str
    name_de: str
    tier: str                   # alltag | ernsthaft | selten | legendaer | mythisch
    unlock_de: str              # in der Sprache des Fahrers
    axis: str | None            # RideFacts-Feld, fuer den Fortschrittsbalken
    op: str | None              # "≥" | "≤" | "<" | ">"
    threshold: float | None
    analogy: str                # A0..A5, siehe §2
    joke_de: str                # EINE Zeile, steht auf der Karte
    sign_de: str                # Erkennungszeichen bei 120 px (Pruefkriterium)
    prose: str                  # Weltbeschreibung fuer den Render
    ritual_de: str | None = None    # der geliehene Gegenstand des Ortes
    note_de: str | None = None      # Amtsgegenstand oder Wirkung am Rad
    rendered: bool = False
    unlocked_by: Callable[[RideFacts], bool] | None = None
```

**`axis` + `threshold` sind der Grund für die Erweiterung.** Eine Funktion lässt sich nicht
nach ihrer Schwelle fragen — ohne diese zwei Felder kann die Erfolge-Seite keinen Fortschritt
zeigen. `unlocked_by` bleibt zusätzlich, weil Kombi-Bedingungen (Nordlicht: `in_dark` **und**
`temp_c ≤ −10`) nur als Prädikat ausdrückbar sind; dort ist `axis=None`.

### 3.2 Fortschritt — drei Sorten, und keine erfinden

- **Anteil mit Balken**, wo ein Prozentwert etwas bedeutet: 4 812 / 5 000 hm.
- **Abstand ohne Balken**, wo Prozent Unsinn wäre: „↓ 2 Grad kälter". Eine Temperaturschwelle
  hat keinen Nullpunkt.
- **Gelegenheit**, ohne Zahl: Regen, Dunkelheit, Schotter, Ruhetag. Ein Balken auf 0 % wäre
  eine Lüge — niemand ist „0 % vom Regen entfernt".

### 3.3 Kollisionen mit dem alten Katalog

| alt (`backdrops.py`) | neu | Auflösung |
|---|---|---|
| `rain_road` (`was_wet`) | `waschanlage` | Regenstraße = **erste** Regenfahrt, Waschanlage = `was_wet` + `duration_s > 7200` |
| `mountain_pass` (1 000 hm) | `sessellift` (1 000 hm) | eine von beiden; der Sessellift ist die witzigere |
| `coast_road` (100 km) | — | bleibt, füllt die Distanzleiter zwischen 50 und 150 |
| `winter_road` (≤ 0 °C) | `kryokammer` (≤ 0 °C) | Kryokammer ersetzt sie |
| `velodrome` (IF ≥ 0,95) | `indoor_studio` (IF ≥ 0,95) | Indoor-Studio ersetzt sie |
| `dawn_road` (< 7 Uhr) | `backstube` (< 5 Uhr) | **Schwelle auf 5 ziehen**, sonst ist es keine Ansage |
| `gravel_track` | `schuhputzautomat` / `moorbad` / `bambusdom` | Schotter bekommt eine Leiter |
| 4 Starter (`studio_*`, `starter_road`, `night_road`) | — | unverändert lassen |

---

## 4 · Der Katalog — 50 Szenen, fertig zum Einsetzen

Sprossenverteilung **9 · 13 · 13 · 8 · 7**. `axis`/`threshold` sind aus den Bedingungen
abgeleitet; wo `axis=None` steht, ist die Bedingung eine Kombination und braucht ein Prädikat.
`rendered=True` heißt: es existiert ein geprüftes Bild.

```python
SCENES: list[Scene] = [
    Scene(
        id="einfahrt",
        name_de="Die Einfahrt",
        tier="alltag",
        unlock_de="50 km Feierabendrunde",
        # Bedingung im Klartext: distance_m ≥ 50 000
        axis='distance_m', op='≥', threshold=50000,
        analogy="A0",
        joke_de="Niemand verkauft eine Feierabendrunde. Das ist der Punkt.",
        sign_de="Hecke, Tonne, Abendgold",   # Erkennungszeichen bei 120 px
        prose=(
            "Die eigene Einfahrt im letzten warmen Licht: Pflaster, geschnittene Hecke, "
            "Mülltonne, lange Schatten in den Fugen. "
        ),
        rendered=True,
    ),
    Scene(
        id="balkon",
        name_de="Der Balkon",
        tier="alltag",
        unlock_de="Unter 20 km",
        # Bedingung im Klartext: distance_m < 20 000
        axis='distance_m', op='<', threshold=20000,
        analogy="A0",
        joke_de="Weiter als der Blumenkasten war es nicht.",
        sign_de="Wäschespinne und Geranien",   # Erkennungszeichen bei 120 px
        prose=(
            "Ein Mietshausbalkon in der Abendsonne: Wäschespinne, Geranien im Kasten, zwei "
            "Klappstühle, die Stadt unscharf darunter. "
        ),
        rendered=False,
    ),
    Scene(
        id="backstube",
        name_de="Die Backstube",
        tier="alltag",
        unlock_de="Vor 5 Uhr losgefahren",
        # Bedingung im Klartext: start_hour < 5
        axis=None, op=None, threshold=None,
        analogy="A1",
        joke_de="Der Bäcker ist auch erst seit einer Stunde da.",
        sign_de="Glühende Ofenmäuler, weiße Bleche",   # Erkennungszeichen bei 120 px
        prose=(
            "Backstube um fünf: Bleche mit Brötchen auf Rollwagen bis unter die Decke, Mehlstaub "
            "in der Luft, drei offene Ofentüren als einzige Lichtquelle. "
        ),
        ritual_de=(
            "Eine bemehlte weiße Schürze über dem Sattel, Bänder herabhängend "
        ),
        rendered=False,
    ),
    Scene(
        id="tankstelle",
        name_de="Die Tankstelle",
        tier="alltag",
        unlock_de="Nach 22 Uhr losgefahren",
        # Bedingung im Klartext: start_hour ≥ 22
        axis=None, op=None, threshold=None,
        analogy="A1",
        joke_de="Der einzige Ort im Landkreis, der dafür Licht anlässt.",
        sign_de="Helle Lichtwanne im Schwarzen",   # Erkennungszeichen bei 120 px
        prose=(
            "Vorplatz um Mitternacht: das Dach eine Wanne aus kaltem Leuchtstofflicht, ringsum "
            "schwarz, Motten in Wolken um die Lampen, nasser Beton mit Regenbogenschlieren. "
        ),
        ritual_de=(
            "Ein Pappbecher Kaffee mit Plastikdeckel auf dem Oberrohr, Dampf sichtbar "
        ),
        rendered=False,
    ),
    Scene(
        id="trockenraum",
        name_de="Der Trockenraum",
        tier="alltag",
        unlock_de="Nass, unter 40 km",
        # Bedingung im Klartext: was_wet + distance_m < 40 000
        axis='distance_m', op='<', threshold=40000,
        analogy="A2",
        joke_de="Dein Rad hat auch einen Haken bekommen.",
        sign_de="Reihe nasser Trikots, Dampf",   # Erkennungszeichen bei 120 px
        prose=(
            "Ein Trockenraum im Keller: nasse Trikots und Handschuhe hängen dicht an dicht über "
            "Heizrippen, Dampf steht in der Luft, Pfützen auf dem Estrich, eine nackte Glühbirne. "
        ),
        ritual_de=(
            "Ein Bügel mit einem nassen Trikot hängt am Lenker "
        ),
        rendered=False,
    ),
    Scene(
        id="waschsalon",
        name_de="Der Waschsalon",
        tier="alltag",
        unlock_de="Erste Fahrt im Regen",
        # Bedingung im Klartext: was_wet is True
        axis=None, op=None, threshold=None,
        analogy="A1",
        joke_de="Hier dreht sich alles um nasse Sachen.",
        sign_de="Wand aus drehenden Bullaugen",   # Erkennungszeichen bei 120 px
        prose=(
            "Ein Waschsalon abends: eine Wand aus Bullaugen, in drei davon dreht Wäsche, "
            "Plastikstühle in einer Reihe, Neonlicht, Waschmittelduft als Dunst. "
        ),
        rendered=False,
    ),
    Scene(
        id="schulhof_radstand",
        name_de="Der Schulhof-Radstand",
        tier="alltag",
        unlock_de="Mit der Crew",
        # Bedingung im Klartext: with_crew is True
        axis=None, op=None, threshold=None,
        analogy="A3",
        joke_de="Vierzig Räder. Eins davon war heute achtzig Kilometer weg.",
        sign_de="Reihe gleicher Lenker",   # Erkennungszeichen bei 120 px
        prose=(
            "Ein überdachter Fahrradständer an einer Schule, randvoll: eine Reihe fremder Lenker "
            "und Sattel bis aus dem Bild, Wellblechdach, gesprungener Asphalt, Nachmittagslicht. "
        ),
        rendered=False,
    ),
    Scene(
        id="liegestuhl",
        name_de="Der Liegestuhl",
        tier="alltag",
        unlock_de="Ruhetag gehalten, wie geplant",
        # Bedingung im Klartext: honoured_easy_day
        axis=None, op=None, threshold=None,
        analogy="A2",
        joke_de="Eine Stunde Faulenzen kostet hier fünfundvierzig Euro.",
        sign_de="Liege, Handtuch, Poolreflexe",   # Erkennungszeichen bei 120 px
        prose=(
            "Eine Hotelterrasse mittags: Sonnenliege mit zusammengelegtem Handtuch, Poolreflexe "
            "zittern an der Wand, ein halb eingeklappter Schirm, niemand da. "
        ),
        ritual_de=(
            "Ein weißer Bademantel über dem Lenker, Gürtel hängend "
        ),
        rendered=False,
    ),
    Scene(
        id="bahnuebergang",
        name_de="Der Bahnübergang",
        tier="alltag",
        unlock_de="Unter 30 km",
        # Bedingung im Klartext: distance_m < 30 000
        axis='distance_m', op='<', threshold=30000,
        analogy="A5",
        joke_de="Die Schranke war der einzige Gegner.",
        sign_de="Rot-weiße Schranke quer im Bild",   # Erkennungszeichen bei 120 px
        prose=(
            "Ein Feldweg-Bahnübergang, Schranke gerade unten: rot-weiße Balken quer im Bild, das "
            "rote Blinklicht an, Getreide zu beiden Seiten, Staub in der Luft. "
        ),
        rendered=False,
    ),
    Scene(
        id="waschanlage",
        name_de="Die Waschanlage",
        tier="ernsthaft",
        unlock_de="Regen über zwei Stunden",
        # Bedingung im Klartext: was_wet + duration_s > 7 200
        axis='duration_s', op='>', threshold=7200,
        analogy="A1",
        joke_de="Du wurdest zwei Stunden durchnässt. Hier kostet das neun Euro und läuft nach Programm.",
        sign_de="Magenta-blaue Bürsten — der Maßstab",   # Erkennungszeichen bei 120 px
        prose=(
            "Mitten im Programm: rotierende blau-magenta Bürsten, Düsen über Kopf, Schaum an den "
            "gefliesten Wänden, nasser Rillenbeton, der jede Farbe zurückwirft. "
        ),
        rendered=True,
    ),
    Scene(
        id="planetarium",
        name_de="Das Planetarium",
        tier="ernsthaft",
        unlock_de="Im Dunkeln gefahren",
        # Bedingung im Klartext: in_dark is True
        axis=None, op=None, threshold=None,
        analogy="A1",
        joke_de="Du hattest den Sternenhimmel umsonst. Hier stehen Leute an der Kasse dafür an.",
        sign_de="Sternenkuppel über Sesselreihen",   # Erkennungszeichen bei 120 px
        prose=(
            "Unter der Kuppel, Vorführung läuft: der projizierte Himmel überall, Reihen leerer "
            "Klappsessel steigen an, der alte Projektor auf seiner Säule — alles nur von Sternen "
            "beleuchtet. "
        ),
        rendered=False,
    ),
    Scene(
        id="kegelbahn",
        name_de="Die Kegelbahn",
        tier="ernsthaft",
        unlock_de="60 km mit unter 20 hm",
        # Bedingung im Klartext: elevation_gain_m < 20
        axis='elevation_gain_m', op='<', threshold=20,
        analogy="A5",
        joke_de="Flacher geht es nicht. Dieser Boden wird auf Zehntelmillimeter gerichtet.",
        sign_de="Gerade Dielen zu hellen Kegeln",   # Erkennungszeichen bei 120 px
        prose=(
            "Alte Kegelbahn, tief und warm beleuchtet: das Rad auf der lackierten Ahornbahn, die "
            "Dielen laufen schnurgerade weg, am Ende die vollen Kegel in ihrem Lichtsee. "
        ),
        ritual_de=(
            "Ein Paar rot-cremefarbene Leihschuhe über dem Lenker, Senkel verknotet "
        ),
        rendered=False,
    ),
    Scene(
        id="billardtisch",
        name_de="Der Billardtisch",
        tier="ernsthaft",
        unlock_de="40 km mit unter 15 hm",
        # Bedingung im Klartext: elevation_gain_m < 15
        axis='elevation_gain_m', op='<', threshold=15,
        analogy="A5",
        joke_de="Auch dieser Tisch wird mit der Wasserwaage gerichtet.",
        sign_de="Grüner Filz und Kugellampe",   # Erkennungszeichen bei 120 px
        prose=(
            "Ein Billardsalon: das Rad steht auf dem grünen Filz, die Kugeln liegen verstreut, "
            "eine tiefhängende Kugellampe wirft einen harten Kreis, dahinter dunkles Holz. "
        ),
        rendered=False,
    ),
    Scene(
        id="faehre",
        name_de="Die Fähre",
        tier="ernsthaft",
        unlock_de="Mit der Crew, über 80 km",
        # Bedingung im Klartext: with_crew + distance_m ≥ 80 000
        axis='distance_m', op='≥', threshold=80000,
        analogy="A3",
        joke_de="Vier Euro pro Rad, und der Decksmann kümmert sich um alle.",
        sign_de="Reihe Räder, helles Rechteck Meer",   # Erkennungszeichen bei 120 px
        prose=(
            "Raddeck einer arbeitenden Fähre: genietetes Stahlblech naß von Gischt, eine Reihe "
            "fremder Räder läuft nach hinten aus dem Fokus, das offene Hecktor rahmt graublaue "
            "See. "
        ),
        ritual_de=(
            "Ein orangener Spanngurt lose über dem Oberrohr, das freie Ende hängt herab "
        ),
        rendered=False,
    ),
    Scene(
        id="blitzer",
        name_de="Der Blitzer",
        tier="ernsthaft",
        unlock_de="Schnitt über 35 km/h",
        # Bedingung im Klartext: avg_speed_kmh ≥ 35
        axis='avg_speed_kmh', op='≥', threshold=35,
        analogy="A4",
        joke_de="Geblitzt. Bei sechsunddreißig.",
        sign_de="Greller Blitz, grauer Kasten",   # Erkennungszeichen bei 120 px
        prose=(
            "Eine leere Landstraße im Moment des Blitzes: der graue Messkasten am Bankett, sein "
            "Licht hat gerade ausgelöst und legt eine harte weiße Kante auf alles, die Straße "
            "dahinter im Dämmerblau. "
        ),
        rendered=False,
    ),
    Scene(
        id="solarium",
        name_de="Das Solarium",
        tier="ernsthaft",
        unlock_de="Über 30 °C",
        # Bedingung im Klartext: temp_c ≥ 30
        axis='temp_c', op='≥', threshold=30,
        analogy="A2",
        joke_de="Die Sonne war umsonst. Hier kostet sie einen Euro pro Minute.",
        sign_de="Violette Röhrenwand",   # Erkennungszeichen bei 120 px
        prose=(
            "Eine Solarium-Kabine, Liege aufgeklappt: das Rad steht auf der unteren Acrylfläche, "
            "über ihm der Deckel voller violett glühender Röhren, gefliester Boden, "
            "Handtuchstapel auf einem Hocker. "
        ),
        ritual_de=(
            "Ein Paar kleine Schutzbrillen liegt auf dem Sattel "
        ),
        rendered=False,
    ),
    Scene(
        id="sessellift",
        name_de="Der Sessellift",
        tier="ernsthaft",
        unlock_de="Über 1 000 hm",
        # Bedingung im Klartext: elevation_gain_m ≥ 1000
        axis='elevation_gain_m', op='≥', threshold=1000,
        analogy="A2",
        joke_de="Bergauf gibt es hier einen Sitzplatz.",
        sign_de="Rad im Liftsessel über weißem Grund",   # Erkennungszeichen bei 120 px
        prose=(
            "Ein Zweier-Sessellift über der Piste, Bügel unten: das Rad sitzt im Sessel wie ein "
            "Gast, unten läuft der Schnee weg, vor und hinter ihm hängen leere Sessel am Seil, "
            "Bergsonne flach. "
        ),
        rendered=False,
    ),
    Scene(
        id="eistonne",
        name_de="Die Eistonne",
        tier="ernsthaft",
        unlock_de="Unter 5 °C",
        # Bedingung im Klartext: temp_c ≤ 5
        axis='temp_c', op='≤', threshold=5,
        analogy="A2",
        joke_de="Drei Minuten kosten hier extra.",
        sign_de="Eiswürfel im Wasser, weiße Fliesen",   # Erkennungszeichen bei 120 px
        prose=(
            "Ein Physioraum: eine hohe Edelstahltonne voll Wasser mit schwimmenden Eiswürfeln, "
            "Dampf steigt kalt davon auf, weiße Fliesen, ein Stapel Handtücher, eine Sanduhr am "
            "Rand. "
        ),
        ritual_de=(
            "Ein Handtuch über dem Sattel, am unteren Rand nass "
        ),
        rendered=False,
    ),
    Scene(
        id="windkanal",
        name_de="Der Windkanal",
        tier="ernsthaft",
        unlock_de="Schnitt über 32 km/h",
        # Bedingung im Klartext: avg_speed_kmh ≥ 32
        axis='avg_speed_kmh', op='≥', threshold=32,
        analogy="A1",
        joke_de="Sie messen hier, was du schon gemacht hast.",
        sign_de="Waagerechte Rauchfäden",   # Erkennungszeichen bei 120 px
        prose=(
            "Die Messkammer: Rauchfäden ziehen waagerecht durch das ganze Bild, dahinter das "
            "riesige Gitter der Düse, Scheinwerfer in der Decke, alles aluminiumgrau. "
        ),
        rendered=False,
    ),
    Scene(
        id="schuhputzautomat",
        name_de="Der Schuhputzautomat",
        tier="ernsthaft",
        unlock_de="Schotter unter 40 km",
        # Bedingung im Klartext: surface == "gravel"
        axis=None, op=None, threshold=None,
        analogy="A1",
        joke_de="Rotierende Bürsten, fünfzig Cent.",
        sign_de="Drehende schwarze Bürstenwalzen",   # Erkennungszeichen bei 120 px
        prose=(
            "Ein Schuhputzautomat im Eingang einer Sporthalle: drei schwarze Bürstenwalzen "
            "drehen, Dreckspritzer auf der verzinkten Haube und auf den Fliesen ringsum, "
            "Neonlicht von oben. "
        ),
        rendered=False,
    ),
    Scene(
        id="massageliege",
        name_de="Die Massageliege",
        tier="ernsthaft",
        unlock_de="Ruhetag über zwei Stunden",
        # Bedingung im Klartext: honoured_easy_day + duration_s > 7 200
        axis='duration_s', op='>', threshold=7200,
        analogy="A2",
        joke_de="Das Handtuch liegt schon bereit.",
        sign_de="Liege mit Papierbezug, Ölfläschchen",   # Erkennungszeichen bei 120 px
        prose=(
            "Ein Behandlungsraum: die Liege frisch mit Papier bezogen, ein Ölfläschchen und ein "
            "Stapel gefalteter Handtücher auf dem Beistelltisch, warmes Seitenlicht, Bambus im "
            "Topf. "
        ),
        ritual_de=(
            "Ein gefaltetes Handtuch über dem Sattel und ein zweites über dem Oberrohr "
        ),
        rendered=False,
    ),
    Scene(
        id="autoscooter",
        name_de="Der Autoscooter",
        tier="ernsthaft",
        unlock_de="Unter 5 km mit der Crew",
        # Bedingung im Klartext: distance_m < 5 000 + with_crew
        axis='distance_m', op='<', threshold=5000,
        analogy="A1",
        joke_de="Zwei Minuten, viel Geschrei, keinen Meter vorangekommen.",
        sign_de="Funken am Blechhimmel",   # Erkennungszeichen bei 120 px
        prose=(
            "Ein Autoscooter in der Dämmerung: der Blechhimmel wirft Funken, die Wagen stehen "
            "kreuz und quer auf der Stahlplatte, Glühbirnenketten und Spiegel ringsum, Gummi und "
            "Ozon in der Luft. "
        ),
        rendered=False,
    ),
    Scene(
        id="sauna",
        name_de="Die Sauna",
        tier="selten",
        unlock_de="Über 35 °C",
        # Bedingung im Klartext: temp_c ≥ 35
        axis='temp_c', op='≥', threshold=35,
        analogy="A1",
        joke_de="Hier zahlen Leute Eintritt, um sich hineinzusetzen.",
        sign_de="Honigholz und weißes Handtuch",   # Erkennungszeichen bei 120 px
        prose=(
            "Finnische Kabine, heiß und dämmrig: dunkler geölter Holzboden, Bänke aus heller "
            "Espe, Harzperlen an den Astlöchern, Ofen mit Steinhaufen, Eimer und Kelle, Dampf "
            "rollt in Schichten, ein Fenster blind beschlagen. "
        ),
        ritual_de=(
            "Ein großes weißes Waffelhandtuch über dem Sattel, beidseitig in Falten, unten feucht "
        ),
        rendered=False,
    ),
    Scene(
        id="kryokammer",
        name_de="Die Kryokammer",
        tier="selten",
        unlock_de="0 °C oder kälter",
        # Bedingung im Klartext: temp_c ≤ 0
        axis='temp_c', op='≤', threshold=0,
        analogy="A1",
        joke_de="Fünfzig Euro für drei Minuten bei minus achtzig.",
        sign_de="Blauweißer Nebel über Stahl",   # Erkennungszeichen bei 120 px
        prose=(
            "Eine Kältekammer: Wände aus gebürstetem Edelstahl, Frostnebel wälzt sich knietief "
            "über den Boden, kalte blaue Röhren in der Decke, dicker Reif auf jeder Fläche und an "
            "den Scharnieren der schweren Tür. "
        ),
        ritual_de=(
            "Weiße Frottee-Stirnbänder über dem Lenker, schon mit Reif überzogen "
        ),
        rendered=False,
    ),
    Scene(
        id="indoor_studio",
        name_de="Das Indoor-Studio",
        tier="selten",
        unlock_de="IF 0,95 oder höher",
        # Bedingung im Klartext: intensity_factor ≥ 0.95
        axis='intensity_factor', op='≥', threshold=0.95,
        analogy="A3",
        joke_de="Dreißig Leute im Abo, um im Dunkeln auf der Stelle zu treten. Eins hier war wirklich weg.",
        sign_de="Violette Spots über Reihen gleicher Räder",   # Erkennungszeichen bei 120 px
        prose=(
            "Ein Indoor-Cycling-Saal, leer und noch beleuchtet: Reihen identischer Standräder auf "
            "gestuften Podesten, violette und blaue Spots, Nebelhauch in den Strahlen, "
            "Spiegelwand — und dazwischen das eine Rad, das draußen war. "
        ),
        rendered=False,
    ),
    Scene(
        id="hau_den_lukas",
        name_de="Hau den Lukas",
        tier="selten",
        unlock_de="IF 0,92 ohne Leistungsmesser",
        # Bedingung im Klartext: intensity_factor ≥ 0.92 + has_power False
        axis='intensity_factor', op='≥', threshold=0.92,
        analogy="A5",
        joke_de="Kein Messgerät nötig. Die Glocke hat geklingelt.",
        sign_de="Beleuchteter Turm mit Glocke oben",   # Erkennungszeichen bei 120 px
        prose=(
            "Ein Kirmes-Kraftmesser in der Dämmerung: der Turm steigt aus dem Bild, die Glocke "
            "oben schwingt noch und die Lichterkette am Mast leuchtet bis zur Spitze, der Hammer "
            "lehnt am Sockel, Buden unscharf im Hintergrund. "
        ),
        rendered=False,
    ),
    Scene(
        id="salzspiegel",
        name_de="Der Salzspiegel",
        tier="selten",
        unlock_de="Nass und flach",
        # Bedingung im Klartext: was_wet + elevation_gain_m < 50
        axis='elevation_gain_m', op='<', threshold=50,
        analogy="A4",
        joke_de="Zwei Zentimeter Wasser, zwei Fahrräder.",
        sign_de="Das Rad zweimal, Naht in der Mitte",   # Erkennungszeichen bei 120 px
        prose=(
            "Eine Salzpfanne unter zwei Zentimetern Wasser bis an jeden Horizont: das Rad steht "
            "auf einem perfekten Spiegel und ist zweimal da, Salzwaben unter der Oberfläche, ein "
            "einziger durchgehender Himmelsverlauf, zweimal. "
        ),
        note_de=(
            "Behörde: eine Parkbank, bis zum Sitz im Salzwasser versunken, Beine weiß verkrustet "
        ),
        rendered=True,
    ),
    Scene(
        id="kuehlturm",
        name_de="Der Kühlturm",
        tier="selten",
        unlock_de="150 km im Dunkeln",
        # Bedingung im Klartext: distance_m ≥ 150 000 + in_dark
        axis='distance_m', op='≥', threshold=150000,
        analogy="A4",
        joke_de="Von innen ist er ein Dom.",
        sign_de="Heller Kreis hoch über Beton",   # Erkennungszeichen bei 120 px
        prose=(
            "Im Inneren eines Kühlturms: die Hyperbelwand steigt in allen Richtungen weg, oben "
            "ein perfekter heller Kreis Himmel, Wasserschleier fällt an den Rändern, Beton mit "
            "Kalkfahnen, Hall in der Luft. "
        ),
        note_de=(
            "Behörde: ein kommunaler Abfallkorb am Fuß der Wand, Farbe abgeblättert "
        ),
        rendered=False,
    ),
    Scene(
        id="moorbad",
        name_de="Das Moorbad",
        tier="selten",
        unlock_de="Schotter über 60 km",
        # Bedingung im Klartext: surface == "gravel" + distance_m ≥ 60 000
        axis='distance_m', op='≥', threshold=60000,
        analogy="A1",
        joke_de="Leute zahlen dafür, mit Schlamm bedeckt zu werden.",
        sign_de="Schwarze Wanne, grünweiße Fliesen",   # Erkennungszeichen bei 120 px
        prose=(
            "Ein Moorbad-Behandlungsraum: eine gemauerte Wanne voll schwarzem, glänzendem Schlamm "
            "mit sichtbaren Strudeln, Fliesen in altem Grünweiß, Messinghähne, gestapelte "
            "Holzeimer, Wasserdampf an den Fenstern. "
        ),
        ritual_de=(
            "Eine frisch bestrichene Spachtel liegt auf dem Oberrohr, derselbe Schlamm klebt an "
            "Reifen und Kettenstreben "
        ),
        rendered=False,
    ),
    Scene(
        id="hotelbett",
        name_de="Das Hotelbett",
        tier="selten",
        unlock_de="Über fünf Stunden",
        # Bedingung im Klartext: duration_s ≥ 18 000
        axis='duration_s', op='≥', threshold=18000,
        analogy="A2",
        joke_de="Irgendwann muss auch ein Rad ins Bett.",
        sign_de="Weiße Bettdecke ums Rad",   # Erkennungszeichen bei 120 px
        prose=(
            "Ein Hotelzimmer bei Nacht: das Rad steht im aufgeschlagenen Doppelbett, Decke bis "
            "zum Oberrohr, zwei Kissen hochgestellt, Nachttischlampe an, Vorhang halb zu, die "
            "Stadt unscharf dahinter. "
        ),
        ritual_de=(
            "Die Bettdecke selbst — bis zum Oberrohr hochgezogen, Falten wie bei einem Gast "
        ),
        rendered=False,
    ),
    Scene(
        id="kinosaal",
        name_de="Der Kinosaal",
        tier="selten",
        unlock_de="Über sechs Stunden",
        # Bedingung im Klartext: duration_s ≥ 21 600
        axis='duration_s', op='≥', threshold=21600,
        analogy="A1",
        joke_de="Vierzehn Euro für drei Stunden Sitzen, mit Pause.",
        sign_de="Rote Sesselreihen, Staub im Lichtkegel",   # Erkennungszeichen bei 120 px
        prose=(
            "Ein großer alter Kinosaal, leer, Vorstellung läuft: das Rad im Mittelgang auf "
            "ausgetretenem Teppich, Reihen roter Klappsessel, der Projektorkegel voller Staub "
            "über den Köpfen — alles vom Leinwandlicht beleuchtet, die Leinwand selbst außerhalb "
            "des Ausschnitts. "
        ),
        rendered=False,
    ),
    Scene(
        id="rolltreppe",
        name_de="Die Rolltreppe",
        tier="selten",
        unlock_de="15 % über einen Kilometer",
        # Bedingung im Klartext: max_gradient_pct ≥ 15
        axis='max_gradient_pct', op='≥', threshold=15,
        analogy="A2",
        joke_de="Hier fährt die Steigung selbst.",
        sign_de="Steil aufsteigende Stufenflucht",   # Erkennungszeichen bei 120 px
        prose=(
            "Eine sehr lange U-Bahn-Rolltreppe von unten gesehen: die gerillten Stufen laufen "
            "steil aus dem Bild nach oben, Handläufe als zwei Linien in die Flucht, gewölbte "
            "Decke mit Lampenreihe, niemand darauf. "
        ),
        rendered=False,
    ),
    Scene(
        id="bambusdom",
        name_de="Der Bambusdom",
        tier="selten",
        unlock_de="Schotter über 80 km",
        # Bedingung im Klartext: surface == "gravel" + distance_m ≥ 80 000
        axis='distance_m', op='≥', threshold=80000,
        analogy="A0",
        joke_de="Grünes Licht, drei Stunden lang.",
        sign_de="Grüne Säulenhalle",   # Erkennungszeichen bei 120 px
        prose=(
            "Ein Bambuswald als Kirchenschiff: Halme wie Säulen bis aus dem Bild, das Licht kommt "
            "nur gefiltert von oben und ist deshalb vollständig grün, ein geharkter Kiesweg führt "
            "hindurch, Halme schwingen sichtbar. "
        ),
        rendered=False,
    ),
    Scene(
        id="reisterrassen",
        name_de="Die Reisterrassen",
        tier="selten",
        unlock_de="2 500 hm mit 20 % Rampe",
        # Bedingung im Klartext: elevation_gain_m ≥ 2500 + max_gradient_pct ≥ 20
        axis='elevation_gain_m', op='≥', threshold=2500,
        analogy="A0",
        joke_de="Treppen, so weit das Auge reicht.",
        sign_de="Hundert gestufte Spiegel",   # Erkennungszeichen bei 120 px
        prose=(
            "Terrassierte Reisfelder in der Dämmerung: hundert gestufte Wasserflächen "
            "übereinander, jede mit demselben rosa Himmel darin, Nebel in den unteren Stufen, ein "
            "schmaler Lehmdamm führt hindurch. "
        ),
        rendered=False,
    ),
    Scene(
        id="gewaechshaus",
        name_de="Das Gewächshaus",
        tier="selten",
        unlock_de="Über 38 °C im Dunkeln",
        # Bedingung im Klartext: temp_c ≥ 38 + in_dark
        axis='temp_c', op='≥', threshold=38,
        analogy="A1",
        joke_de="Nachts noch achtunddreißig Grad. Hier ist das Absicht.",
        sign_de="Beschlagene Glaskuppel von innen",   # Erkennungszeichen bei 120 px
        prose=(
            "Ein Palmenhaus bei Nacht: Glasgewölbe auf gusseisernen Rippen, Palmen und Farne "
            "dicht bis unter das Dach, Kondens läuft in Bahnen an den Scheiben, Bodenstrahler von "
            "unten, Nebeldüsen arbeiten sichtbar. "
        ),
        rendered=False,
    ),
    Scene(
        id="mond",
        name_de="Der Mond",
        tier="legendaer",
        unlock_de="5 000 Höhenmeter",
        # Bedingung im Klartext: elevation_gain_m ≥ 5000
        axis='elevation_gain_m', op='≥', threshold=5000,
        analogy="A4",
        joke_de="Kein Gewerbe verkauft den Mond. Also war die Verwaltung da.",
        sign_de="Graue Fläche, schwarzer Himmel, blauer Punkt",   # Erkennungszeichen bei 120 px
        prose=(
            "Regolith mit eigenen Spuren, schwarzer Himmel mit harten Sternen, die Erde klein und "
            "blau und brillant, Erdschein-Blau neben hartem Weiß. "
        ),
        note_de=(
            "Behörde: eine Parkuhr auf einem Stahlpfosten, Gehäuse kalkig ausgeblichen, "
            "Solarzelle verkratzt, Fensterchen blind "
        ),
        rendered=True,
    ),
    Scene(
        id="schanze",
        name_de="Die Schanze",
        tier="legendaer",
        unlock_de="Rampe über 20 %",
        # Bedingung im Klartext: max_gradient_pct ≥ 20
        axis='max_gradient_pct', op='≥', threshold=20,
        analogy="A4",
        joke_de="Man hat hier eine Anlage gebaut, um dasselbe herunterzukommen. Mit Lift.",
        sign_de="Weiße Spur, die steil ins Bild kippt",   # Erkennungszeichen bei 120 px
        prose=(
            "Oben am Anlauf einer großen Skisprungschanze: das Rad steht auf dem Balken, die "
            "vereiste Spur fällt vor ihm senkrecht ins Bild, unten der Auslauf und die leeren "
            "Tribünenbögen, dahinter das Tal in kaltem Blau, Schneefahnen ziehen quer. "
        ),
        note_de=(
            "Behörde: ein kommunaler Abfallkorb am Pfosten neben dem Balken, halb voll Schnee "
        ),
        rendered=False,
    ),
    Scene(
        id="hoelle",
        name_de="Die Hölle",
        tier="legendaer",
        unlock_de="Über 40 °C und über 100 km",
        # Bedingung im Klartext: temp_c ≥ 40 + distance_m ≥ 100 000
        axis='distance_m', op='≥', threshold=100000,
        analogy="A4",
        joke_de="Hundert Kilometer bei über vierzig Grad. Dafür gibt es kein Geschäft.",
        sign_de="Orangeglut von unten, schwarzer Fels",   # Erkennungszeichen bei 120 px
        prose=(
            "Eine Kaverne aus Feuer: Lavastrom hinter der Maschine, Funken zu Tausenden nach "
            "oben, Schwefelschleier in Schichten, die Luft flimmert sichtbar, alles nur von unten "
            "beleuchtet. "
        ),
        note_de=(
            "Behörde: ein gusseiserner Trinkbrunnen, grüne Farbe blasig, das Becken "
            "knochentrocken und voller Kalk "
        ),
        rendered=False,
    ),
    Scene(
        id="duene",
        name_de="Die Düne",
        tier="legendaer",
        unlock_de="100 km über 35 °C",
        # Bedingung im Klartext: distance_m ≥ 100 000 + temp_c ≥ 35
        axis='distance_m', op='≥', threshold=100000,
        analogy="A4",
        joke_de="Ein ganzer Tag ohne Schatten.",
        sign_de="Eine Kante quer durchs Bild, alles Sand",   # Erkennungszeichen bei 120 px
        prose=(
            "Der Grat einer dreihundert Meter hohen Düne bei Sonnenaufgang: das Rad auf der "
            "messerscharfen Kante, Sand raucht in Fahnen über den Grat, das Licht streift so "
            "flach, dass jede Rippel ihren eigenen Schatten hat. "
        ),
        note_de=(
            "Behörde: ein Wanderparkplatz-Pfosten im Sand, Farbe sandgestrahlt, halb verschüttet "
        ),
        rendered=False,
    ),
    Scene(
        id="gewitter",
        name_de="Im Gewitter",
        tier="legendaer",
        unlock_de="Nass bei IF über 0,9",
        # Bedingung im Klartext: was_wet + intensity_factor ≥ 0.9
        axis='intensity_factor', op='≥', threshold=0.9,
        analogy="A0",
        joke_de="Du bist weggefahren. Es hat gewonnen.",
        sign_de="Blitz im Einschlag, alles seitlich beleuchtet",   # Erkennungszeichen bei 120 px
        prose=(
            "Unter der Schulter einer Superzelle: die Wolke hängt als gedrechselte Decke über dem "
            "ganzen Bild, ein Blitz steht im Moment des Einschlags links im Feld und beleuchtet "
            "alles von der Seite, Regenvorhänge schräg, die Straße dampft. "
        ),
        rendered=False,
    ),
    Scene(
        id="startrampe",
        name_de="Die Startrampe",
        tier="legendaer",
        unlock_de="200 km",
        # Bedingung im Klartext: distance_m ≥ 200 000
        axis='distance_m', op='≥', threshold=200000,
        analogy="A4",
        joke_de="Von hier wird sonst nur einmal gestartet.",
        sign_de="Gitterturm und Dampf über Beton",   # Erkennungszeichen bei 120 px
        prose=(
            "Der Fuß einer Raketen-Startrampe frühmorgens: Gitterturm und Versorgungsarme steigen "
            "aus dem Bild, Dampfschwaden ziehen über den Abgasgraben, Flutlichtmasten noch an, "
            "der Beton brandschwarz. "
        ),
        note_de=(
            "Behörde: ein verzinkter Fahrradbügel, in den Startbeton gedübelt "
        ),
        rendered=False,
    ),
    Scene(
        id="staumauer",
        name_de="Die Staumauer",
        tier="legendaer",
        unlock_de="3 000 Höhenmeter",
        # Bedingung im Klartext: elevation_gain_m ≥ 3000
        axis='elevation_gain_m', op='≥', threshold=3000,
        analogy="A4",
        joke_de="Zweihundert Meter Beton. Oben ein Geländer, das aussieht wie an jeder Brücke.",
        sign_de="Senkrechter Betonabsturz",   # Erkennungszeichen bei 120 px
        prose=(
            "Auf der Krone einer gekrümmten Bogenstaumauer: die Wand fällt senkrecht ins Bild "
            "hinab, unten Wasserauslässe wie Nadelstiche, auf der anderen Seite der türkise "
            "Stausee, Morgennebel in den Hängen. "
        ),
        note_de=(
            "Behörde: das ganz normale kommunale Rohrgeländer, ein Pfosten verbogen und neu "
            "gestrichen "
        ),
        rendered=False,
    ),
    Scene(
        id="sternwarte",
        name_de="Die Sternwarte",
        tier="legendaer",
        unlock_de="Nacht über 120 km",
        # Bedingung im Klartext: in_dark + distance_m ≥ 120 000
        axis='distance_m', op='≥', threshold=120000,
        analogy="A1",
        joke_de="Sie haben eine Kuppel gebaut, um zu sehen, was du die ganze Nacht gesehen hast.",
        sign_de="Offener Kuppelspalt mit Sternen",   # Erkennungszeichen bei 120 px
        prose=(
            "In einer großen Kuppel, Spalt offen: der Tubus des Teleskops ragt schräg in einen "
            "Streifen Sternenhimmel, das Gitterwerk der Montierung silhouettiert, rotes "
            "Arbeitslicht am Boden, Kuppelblech genietet. "
        ),
        rendered=False,
    ),
    Scene(
        id="rand_welt",
        name_de="Der Rand der Welt",
        tier="mythisch",
        unlock_de="300 km in einer Fahrt",
        # Bedingung im Klartext: distance_m ≥ 300 000
        axis='distance_m', op='≥', threshold=300000,
        analogy="A4",
        joke_de="Du bist von der Karte gefahren. Die Straße ist hier gesperrt.",
        sign_de="Rad auf einer Kante, dahinter Sterne statt Land",   # Erkennungszeichen bei 120 px
        prose=(
            "Der Asphalt endet an einer scharfen Kante, ein Ozean fällt lautlos darüber in ein "
            "Sternenfeld, und das Licht kommt von unten. "
        ),
        note_de=(
            "Behörde: eine rot-weiße Absperrung, Streifen ausgebleicht, Rost an den Scharnieren, "
            "ein Kabelbinderstummel am Fuß "
        ),
        rendered=True,
    ),
    Scene(
        id="nordlicht",
        name_de="Das Nordlicht",
        tier="mythisch",
        unlock_de="Nachts unter −10 °C",
        # Bedingung im Klartext: in_dark + temp_c ≤ −10
        axis='temp_c', op='≤', threshold=-10,
        analogy="A0",
        joke_de="Zwei Bedingungen auf einmal. Dafür gibt es auch zwei Himmel.",
        sign_de="Grünes Band am Himmel, zweimal",   # Erkennungszeichen bei 120 px
        prose=(
            "Ein zugefrorener See als schwarzer Spiegel, Risse sternförmig unter dem Eis, ein "
            "volles Nordlicht über dem ganzen Himmel — und im Eis dasselbe Nordlicht ein zweites "
            "Mal. "
        ),
        note_de=(
            "Am Rad: das Grün läuft über Lack, Felgenflanken und Sattelkante "
        ),
        rendered=False,
    ),
    Scene(
        id="meeresleuchten",
        name_de="Das Meeresleuchten",
        tier="mythisch",
        unlock_de="Nachts über 150 km",
        # Bedingung im Klartext: in_dark + distance_m ≥ 150 000
        axis='distance_m', op='≥', threshold=150000,
        analogy="A0",
        joke_de="Das Wasser hat mitgezählt.",
        sign_de="Leuchtend blaue Linie im Schwarzen",   # Erkennungszeichen bei 120 px
        prose=(
            "Ein schwarzer Strand bei Neumond: die Brandung leuchtet elektrisch blau von innen, "
            "jede Welle zieht eine glühende Linie, der nasse Sand behält sie noch Sekunden, "
            "darüber die Milchstraße ohne ein Fremdlicht. "
        ),
        note_de=(
            "Am Rad: beleuchtet vom Boden und von nichts anderem — blaue Unterseite, schwarze "
            "Oberseite "
        ),
        rendered=False,
    ),
    Scene(
        id="stratosphaere",
        name_de="Die Stratosphäre",
        tier="mythisch",
        unlock_de="Everesting — 8 848 hm",
        # Bedingung im Klartext: elevation_gain_m ≥ 8848
        axis='elevation_gain_m', op='≥', threshold=8848,
        analogy="A4",
        joke_de="Achttausendachthundertachtundvierzig. Hier oben ist der Himmel schon schwarz.",
        sign_de="Gekrümmter Horizont, schwarzer Himmel",   # Erkennungszeichen bei 120 px
        prose=(
            "Auf einem Eisgrat weit über allem: die Erdkrümmung läuft deutlich über den Horizont, "
            "die Atmosphäre bandet von brennendem Orange über Rosa in Violett und in fast "
            "schwarzes All, Spindrift zieht vom Grat, ein gerissener Wetterballon liegt im "
            "Schnee. "
        ),
        note_de=(
            "Behörde: ein Wanderwegweiser aus verzinktem Blech, alle Arme leer und "
            "windgeschliffen "
        ),
        rendered=False,
    ),
    Scene(
        id="gletschertunnel",
        name_de="Der Gletschertunnel",
        tier="mythisch",
        unlock_de="Unter −10 °C und 2 000 hm",
        # Bedingung im Klartext: temp_c ≤ −10 + elevation_gain_m ≥ 2000
        axis='elevation_gain_m', op='≥', threshold=2000,
        analogy="A4",
        joke_de="Im Berg drin ist es wärmer als draußen.",
        sign_de="Blau leuchtendes Eis von allen Seiten",   # Erkennungszeichen bei 120 px
        prose=(
            "Eine Höhle im Gletscher: die Wände sind gepresstes, blasenfreies Eis und leuchten "
            "von innen in einem Blau, das sonst nichts hat, geriffelt von Schmelzwasser, der "
            "Boden geschliffenes Eis mit Steinen darin, am Ende ein Lichtschlitz. "
        ),
        note_de=(
            "Behörde: ein Fahrradbügel, ins Eis gedübelt, die Verankerung schon eingewachsen. Am "
            "Rad: fast kein Schatten, das Licht kommt aus allen Wänden "
        ),
        rendered=False,
    ),
    Scene(
        id="finsternis",
        name_de="Die Finsternis",
        tier="mythisch",
        unlock_de="Ereignis, an einem echten Datum",
        # Bedingung im Klartext: Feld fehlt — braucht ein Kalenderdatum
        axis=None, op=None, threshold=None,
        analogy="A0",
        joke_de="Zwei Minuten Nacht am Mittag. Man kann sie nicht kaufen und nicht erfahren, nur dabei sein.",
        sign_de="Schwarze Scheibe mit weißem Kranz",   # Erkennungszeichen bei 120 px
        prose=(
            "Totalität: der schwarze Mond mit dem Korona-Kranz hoch im tiefblauen Himmel, am "
            "Horizont rings ein orangener Saum, die Straßenlaternen sind angegangen, alles wirft "
            "doppelte Schatten. "
        ),
        rendered=False,
    ),
    Scene(
        id="karussell",
        name_de="Das Karussell",
        tier="mythisch",
        unlock_de="Unter 5 km",
        # Bedingung im Klartext: distance_m < 5 000
        axis='distance_m', op='<', threshold=5000,
        analogy="A1",
        joke_de="Zwei Euro, im Kreis fahren und dort ankommen, wo man losgefahren ist.",
        sign_de="Glühbirnenkranz und bemalte Pferde",   # Erkennungszeichen bei 120 px
        prose=(
            "Ein altes Kettenkarussell in der Dämmerung, Lichter gerade an: das Rad auf dem "
            "lackierten Holzpodest zwischen bemalten Pferden mit Messingstangen, Spiegel und "
            "Goldornament in der Mitte, Glühbirnengirlanden, die Scheibe dreht leicht und die "
            "Randlichter ziehen Streifen. "
        ),
        note_de=(
            "KURIOS-Fassung, nicht Sprosse V — verchromtes Presswerk mit Pressnaht und Rosette "
        ),
        rendered=False,
    ),
]
```

---

## 5 · Frontend

### 5.1 Die Fassungen — die Raritätsleiter ist die Materialleiter des Radsports

Jeder Fahrer kennt diese Reihenfolge und weiß, was sie kostet; deshalb muss die Seltenheit
sich nicht erklären. **Die Platte ist heilig, die Fassung spricht:** innen ändert sich nie
etwas — gleicher Ausschnitt, gleicher Verlauf, gleiche Schriftgrößen —, also vergleicht das
Auge nur die Rahmen.

| Sprosse | Material | Kontur | Bewegung |
|---|---|---|---|
| I alltag | Rohaluminium sandgestrahlt `#1A1A1A` | Fase, starkes Korn | keine |
| II ernsthaft | Eloxal olive `#2C3524` | Farbe mit Metall darunter | Glanzband 9 s |
| III selten | Gebürsteter Stahl + Säurelippe `#59761A` | Bürstung 1 px, **Schraubköpfe**, Riffelung | Glanzband 7 s |
| IV legendaer | Carbon-Twill + Eloxal-Fase `#BFFF3C` | 2×2-Köpergewebe aus zwei 45°-Rastern | **Lichtlauf um die Kante** 4,6 s, Schriftglanz |
| V mythisch | Eloxiertes Titan | Anlauffarben als Kegel im Material | Lichtlauf 3,8 s, Farbwanderung 14 s, Krone |
| kurios | Verchromtes Presswerk `#E8C25A` | Billigblech mit **Pressnaht**, Rosette | Glanzband 4,2 s, zu schnell — mit Absicht |

Zwei Details tragen mehr als jede Farbwahl: eine **1,2-px-Lichtkante oben und eine dunkle
unten** (was ein gefrästes Bauteil bei Licht von oben macht) und ein **Korn-Overlay im
Überlagern-Modus** — ohne Korn sieht jedes Metall nach Farbverlauf aus. Der Lichtlauf ist ein
drehender `conic-gradient` **unter** dem Materialkörper; der liegt 1,6 px innerhalb der Karte,
also sieht man vom Kegel nur diesen Rand. Alles reines CSS, kein JavaScript.

### 5.2 Feier-Seite (`frontend/src/editorial/w3/W3RideCelebrateView.tsx`)

Die Seite existiert, bucht beim Wisch wirklich (`POST /rewards/ride/:id/claim`) und hat eine
eigene Doktrin: **violett ist ein Versprechen, lime ist eine Quittung**, und *„sealed shows
nothing"* — vor dem Wisch steht `?` an der Stelle der Zahl. Der Ort folgt derselben Regel.

- **Vorher:** eine Ridr-Kiste (176 × 176, Nahschwarz-Verläufe, vier Nieten, Klebenaht, das
  Markenzeichen aus `components/RidrMark.tsx` im **Marken-Lime `#C6F53C`**, nicht im
  Interface-Säuregrün). Sie zittert in drei Stößen, jeder stärker, Naht und Zeichen glühen mit.
  Genannt wird nur, **warum** ein Ort wartet und **wie selten** er ist — nie welcher.
- **Auslösen:** Deckel fliegt, acht Lime-Splitter, zwei Ringe, ein Blitz. Haptik
  `navigator.vibrate([16,40,16,40,70,120,240])`, dazu ein Tick pro Viertel beim Ziehen und
  einer, wenn der Name sitzt.
- **Auflösung:** vier vorgerenderte Ebenen, Blockgröße 28 → 14 → 6 → scharf, crossfaden über
  1,5 s; parallel Sättigung 0,34 → 1, Helligkeit 0,5 → 1, Maßstab 1,05 → 1. Das liest sich als
  **entwickeln**, nicht als einblenden.
- **Nachher:** die Platte bekommt den ganzen Bildschirm (390 × 693 = das 9:16, das geteilt
  wird). **Keine Punkte auf dem Platten-Bildschirm** — die Zahl war das Versprechen und ist
  bezahlt, sie steht im Beleg darunter.
- **Schließen, dreifach:** Griff oben (wischt nach unten), ✕ in abgedunkelter Scheibe mit
  eigenem Rand (auf hellem Bild war es vorher unsichtbar), ✓ neben TEILEN. Alle drei landen auf
  demselben Schirm: **nichts verfällt**.
- **Statistik:** eine 56-px-Zahl + Schwellenzeile („5 000 überschritten · +12 m") +
  Höhenprofil mit leuchtendem längsten Anstieg + Liste. **Keine vier gleich großen Kacheln,
  keine Icons** — ein Routen-Icon neben „DISTANZ" trägt null Information.

### 5.3 Erfolge-Seite

Erreicht als **Raster** (Trophäen wollen nebeneinander hängen, damit man die Lücke findet),
offen als **Liste** (jede Zeile trägt Bedingung und Abstand, und Text im Raster wird
unlesbar). Gesperrte Kacheln **verpixelt, nicht verschlossen** — 14-px-Blöcke sagen etwas über
den Ort, ein Schloss sagt nur „nein", und es ist dieselbe Mechanik wie beim Öffnen.
Sortierung: Schwierigkeit aufsteigend als Bänder, innerhalb eines Bandes das Näheste oben.

---

## 6 · Renderpfad für eine neue Szene

Prompt-Reihenfolge: `bike_build.edit_prompt([], world=prose, tier=tier)` + `ENVY_CUES` +
`DEADPAN` + (`INCIDENT`, wenn etwas passieren soll) + (`MOON_STRUCTURE` **nur** bei `A4`) +
(`MOTOR_C` bei Kurios) + `REAL_PLACE` + (`RITUAL` **oder** `UNTOUCHED`) + `NO_DISPLAY`.
Aufruf: `cyclr_studio.edit_image(bike_b64, prompt, key, aspect=cyclr_studio.STAGE_ASPECT)`.

### 6.1 `REAL_PLACE` — der Ort existiert

```
THIS IS A REAL PLACE THAT EXISTS AND IT IS PHOTOGRAPHED STRAIGHT. Everything in it is at its
true size, in its true material, at a believable distance from a camera standing on the floor:
an ordinary photograph of somewhere a person could actually walk into today. The humour comes
entirely from a bicycle being in this particular real room, and from what this room does to a
guest — never from anything being enlarged, shrunk, multiplied, staged or arranged for the
picture.
```

### 6.2 `RITUAL` — genau ein geliehener Gegenstand (ersetzt `UNTOUCHED`)

```
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

### 6.3 `UNTOUCHED` — für alle Szenen **ohne** Ritual

```
NOTHING IS PLACED ON THE BICYCLE AND NOTHING IS DRAWN ON IT — no cloth, no strap, no tag, no
ribbon, no face, no eyes, nothing resting on or hanging from any part of it, and it is not
locked or chained to anything. It stands on its own, upright on both wheels, completely
unchanged.
```

### 6.4 `MOON_STRUCTURE` — nur für `A4`

```
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

### 6.5 `MOTOR_C` — für Kurios: der Ernst ist der Witz

```
REGISTER — THE PICTURE DOES NOT KNOW THE ACHIEVEMENT WAS SMALL. It is photographed with
complete, unironic grandeur: the scale monumental, the light reverent, the craft that of an
expensive campaign still. Every surface is materially honest and every proportion is serious.
Nothing in the frame is comic, cartoonish, tilted, exaggerated or winking; no part of the
composition acknowledges that anything is funny. The humour lives entirely OUTSIDE the image,
in the gap between this ceremony and what earned it, and the render's job is to hold the
ceremony perfectly straight.
```

### 6.6 `ENVY_CUES` · `DEADPAN` · `INCIDENT` · `ILLUSTRATES`

```
ENVY_CUES
IT MUST WORK AT THUMBNAIL SIZE: one clear subject, one clear idea, enormous tonal separation
between the machine and its ground. IT MUST OWN ONE COLOUR — a single dominant hue across the
large areas, every other object a tonal variation of it or near-neutral.

DEADPAN
REGISTER — PLAY IT COMPLETELY STRAIGHT. A serious, expensive, immaculately lit photograph shot
as a premium campaign still. Nothing cartoonish, nothing exaggerated, nothing winking at the
viewer, no comic styling. Total material fidelity throughout.

INCIDENT
THE SCENE IS MID-SOMETHING: at least FIVE things going on besides the bicycle at THREE DEPTHS
— close to the lens and out of focus, at the machine's own distance, receding far behind — and
at least TWO of them IN MOTION, caught by the shutter. The ground immediately around the
bicycle stays clear.

ILLUSTRATES   ({cond} = die Bedingung in einem Satz)
THE PICTURE HAS TO SHOW THE CONDITION THE RIDE WAS RIDDEN IN, in the air and on the ground
rather than in any caption: {cond} — visible in the light, in the temperature of the colour,
in what the surface is doing and in what the atmosphere is doing, so that somebody who sees
the picture understands what was survived before anybody tells them a number.
```

### 6.7 `NO_DISPLAY` — unverzichtbar, siehe §9

```
NO DISPLAY SURFACE ANYWHERE: no screen, no notice board, no framed picture, no poster, no
plaque, no inscription, no sign and no illuminated board, and no large blank wall plane or gap
in the composition where one could stand. No writing, no numbers and no lettering on any
surface — including on the municipal object itself — except what is already printed on the
bicycle. No proper nouns are depicted. Nobody is present and nobody is depicted in any image,
statue, silhouette or reflection.
```

---

## 7 · Der Tausch: eine Szene, viele Fahrer

Pro Fahrer neu zu rendern kostet die Szene (gemessene Umgebungsdrift **55,2**). Statt dessen:
**ein kanonisches Rendering pro Szene**, und für jeden weiteren Fahrer gehen *Zielbild + Rad
des Fahrers* in einen Tausch. Gemessene Drift **1,7 – 7,9**.

Sampling: `{'temperature': 0.0, 'top_k': 1.0}`. Determinismus gibt es bei diesem Modell **nicht** — kein Seed und
keine Temperatur macht die Ausgabe reproduzierbar; `temperature=0` mit `top_k=1` kauft 11 %
weniger Drift und nichts weiter.

```
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

**Der letzte Absatz ist der wichtigste, und er ist eine Korrektur.** Eine frühere Fassung
verlangte „der Ort markiert das Rad" — daraufhin hat das Modell auf dem Mond, wo das Original
ein sauberes Rad zeigt, **Staub erfunden**. Die Regel heißt: *das Zielbild entscheidet.* Was
das Rad dort an Staub, Nässe oder Sauberkeit trägt, trägt das neue genauso; was es dort nicht
trägt, trägt es hier auch nicht. Reif auf den Felgen entsteht im **kanonischen** Rendering,
nie im Tausch.

---

## 8 · Ausdrücklich offen

- **Sprosse `mythisch` existiert im Code nicht.** `bike_build.TIER_INTENSITY` hat vier Rungen.
  Braucht einen Eintrag plus Registertext.
- **`scene_unlocks` fehlt komplett.** Ohne die Tabelle sind „12 von 40" und „1 von 9 Fahrern"
  Behauptungen — und Behauptungen sind in dieser App verboten. Bis dahin: Zeile weglassen,
  nicht schätzen.
- **„Die Finsternis"** braucht ein Fahrtdatum gegen eine Liste echter Termine. Das einzige
  Feld im Katalog, das es nicht gibt.
- **45 von 50 Szenen sind nie gerendert.** Von vier Prüfrenderings sind zwei beim ersten
  Versuch durchgefallen (§9). Jede Szene braucht ein Rendering, bevor sie freigegeben wird.
- **Nächste sechs Renderings**, jedes prüft eine Analogie: Sessellift (A2, die wichtigste),
  Sauna (das Ritual), Indoor-Studio (A3, technisch das schwerste), Hotelbett (ob A2 nach oben
  trägt), Blitzer (120 px), Karussell (gegen den gerenderten Triumphbogen).
- **`stage_swap.py` wird von nichts aufgerufen.** Braucht zwei Entscheidungen: welches
  Rendering die kanonische Vorlage einer Szene ist, und ob der Cache-Key Szene × Rad ist.

---

## 9 · Fallen, jede schon einmal zugeschnappt

- **Textleaks.** Anzeigeflächen und beschriftete Gattungen ziehen Schrift ins Bild: „COSMIC
  VOID", „ETERNAL GULF", „SUPERMARKET", „KREISSÄGE". Auslöser waren Eigennamen in der Prosa
  und Gattungsangaben wie „galaxies and nebulae" — das ist Weltraumgrafik, und die ist
  beschriftet. **Himmel als Lichtverhalten beschreiben, nicht als benannte Objekte.**
  `NO_DISPLAY` ist Pflicht. Besonders gefährdet: Museum, Kegelbahn, Kryokammer, Backstube.
- **Farbfolgen.** „orange durch rosé nach grün" liest sich als Verlaufstafel — der erste
  Salzspiegel bekam drei harte senkrechte Bänder. Stattdessen: „eine einzige durchgehende
  Abstufung, ohne Kanten".
- **Gegenstände als Fläche beschreiben.** Die Wasserwaage war „Rad auf gelbem Streifen", bis
  Dicke, gefräste Flanke und ein Ende dazukamen.
- **Negationen benennen, was sie verbieten.** Positiv formulieren; eine Verbotsliste legt jedes
  verbotene Wort ins Kontextfenster. `SWAP` enthält bewusst kein „do not".
- **Alembic: ein Kopf.** Zwei Worktrees mit je einer Migration lassen den Container beim Booten
  sterben und die API 502en.
- **Kein FK auf `activities`** — Hypertable mit zusammengesetztem PK; ein FK dort hat Prod
  schon einmal crashen lassen (02.09.2026).
- **Railway ist CLI-only** (`railway up`, kein Repo verbunden, `git push` deployt nichts), es
  gibt **zwei Hosts** (`ai-cycling-coach-api` und `editorial`, beide SPA + API aus dem
  Root-Dockerfile), `SPA_CACHE_EPOCH` muss beim Frontend-Deploy hochgezählt werden, und
  Verifikation läuft über **Chunk-Inhalt** statt Bundle-Hash (`curl --compressed`, sonst grept
  man gzip-Bytes).

---

## 10 · Was existiert, wo

| Sache | Ort | Stand |
|---|---|---|
| Feier-Seite | `frontend/src/editorial/w3/W3RideCelebrateView.tsx` | echt, live, bucht wirklich |
| Kulissen-Katalog | `backend/app/services/backdrops.py` | 11 Einträge, **kein** Raritätsfeld |
| Register pro Sprosse | `backend/app/services/bike_build.py` → `TIER_INTENSITY` | 4 Rungen |
| Bild-Prompt | `bike_build.edit_prompt` | inkl. `no_additions` (Besitzgrenze) |
| Renderaufruf | `backend/app/services/cyclr_studio.py` → `edit_image` | 2K, 9:16, `STAGE_ASPECT` |
| Rahmen-Normalisierung | `backend/app/services/stage_frame.py` | live, Kontaktstreuung 0,203 → 0,005 |
| Tausch | `backend/app/services/stage_swap.py` | fertig + 11 Tests, **wird von nichts aufgerufen** |
| Marke | `frontend/src/components/RidrMark.tsx` | Pfad + `RIDR_LIME #C6F53C` |
| Gerenderte Platten | Einfahrt, Waschanlage, Hölle, Mond, Rand der Welt, Triumphbogen, Salzspiegel, Wasserwaage, Zwerge | im Sitzungs-Arbeitsordner, **nicht im Repo** |
