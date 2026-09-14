# Strukturierte Radtrainings auf persönlichen Routen

## Empfehlung

RIDR sollte dem Fahrer ermöglichen, seine gewünschte Strecke zu behalten und das geplante Training darauf prüfen zu lassen. Die zentrale Leistung ist eine nachvollziehbare Zuordnung von Belastung, Erholung und Anfahrt zu geeigneten Streckenabschnitten. Ein Dateiexport allein leistet das nicht. Der erste produktive Umfang sollte Routenauswahl, Eignungsprüfung und ein flexibles Outdoor-Workout umfassen; automatische Intervallstarts anhand der Position sind eine spätere, geräteabhängige Erweiterung.

Garmin dokumentiert für den Edge 1050 ausdrücklich, dass vor dem Start eines Workouts eine Strecke hinzugefügt werden kann. Wahoo bestätigt die gleichzeitige Nutzung von Route und geplantem Workout für ACE, BOLT 3 und ROAM 3. Damit ist die Basis auf aktuellen Radcomputern vorhanden. Die Zuordnung der Trainingsblöcke zu passenden Orten bleibt eine eigene Aufgabe.<sup><a href="#s1">1</a>, <a href="#s2">2</a></sup>

Die untersuchten Ansätze zeigen drei unterschiedliche Fähigkeiten: TrainerRoad übersetzt Einheiten in draußen ausführbare Varianten, myWindsock erlaubt die manuelle Planung von Intervallen auf einer Route, Best Bike Split verbindet Leistungsziele mit Positionen entlang einer Rennstrecke. Daraus lässt sich eine bessere RIDR-Erfahrung entwickeln, ohne die Funktionsfähigkeit eines fremden Produkts oder eine physiologisch perfekte Anpassung zu behaupten.<sup><a href="#s3">3</a>, <a href="#s4">4</a>, <a href="#s5">5</a></sup>

Untersuchungsrahmen: Rennradtraining draußen, Garmin als erste Integration, mit Vergleich zu Wahoo, Hammerhead, TrainerRoad, JOIN, TrainingPeaks, Komoot und myWindsock. Die Funktionsprüfung basiert auf öffentlich zugänglicher Herstellerdokumentation und dem lokalen RIDR-Quellcode; es fand kein Test auf physischen Radcomputern statt. Quellen wurden am 14. September 2026 geprüft. Undatierte Hilfeartikel und ältere Implementierungen sind entsprechend eingeordnet.

## 1. Welche der angezeigten Einheiten funktionieren draußen?

Die aktuelle Planvorschau enthält Sweetspot, VO₂max, lange Grundlage und Regeneration. Diese Trainingsarten sind grundsätzlich draußen umsetzbar. Ob eine konkrete Einheit auf einer konkreten Route funktioniert, hängt jedoch von der Länge störungsarmer Abschnitte, der möglichen Leistung bei der vorhandenen Übersetzung, den Pausen und den örtlichen Bedingungen ab. Die folgenden Zuordnungen sind eine technische und sportpraktische Bewertung für das Produkt, keine individuell validierte Trainingsverordnung.

| Einheit aus der Vorschau | Geeignete Durchführung | Was RIDR prüfen muss |
|---|---|---|
| 3 × 12 Minuten Sweetspot | Drei ausreichend lange flache oder gleichmäßig ansteigende Abschnitte; alternativ ein längerer Abschnitt mit der gesamten Serie | Passt jeder volle 12-Minuten-Block auch bei höherer Geschwindigkeit vor die nächste Unterbrechung? Ist die Erholung anschließend möglich? |
| 5 × 3 Minuten VO₂max | Überschaubare, wenig unterbrochene Abschnitte oder ein wiederholbarer Anstieg | Fünf Wiederholungen und die geplanten Pausen müssen zusammenpassen. Fünf kurze Hügel allein reichen als Nachweis nicht. |
| Lange Grundlage | Eine Runde, auf der sich überwiegend locker bis moderat pedalieren lässt | Steile Rampen, viele Rollphasen, Gesamtfahrzeit und unerwartete Zusatzbelastung |
| Locker rollen | Kurze, möglichst unkomplizierte Runde ohne erzwungene harte Anstiege | Niedrige Belastung muss mit Übersetzung und Streckenprofil praktisch möglich sein. |
| Ruhetag | Kein auszuführendes Radworkout | Kein Export und keine automatische Umdeutung in eine zusätzliche Einheit |

Für spätere Trainingsarten gelten zusätzliche Bedingungen. Over-Unders und 30/30-Serien sollten als zusammenhängende Sets platziert werden. Ein zwölfminütiges Set braucht einen geeigneten zwölfminütigen Korridor, nicht zwölf isolierte kurze Stücke. Sprints brauchen außerdem Raum zum kontrollierten Ausrollen und sollten nicht allein aufgrund geringer Steigung vorgeschlagen werden. Ein gleich langer oder gleich belastender Ersatz ist nicht automatisch derselbe Trainingsreiz.

TrainerRoad empfiehlt je nach Struktur unterschiedliche Geländearten und unterscheidet insbesondere kurze und lange Erholungen. Das stützt eine Einteilung nach Trainingsstruktur statt allein nach dem Etikett „VO₂max“ oder „FTP“. Die konkreten Grenzen für unsere Einheiten müssen jedoch aus einem fachlich geprüften Workout-Vertrag kommen.<sup><a href="#s6">6</a></sup>

Ohne Leistungsmesser sollte RIDR eine ausdrücklich als solche gekennzeichnete Variante nach Belastungsempfinden anbieten. Puls kann bei längeren gleichmäßigen Belastungen ergänzen, ist wegen seiner verzögerten Reaktion aber kein gleichwertiger Regler für kurze harte Intervalle. TrainerRoad bietet RPE-Varianten an; daraus folgt keine identische Unterstützung dieser Zielart auf jedem Radcomputer.<sup><a href="#s7">7</a></sup>

## 2. Was aktuelle Produkte tatsächlich lösen

| Produkt / Funktion | Öffentlich belegte Fähigkeit | Grenze für RIDRs Fragestellung |
|---|---|---|
| Garmin Edge 1050 Workout + Strecke | Strecke direkt zum Workout hinzufügen; Schritte, Ziele und Übergänge auf dem Gerät | Gleichzeitige Navigation garantiert keine sinnvolle Intervallposition. [1] |
| Garmin Power Guide | Leistungsstrategie anhand von FTP, Höhenprofil und erwarteter Kursdauer | Laut Garmin nicht mit Workouts oder Segmenten kombinierbar. Eigenständiger Pacing-Modus. [8] |
| TrainerRoad Outside Workouts | Outdoor-Alternativen; Anleitung zu geeignetem Gelände und flexiblem Start | In den geprüften Quellen keine automatische Zuordnung eines importierten GPX zu allen Intervallen belegt. [3, 6] |
| JOIN | Automatischer Export der heutigen Einheit an verbundene Plattformen, einschließlich Updates und Löschungen | Export-Automation belegt; automatische ortsgenaue Intervallplatzierung nicht belegt. [9] |
| TrainingPeaks | Strukturierte geplante Einheiten lassen sich zu Garmin synchronisieren | Verteilung von Trainingsplänen ersetzt keine Analyse geeigneter Routeabschnitte. [10] |
| myWindsock | Abschnitte in einem Streckendiagramm auswählen und dort Leistung sowie weitere Parameter setzen | Sehr relevantes Vorbild, aber die dokumentierte Intervallplatzierung erfolgt manuell. [4, 11] |
| Best Bike Split | Positionsbezogene Power Courses und zeit- oder distanzbasierte Race Workouts | Renn-Pacing ist ein anderes Optimierungsziel als Erhalt einer vorgeschriebenen Trainingsserie. [5] |
| Wahoo ACE / BOLT 3 / ROAM 3 | Route und Workout gleichzeitig; Workout pausieren, Schritte überspringen oder wiederholen | Geräteführung ist vorhanden, automatische Streckenanpassung dadurch nicht belegt. [2] |
| Hammerhead Karoo | Strukturierte Workouts, Darstellung der Zielzonen und Workout-Steuerung | Die geprüfte Hilfe schließt RPE-Workouts ausdrücklich aus; Modell- und Funktionsprüfung bleibt nötig. [12] |
| Komoot | Strecken erstellen, übertragen und mit Garmin Courses synchronisieren | Eine GPX-Strecke enthält keinen universell abspielbaren strukturierten Watt-Trainingsplan. [13] |

Die Untersuchung erlaubt keine Aussage, dass kein Anbieter automatische Intervallplatzierung besitzt. Nicht öffentliche, experimentelle oder separat freigeschaltete Funktionen wurden nicht geprüft. Die belastbare Differenzierung liegt in der Kombination der nachgewiesenen Bausteine mit einer transparenten, persönlichen Eignungsprüfung.

Bei Best Bike Split widersprechen ältere Hilfeseiten dem neueren dokumentierten Ablauf: Eine ältere Anleitung beschreibt ausschließlich manuellen Transfer; die Seite „Garmin Uploads“ beschreibt direktes Hochladen von Power Courses und Race Workouts. Deshalb sollte RIDR weder alte Kompatibilitätslisten als aktuell vollständig übernehmen noch behaupten, Garmin könne grundsätzlich keine positionsbezogenen Leistungsziele darstellen. Die konkrete Kombination aus Dateiformat, Datenfeld, Navigation und Firmware muss getestet werden.<sup><a href="#s5">5</a>, <a href="#s14">14</a></sup>

## 3. Garmin: vier unterschiedliche Integrationsstufen

### A. Workout und Navigation parallel

Für einen Edge 1050 ist der dokumentierte Ablauf: Training → Workouts → Einheit auswählen → Strecke hinzufügen → Ride. Das passt gut zu RIDRs Einstieg „Einheit ansehen“. Die Person muss nicht ihre Route neu zeichnen. Wenn die Route bereits auf dem Gerät liegt, kann sie dort ausgewählt werden. Für eine vorherige Eignungsanalyse in RIDR müssen wir jedoch selbst Zugriff auf ihre Geometrie haben.<sup><a href="#s1">1</a></sup>

Ein Workout-FIT und ein Course-FIT sind unterschiedliche Datentypen. Gleiche Dateiendung bedeutet keine automatische Verknüpfung. RIDR sollte Route und Einheit als ein gemeinsames Vorbereitungspaket behandeln, intern aber getrennte Identitäten und Exportzustände behalten. Ein Course Point mit dem Text „Intervall 1“ ist zunächst ein Hinweis; er ist kein Beleg dafür, dass der native Workout-Schritt genau dort startet.

### B. Flexible Intervallstarts

Ein praxistauglicher Anfang ist ein offener Anfahrts- oder Übergangsschritt. Der Fahrer erreicht den vorgesehenen Abschnitt und startet die Belastung per Rundentaste. Der Belastungsblock selbst läuft weiterhin mit der verordneten Dauer. Das verhindert, dass eine langsamere Anfahrt die ganze Einheit in eine Ortsdurchfahrt verschiebt. TrainerRoads Outdoor-Anleitungen nutzen diese Flexibilität bereits.<sup><a href="#s6">6</a>, <a href="#s15">15</a></sup>

Erholungen dürfen dabei nicht beliebig verlängert werden. Bei einem engen Intervallset bleibt die interne Struktur fest. Flexible Schritte gehören vor das Set oder zwischen unabhängig verschiebbaren Blöcken, wenn die Trainingsdefinition das erlaubt. Eine Straßenquerung ist kein geplanter Ersatz für eine präzise kurze Erholung.

Der lokal installierte offizielle Garmin FIT SDK enthält den Dauer-Typ `open`. Dessen tatsächliches Verhalten auf den freizugebenden Edge-Modellen muss mit unseren Exportdateien geprüft werden. Die gegenwärtige Vorschau exportiert dagegen ausschließlich zeitgesteuerte Schritte mit identischen unteren und oberen Wattzielen; sie ist noch keine geländeangepasste Outdoor-Fassung.

### C. Automatische Übertragung

Garmins Training API veröffentlicht Workouts und Pläne im Connect-Kalender; die Courses API veröffentlicht Strecken. Beide setzen eine genehmigte Integration und die Zustimmung des Fahrers voraus. Die öffentlich beschriebene Courses API ist insbesondere kein Beleg dafür, dass RIDR beliebig alle bereits gespeicherten Garmin-Strecken auslesen kann. Ein solches Leserecht muss in der tatsächlichen Partnerdokumentation bestätigt werden.<sup><a href="#s16">16</a>, <a href="#s17">17</a></sup>

Der verlässliche Start für die Routenauswahl ist daher ein GPX-Import oder eine bereits in RIDR verfügbare eigene Fahrt. Später kommen bestätigte Anbieter-Verbindungen hinzu. Garmin dokumentiert OAuth 2.0 und einen Bewerbungsprozess für Unternehmensintegrationen. Die genannten typischen Integrationszeiten sind Anbieterangaben, keine belastbare Lieferzusage für RIDR.<sup><a href="#s18">18</a></sup>

Ein Versand an Garmin Connect ist nicht dasselbe wie ein auf dem Edge angekommenes Workout. RIDR benötigt getrennte Zustände wie „vorbereitet“, „an Garmin übertragen“ und, nur bei entsprechender Bestätigung, „auf Gerät verfügbar“. Die JOIN-Dokumentation zeigt ebenfalls, dass Sender-Updates und nachgelagerte Plattform-Synchronisation unterschiedliche Zeitpunkte haben.<sup><a href="#s9">9</a></sup>

### D. Neuere Möglichkeit: aktive Steuerung durch Connect IQ

Die aktuelle Connect-IQ-Dokumentation beschreibt `DataField.setWorkout` ab API-Level 5.2.0. Es benötigt die Berechtigung `ActivityControl`; unter den unterstützten Geräten stehen unter anderem Edge 540, 840, 1040 und 1050. Das ist eine echte technische Option für eine spätere RIDR-Erweiterung. Bei dynamisch aufgebauten Schritten nennt Garmin Zeit und Distanz als erlaubte Dauerarten.<sup><a href="#s19">19</a></sup>

Unsere Schlussfolgerung ist begrenzt: Eine eigene Gerätekomponente könnte Positionsinformationen auswerten und ein passendes Workout setzen. Damit ist noch nicht bewiesen, dass sich jeder laufende native Schritt verlustfrei fortsetzen oder GPS-genau umschalten lässt. Re-Entry, Aufzeichnung, Navigation, Berechtigungen und Firmware müssen in einem technischen Versuch untersucht werden. Deshalb ist dies eine spätere Ausbaustufe, keine Voraussetzung für einen nützlichen ersten Release.

## 4. Die passende Route ist eine Funktion von Strecke, Fahrer und Einheit

Eine Strecke ist nicht dauerhaft „eine Sweetspot-Route“. Derselbe Anstieg kann für einen Fahrer einen vollständigen zwölfminütigen Block erlauben und für einen stärkeren Fahrer zu kurz sein. Rückenwind verkürzt die verfügbare Zeit auf einem flachen Abschnitt; eine steile Rampe kann bei niedriger Zielintensität wegen Übersetzung und Gleichgewicht praktisch unpassend sein.

Ein sinnvoller Matcher braucht daher drei getrennte Eingaben:

| Eingang | Erforderlicher Inhalt |
|---|---|
| Trainingsvertrag | Konkrete Schritte, Zielbereiche, Wiederholungen, Mindest- und Höchsterholung, zusammenhängende Sets, erlaubte Outdoor-Varianten |
| Strecke | Originalgeometrie, Richtung, Höhe und deren Qualität; bekannte Unterbrechungen, Straßenoberfläche und Zugangsbedingungen |
| Fahrer und Kontext | Aktuelle Leistungsziele, Leistungsmesser verfügbar, möglichst Übersetzung und Gesamtgewicht; geplante Zeit, Wind und Erfahrungen auf dieser Route |

Fehlende Werte müssen als unbekannt erhalten bleiben. Ein GPX mit Höhe verrät nicht zuverlässig, ob es eine Ampel, einen gesperrten Weg oder eine stark befahrene Kreuzung gibt. Wiederholte Fahrten ohne Halt sind hilfreiche Beobachtungen, aber keine Garantie für die nächste Fahrt.

Valhalla kann Kartenattribute wie Oberfläche, Nutzung, Kreisverkehr und Höheninformationen liefern. GraphHopper bietet vergleichbare abschnittsbezogene Informationen. Beide sind Infrastruktur für die Analyse; keiner dieser Bausteine liefert allein ein validiertes „hier sind harte Intervalle sicher“. Auch die Auflösung und Semantik der Höhenattribute muss passen: Valhalla weist ausdrücklich darauf hin, dass `weighted_grade` keine gewöhnliche lokale Steigung sein muss.<sup><a href="#s20">20</a>, <a href="#s21">21</a></sup>

## 5. Empfohlener Algorithmus

### Schritt 1: Originalroute erhalten und Datenqualität prüfen

GPX, eigene Aktivität oder Crew-Strecke auf eine gemeinsame Datenstruktur bringen. Streckenrichtung, Rundennummer und Reihenfolge müssen erhalten bleiben. Eine Acht oder Hin-und-zurück-Strecke darf nicht anhand des nächsten GPS-Punkts allein zugeordnet werden. Eine optional kartengestützte Geometrie wird gegen das Original geprüft; der Import darf nicht unbemerkt eine andere Straße erzeugen.

### Schritt 2: Erlaubte Trainingsabschnitte bilden

Aus Höhe, Straßenattributen, Kurven und bekannten Unterbrechungen entstehen zusammenhängende Kandidaten. Nicht nur Anstiege suchen: Eine lange ebene Straße kann für Schwellentraining besser geeignet sein als eine kurze steile Rampe. Bekannte Unterbrechungen teilen den Korridor; unzureichende Daten verringern die Aussagekraft. Die Grenzen sind konfigurierbare Produktregeln, keine vorgetäuschten wissenschaftlichen Naturkonstanten.

### Schritt 3: Zeit bei der geplanten Belastung schätzen

Geschwindigkeit muss für den jeweiligen Zielbereich geschätzt werden. Die historische Durchschnittsgeschwindigkeit der gesamten Runde reicht nicht. Bestehende persönliche Fahrten, Windrichtung, Steigung und ein einfaches physikalisches Modell liefern eine Zeitspanne. Physikalische Leistungsmodelle sind in der Literatur grundsätzlich validiert; das validiert jedoch weder RIDRs individuelle Parameter noch unsere Vorhersage unter Verkehr, Kurven und wechselnden Bedingungen.<sup><a href="#s22">22</a></sup>

Für die Passform eines zwölfminütigen Blocks ist besonders der schnellere plausible Verlauf wichtig: Wenn der Fahrer den geeigneten Abschnitt früh verlässt, endet das Zeitintervall sonst hinter der sicheren oder geeigneten Grenze. Für die Rückkehrzeit ist dagegen die langsamere plausible Fahrt relevant. Eine einzige optimistische ETA kann beide Entscheidungen nicht sinnvoll tragen.

### Schritt 4: Ganze Sets platzieren

Die Zuweisung erfolgt entlang der Route in Reihenfolge. Ein Intervallset ist eine Einheit aus Belastung und vorgeschriebener Erholung. Übergänge zwischen Sets können nur innerhalb der erlaubten Grenzen verschoben werden. Auch die Rückfahrt und das verbleibende Tageszeitbudget zählen.

Technisch bietet sich eine Suche über Kandidatenabschnitte mit dynamischer Programmierung an. Zustände enthalten den nächsten Trainingsblock, die Position im Kurs und zulässige Zeit- beziehungsweise Erholungsfenster. Unzulässige Übergänge werden ausgeschlossen; unter den verbleibenden Lösungen werden geringe Abweichung von der Trainingsabsicht, geeignete Oberfläche und überschaubare Zusatzdauer bevorzugt. Diese Architektur ist eine Empfehlung, kein bereits trainiertes oder validiertes Modell.

### Schritt 5: Belastung und Routenzeiten neu berechnen

Anfahrt, zusätzliche Erholung und Heimweg verändern die Gesamtdauer. TSS hängt von Intensität und Dauer ab und darf nach einer Anpassung nicht einfach aus der Originaleinheit übernommen werden. Gleiche TSS beweisen wiederum keine gleichwertige Intervallstruktur. Erwartete Werte sind als Prognose zu kennzeichnen; die tatsächlichen Werte entstehen aus der gefahrenen Aktivität.<sup><a href="#s23">23</a></sup>

### Schritt 6: Ergebnis mit begründeter Grenze ausgeben

RIDR sollte drei klare Ausgänge verwenden: „Passt“, „Passt mit Anpassung“ und „Kein passender Abschnitt gefunden“. Dazu kommt unabhängig die Datenlage, beispielsweise „Höhenprofil vorhanden, Unterbrechungen nicht geprüft“. Ein undurchsichtiger Prozentwert vermischt Eignung und Sicherheit und ist für eine Entscheidung schlechter als eine kurze konkrete Begründung.

Ein negatives Ergebnis darf nicht durch beliebiges Kürzen, Intensivieren oder Zusammenlegen der Einheit grün gerechnet werden. Stattdessen eine bekannte passende Route anbieten, eine fachlich freigegebene Alternative wählen oder die ursprüngliche Einheit für drinnen beibehalten. Eine längere Lieblingsrunde kann möglich sein, muss aber als zusätzlicher Umfang in die Wochenplanung eingehen.

## 6. Konkretes Beispiel

Die folgenden Zahlen sind ein Rechenbeispiel, keine Analyse einer echten Nutzerroute. Vorgesehen sind drei zwölfminütige Sweetspot-Blöcke. Der erste geeignete Abschnitt beginnt nach dem Ort; später folgen zwei weitere lange Abschnitte. Für jeden Block wird die Zeit bei Zielintensität simuliert, nicht die globale Rundengeschwindigkeit verwendet.

| Teil der Fahrt | Zuordnung | Steuerung |
|---|---|---|
| Anfahrt durch den Ort | Locker bis zum ersten geeigneten Abschnitt | Flexibler Schritt; noch kein harter Countdown |
| Abschnitt A | 12 Minuten Sweetspot | Feste Belastungsdauer, Start nach Bestätigung |
| Verbindung A → B | Erholung innerhalb des zulässigen Fensters | Belastungsobergrenze und verbleibende Zeit beachten |
| Abschnitt B | Zweiter vollständiger Block | Wie A |
| Verbindung B → C | Erholung | Keine automatische Freigabe, wenn der Transfer zu lange dauert |
| Abschnitt C | Dritter vollständiger Block | Wie A |
| Heimweg | Locker ausfahren | Zusätzliche Dauer bleibt sichtbar |

Bei angenommenen 30–36 km/h legt der Fahrer in zwölf Minuten 6,0–7,2 km zurück. Ein sechs Kilometer langer Abschnitt reicht somit nicht zuverlässig für den ganzen Block. Ein Gegenwindtag kann die Passform verändern, ohne dass die Route selbst anders aussieht. Eine positionsbezogene Empfehlung sollte deshalb einen geeigneten Startkorridor zeigen und die tatsächliche Belastungsdauer erhalten.

Bei 5 × 3 Minuten mit drei Minuten Erholung benötigt eine vollständig zusammenhängende Serie insgesamt 27 Minuten, ohne Aufwärmen und Ausfahren. Wird stattdessen ein Hügel wiederholt, muss auch der Rückweg in das zulässige Erholungsfenster passen. Das ist der Unterschied zwischen einer hübschen Karte mit fünf Markern und einem ausführbaren Workout.

## 7. Vorhandene RIDR-Bausteine und konkrete Lücken

Die lokale Codeprüfung zeigt mehr als einen leeren Ausgangspunkt. Sie belegt aber nicht, dass sämtliche Bausteine in derselben Version produktiv ausgerollt oder fachlich validiert sind.

| Vorhandener Baustein | Was der Code leistet | Nötige Ergänzung |
|---|---|---|
| `route_recommendation.py` | Routensortierung über Dauer, historische TSS, Kletteranteil und längsten Anstieg; Abschläge bei dünner Historie | Tatsächliche Intervalle und Wiederholungen über den Streckenverlauf zuordnen |
| `route_match.py` | Kartenzuordnung über Valhalla und Qualitätsprüfung | Für Trainingsentscheidungen passende Straßenattribute, Richtungs- und Unterbrechungsinformationen |
| `rehearsal/route_source.py` | Quellen vereinheitlichen, unter anderem GPX und Aktivitäten | Identität der gewählten Route durchgängig bis Analyse und Export |
| `rehearsal/route_profile.py` | Höhenabschnitte und Anstiege | Geeignete flache Abschnitte und Grenzen zwischen Trainingskorridoren |
| `rehearsal/physics.py` | Geschwindigkeit aus Leistung, Steigung, Wind und Fahrerparametern | Schätzung bei vorgeschriebenem Workout-Ziel, Fahrtechnik- und Unterbrechungsgrenzen |
| `rehearsal/simulator.py` | Pacing-Simulation mit eigener Belastungslogik | Workout-Schritte als unverwechselbare Vorgabe; keine Übernahme einer Race-Pacing-Logik als Trainingsersatz |
| `rehearsal/route_history.py`, `band_calibration.py` | Historische Vergleiche und Kalibrierungsbausteine | Persönliche Vorhersagefehler und passendes Segmenttempo zurückführen |
| `api/coach.py` Export | Exportiert das Workout aus dem neuesten Coach-Brief | Export der tatsächlich ausgewählten Plan-Einheit mit eindeutiger Version |
| Planvorschau | Lokaler ZWO/FIT/MRC/ERG-Export der ausgewählten Beispieleinheit | Echte Nutzer- und Planbindung, Outdoor-Zielbereiche, flexible Schritte, gekoppelte Route |

Zwei konkrete Schwächen der vorhandenen Routensortierung sind für dieses Vorhaben relevant. Erstens gewichtet sie Dauer und historische TSS mit jeweils 30 %, Gelände mit 25 % und längsten Anstieg mit 15 %, prüft aber keine vollständige Intervallfolge. Ein langer Anstieg ist nicht gleichbedeutend mit einer passenden zwölfminütigen Strecke, und frühere TSS hängen auch davon ab, wie der Fahrer damals gefahren ist.

Zweitens werden virtuelle Routen nur abgewertet. Für eine ausdrücklich gewählte Outdoor-Fahrt sollten sie bereits bei der Kandidatenauswahl ausgeschlossen werden. Fehlende Geländeinformationen dürfen weiterhin eine ehrliche Unbekannt-Meldung ergeben; sie sollten keine ungeprüfte Bestätigung „Route passt“ erzeugen.

Die ältere Route-Rehearsal-Spezifikation enthält die Behauptung, niemand simuliere Fahrer und Straße gemeinsam. Die recherchierten Funktionen von myWindsock und Best Bike Split widersprechen dieser pauschalen Marktbehauptung. Die technische Wiederverwendung bleibt sinnvoll; die Positionierung sollte auf einer besseren Trainingszuordnung und persönlicher Rückkopplung beruhen.

## 8. Oberfläche für den Fahrer

Die Bedienung beginnt auf der Detailseite der tatsächlich ausgewählten Einheit mit „Draußen fahren“. Danach erscheint eine kompakte Routenauswahl: eigene Routen und GPX importieren. Bereits verbundene externe Sammlungen dürfen nur erscheinen, wenn der Zugriff tatsächlich funktioniert. Der Fahrer muss keine Intervalle auf einer Karte zusammenbauen.

Nach der Analyse steht ein einziger Satz oben, beispielsweise: „Deine drei Belastungen passen auf die langen Abschnitte hinter dem Ort.“ Darunter eine große Karte oder ein Höhenprofil mit derselben gemeinsamen Kilometerachse: Belastung farbig, Übergänge ruhig, ungeklärte Abschnitte sichtbar unterscheidbar. Antippen markiert denselben Block auf Karte und Profil. Die Grafik darf keine Daten suggerieren, die wir nicht haben.

In der kompakten Ansicht genügen die geplante Gesamtzeit als Spanne, Kilometer und der Trainingszweck. Beim Öffnen eines Blocks folgen Zielbereich, Dauer und der konkrete Grund für die Platzierung. Die Hauptaktion heißt „Einheit & Route vorbereiten“ beziehungsweise bei funktionsfähiger Verbindung „An Garmin senden“. Dateiformate gehören in die sekundäre Exportansicht.

Nach der Fahrt sollte das Review getrennt zeigen: erreichte Belastungsblöcke, Abweichung vom vorgesehenen Reiz, zusätzliche Gesamtbelastung und Konsequenz für die nächste Einheit. Eine wegen einer Kreuzung verschobene Belastung ist nicht dasselbe wie ein nicht geschaffter Belastungsblock. Umgekehrt darf „gleiche TSS“ einen ausgefallenen VO₂max-Reiz nicht unsichtbar machen.

Die sinnvolle persönliche Rückkopplung besteht aus tatsächlich gelernten Routenzeiten, bevorzugten Abschnitten, beobachteten Unterbrechungen und Ausführbarkeit bestimmter Trainingssets. Ein Modell kann dadurch seine Vorschläge verbessern. Eine einzelne gute Fahrt beweist jedoch keinen exakten FTP- oder VO₂max-Zuwachs.

## 9. Reihenfolge der Umsetzung und Abnahmekriterien

| Stufe | Umfang | Bedingung für Freigabe |
|---|---|---|
| 1. Korrekte Outdoor-Einheit | Ausgewählte Einheit, fachlich definierte Zielbereiche, erlaubte flexible Schritte, klare Sensoranforderungen | Export und Anzeige beziehen sich auf dieselbe Einheit und Version; keine Fantasie-TSS oder Ersatz-GPS |
| 2. Eigene Route prüfen | GPX / frühere Fahrt, Gelände und Datenlage, volle Sets platzieren, Tagesumfang aktualisieren | Negative Fälle bleiben negativ; keine still veränderte Route oder Trainingsabsicht |
| 3. Garmin-Paket | Zugehörige Route und Workout übertragen; Versionierung, Wiederholversuche, getrennte Sync-Zustände | Physischer Test mit mindestens den konkret freizugebenden Edge-Modellen und Firmwareständen |
| 4. Wahoo / weitere Geräte | Geräteabhängige Export- und Ausführungsvarianten | Navigation, Hinweise, Pausen und Zielbereiche pro Gerät geprüft |
| 5. Ortsabhängige Begleitung | Eigene Connect-IQ-Komponente als technischer Versuch | GPS-Ausfall, Umwege, Kreisstrecken und Workout-Wechsel ohne irreführende Führung beherrscht |

Für die Streckenanalyse sind insbesondere vier Gegenproben nötig: eine flache Route voller Unterbrechungen, ein steiler Kurs für Regeneration, ein technisch schwieriger Abschnitt mit gut aussehendem Höhenprofil und eine Hin-und-zurück-Strecke mit überlappenden GPS-Punkten. Zusätzlich muss eine Route, die bei Normaltempo passt, unter plausibler schnellerer Fahrt geprüft werden. Fehlende Höhe, fehlende Leistungsdaten und eine deutlich zu lange Heimfahrt dürfen keine scheinpräzise positive Bewertung erzeugen.

Auf dem Gerät müssen Zielbereiche, offene Schritte, Rundenknopf, Navigation neben dem Workout, Pause, Wiederholung, Offline-Nutzung und der Rückimport der gefahrenen Einheit geprüft werden. Eine erfolgreiche FIT-Decodierung bestätigt die Dateistruktur; sie ersetzt diesen Test nicht. Für den Analysebetrieb sind zudem Latenz und Datenalter sichtbar zu messen. Zwischengespeicherte Routengeometrie kann wiederverwendet werden, während Wetter, Trainingsversion und Fahrerparameter eine neue Bewertung auslösen.

Die zentrale Erfolgsmessung sollte lauten: Können Fahrer die vorgesehenen Belastungsblöcke auf ihrer gewählten Route durchführen, ohne vorher selbst planen zu müssen? Ergänzend messen wir Abweichung der vorhergesagten Zeitspanne, ungeeignete Vorschläge, notwendige manuelle Eingriffe und verpasste Synchronisationen. Einen psychologischen Bindungseffekt oder eine Leistungssteigerung dürfen wir nicht aus der Nutzungshäufigkeit allein ableiten.

## Quellen

Die Quellen belegen die jeweils zugeordneten Funktionen, nicht die Wirksamkeit eines noch zu entwickelnden RIDR-Matchers. Herstellerdokumentation ist eine Beschreibung des Anbieters; Hardwareverhalten bleibt gesondert zu verifizieren. Alle Abrufe: 14. September 2026.

1. <a id="s1"></a>Garmin. [Edge 1050 – Starting a Workout](https://www8.garmin.com/manuals/webhelp/GUID-08ACA9FC-DEE6-4C8D-8A95-F62181C512E9/EN-US/GUID-5CA69960-1471-47A1-867E-820FD0B240C8.html). Handbuch v7, Mai 2026. Route zum Workout hinzufügen.
2. <a id="s2"></a>Wahoo. [Planned workouts with ELEMNT ACE, BOLT 3 and ROAM 3](https://support.wahoofitness.com/hc/en-us/articles/22710662013458-Planned-workouts-with-ELEMNT-ACE-BOLT-3-and-ROAM-3). Ohne verlässlich ausgewiesenes Änderungsdatum. Gleichzeitige Route, Workout-Steuerung und Benachrichtigungen.
3. <a id="s3"></a>TrainerRoad. [Take Your Training Outside](https://www.trainerroad.com/blog/take-your-training-outside-introducing-outside-workouts/). Laufende Produktbeschreibung, Datum nicht verlässlich ausgewiesen. Draußen angepasste Alternativen.
4. <a id="s4"></a>myWindsock. [Intervals and Power Plans](https://mywindsock.com/page/help/beginner-2/intervals-and-power-plans/). Undatiert. Manuelle abschnittsbezogene Intervallplanung.
5. <a id="s5"></a>Best Bike Split. [What does the Garmin Uploads feature do?](https://support.bestbikesplit.com/article/82/what-does-the-garmin-uploads-feature-do). Undatiert; Footer 2022 ist kein verlässliches Änderungsdatum. Power Courses und Race Workouts.
6. <a id="s6"></a>TrainerRoad. [Outside Workouts: Choosing the Best Routes](https://www.trainerroad.com/blog/outside-workouts-choosing-the-best-routes/). Undatiert. Geländewahl nach Intervallstruktur.
7. <a id="s7"></a>TrainerRoad. [Structured Training Without a Power Meter](https://www.trainerroad.com/blog/structured-training-without-a-power-meter/). Undatiert. RPE und Grenzen kurzer pulsgesteuerter Belastungen.
8. <a id="s8"></a>Garmin. [Edge 1050 – Power Guide](https://www8.garmin.com/manuals/webhelp/GUID-08ACA9FC-DEE6-4C8D-8A95-F62181C512E9/EN-US/GUID-62E9EA93-7721-4ECB-91CE-5900580BB73C.html). Handbuch v7, Mai 2026. Kurs-Pacing, Ausschluss gleichzeitiger Workouts.
9. <a id="s9"></a>JOIN. [How does JOIN automatic export work?](https://help.join.cc/hc/en-150/articles/46209433565969-How-does-JOIN-automatic-export-work). Aktualisiert 21. Mai 2026. Heutige Einheit, Änderungen, Plattform-Sync.
10. <a id="s10"></a>TrainingPeaks. [How to Sync Garmin Connect With TrainingPeaks](https://help.trainingpeaks.com/hc/en-us/articles/204070854-How-to-Sync-Garmin-Connect-With-TrainingPeaks). Aktualisiert 11. September 2025. Geplante strukturierte Einheiten und Aktivitätssync.
11. <a id="s11"></a>Ben Norbury / myWindsock. [Planning an interval session](https://mywindsock.com/page/winter-training/planning-an-interval-session/). 6. November 2021, geändert 7. November 2021. Älteres konkretes Beispiel; keine neue Produkteinführung.
12. <a id="s12"></a>Hammerhead. [Karoo OS – Workouts](https://support.hammerhead.io/hc/en-us/articles/18001019006363-Karoo-OS-Workouts). Aktualisiert 26. Juni 2025. Strukturierte Workouts, keine RPE-Unterstützung laut Artikel.
13. <a id="s13"></a>Komoot. [Use Garmin Courses Sync with komoot](https://support.komoot.com/hc/en-us/articles/360041441552-Use-komoot-Tours-with-Garmin-Courses-Sync-integration). Laufende Supportdokumentation. Streckenübertragung.
14. <a id="s14"></a>Best Bike Split. [Manual loading of Garmin Power Course and TCX Power Route files](https://support.bestbikesplit.com/article/78/how-do-i-manually-load-garmin-power-course-and-tcx-power-route-files-on-to-my-ga). Undatiert, ältere Modellliste. Historischer Implementierungsweg; eingeschränkt aktuell.
15. <a id="s15"></a>TrainerRoad. [Outside Workouts: Garmin Setup](https://www.trainerroad.com/blog/garmin-edge-the-best-head-unit-setup/). Laufende Beschreibung. Anzeige und lap-gesteuerte Abschnitte.
16. <a id="s16"></a>Garmin Developers. [Training API](https://developer.garmin.com/gc-developer-program/training-api/). Undatiert. Veröffentlichung von Trainingsplänen und Workouts.
17. <a id="s17"></a>Garmin Developers. [Courses API](https://developer.garmin.com/gc-developer-program/courses-api/). Undatiert. Veröffentlichung von Kursen und Course Points.
18. <a id="s18"></a>Garmin Developers. [Program FAQ](https://developer.garmin.com/gc-developer-program/program-faq/). Undatiert. Zulassung, OAuth 2.0, Abgrenzung Connect IQ.
19. <a id="s19"></a>Garmin Developers. [Toybox.WatchUi.DataField – setWorkout](https://developer.garmin.com/connect-iq/api-docs/Toybox/WatchUi/DataField.html#setWorkout-instance_function). Dokumentation generiert 25. August 2026. API 5.2.0, ActivityControl, unterstützte Geräte und Schrittbeschränkungen.
20. <a id="s20"></a>Valhalla. [Map matching API](https://valhalla.github.io/valhalla/api/map-matching/). Laufende Dokumentation. Geometrie, Straßenattribute und Grenzen der Höhenattribute.
21. <a id="s21"></a>GraphHopper / Peter. [Routing API: Using Path Details](https://www.graphhopper.com/blog/2019/11/28/routing-api-using-path-details/). 28. November 2019, mit Ergänzung zu März 2023. Attributmodell; aktuelle Verfügbarkeit separat im API-Vertrag prüfen.
22. <a id="s22"></a>Martin JC, Milliken DL, Cobb JE, McFadden KL, Coggan AR. [Validation of a Mathematical Model for Road Cycling Power](https://pubmed.ncbi.nlm.nih.gov/28121252/). Journal of Applied Biomechanics 14(3), 276–291, August 1998. DOI 10.1123/jab.14.3.276. Physikalische Grundlage; keine Validierung unserer Umsetzung.
23. <a id="s23"></a>Joe Friel / TrainingPeaks. [Estimating Training Stress Score](https://www.trainingpeaks.com/learn/articles/estimating-training-stress-score-tss/). Älterer Grundlagenartikel, Originaldatum auf der geöffneten Fassung nicht ausgewiesen. Genutzt für die TSS-Formel; keine Übernahme aller Aussagen des Artikels.

### Lokale technische Belege

Geprüfter Arbeitsstand: `plan-design-review`, Branch `codex/plan-four-states`, Basis `81dabdf` mit lokalen Änderungen an der Planvorschau. Die Aussagen zu Backend-Modulen beziehen sich auf diesen Checkout, nicht auf eine verifizierte Railway-Produktionsversion.

- `backend/app/services/route_recommendation.py`: Gewichte, Geländeheuristiken, fehlende Intervallplatzierung und virtuelle Routenkandidaten.
- `backend/app/services/route_match.py`: vorhandene Valhalla-Anbindung.
- `backend/app/services/rehearsal/route_source.py`, `route_profile.py`, `physics.py`, `simulator.py`, `route_history.py`, `band_calibration.py`: wiederverwendbare Analysebausteine.
- `backend/app/api/coach.py`, ab Abschnitt „Workout export“: Auswahl über den neuesten Coach-Brief.
- `frontend/src/review-plan/data.ts`, `workoutFiles.ts`: synthetische Beispiele, zeitgesteuerte lokale Exporte.
- `frontend/review-tools/node_modules/@garmin/fitsdk/src/profile.js`: offizielles SDK 21.214.0, `wktStepDuration.open`.
- `docs/superpowers/specs/2026-07-30-route-rehearsal-design.md`: ältere Architekturabsicht; Marktbehauptungen nicht als Fakten übernommen.
