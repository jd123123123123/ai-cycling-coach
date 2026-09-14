"""Cassette catalogue. Prose retained verbatim; release eligibility is separate.

RiderBackdrop already supplies a permanent per-rider unlock ledger. Do not create
another table with the same meaning. Unreviewed plates never enter the live catalogue.
"""
from dataclasses import dataclass
from math import isfinite
from operator import ge, gt, le, lt
from app.services.earn_modifiers import RideFacts

@dataclass(frozen=True)
class Scene:
    id: str
    name_de: str
    tier: str
    unlock_de: str
    axis: str | None
    op: str | None
    threshold: float | None
    analogy: str
    joke_de: str
    sign_de: str
    prose: str
    ritual_de: str | None = None
    note_de: str | None = None
    rendered: bool = False

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
        unlock_de="Fahrt über 2 Stunden mit Regen",
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

CATALOGUE = {s.id: s for s in SCENES}
# Asset manifest, independently reviewed. The archival rendered flag is not authorization.
RELEASED = frozenset({"waschanlage", "mond", "startrampe"})
TIERS = ("alltag", "ernsthaft", "selten", "legendaer", "mythisch")

def matches(scene: Scene, f: RideFacts) -> bool:
    def n(key, op, threshold):
        v = getattr(f, key, None)
        return isinstance(v, (int, float)) and not isinstance(v, bool) and isfinite(v) and op(v, threshold)
    # Positive ride evidence, never a default zero or an absent fact.
    if not (n("distance_m", gt, 0) and n("duration_s", gt, 0)):
        return False
    sid = scene.id
    special = {
        "backstube": lambda: n("start_hour", ge, 0) and n("start_hour", lt, 5),
        "tankstelle": lambda: n("start_hour", ge, 22) and n("start_hour", lt, 24),
        "waschsalon": lambda: f.was_wet is True,
        "schulhof_radstand": lambda: f.with_crew is True,
        "liegestuhl": lambda: False,  # A no-ride rest day needs a plan-day event, not ride facts.
        "planetarium": lambda: f.in_dark is True,
        "schuhputzautomat": lambda: f.surface == "gravel" and n("distance_m", lt, 40000),
        "finsternis": lambda: False,  # Requires verified eclipse date AND location; no proxy.
        "rolltreppe": lambda: False,  # Max gradient does not prove 1 km sustained at 15%.
        "hau_den_lukas": lambda: False,  # No measured IF without power: do not infer one.
    }
    if sid in special:
        return bool(special[sid]())
    ops = {"≥": ge, ">": gt, "≤": le, "<": lt}
    if scene.axis is None or scene.op not in ops or scene.threshold is None:
        return False
    if not n(scene.axis, ops[scene.op], scene.threshold):
        return False
    # These are conjunctions even though their catalogue rows also have an axis.
    gates = {
        "trockenraum": lambda: f.was_wet is True,
        "waschanlage": lambda: f.was_wet is True,
        "kegelbahn": lambda: n("distance_m", ge, 60000),
        "billardtisch": lambda: n("distance_m", ge, 40000),
        "faehre": lambda: f.with_crew is True,
        "autoscooter": lambda: f.with_crew is True,
        "massageliege": lambda: False,  # Clarify contradictory rest-day/duration brief before release.
        "salzspiegel": lambda: f.was_wet is True,
        "kuehlturm": lambda: f.in_dark is True,
        "moorbad": lambda: f.surface == "gravel",
        "bambusdom": lambda: f.surface == "gravel",
        "reisterrassen": lambda: n("max_gradient_pct", ge, 20),
        "gewaechshaus": lambda: f.in_dark is True,
        "hoelle": lambda: n("temp_c", ge, 40),
        "duene": lambda: n("temp_c", ge, 35),
        "gewitter": lambda: f.was_wet is True,
        "sternwarte": lambda: f.in_dark is True,
        "nordlicht": lambda: f.in_dark is True,
        "meeresleuchten": lambda: f.in_dark is True,
        "gletschertunnel": lambda: n("temp_c", le, -10),
    }
    return bool(gates.get(sid, lambda: True)())

def plate_url(sid: str) -> str | None:
    return f"/w3/scenes/{sid}.webp" if sid in RELEASED else None

def progress(scene: Scene, rides: list[RideFacts]) -> dict:
    # Only single-ride quantities. Weather, max speed and opportunities are not goals to chase.
    if scene.axis not in {"distance_m", "elevation_gain_m", "duration_s"} or scene.op not in {"≥", ">"}:
        return {"kind": "opportunity", "current": None, "target": None, "pct": None}
    if scene.id not in {"einfahrt", "mond", "startrampe", "rand_welt"}:
        return {"kind": "opportunity", "current": None, "target": None, "pct": None}
    values = [getattr(f, scene.axis) for f in rides if getattr(f, scene.axis, None) is not None]
    values = [v for v in values if isfinite(v) and v >= 0]
    value = max(values) if values else None
    return {"kind": "single_ride", "current": value, "target": scene.threshold,
            "pct": min(1, value / scene.threshold) if value is not None else None}
