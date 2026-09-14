# RIDR – 50 zusätzliche Easter-Egg-Challenges

Konzeptstand: 14.09.2026. **Genau 50 neue Konzepte, keine bereits freigeschalteten Erfolge.** Keine Bilder erzeugt, keine Produktregeln aktiviert. Gegen die Namen, Auslöser und Motive aus `backend/app/services/scene_catalogue.py` und `docs/codex-stage-scenes.md` geprüft. Überschneidende Fahrten dürfen mehrere unterschiedliche Erfolge erfüllen; eine neue Kulisse erhält aber nicht einfach eine vorhandene Bedingung unter neuem Namen. Insbesondere ergänzt die Kurzstrecke zusätzliche Geometrie oder Serien statt den bestehenden Karussell-Auslöser zu kopieren.

## Verbindliche Regeln für sämtliche Einträge

- **B – Basis:** abgeschlossene, eindeutig deduplizierte Outdoor-Radaktivität aus einem Gerätedatensatz; `sport=cycling` allein reicht wegen Indoor-/Virtual-Zuordnung nicht. Erkannter Outdoor-Untertyp, keine manuelle/synthetische Aktivität, mindestens 250 m und 120 echte Bewegungssekunden. B setzt die unten definierten Profile G und T voraus; ihre Wiederholung im Eintrag betont besonders relevante Daten. Als E-Bike erkannte Fahrten bleiben bei Distanz-, Kalender- und Routenfunden möglich; tempo- oder trittbezogene Erfolge schließen sie aus. Nicht erkannter Outdoor-Untertyp sperrt. Eine Datei in Teilstücke zu importieren zählt nicht als mehrere Fahrten.
- **G – GPS:** zeitlich geordnete reale Koordinaten, mindestens 95 % Abdeckung der beanspruchten Bewegungszeit, höchstens 10 s Lücke; stationären GPS-Jitter entfernen. Geräte- und Spurstrecke weichen höchstens 5 % oder 30 m ab, je nachdem, was größer ist. Als harte technische Ausreißer gelten GPS-Teilgeschwindigkeit > 100 km/h oder eine Änderung geglätteter 5-s-Geschwindigkeit um > 15 m/s innerhalb 5 s. Diese großzügigen Ausschlussgrenzen sind keine erlaubten Fahrgeschwindigkeiten. Unplausible Sprünge, widersprüchliche Sensoren und belegte Fahrzeug-/Transportabschnitte sperren die betroffene Fahrt; keine bloße Entfernung eines Spitzenwerts, um sie passend zu machen. Unter 1 km: mindestens 30 gültige Positionspunkte und mindestens 150 m räumliche Ausdehnung. Das sind neue Qualitätsregeln, keine Behauptung über vorhandene Verarbeitung.
- **T – Zeit:** echte Zeitstempel einschließlich Aufnahmeende und Pausen. Bewegungszeit ist die Summe gültiger Intervalle mit Geschwindigkeit ≥ 2 km/h; Gesamtzeit ist Ende minus Start. Ein Streamindex ist kein Pausennachweis. Kalenderregeln verwenden die zum Startort und Datum bestimmte IANA-Zeitzone; UTC bleibt Vergleichsbasis. Grenzwerte beziehen sich auf ungerundete Daten. `a–b` ist einschließlich beider Grenzen; `<` bleibt strikt.
- **S – Tempo/Tritt:** B + G + T, belegter unmotorisierter Outdoor-Sporttyp und Geräteherkunft, Geschwindigkeit durch GPS bestätigt; Kadenzdeckung ≥ 95 % im geprüften Abschnitt, mindestens 60 % seiner Bewegungszeit mit Kadenz ≥ 30 rpm. E-Bike, Indoor, Virtual, unbekannte Unterstützung, Schieben, Fahrzeugmitnahme und unplausible Sensorwerte sperren. Ein frei gewählter Aktivitätstitel genügt nicht. Durchschnitt = Abschnittsdistanz / dessen Bewegungszeit, keine Maximalgeschwindigkeit.
- **V – schnelles oder enges Tempo:** zusätzlich S und eine für Datum und Zeit verifizierte, abgesperrte Radstrecke mit erlaubtem Zugang und Betreiberfreigabe für das Geschwindigkeitsband. Jede gültige 5-s-Geschwindigkeit muss unter dem niedrigeren Wert aus dokumentierter Betreibergrenze und Challenge-Obergrenze liegen. Unbekannte Grenzen, öffentliche Straßen, nasse Strecke, aktive Wetterwarnung oder fehlender Zustandsnachweis sperren. Ein Zahlenlimit allein beweist keine Sicherheit. Keine Live-Aufforderung zur Beschleunigung, kein Straßenrekord, keine Zusatzbelohnung fürs Überschreiten. Diese Daten fehlen derzeit; solche Konzepte sind bis dahin nicht auswertbar.
- **R – Route:** G + T, für diese Berechnung auf 10 m Wegabstand resampeln. Gleiche Route bedeutet ≥ 90 % längengewichtete Überdeckung beider Spuren innerhalb 25 m; Richtung wird aus mindestens 50 m langen Teilstücken bestimmt. „Zurück am Start“ bedeutet ≤ 100 m Abstand. Graph- und Formenregeln verwenden verlässlich zugeordnete fahrbare Wege; unsichere Zuordnung sperrt. Höhenregeln brauchen ein geprüftes, geglättetes Höhenprofil, keine Summe aller GPS-Zacken.
- **H – Historie:** vollständiger, bestätigter Import für das ganze genannte Fenster, nur B-Fahrten und eindeutig verschiedene Aktivitäten. Fehlender Import beweist weder einen Ruhetag noch eine Pause. Mehrere Aktivitäten am gleichen Kalendertag zählen nur dort mehrfach, wo ausdrücklich verlangt. Ein Erfolg wird pro Person einmal vergeben; keine künstlichen Seltenheitsprozente.
- **W – Wetter:** archivierte Beobachtungen am wirklichen Ort und zur wirklichen Zeit mit Quelle und vollständiger Fensterabdeckung. Stundenwerte am Startort reichen nicht für minutengenaue Wechsel oder Ereignisse unterwegs. Die Einträge nennen die nötige Auflösung; fehlende Werte, unbekannte Einheiten oder nur eine Vorhersage sperren. Wetterfunde werden erst nach Abschluss rückblickend gezeigt und nicht als zu jagendes Wetterziel angeboten.
- **Fehlend = gesperrt:** Das gilt für jedes im jeweiligen Eintrag aufgeführte Datum und jedes geerbte Profil. `null`, fehlende Samples, unbestätigte Herkunft, unvollständige Geschichte und widersprüchliche Daten bedeuten „nicht prüfbar“, nie `0`, „trocken“, „allein“ oder automatisch erfüllt. Nicht prüfbar heißt keine Abwertung der Fahrt.

**Schwierigkeit** ist redaktioneller Aufwand, keine statistische Seltenheit: I leicht; II bewusst; III anspruchsvoll; IV ausdauernd/aufwendig; V Langzeitsammlung. **Zufallsfund** beschreibt Gelegenheit statt sportlicher Härte. Wetter und Kalender lassen sich nicht sinnvoll in Leistungsstufen hochstufen.

**Bildvertrag für alle 50:** Luxus-W3, fotografisch ernst, dunkle hochwertige Materialien, ein dominanter Farbton, klare Silhouette. Dasselbe Besitzerfahrrad bleibt exakt an denselben Bildkoordinaten, in derselben Größe, Geometrie, Lackierung und Perspektive, auf beiden Reifen am Boden. Keine erfundenen Teile, keine Gegenstände am Rad, keine Kostüme. Umgebung und Boden tragen die Pointe. Keine Menschen, Bildschirme, Schilder, UI-Texte oder Zahlen; vorhandene Rad-Decals bleiben. Kein Gamer-Neon, keine Weltraum-Allzweckkulisse, keine vergrößerten Alltagsgegenstände. Jeder genannte 120-px-Gag ist ein Prüfauftrag für ein späteres Rendering, noch kein bestandener Bildtest. Die Kulisse vermittelt die Art der Leistung; exakte Meter und Zeitgrenzen gehören in die Regelbeschreibung außerhalb des Bildes.

## Kurz, aber mit eigenem Anlass

### 01 · `ee_001_tuersteher` · Der Türsteher
**Zeile:** „Für diesen Ausflug wurde die große Tür geöffnet.“
**Freischaltung / Zeitraum:** Eine B+G+T-Fahrt mit 250 m ≤ Distanz < 1.000 m; Start und Ende mindestens 150 m auseinander; mindestens 120 Bewegungssekunden.
**Messdaten / Lücke:** Distanz, Bewegung, Spur, Outdoor-Herkunft; fehlt eines, gesperrt. **Stufe:** I.
**Kulisse / 120 px:** Dunkler Grandhotel-Eingang; unmittelbar hinter dem Rad eine monumentale, echte offene Flügeltür, der kurze Vorplatz endet bereits am Bordstein. Warmes Messing. **Gag:** überwältigend große offene Tür für einen winzigen Weg.

### 02 · `ee_002_kurzstreckentarif` · Kurzstreckentarif
**Zeile:** „Die Anreise war kürzer als der rote Teppich klingt.“
**Freischaltung / Zeitraum:** Eine B+G+T-Fahrt mit 1.000 m ≤ Distanz < 5.000 m; Endpunkt mindestens 600 m vom Start und Luftlinie/Strecke ≥ 0,8, also eine kurze direkte Verbindung.
**Messdaten / Lücke:** Strecke, Start-/Endkoordinaten, Zeit, Herkunft; fehlt eines, gesperrt. **Stufe:** I.
**Kulisse / 120 px:** Kleiner Theatervorraum in Burgunder; ein realer, sehr kurzer Teppich verbindet zwei unmittelbar benachbarte offene Türen. **Gag:** feierlicher Teppich, der schon wieder vorbei ist.

### 03 · `ee_003_dreifache_espresso` · Dreifacher Espresso
**Zeile:** „Drei kleine Ausfahrten. Jetzt gilt das als Verkostung.“
**Freischaltung / Zeitraum:** Drei B+G+T-Fahrten an drei verschiedenen Tagen innerhalb sieben lokaler Kalendertage, jede 250–999 m und ≥ 120 Bewegungssekunden.
**Messdaten / Lücke:** H, Einzelstrecken, Zeiten, Spurqualität; unvollständige Woche sperrt. **Stufe:** II.
**Kulisse / 120 px:** Espresso-Bar nach Schluss, dunkler Nussbaum; auf der niedrigen echten Servicetheke drei kleine weiße Espressotassen eng als Servicegruppe. **Gag:** drei winzige Portionen unter einer schweren professionellen Maschine.

### 04 · `ee_004_zweite_portion` · Zweite Portion
**Zeile:** „Einmal kurz war offenbar nicht genug.“
**Freischaltung / Zeitraum:** Genau zwei B-Fahrten an einem lokalen Tag; jeweils ≥ 500 m und ≥ 180 Bewegungssekunden, zusammen < 5.000 m; dazwischen ≥ 60 Minuten ohne Aufnahme. Zusammengehörige Splitimporte ausgeschlossen.
**Messdaten / Lücke:** H, G, T inklusive Enden, Distanzen; fehlende Tagesabdeckung sperrt. **Stufe:** II.
**Kulisse / 120 px:** Servicegang eines edlen Restaurants, zwei übereinander geöffnete Speiseaufzugfächer, jedes mit einer kleinen silbernen Cloche. **Gag:** das zweite winzige Menü kommt schon angefahren.

### 05 · `ee_005_taschenformat` · Taschenformat
**Zeile:** „Eine ganze Woche passt ins Handgepäck.“
**Freischaltung / Zeitraum:** Innerhalb sieben lokaler Tage vier B-Fahrten an vier Tagen, jeweils 500–4.999 m; Summe dieser vier < 10 km. Bei mehr als vier Fahrten zählen die chronologisch ersten vier B-Fahrten des Fensters.
**Messdaten / Lücke:** H, G, T, Distanzen; fehlende Historie sperrt. **Stufe:** III.
**Kulisse / 120 px:** Gepäckraum eines noblen Nachtzugs; im offenen niedrigen Gepäckregal ein einzelner kleiner Lederkoffer unter riesiger Gewölbedecke. Rad steht davor auf dem Boden. **Gag:** viel Reisezeremoniell für den kleinsten Koffer.

## Routen mit trockenem Kommentar

### 06 · `ee_006_retourenschein` · Retourenschein
**Zeile:** „Die Landschaft wurde vollständig zurückgegeben.“
**Freischaltung / Zeitraum:** Eine B+R-Fahrt ≥ 10 km: ein Wendepunkt zwischen 45 und 55 % der Strecke, danach ≥ 90 % des Rückwegs gegenläufig auf dem Hinweg; Startnähe ≤ 100 m; keine zusätzliche Runde > 500 m.
**Messdaten / Lücke:** Zeitlich gerichtete Spur und Wendepunktableitung; fehlendes R sperrt. **Stufe:** II.
**Kulisse / 120 px:** Paketzentrum in mattem Graphit; zwei parallele Förderbänder laufen über eine sichtbare U-Kurve wieder zur gleichen Hallenöffnung. **Gag:** die Sendung kommt zurück, das Rad wartet neben der Anlage.

### 07 · `ee_007_doppelknoten` · Doppelknoten
**Zeile:** „Du hast die Runde fachgerecht verknotet.“
**Freischaltung / Zeitraum:** Eine B+R-Fahrt ≥ 12 km bildet im zugeordneten Wegenetz genau zwei einfache Schleifen ≥ 3 km mit genau einem gemeinsamen Knoten; gemeinsame Kanten insgesamt ≤ 5 %; Start und Ende am gemeinsamen Knoten ± 100 m.
**Messdaten / Lücke:** Topologischer Routengraph, Spur und Distanzen; unsicherer Kreuzungsknoten sperrt. **Stufe:** III.
**Kulisse / 120 px:** Kleine Seilerei in warmem Hanfbraun; hinter dem freien Boden hängen zwei ineinanderlaufende, normal große Tau-Schlaufen am Arbeitsgestell. **Gag:** die markante Achterform aus dickem Tau.

### 08 · `ee_008_alle_sackgassen` · Alle Sackgassen
**Zeile:** „Viermal nachgesehen. Wirklich kein Durchgang.“
**Freischaltung / Zeitraum:** Eine B+R-Fahrt ≥ 10 km besucht vier verschiedene kartierte Wegenden; jeweils ≥ 200 m derselben Kante hinein und entgegen wieder hinaus, Umkehr innerhalb 40 m des Endes; kein verbotenes Befahren.
**Messdaten / Lücke:** Routengraph einschließlich Zugangsrechten und Wegenden, gerichtete Spur; unbekannte Rechte sperren. **Stufe:** III.
**Kulisse / 120 px:** Lagergang mit mehreren kurzen Regalbuchten, jede endet direkt an einer Mauer; der sichtbare Hauptgang bleibt frei. Ockerfarbenes Holz. **Gag:** vier aussichtslose Öffnungen nebeneinander.

### 09 · `ee_009_lineal` · Das Lineal
**Zeile:** „Die Kurven wurden separat bestellt.“
**Freischaltung / Zeitraum:** Eine B+R-Fahrt ≥ 15 km; Endpunktabstand/Strecke ≥ 0,97, mindestens 95 % der Spur maximal 50 m von der Start-End-Geraden; kein Hin-und-zurück.
**Messdaten / Lücke:** Spur, Distanz und Geradenabweichung; fehlendes G sperrt. **Stufe:** III.
**Kulisse / 120 px:** Lange dunkle Schreinerei; hinter dem Rad läuft eine präzise Reihe echter gerader Hobelbänke bis ins Tageslicht. **Gag:** eine einzige völlig gerade Materialflucht ohne Ausweichmöglichkeit im Bild.

### 10 · `ee_010_randnotiz` · Randnotiz
**Zeile:** „Einmal außen herum. Die Mitte hatte frei.“
**Freischaltung / Zeitraum:** Eine B+R-Fahrt ≥ 8 km umrundet genau einen kartierten See: geschlossene Spur, See vollständig im Spurpolygon; ≥ 80 % der Strecke im Landkorridor bis 300 m vom Ufer; keine Fährpassage.
**Messdaten / Lücke:** Seegeometrie, Land-/Wegnetz, Spurpolygon; fehlt Karte oder eindeutiger See, gesperrt. **Stufe:** II.
**Kulisse / 120 px:** Dunkler Innenhof mit großem rundem Wasserbecken und trockenem umlaufendem Gang. **Gag:** der leere Wasserkern beansprucht fast alles, der fahrbare Rand ist schmal.

### 11 · `ee_011_vier_ecken` · Vier Ecken
**Zeile:** „Die Runde wurde mit dem Winkel geprüft.“
**Freischaltung / Zeitraum:** Eine B+R-Fahrt ≥ 8 km; geschlossene Route wird mit 100-m-Toleranz zu genau vier Seiten vereinfacht, jede ≥ 1 km; vier Innenwinkel 75–105°, Gegenüberseiten maximal 20 % Längenunterschied.
**Messdaten / Lücke:** Geschlossene Spur, deterministische Polygonvereinfachung; mehrdeutige Form sperrt. **Stufe:** III.
**Kulisse / 120 px:** Klarer rechteckiger Kreuzgang mit vier massiven Steinpfeilern um einen leeren Hof. **Gag:** absurd ordentliches Rechteck statt romantischer Kurven.

### 12 · `ee_012_einfache_fahrt` · Einfache Fahrt
**Zeile:** „Für den Rückweg ist heute eine andere Abteilung zuständig.“
**Freischaltung / Zeitraum:** Eine B+R-Fahrt ≥ 25 km; Start-End-Abstand ≥ 20 km; gegenläufig wiederverwendete Wegstrecke < 5 %; kein Verkehrsmitnahmeabschnitt.
**Messdaten / Lücke:** Gerichtete Spur, Distanz, Transportprüfung; fehlende Werte sperren. **Stufe:** II.
**Kulisse / 120 px:** Vorplatz einer kleinen Kopfbahnhofhalle, im Hintergrund klar endende Gleise an breiten Prellböcken; Fahrrad auf dem sicheren Pflaster. **Gag:** hier ist eindeutig Schluss, die Rückreise bleibt offen.

### 13 · `ee_013_spiegelverkehrt` · Spiegelverkehrt
**Zeile:** „Gleiche Aussicht. Andere Leserichtung.“
**Freischaltung / Zeitraum:** Zwei B+R-Fahrten ≥ 10 km an verschiedenen Tagen innerhalb 14 Tagen: gleiche geschlossene Route, ≥ 90 % der gemeinsamen Kanten beim zweiten Mal in Gegenrichtung.
**Messdaten / Lücke:** H, R, zwei gerichtete Spuren; fehlender Richtungsbeleg sperrt. **Stufe:** II.
**Kulisse / 120 px:** Dunkler Spiegelschleifraum; zwei echte große Spiegelplatten stehen auf getrennten schrägen Transportgestellen und reflektieren den Raum entgegengesetzt. **Gag:** zwei gegeneinander gekippte Spiegel; keine zweite Fahrradkopie im Ausschnitt.

### 14 · `ee_014_wiedervorlage` · Wiedervorlage
**Zeile:** „Die Runde kam dreimal zur Unterschrift.“
**Freischaltung / Zeitraum:** Eine B+R-Fahrt fährt genau drei aufeinanderfolgende gleiche geschlossene Schleifen à ≥ 5 km; Längenabweichung zwischen Schleifen ≤ 5 %, Überdeckung ≥ 95 %, Zufahrt/Abfahrt zusammen ≤ 500 m.
**Messdaten / Lücke:** R, Schleifensegmentierung, chronologische Spur; fehlt eines, gesperrt. **Stufe:** III.
**Kulisse / 120 px:** Restaurierungswerkstatt mit einer echten mechanischen Dreifach-Druckwalze, drei gleich große Walzen hintereinander. **Gag:** dasselbe schwere Verfahren läuft sichtbar dreimal durch.

### 15 · `ee_015_lolli` · Der Lolli
**Zeile:** „Erst der Stiel. Dann der Spaß. Dann wieder der Stiel.“
**Freischaltung / Zeitraum:** Eine B+R-Fahrt ≥ 12 km: gemeinsamer Hin-/Rückweg jeweils ≥ 2 km und ≥ 90 % gegenläufige Überdeckung, dazwischen genau eine einfache Schleife ≥ 5 km; Schleife teilt mit dem Stiel nur den Anschlussknoten ± 100 m.
**Messdaten / Lücke:** R, Weggraph und Teilstrecken; unklare Trennung sperrt. **Stufe:** III.
**Kulisse / 120 px:** Garten eines alten Landsitzes: gerader Kieszugang mündet sichtbar in den Rundweg um ein einzelnes kreisförmiges Beet. **Gag:** unverkennbare Lolli-Geometrie aus wirklich begehbaren Wegen.

## Tempo ohne Straßenrennen

### 16 · `ee_016_teppichgleiter` · Teppichgleiter
**Zeile:** „Die Landschaft hatte ausreichend Zeit, dich zu begrüßen.“
**Freischaltung / Zeitraum:** Eine B+S-Fahrt 5–15 km, Bewegungsdurchschnitt 6–10 km/h, ≥ 30 Bewegungsminuten, Aufstieg ≤ 50 m; längste Pause ≤ 5 Minuten. Langsamkeit entsteht beim Radeln, nicht durch einen langen Stopp.
**Messdaten / Lücke:** S, Höhenprofil, echte Pausenzeiten; fehlende Kadenz sperrt. **Stufe:** I.
**Kulisse / 120 px:** Edler Teppichhandel; mehrere schwere Teppiche rollen sich auf dem niedrigen Arbeitstisch nur ein Stück ab. Tiefes Tabakbraun. **Gag:** eine breite, gemütlich eingerollte Teppichkante vor langer freier Fläche.

### 17 · `ee_017_schneckengang` · Schneckengang
**Zeile:** „Langsam oben ist weiterhin oben.“
**Freischaltung / Zeitraum:** Eine B+S-Fahrt enthält einen ununterbrochenen Anstieg ≥ 3 km und ≥ 200 m Höhengewinn, Abschnittsschnitt 6–10 km/h, keine Abfahrt > 20 m im Abschnitt; Gesamtstrecke ≥ 8 km. Keine Steilheitsprämie.
**Messdaten / Lücke:** S, geglättetes Höhenprofil, Abschnittsgrenzen; fehlt eines, gesperrt. **Stufe:** II.
**Kulisse / 120 px:** Historische Mühlenwerkstatt mit langsam arbeitender echter Förderschnecke, die Korn schräg nach oben transportiert; Rad sicher daneben. **Gag:** mächtige sichtbare Schneckenwindung schafft alles nach oben, ganz ohne Eile.

### 18 · `ee_018_expresswaesche` · Expresswäsche
**Zeile:** „So flott faltet hier sonst nur die Maschine.“
**Freischaltung / Zeitraum:** Eine B+S+V-Fahrt ≥ 20 km mit Bewegungsdurchschnitt 32–36 km/h, ≥ 30 Bewegungsminuten; 5-s-Obergrenze 40 km/h oder niedrigere Betreibergrenze.
**Messdaten / Lücke:** S, Strecken-/Zustandsfreigabe V, Mindestdistanz; V derzeit nicht vorhanden, daher gesperrt. **Stufe:** IV.
**Kulisse / 120 px:** Luxus-Hotelwäscherei in Elfenbein und dunklem Stahl; frisch gefaltete weiße Laken schießen als reale Bewegungsunschärfe aus einer großen Faltmaschine. **Gag:** die Wäsche hat einen schnelleren Feierabend als das Personal.

### 19 · `ee_019_rohrpost` · Rohrpost
**Zeile:** „Ein Kilometer wurde als Eilsendung zugestellt.“
**Freischaltung / Zeitraum:** Eine B+S+V-Fahrt ≥ 20 km enthält einen fortlaufenden 1-km-Abschnitt im Schnitt 36–39 km/h; 5-s-Obergrenze 40 km/h oder niedrigere Betreibergrenze; gesamte Fahrt ≥ 30 Bewegungsminuten. Kein Max-Speed-Auslöser.
**Messdaten / Lücke:** S, genaue Abschnittszeit, V; unbekannte Freigabe sperrt. **Stufe:** IV.
**Kulisse / 120 px:** Historische Rohrpostzentrale, ein transparentes kurzes Empfangsrohr mit gerade abbremsender Messingkapsel, dahinter dunkles Kupferrohrnetz. **Gag:** die einzelne Kapsel steckt sichtbar am gepolsterten Ziel.

### 20 · `ee_020_tempomat` · Tempomat
**Zeile:** „Der Kaffee hätte auf der Werkbank ruhig stehen bleiben können.“
**Freischaltung / Zeitraum:** Eine B+S+V-Fahrt ≥ 15 km enthält 10 zusammenhängende Kilometer, in denen ≥ 90 % der gültigen 5-s-Mittel zwischen 19 und 21 km/h liegen; keine Pause im Abschnitt; Obergrenze 25 km/h oder niedrigere Betreibergrenze.
**Messdaten / Lücke:** S, V, Abschnittsstatistik; ohne vollständige Zeit-/Freigabedaten gesperrt. **Stufe:** III.
**Kulisse / 120 px:** Feinmechanische Werkstatt mit langer gleichmäßig transportierender Produktionslinie und einem mechanischen Fliehkraftregler. **Gag:** zwei symmetrisch ausstehende Reglerkugeln halten stoisch die Ordnung.

## Uhr und Kalender

### 21 · `ee_021_mittagstisch` · Mittagstisch
**Zeile:** „Die Tagesempfehlung hatte zwei Räder.“
**Freischaltung / Zeitraum:** Eine B+T-Fahrt mit Start 12:00–12:30 und Ende spätestens 13:00 lokaler Zeit desselben Tages; 5–15 km und mindestens 20 Bewegungsminuten.
**Messdaten / Lücke:** G, T, IANA-Zone, Distanz; fehlendes echtes Ende sperrt. **Stufe:** I.
**Kulisse / 120 px:** Leere Kantine in dunklem Flaschengrün, ein einzelnes servierfertiges Tablett im warmen Ausgabefach. **Gag:** große Kantinenlogistik für genau eine Mittagspause.

### 22 · `ee_022_pausenbrot` · Pausenbrot
**Zeile:** „Die Pause hatte eine eigene Pause.“
**Freischaltung / Zeitraum:** Eine B+G+T-Fahrt 10–30 km mit genau einem stationären Abschnitt 20–30 Minuten; davor und danach jeweils ≥ 4 km; alle übrigen Einzelpausen < 2 Minuten. Stationär: Geschwindigkeit < 2 km/h und Spur innerhalb 30 m.
**Messdaten / Lücke:** Vollständige verstrichene Zeitachse und GPS während Pausen; reine Bewegungsstreams sperren. **Stufe:** II.
**Kulisse / 120 px:** Rastpavillon mit großem aufgeklapptem Picknickkoffer auf einer Bank, darin ein ganz normales kleines belegtes Brot. **Gag:** der Koffer macht mehr Pause als sein Inhalt.

### 23 · `ee_023_rollladen` · Der Rollladen
**Zeile:** „Du warst schon draußen, als der Tag geöffnet hat.“
**Freischaltung / Zeitraum:** Eine B+G+T-Fahrt ≥ 10 km startet 10–30 Minuten vor berechnetem örtlichem Sonnenaufgang und endet 10–60 Minuten danach; Startsonnenhöhe −6° bis 0° und belegte geeignete Sicht-/Lichtbedingungen. Kein Start vor einer festen frühen Uhrzeit erforderlich.
**Messdaten / Lücke:** Astronomische Berechnung, Ort, Zeit, Eignungsnachweis; fehlt eines, gesperrt. **Stufe:** II / Gelegenheit.
**Kulisse / 120 px:** Alter Ladenraum; schwerer Rollladen halb hoch, darunter ein breiter niedriger Streifen warmen Morgenlichts. **Gag:** der Tag kommt als frisch geöffneter Laden ins Bild.

### 24 · `ee_024_vorhang` · Vorhang zu
**Zeile:** „Pünktlich vor dem Abspann zurück.“
**Freischaltung / Zeitraum:** Eine B+G+T-Fahrt ≥ 10 km endet 5–20 Minuten vor örtlichem Sonnenuntergang; Start ≥ 45 Minuten vor Ende. Die Fahrt bleibt vollständig vor Sonnenuntergang.
**Messdaten / Lücke:** Ort, T, Sonnenuntergangsberechnung; fehlt eines, gesperrt. **Stufe:** I / Gelegenheit.
**Kulisse / 120 px:** Seitengang einer Theaterbühne, tiefer pflaumenfarbener schwerer Vorhang schließt sich bis auf einen schmalen goldenen Spalt. **Gag:** der letzte offene Spalt wartet gerade noch.

### 25 · `ee_025_geschenkte_stunde` · Geschenkte Stunde
**Zeile:** „Die Uhr hat heute einen Teil der Rechnung übernommen.“
**Freischaltung / Zeitraum:** Eine B+G+T-Fahrt ≥ 15 km überquert eine reale Rückstellung der lokalen Zeitzone um genau 60 Minuten; UTC-Dauer 90–180 Minuten, lokale angezeigte Uhrzeitdifferenz genau 60 Minuten kleiner. Kein Zeitstempelwechsel im Gerät; geeignete Sicht-/Lichtbedingungen belegt.
**Messdaten / Lücke:** UTC-Ende, IANA-Regel, Standortzone, Eignungsnachweis; fehlt eines, gesperrt. **Stufe:** II / Kalenderfund.
**Kulisse / 120 px:** Uhrmacherwerkstatt; geöffnete Standuhr mit sichtbar ausgehängtem Pendel auf der Werkbank. Keine Zifferblätter im Ausschnitt. **Gag:** das Pendel macht Pause, die Werkstatt läuft weiter.

### 26 · `ee_026_extrablatt` · Extrablatt
**Zeile:** „Dieser Tag wird normalerweise wegrationalisiert.“
**Freischaltung / Zeitraum:** Eine B+T-Fahrt ≥ 5 km beginnt und endet am 29. Februar derselben lokalen Datumszone; ≥ 15 Bewegungsminuten.
**Messdaten / Lücke:** H nicht nötig; Start, Ende, Zone, Strecke und Bewegung nötig; fehlt eines, gesperrt. **Stufe:** I / Kalenderfund.
**Kulisse / 120 px:** Dunkle Buchbinderei; aus einer aufgeschlagenen unbedruckten Papierlage steht ein einzelnes zusätzliches Blatt hervor. **Gag:** das eine Blatt passt sichtbar nicht in den sonst bündigen Block.

### 27 · `ee_027_jahreswechsel` · Jahreswechsel
**Zeile:** „Eine Ausfahrt. Zwei Geschäftsjahre.“
**Freischaltung / Zeitraum:** Eine B+G+T-Fahrt ≥ 10 km beginnt am 31. Dezember und endet am 1. Januar, UTC-Dauer 30–120 Minuten; tatsächlich gefahrene Zeit auf beiden Datumsseiten jeweils ≥ 10 Minuten; Sicht-/Licht- und sichere Streckenbedingungen belegt.
**Messdaten / Lücke:** T, örtliche Zone, kontinuierliche Aufnahme, Eignungsnachweis; fehlt eines, gesperrt. **Stufe:** II / Kalenderfund.
**Kulisse / 120 px:** Leere Garderobe nach einer Feier, zwei schwere halb geöffnete Raumtüren und einzelne goldene Konfettistreifen am Boden; Rad im Durchgang. **Gag:** ein Rad steht genau zwischen zwei aufgeräumten Feierräumen.

### 28 · `ee_028_stammtermin` · Stammtermin
**Zeile:** „Der Termin hat inzwischen einen eigenen Schlüssel.“
**Freischaltung / Zeitraum:** In sechs aufeinanderfolgenden lokalen Kalenderwochen je eine B-Fahrt ≥ 8 km am gleichen Wochentag; Startzeiten innerhalb desselben 15-Minuten-Fensters. Fenster wird aus den ersten beiden Fahrten fixiert und danach nicht verschoben.
**Messdaten / Lücke:** H, T, Zone, sechs Distanzen; unvollständige Wochen sperren. **Stufe:** IV.
**Kulisse / 120 px:** Gepflegter Vereinsvorraum in dunkler Eiche; sechs identische Garderobenhaken, an genau einem hängt ein alter Schlüsselbund. **Gag:** der feste Platz hat sichtbar seinen eigenen Schlüssel.

## Wetter erst im Rückspiegel

### 29 · `ee_029_regiepause` · Regenpause
**Zeile:** „Der Regen hat auf deinen Feierabend gewartet.“
**Freischaltung / Zeitraum:** Eine B+G+T-Fahrt ≥ 5 km; W belegt entlang der Fahrt keinen Niederschlag, am Endort beginnt 15–60 Minuten nach Ende Niederschlag ≥ 0,5 mm in 30 Minuten. Auswertung erst 60 Minuten nach Ende.
**Messdaten / Lücke:** Wetter höchstens 5-minütig entlang Route und am Endort, echte Endzeit; Stundenwetter reicht nicht, dann gesperrt. **Stufe:** I / Zufallsfund.
**Kulisse / 120 px:** Trockener massiver Portikus, jenseits seiner Dachkante fällt ein dichter Regenvorhang auf den Hof. **Gag:** eine messerscharfe Dachkante trennt trockenen Fahrradplatz und Regenwand.

### 30 · `ee_030_donner_nachschluss` · Donner nach Schluss
**Zeile:** „Das Gewitter kam zur Nachbesprechung.“
**Freischaltung / Zeitraum:** Eine B+G+T-Fahrt ≥ 5 km ist vollständig beendet; erst 60–180 Minuten später liegt ein archiviert beobachtetes Gewitterereignis samt registriertem Blitz innerhalb 10 km des Endorts vor. Im Fahrtfenster und bis 30 Minuten danach muss die Ereignisquelle dort sowie entlang der Route ausdrücklich vollständig und ohne Gewitterereignis sein. Auswertung frühestens nach 180 Minuten. Keine Aufforderung, ein Gewitter abzuwarten oder anzufahren.
**Messdaten / Lücke:** Vollständiges Blitz-/Gewitterarchiv mit Ort, Zeit und Abdeckungsstatus; Regen, IF oder Wetterfarbe sind kein Ersatz. Heute gesperrt. **Stufe:** I / Zufallsfund.
**Kulisse / 120 px:** Innenraum einer massiven Garage; durch das kleine geschlossene rückwärtige Fenster ein klarer entfernter Blitz, davor bereits ordentlich aufgerollter Gartenschlauch. **Gag:** drinnen ist schon Feierabend, draußen beginnt die große Show. Keine Behauptung über den tatsächlichen Aufenthaltsort des Fahrers.

### 31 · `ee_031_windstilllegung` · Windstilllegung
**Zeile:** „Die Luft hat heute keinen Beitrag geleistet.“
**Freischaltung / Zeitraum:** Eine B+G+T-Fahrt ≥ 20 km und ≥ 60 Bewegungsminuten; vollständige räumlich passende W-Beobachtungen in höchstens 15-Minuten-Abständen: Wind ≤ 1 m/s in jedem Messfenster.
**Messdaten / Lücke:** Zeit-/ortsaufgelöster Wind einschließlich Einheiten; Startort-Stundenwert allein sperrt. **Stufe:** II / Zufallsfund.
**Kulisse / 120 px:** Geschützter Segelmacherhof, ein großer schlaffer Windsack hängt vollständig senkrecht am Mast, schwere Segel ruhen daneben. **Gag:** das sonst waagerechte Windinstrument ist arbeitslos zusammengesackt.

### 32 · `ee_032_meinungswechsel` · Meinungswechsel
**Zeile:** „Der Wind hat unterwegs die Fraktion gewechselt.“
**Freischaltung / Zeitraum:** Eine B+G+T-Fahrt ≥ 20 km und ≥ 90 Minuten; aufeinanderfolgende erste und letzte vollständige 30-Minuten-Wetterfenster weisen mittlere Windrichtungen mit 150–180° Unterschied auf, Wind jeweils 2–5 m/s; keine aktive Warnung.
**Messdaten / Lücke:** W ≤ 10-minütig an der jeweiligen Route, zirkuläres Richtungsmittel, Warnungsarchiv; fehlt eines, gesperrt. **Stufe:** II / Zufallsfund.
**Kulisse / 120 px:** Wetterinstrument-Werkstatt, zwei echte demontierte Wetterfahnen liegen entgegengesetzt auf einer langen Werkbank. **Gag:** zwei gerichtete Pfeilsilhouetten zeigen ernsthaft gegeneinander.

### 33 · `ee_033_klimavertrag` · Klimavertrag
**Zeile:** „Das Wetter hat sich exakt an die Stellenbeschreibung gehalten.“
**Freischaltung / Zeitraum:** Eine B+G+T-Fahrt ≥ 30 km und ≥ 90 Minuten; alle W-Temperaturmessungen 18–22 °C, Spannweite ≤ 1 °C; jedes beobachtete Niederschlagsfenster 0 mm und Wind ≤ 3 m/s.
**Messdaten / Lücke:** W ≤ 15-minütig entlang Route, Temperatur/Regen/Wind; fehlender Kanal sperrt. **Stufe:** II / Zufallsfund.
**Kulisse / 120 px:** Ruhiger Konservierungsraum, große passive Lüftungslamellen stehen sämtlich im gleichen Winkel, glatte schwere Vorhänge ohne Bewegung. **Gag:** makellos ausgerichtete Lamellen wirken wie ein Wettervertrag in Metall.

### 34 · `ee_034_abgetropft` · Abgetropft
**Zeile:** „Das letzte Kapitel wurde trocken geliefert.“
**Freischaltung / Zeitraum:** Eine B+G+T-Fahrt ≥ 10 km: erste 20 Minuten mindestens 0,5 mm Niederschlag, letzte 30 Minuten vollständig 0 mm; Gesamtzeit 60–150 Minuten; keine aktive Warnung. Erst nach Abschluss bewerten.
**Messdaten / Lücke:** W ≤ 5-minütig entlang Route, echte T, Warnungsarchiv; heutige Stundensumme genügt nicht, gesperrt. **Stufe:** II / Zufallsfund.
**Kulisse / 120 px:** Großer Schirmmacher-Arbeitsraum; ein nasser geschlossener Schirm tropft in eine tiefe Messingschale, dahinter fällt trockenes helles Tageslicht herein. **Gag:** das Wetter hängt zusammengefaltet am Haken neben dem freien Radplatz.

### 35 · `ee_035_nebendienst` · Nebendienst
**Zeile:** „Die Aussicht hat sich krankgemeldet.“
**Freischaltung / Zeitraum:** Eine B+G+T-Fahrt ≥ 5 km endet vollständig; erst 60–180 Minuten danach melden zwei aufeinanderfolgende Beobachtungen am Endort im Abstand 10–20 Minuten Sichtweite < 200 m, während im gesamten Fahrtfenster Sichtweite ≥ 2 km belegt ist. Auswertung nach 180 Minuten.
**Messdaten / Lücke:** W-Sichtweitenarchiv, Quellenabdeckung, genaue Endzeit; Sichtweite ist nicht gespeichert, daher gesperrt. **Stufe:** I / Zufallsfund.
**Kulisse / 120 px:** Trockener Innenraum eines Pförtnerhauses; breite geschlossene Fenster direkt hinter dem klar sichtbaren Rad verschwinden außen in dichtem milchigem Nebel. **Gag:** perfektes Panoramafenster mit vollständig abwesendem Panorama.

## Kleine Serien, große Verwaltung

### 36 · `ee_036_wiedereroeffnung` · Wiedereröffnung
**Zeile:** „Der Laden ist wieder da. Die Stammkundschaft auch.“
**Freischaltung / Zeitraum:** Eine B-Fahrt ≥ 3 km nach mindestens 21 aufeinanderfolgenden lokalen Kalendertagen ohne B-Fahrt; mindestens eine ältere B-Fahrt im vollständig verfügbaren 90-Tage-Fenster davor. Keine Aussage über Gesundheit oder andere Sportarten.
**Messdaten / Lücke:** H über 90 Tage, T, Distanz; Importlücke sperrt und wird nicht als Pause gewertet. **Stufe:** I.
**Kulisse / 120 px:** Alte Ladentür steht wieder offen; eine sorgfältig gefaltete Staubschutzplane liegt auf dem seitlichen Tresen. **Gag:** das große weiße Tuch ist endlich vom Geschäft verschwunden.

### 37 · `ee_037_werktagsbesteck` · Werktagsbesteck
**Zeile:** „Für jeden Wochentag liegt jetzt etwas bereit.“
**Freischaltung / Zeitraum:** Innerhalb 28 lokaler Kalendertage je mindestens eine B-Fahrt ≥ 5 km mit Start an Montag, Dienstag, Mittwoch, Donnerstag und Freitag. Kein Fünf-Tage-Streak erforderlich.
**Messdaten / Lücke:** H, T, Zone, Distanzen; fehlt ein Wochentag oder dessen Beleg, gesperrt. **Stufe:** II.
**Kulisse / 120 px:** Silberkammer eines Hotels; fünf ordentliche Besteckfächer in einer geöffneten tiefen Schublade, jedes gefüllt. **Gag:** die ganze Arbeitswoche ist eingedeckt, obwohl niemand am Tisch sitzt.

### 38 · `ee_038_ganzjahresgarderobe` · Ganzjahresgarderobe
**Zeile:** „Die Garderobe ist jetzt für alles zuständig.“
**Freischaltung / Zeitraum:** Im selben Kalenderjahr je eine B-Fahrt ≥ 15 km in vier fest definierten Quartalen Jan–März, Apr–Jun, Jul–Sep, Okt–Dez. Name beschreibt ganzjährige Nutzung; keine unbelegte Wetter-/Jahreszeitenbehauptung für den tatsächlichen Ort.
**Messdaten / Lücke:** H des Jahres, Startdatum, Zone, Distanz; fehlende Quartalsbelege sperren. **Stufe:** IV.
**Kulisse / 120 px:** Dunkle Theatergarderobe, ein echter Mantel, leichter Regenmantel, Leinenjacke und Wollschal hängen als normaler Bestand nebeneinander. **Gag:** vier völlig verschiedene Wetterschichten teilen dieselbe Garderobe.

### 39 · `ee_039_pendelamt` · Pendelamt
**Zeile:** „Dieser Weg hat inzwischen Öffnungszeiten.“
**Freischaltung / Zeitraum:** An zehn verschiedenen Tagen innerhalb 30 Tagen jeweils zwei B+R-Fahrten ≥ 3 km: A→B und B→A; gleiche Start-/Zielcluster mit Radius 100 m, Routenüberdeckung ≥ 90 %; Abstand zwischen Fahrten ≥ 2 Stunden. Zweck „Arbeit“ wird nicht unterstellt.
**Messdaten / Lücke:** H, G, T, Cluster-/Routenvergleich; fehlende Endzeiten sperren. **Stufe:** IV.
**Kulisse / 120 px:** Maschinenraum einer alten Pendeluhr, das breite Messingpendel hängt sichtbar zwischen zwei festen Anschlägen; Rad auf freiem Wartungsboden. **Gag:** immer derselbe Weg zwischen zwei Enden.

### 40 · `ee_040_monatsabschluss` · Monatsabschluss
**Zeile:** „Die Kilometer haben den Vormonat kopiert.“
**Freischaltung / Zeitraum:** Zwei direkt aufeinanderfolgende vollständige lokale Kalendermonate mit jeweils ≥ 100 km B-Gesamtdistanz; absolute Summendifferenz ≤ 0,5 % der kleineren Summe; je Monat mindestens fünf Fahrtage.
**Messdaten / Lücke:** H beider Monate, ungerundete Strecken, T; fehlender Import sperrt. **Stufe:** IV.
**Kulisse / 120 px:** Buchbinderlager, zwei gleich hohe Stapel fertig gebundener unbeschrifteter Geschäftsbücher nebeneinander auf niedriger Holzbank. **Gag:** zwei schwere Monatsberge enden exakt auf derselben Höhe.

### 41 · `ee_041_gemischte_tuete` · Gemischte Tüte
**Zeile:** „Einmal jede Größe, bitte.“
**Freischaltung / Zeitraum:** Innerhalb 30 Tagen je eine B-Fahrt in vier disjunkten Distanzbändern: 0,5–0,999 km; 5–9,999 km; 20–29,999 km; 50–60 km. Vier verschiedene Aktivitäten, freie Reihenfolge, kein Tempoziel.
**Messdaten / Lücke:** H, G für Kurzfahrt, T, Einzelstrecken; fehlt ein belegtes Band, gesperrt. **Stufe:** III.
**Kulisse / 120 px:** Alte Bonbonmanufaktur, vier normal unterschiedlich große Kupferschöpfkellen hängen über einem offenen Sack. **Gag:** die Kellen reichen von winzig bis zur großen Portion; das Rad bleibt normal groß.

### 42 · `ee_042_matroschka` · Matroschka
**Zeile:** „In der letzten Runde stecken noch zwei kleinere.“
**Freischaltung / Zeitraum:** Drei B+R-Fahrten an unterschiedlichen Tagen innerhalb 30 Tagen, chronologisch 4,5–5,5 km, 9–11 km und 18–22 km; gleicher Startcluster ≤ 100 m und jeweils ≥ 90 % der vorigen Spur in der nächsten enthalten.
**Messdaten / Lücke:** H, R, verschachtelte Spuren und Distanzen; bloß ähnliche Zahlen reichen nicht. **Stufe:** III.
**Kulisse / 120 px:** Werkstatt für Holzschalen, drei tatsächlich ineinander passende unbemalte Schalen stehen halb ineinandergeschoben auf der Bank. **Gag:** eine große Schale enthält zwei komplette kleinere Reisen.

### 43 · `ee_043_jahrestag` · Jahrestag
**Zeile:** „Die Strecke erkennt dich am Jahrestag wieder.“
**Freischaltung / Zeitraum:** Zwei B+R-Fahrten ≥ 20 km auf gleicher Route am selben lokalen Monatstag in zwei direkt aufeinanderfolgenden Jahren; genau gleiche Fahrtrichtung auf ≥ 90 % der überdeckten Strecke. 29. Februar wird nicht auf einen anderen Tag umgedeutet.
**Messdaten / Lücke:** H für beide belegten Fahrten und Herkunft, R, lokale Datumswerte; fehlende Vorjahresfahrt sperrt. **Stufe:** V.
**Kulisse / 120 px:** Reifekeller, zwei große Eichenfässer ruhen nebeneinander in ihren lang benutzten Böcken; ein leerer dritter Bock bleibt daneben. **Gag:** derselbe gute Jahrgang hat einen festen Wiederholungsplatz, ohne Etiketten.

## Tritt, Gelände und Sammeltrieb

### 44 · `ee_044_metronom` · Metronom
**Zeile:** „Der Taktstock konnte heute früher gehen.“
**Freischaltung / Zeitraum:** Eine B+S-Fahrt ≥ 15 km enthält 20 zusammenhängende Bewegungsminuten mit Kadenz 75–85 rpm in ≥ 95 % der gültigen Sekunden; keine Pause > 5 s im Abschnitt, mindestens 5 km Abschnittsdistanz. Keine Geschwindigkeitsschwelle.
**Messdaten / Lücke:** S, echte Zeitachse, Kadenz, Distanz; unvollständiger Kadenzkanal sperrt. **Stufe:** III.
**Kulisse / 120 px:** Leerer Probenraum in dunklem Mahagoni; ein normales mechanisches Metronom auf niedriger Bank schwingt sichtbar vor geraden Orgelpfeifen. **Gag:** ein kleiner Taktgeber führt den ganzen leeren Saal.

### 45 · `ee_045_spinnerei` · Spinnerei
**Zeile:** „So viel Drehung gibt es sonst nur auf Spulen.“
**Freischaltung / Zeitraum:** Eine B+S-Fahrt ≥ 15 km enthält zehn zusammenhängende Minuten mit Kadenz 100–110 rpm in ≥ 90 % der Sekunden, mittlerer Leistung 40–65 % der für die Fahrt dokumentierten FTP und mindestens 2 km Strecke. Leistung außerhalb des Bereichs erfüllt nichts Zusätzliches.
**Messdaten / Lücke:** S, Leistungskanal ≥ 95 %, historische FTP; aktuelle oder geschätzte FTP kein Ersatz. **Stufe:** III.
**Kulisse / 120 px:** Historische Spinnerei, eine Reihe kleiner Garnspulen dreht mit leichter Bewegungsunschärfe; kupferbraunes Maschinengehäuse. **Gag:** viele Umdrehungen machen dort ganz ruhige kleine Fäden.

### 46 · `ee_046_bodenpersonal` · Bodenpersonal
**Zeile:** „Drei Beläge, ein zuständiges Rad.“
**Freischaltung / Zeitraum:** Eine B+R-Fahrt ≥ 20 km enthält je ≥ 2 km verifiziertes Asphalt-, ungebundenes Schotter- und Pflastersegment; jedes Band muss aus zusammenhängenden Abschnitten ≥ 200 m bestehen. Rechtmäßig befahrbare Wege, keine Ableitung aus Tempo oder Bike-Typ.
**Messdaten / Lücke:** Segmentgenaue Oberflächen-/Zugangskarte mit ausreichender Aktualität; `surface_of` als einzelner Untertyp reicht nicht, gesperrt bis verfügbar. **Stufe:** III.
**Kulisse / 120 px:** Echter Materialprüfhof, drei nebeneinander bündig verlegte Felder aus Asphalt, Schotter und Pflaster hinter dem freien Fahrradstandplatz. **Gag:** eine ordentliche Materialauswahl behandelt die Ausfahrt wie eine Bodenberatung.

### 47 · `ee_047_faltenwurf` · Faltenwurf
**Zeile:** „Die Straße kam heute ungebügelt.“
**Freischaltung / Zeitraum:** Eine B+R-Fahrt ≥ 25 km enthält mindestens fünf Anstiege mit je ≥ 50 m Gewinn über ≥ 500 m; benachbarte Anstiege werden durch je ≥ 30 m Abfahrt getrennt. Steigungsspitzen sind kein Ziel.
**Messdaten / Lücke:** Geprüftes Höhenprofil, R, deterministische Gipfel-/Tal-Segmentierung; verrauschte Höhen sperren. **Stufe:** III.
**Kulisse / 120 px:** Große Polsterei, schwerer olivfarbener Stoff liegt in fünf natürlichen tiefen Wellen auf einem langen Zuschneidetisch. **Gag:** die Landschaft hängt als sauber lesbare Berg-und-Tal-Falten im Raum.

### 48 · `ee_048_sandwich` · Bergsandwich
**Zeile:** „Der Berg lag zwischen zwei ordentlichen Scheiben Flachland.“
**Freischaltung / Zeitraum:** Eine B+R-Fahrt ≥ 30 km hat auf den ersten und letzten je 5 km jeweils ≤ 20 m Aufstieg und ≤ 20 m Abstieg; im dazwischenliegenden Teil mindestens einen zusammenhängenden Anstieg ≥ 400 m über ≥ 5 km.
**Messdaten / Lücke:** R, validiertes Höhenprofil und Distanzfenster; fehlende Abstiegsmessung sperrt. **Stufe:** IV.
**Kulisse / 120 px:** Dunkle Steinmetzwerkstatt, ein grober keilförmiger Rohstein liegt zwischen zwei niedrigen horizontalen Steinplatten auf einem Arbeitssockel. **Gag:** ein eindeutig hoher Mittelteil steckt zwischen zwei flachen Schichten.

### 49 · `ee_049_waagerecht_senkrecht` · Doppelte Buchführung
**Zeile:** „Die Kilometer und Höhenmeter haben sich auf einen Tarif geeinigt.“
**Freischaltung / Zeitraum:** Eine B+R-Fahrt ≥ 40 km und ≥ 400 m Aufstieg, Verhältnis Höhenmeter/Distanzkilometer 19,5–20,5 m/km; diese Bedingung an drei unterschiedlichen Tagen innerhalb 90 Tagen erfüllt. Kein rundungsbedingter Treffer.
**Messdaten / Lücke:** H, R, geprüfte Höhen, ungerundete Distanzen; fehlt eines, gesperrt. **Stufe:** IV.
**Kulisse / 120 px:** Alte Seilzugwerkstatt, zwei gleichmäßig gefüllte Materialkörbe halten sich an einer realen Balkenwaage die Waage; der Balken bleibt exakt horizontal. **Gag:** die beiden sonst verschiedenen Rechnungen sind perfekt austariert.

### 50 · `ee_050_aussenstellen` · Zwanzig Außenstellen
**Zeile:** „Das Hobby hat jetzt ein Filialnetz.“
**Freischaltung / Zeitraum:** Innerhalb 365 Tagen zwanzig B+R-Fahrten ≥ 10 km mit zwanzig Startorten, die paarweise ≥ 5 km auseinanderliegen. Auswahl deterministisch chronologisch: Ein neuer Start zählt nur, wenn er ≥ 5 km von allen bereits gezählten Starts entfernt ist. Wohnadresse wird weder benötigt noch veröffentlicht.
**Messdaten / Lücke:** H, validierte Startkoordinaten, R, Distanzen; fehlende GPS-Fahrt zählt nicht als Standort. **Stufe:** V.
**Kulisse / 120 px:** Gediegenes Hotelschlüsseldepot mit zwanzig echten unbeschrifteten Messingschlüsseln in regulären Fächern; Rad davor auf Steinboden. **Gag:** ein ganzes Schlüsselbrett voller Zuständigkeiten für ein einziges Fahrrad.

## Abdeckung und technische Machbarkeit

**Abdeckung:** 5 kurze Alltags-/Serienfunde, 10 Routengeometrien, 5 Tempoideen, 8 Zeit-/Kalenderfunde, 7 rückblickende Wetterfunde, 8 Serien und 7 Tritt-/Gelände-/Sammelideen ergeben 50. Unter 1 km ist ausdrücklich positiv; unter 5 km bleibt ein eigener Anlass. Hin-und-zurück, langsam und sehr schnell sind vertreten. Die schwersten Serien beruhen auf Planung, Vielfalt und langem Sammeln, nicht auf extremer Hitze, Sturm oder immer höherem Tempo. Die neuen Motive kopieren keine bestehende Kulisse. Selbe Fahrten können bewusst mehrere verschiedenartige Regeln erfüllen.

| Ebene | Im geprüften Repo vorhanden | Was für diesen Katalog daraus folgt |
|---|---|---|
| Aktivitätsdaten | `Activity.started_at`, `sport`, `distance_meters`, `duration_seconds`, `elevation_gain_m`, `source`, `raw_data`, `bike_id`; Leistung/Herzfrequenz und teils `ftp_watts_at_scoring` | Distanz-, Datums- und Summenideen sind am nächsten an vorhandenen Daten. `duration_seconds` beweist allein weder tatsächliches Ende noch Pause; `bike_id` ist kein Beweis für fehlende Motorhilfe. |
| Streams | `ActivityStream.streams` mit optionalen GPS-, Geschwindigkeits-, Distanz-, Kadenz-, Leistungs- und Höhenkanälen, `has_gps`, optional `matched_polyline` | Neue Qualitätsprüfung, echte zeitliche Ausrichtung und Auswertefunktionen erforderlich. Dokumentation nennt 1-Hz-Arrays und Heruntersampling langer Fahrten; einige Analysen interpretieren Indizes als Bewegungssekunden. Kein universeller Sekunden-/Pausennachweis. |
| Klassifikation | `ride_facts.surface_of` kennt einzelne Geräteuntertypen; Garmin ordnet Indoor/Virtual ebenfalls `cycling` zu | Outdoor-/Assistenznormalisierung vor B/S ist nötig. „cycling“ oder „road“ allein darf keinen Geschwindigkeitsbeweis liefern. |
| Wetter | `ActivityStream.weather`; bestehende Beschreibung nennt stündlich Temperatur, Niederschlag, Windgeschwindigkeit und -richtung am Startort | Kein gespeicherter Blitz-/Donner-/Sichtweitenbeleg, kein lückenloses Route-Minutenwetter. Alle sieben Wetterkonzepte brauchen bessere Abdeckung bzw. neue Daten. Kein vorhandenes `was_wet` wird zu „Gewitter“ umgedeutet. |
| Katalog/Freischaltung | Szenenkatalog und bestehendes `RiderBackdrop`-Ledger; Freigabe gerenderter Platten ist getrennt | Diese Datei ist kein Import und keine neue Unlock-Tabelle. Später bestehendes Ledger nutzen, Regeln versionieren, Quellen-/Qualitätsbeleg speichern; keine zweite Tabelle mit derselben Bedeutung erfinden. |

**Neue Ableitungen aus grundsätzlich vorhandenen Rohdaten:** Distanzbänder und Historienfenster; geografische Start-/Endcluster; Richtung und Überdeckung; Routengraph/Formen; Sonnenstand und IANA-Datum; geglättete Höhenabschnitte; Kadenz-/Tempoabschnitte. Diese Ableitungen existieren nicht automatisch als `RideFacts`-Felder, und eine vorhandene passende Rohdatenspalte garantiert keine vollständige Befüllung. Datenabhängige Regeln dürfen nur für nachweisbar vollständige Fahrten aktiviert werden.

**Neue oder häufig fehlende Daten:** echte Aufnahme-/Pausenzeitachsen, verifizierter vollständiger Importzeitraum, eindeutiger Assistenzstatus, GPS-Qualitäts-/Transportnachweise, zeitgültige Streckenfreigaben und Betreiberlimits samt Zustandsnachweis für 18–20, Eignungsnachweise für 23/25/27, Wegzugang/Seen-/Oberflächengeometrien für 08/10/46, Minutenwetter und Warnungsarchive für 29–35, Blitz-/Gewitterarchiv für 30, Sichtweite für 35. Diese Lücken werden nicht durch Behauptungen, Aktivitätstitel, Fotoästhetik oder Nullwerte ersetzt. Die genannten Plausibilitätsfilter beweisen nicht allein, dass keine Fahrzeugmitnahme stattfand; für S/V ist eine belastbare Sport-/Geräteherkunft zusätzlich nötig. Ein universeller Betrugsdetektor wird hier nicht behauptet.

**Reihenfolge für eine spätere Umsetzung:** zunächst B/G/T und Importvollständigkeit belastbar machen; danach Distanz/Datum/Serien auswerten; dann Routen-/Höhen-/Kadenzableitungen. Tempo mit V und die Wetterereignisse bleiben gesperrt, bis ihre zusätzlichen Belege existieren. Jede kanonische Kulisse erst separat rendern und in 120 px visuell prüfen; keine dieser 50 Prosaideen ist bereits ein freigegebenes Bild.

**Dokumentprüfung:** 50 fortlaufende Einträge, 50 eindeutige stabile IDs und Namen, je sechs Pflichtfelder; keine ID- oder Namenskollision mit dem vorhandenen Katalog. Redaktionelle Stufenverteilung: I 10, II 16, III 14, IV 8, V 2. Auslöser und Bildmotive zusätzlich inhaltlich gegengeprüft; überlappende Erfüllbarkeit ist beabsichtigt, keine doppelte identische Challenge. Die Prüfung validiert das Konzeptdokument, nicht eine Implementierung oder bereits gerenderte 120-px-Bilder.
