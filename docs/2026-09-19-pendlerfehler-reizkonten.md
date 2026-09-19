# Der Pendlerfehler

**Warum eine reizblinde Trainingslast die Qualitätseinheit frisst — und wie ein
adaptiver Plan Alltagsfahrten richtig verrechnet.**

Ridr · Trainingswissenschaftliche Ausarbeitung · 19. September 2026

---

## Zusammenfassung

Radpendler berichten ein wiederkehrendes Versagen adaptiver Trainingspläne: Die
Fahrt zur Arbeit erhöht die Tageslast, der Plan registriert Mehrbelastung und
schwächt daraufhin die geplante VO2max- oder Schwelleneinheit ab — oder ersetzt
sie durch Grundlagenausdauer. Das Ergebnis ist ein Athlet, der mehr Stunden auf
dem Rad sitzt und **weniger** Anpassung erfährt, weil der einzige Reiz, den
Grundlagenumfang nicht liefern kann, systematisch aus dem Plan entfernt wird.

Diese Arbeit zeigt: Der Fehler ist kein Justierungsproblem einzelner Schwellen,
sondern ein **Modellfehler**. Er entsteht, sobald Trainingslast als *ein* Skalar
geführt wird. TSS, TRIMP und Session-RPE komprimieren Dauer und Intensität zu
einer Zahl; zwei Wochen mit identischer Summe können völlig verschiedene
Intensitätsverteilungen und damit verschiedene Anpassungen tragen. Ein Planer,
der auf diesen Skalar regelt, kann prinzipiell nicht zwischen „45 TSS Pendeln"
und „45 TSS Intervalle" unterscheiden — obwohl genau dieser Unterschied die
gesamte Trainingswirkung ausmacht.

Wir schlagen **Reizkonten** vor: eine Zerlegung der Last in drei getrennt
geführte Konten (Grundlage, Schwelle, VO2max/anaerob) mit der Invariante, dass
Grundlagenlast niemals Qualitätslast kürzen darf. Ergänzt wird das Modell um ein
**Alltagsprofil** (Arbeitszeiten, Pendelweg, Modus), das Pendellast *vorhersagt*
statt sie nachträglich zu verrechnen, und um die Erkenntnis, dass eine
Morgenfahrt vor einer Abendeinheit physiologisch eher **Priming** als Ermüdung
ist.

---

## 1. Das beobachtete Problem

### 1.1 Die Klage, wörtlich

> „Wenn ich morgens und nachmittags zur Arbeit fahre, passt sich der Plan an und
> ändert das Training. Das ist ja gut, weil diese Fahrten auch etwas bewirken.
> Aber wenn mein Plan FTP oder VO2max vorsieht und meine VO2max-Einheiten dann
> reduziert werden, weil ich zur Arbeit gefahren bin — dann habe ich doch keinen
> echten Trainingsreiz mehr, oder?"

Die Intuition ist korrekt, und sie ist präziser als sie klingt. Der Athlet
beschreibt keinen Komfortverlust, sondern einen **Reizverlust**: Die Substitution
tauscht einen Reiz, den nur hohe Intensität erzeugt, gegen mehr von einem Reiz,
den er ohnehin im Überfluss bekommt.

### 1.2 Zwei Pfade im bestehenden System

Die Klage ist im Code exakt reproduzierbar. Zwei unabhängige Mechanismen führen
dorthin, und beide sind reizblind.

**Pfad A — Bereitschaft über ACWR.**
`readiness_score.py` bildet das Verhältnis akuter zu chronischer Last
(`acwr = inputs.atl / inputs.ctl`). Pendelfahrten heben ATL, ohne CTL im selben
Tempo zu heben. Die Bereitschaft sinkt. Regel R6 (`readiness_applied`) wendet die
daraus folgende Entscheidung an und tauscht die heutige Einheit — in der
Produktion beobachtet: *Schwelle 2×15 min → Grundlagenausdauer 60 min*,
64 → 42 TSS.

**Pfad B — Absorption über das Wochenbudget.**
`plan_absorption.py` sucht ein Opfer, um die Woche ins Budget zurückzuholen:

```python
filler_pool = [p for p in fresh if _category_of(p.template_id) in _FILLER_CATEGORIES]
pool = filler_pool or fresh
victim = max(pool, key=lambda p: _tss_of(p.template_id))
```

Der Kommentar darüber verspricht, Qualitätseinheiten zu verschonen — aber nur,
*solange ein Füller übrig ist*. `pool = filler_pool or fresh` ist der Bruch: Sind
die Grundlagentage verbraucht, umfasst der Topf alle Einheiten, und
`max(_tss_of)` greift zwangsläufig zur größten. Das ist die VO2max- oder
Schwelleneinheit, weil Qualitätseinheiten die höchste TSS-Dichte haben.

**Wer pendelt, verbraucht die Puffer zuerst.** Fünf Pendeltage pro Woche
absorbieren genau die Grundlagentage, die als Opfer gedacht waren. Danach ist die
Qualitätseinheit strukturell das nächste Opfer — nicht als Ausnahme, sondern als
Regelfall. Der Schutz ist so konstruiert, dass er bei genau der Nutzergruppe
versagt, für die er am wichtigsten wäre.

### 1.3 Warum die Regel „mehr Last → weniger Plan" im Kern richtig ist

Der Vollständigkeit halber: Die Absorption ist keine Fehlkonstruktion. Ein
Athlet, der spontan 120 TSS extra fährt, *sollte* nicht zusätzlich das volle
Programm bekommen. Die Regel ist richtig — sie ist nur an der falschen Größe
aufgehängt.

---

## 2. Der Modellfehler: Last als Skalar

### 2.1 Die Äquivalenzannahme

Jede skalare Lastkennzahl — TSS, TRIMP, Session-RPE — bildet die Abbildung

```
Last = f(Dauer, Intensität) → ℝ
```

Diese Abbildung ist **nicht injektiv**. Sie ist es absichtlich nicht: Der Zweck
einer Lastkennzahl ist, Vergleichbarkeit zwischen ungleichen Einheiten zu
schaffen. Genau daraus folgt aber, dass sie die Information verliert, die für die
Anpassungsrichtung entscheidend ist.

90 Minuten Pendeln bei IF 0,55 und 50 Minuten VO2max-Intervalle können denselben
TSS-Wert tragen. Physiologisch haben sie fast nichts gemeinsam:

| | Pendeln (Z1–Z2) | VO2max-Intervalle (Z5) |
|---|---|---|
| Zeit nahe VO2max | ~0 min | 8–16 min |
| Rekrutierung Typ-II-Fasern | gering | hoch |
| Primärer Anpassungspfad | mitochondriale Dichte, Fettoxidation, kapillare Versorgung | maximale Sauerstoffaufnahme, Herzzeitvolumen, Pufferkapazität |
| Regenerationskosten | niedrig | hoch |
| Ersetzbar durch Umfang | ja | **nein** |

Die letzte Zeile ist der ganze Punkt. Grundlagenumfang und hohe Intensität sind
keine Skalierungen desselben Reizes, sondern **verschiedene Reize**. Ein Planer,
der sie gegeneinander verrechnet, tauscht nicht Menge gegen Menge, sondern
löscht eine Reizqualität ersatzlos.

### 2.2 Was die Literatur dazu sagt

**Intensitätsverteilung ist eine eigenständige Trainingsvariable.**
Systematische Übersichten und Netzwerk-Metaanalysen zur Intensitätsverteilung
(*training intensity distribution*, TID) behandeln die Verteilung als
unabhängige Determinante der Anpassung, nicht als Nebenprodukt des Umfangs.
Campos et al. (2022) finden für Mittel- und Langstrecke ein Optimum bei hohem
Umfang niedriger Intensität (≈ 70 % des Gesamtumfangs) — was bedeutet: Die
restlichen ~30 % sind nicht Rest, sondern konstitutiv. Stöggl und Sperlich
(2015) analysieren die Verteilung gut trainierter und Elite-Ausdauerathleten
retrospektiv, um „das optimale Verhältnis von Umfang und Intensität für maximale
Anpassung" zu bestimmen — die Fragestellung selbst setzt voraus, dass eine
Summenlast die Antwort nicht enthält. Rosenblat et al. (2025) vergleichen
Verteilungs-Interventionen netzwerk-metaanalytisch auf VO2max und
Zeitfahrleistung.

Treff et al. (2019) haben für genau dieses Problem den **Polarisationsindex**
vorgeschlagen — ein Rechenwerkzeug, um polarisierte von nicht-polarisierten
Verteilungen zu unterscheiden. Dass ein solcher Index überhaupt nötig ist, ist
der direkteste Beleg dafür, dass Umfang und Summenlast die Verteilung nicht
abbilden.

**Der Reiz einer Intervalleinheit ist nicht ihre Last, sondern die Zeit in der
Zielzone.** Buchheit und Laursen (2013, Teil I und II) legen die Programmierung
hochintensiver Intervalle als mehrdimensionales Problem aus: kardiopulmonale
Beanspruchung, anaerober Energiebeitrag und neuromuskuläre Last sind getrennt zu
steuernde Größen. Eine Einheit, die ihre Zielintensität nicht erreicht, hat ihren
Zweck verfehlt, unabhängig davon, wie viel Last sie sammelt. Fleckenstein et al.
(2024) zeigen die Kehrseite: Kurzintervalle, deren Intensität über die maximale
aerobe Geschwindigkeit hinaus *erhöht* wird, sind traditionellen Formaten
unterlegen — die Zielzone ist ein Fenster, kein Grenzwert. Intensität ist
zweiseitig empfindlich.

**Gibala und Jones (2013)** formulieren die Rolle von HIIT bei Trainierten
explizit als *Ergänzung* zu bereits hohem Umfang. Ergänzung heißt: Der Umfang
kann sie nicht ersetzen. Genau diese Substitution nimmt der Planer vor.

### 2.3 Warum ACWR die Fehlentscheidung verstärkt

Pfad A regelt auf das Verhältnis akuter zu chronischer Last. Diese Kennzahl ist
methodisch umstritten. **Impellizzeri, Tenan, Kempton, Novak und Coutts (2020)**
legen unter dem Titel *„Acute:Chronic Workload Ratio: Conceptual Issues and
Fundamental Pitfalls"* die konzeptionellen und statistischen Probleme dar: Die
ACWR ist ein Quotient zweier korrelierter, überlappender Größen; der Zähler ist
in der Berechnung des Nenners enthalten, was zu mathematischer Kopplung und
Fehlschlüssen führt.

Für unseren Fall kommt ein spezifischeres Problem hinzu: **Der Zähler ist
reizblind.** Pendellast erhöht ATL genauso wie Intervalllast. Die daraus
abgeleitete „Ermüdung" behandelt eine 40-minütige Fahrt bei 55 % FTP wie 40
Minuten Schwellenarbeit. Ein Athlet, der jeden Werktag zweimal 25 Minuten locker
fährt, erzeugt eine chronisch erhöhte ATL bei minimaler realer Erholungsschuld —
und wird dafür dauerhaft als „nicht bereit" eingestuft.

---

## 3. Was Pendeln physiologisch wirklich ist

### 3.1 Pendeln ist Training — aber Grundlagentraining

Die Wirksamkeit des Radpendelns ist gut belegt. Hendriksen et al. (2000)
untersuchten die körperliche Leistungsfähigkeit von 87 männlichen und 35
weiblichen Beschäftigten, die regelmäßig zur Arbeit radelten. Novis et al. (2025)
führten eine randomisiert-kontrollierte Studie über zehn Wochen durch
(Interventionsgruppe: 148 ± 38 min Pendeln pro Woche) und maßen Effekte auf
körperliche Aktivität, kardiometabolische Gesundheit und Körperzusammensetzung.

Zwei Befunde sind für uns wichtig:

1. **Die Dosis ist real.** ~150 min/Woche ist kein Rauschen; das ist bei vielen
   Freizeitathleten ein Drittel bis die Hälfte des Gesamtumfangs. Ihn zu
   ignorieren wäre genauso falsch wie ihn falsch zu verrechnen.
2. **Die Intensität ist selbstgewählt und niedrig.** Riiser et al. (2025)
   untersuchen die selbstgewählte Intensität beim realen E-Bike-Pendeln;
   Olsson et al. (2024) zeigen, dass die wahrgenommene Anstrengung im Feld —
   konkret im Pendelverkehr — *niedriger* ausfällt als drinnen bei gleicher
   Arbeit. Pendeln ist damit typischerweise Zone 1 bis untere Zone 2, mit kurzen
   Spitzen an Ampeln und Steigungen, die die Summenlast heben, ohne nennenswerte
   Zeit in der Zielzone hochintensiver Reize zu erzeugen.

**Schlussfolgerung:** Pendellast gehört auf das Grundlagenkonto. Sie ersetzt
Grundlageneinheiten — und nur diese.

### 3.2 Die Morgenfahrt ist eher Priming als Ermüdung

Die implizite Annahme des Planers lautet: Wer morgens gefahren ist, ist abends
schlechter belastbar. Für eine lockere Pendelfahrt ist diese Annahme nicht
gestützt — die Evidenz weist eher in die Gegenrichtung.

Vorbelastung („priming exercise") beschleunigt die Sauerstoffaufnahmekinetik und
verbessert die Leistung in nachfolgender hochintensiver Arbeit:

- **Caritá et al. (2014, PLoS One)** — *„The positive effects of priming exercise
  on oxygen uptake kinetics and high-intensity exercise performance"*: Vorherige
  Belastung im schweren Intensitätsbereich verbessert die VO2-Kinetik in
  nachfolgender hochintensiver Arbeit.
- **Bailey et al. (2016, IJSPP)** — Priming und Pacing-Strategie beeinflussen
  VO2-Kinetik und Radleistung.
- **Ktenidis et al. (2021, Eur J Sport Sci)** — Vorbelastung erhöht die
  Spitzenleistung im Wingate-Test.
- **McIntyre und Kilding (2015, J Sports Sci)** — hochintensives intermittierendes
  Priming und 3-km-Radleistung; die Autoren halten ausdrücklich fest, dass die
  optimale Priming-Routine „nicht gut definiert" ist.
- **Matsumoto et al. (2023, J Sports Sci Med)** — Priming-Intensität und maximale
  Sprintleistung; bereits eine milde Laktaterhöhung durch Vorbelastung wirkt.

Die Literatur beschreibt Priming üblicherweise mit kurzem Abstand (Minuten) und
höherer Intensität als eine Pendelfahrt. Die Übertragung auf „Morgenfahrt →
Abendeinheit" ist daher **eine begründete Analogie, kein direkter Beleg** — und
genau deshalb behandeln wir sie unten als Hypothese mit Messplan, nicht als
gesetzten Parameter. Was die Evidenz aber klar *nicht* stützt, ist die
Gegenannahme: dass 25 Minuten Zone 1 acht bis zehn Stunden später eine
Intervalleinheit unmöglich machen.

### 3.3 Zwei Einheiten am Tag sind ein etabliertes Werkzeug

Die Doppeleinheit ist im Ausdauersport Standard, nicht Notfall. Die Literatur zum
Training mit reduzierter Kohlenhydratverfügbarkeit („sleep low, train low") baut
sogar *bewusst* auf der Sequenz abendliche Intensität → morgendliche lockere
Einheit auf: Lane et al. (2015) untersuchten die akuten Trainingsantworten bei
Schlaf mit reduzierter Kohlenhydratverfügbarkeit nach abendlichem hochintensivem
Training; Impey et al. (2018) fassen dies in der *Glykogen-Schwellen-Hypothese*
zusammen; Areta et al. (2020) zeigen, dass die Zusammensetzung der Zwischenmahlzeit
das Ergebnis verändert.

Für den Pendler heißt das: Die Tagesstruktur „morgens locker, abends hart" ist
kein Konflikt, den der Plan auflösen muss. Sie ist ein Periodisierungsmuster, das
im Leistungssport gezielt hergestellt wird — der Pendler bekommt es geschenkt.

---

## 4. Zielgruppen

Die Lösung muss für mehrere Nutzungsmuster gleichzeitig tragen. Aus der
beschriebenen Klage und den Datenlagen ergeben sich vier Gruppen:

**A · Der tägliche Pendler-Athlet.** 2 × 20–40 min an 4–5 Werktagen, 80–150
TSS/Woche allein aus dem Arbeitsweg, dazu 2–3 strukturierte Einheiten. Sein
Problem ist das beschriebene: Der Arbeitsweg frisst die Qualität. Er braucht
Reiztrennung und Schutz der Schlüsseleinheit.

**B · Der Gelegenheitspendler.** 1–2 × pro Woche, oft wetterabhängig. Sein
Problem ist Unvorhersehbarkeit: Der Plan kann nicht wissen, ob Dienstag eine
Pendellast anfällt. Er braucht *Vorhersage mit Korrektur*, nicht starre Regeln.

**C · Der Schicht- oder Gleitzeitarbeiter.** Wechselnde Arbeitszeiten, wechselnde
Fenster. Sein Problem ist, dass ein Wochenrhythmus mit festen Terminen für ihn
nicht existiert. Er braucht ein Zeitfenster-Modell, das pro Tag variiert.

**D · Der Umfangsathlet ohne Pendelweg.** Für ihn darf sich nichts ändern. Jede
Lösung muss seine bestehende Erfahrung unverändert lassen — die Reizkonten
verhalten sich bei ihm identisch zum heutigen Verhalten.

**E · Der Sonderfall: das schnelle Pendeln.** Manche fahren den Arbeitsweg *hart*
— als Intervall oder Zeitfahren. Diese Fahrt ist dann keine Grundlagenlast, und
die Reiztrennung muss das erkennen, sonst dreht sich der Fehler um: Ein Athlet,
der morgens den Arbeitsweg gesprintet hat, bekäme abends unverändert VO2max.

Gruppe E ist der Grund, warum die Klassifikation **intensitätsbasiert** sein muss
und nicht allein zeitfensterbasiert.

---

## 5. Das vorgeschlagene Modell: Reizkonten

### 5.1 Grundidee

Statt eines Wochenbudgets in TSS führt der Plan **drei Konten**:

```
K_grundlage   Zone 1–2      (IF < 0,75)
K_schwelle    Zone 3–4      (0,75 ≤ IF < 0,95)
K_hoch        Zone 5+       (IF ≥ 0,95 oder strukturierte VO2max/anaerobe Einheit)
```

Jede Aktivität wird auf genau ein Konto gebucht — nicht nach ihrem Titel, sondern
nach ihrer gemessenen Intensitätsverteilung. Eine Fahrt mit 8 Minuten über 95 %
FTP innerhalb einer sonst lockeren Stunde bucht ihren Intervallanteil auf
`K_hoch` und den Rest auf `K_grundlage`.

### 5.2 Die zentrale Invariante

> **Grundlagenlast darf niemals Qualitätslast kürzen.**
>
> Eine Überschreitung auf `K_grundlage` darf ausschließlich Einheiten kürzen,
> die selbst auf `K_grundlage` gebucht sind. Ist kein solcher Tag mehr übrig,
> ist die korrekte Antwort *nichts zu tun* — nicht, die Qualitätseinheit zu
> opfern.

Das ist die direkte Korrektur zu `pool = filler_pool or fresh`. Der Rückfall auf
„alle Einheiten" ist genau der Ort, an dem das Modell heute kippt.

Physiologische Begründung: Überschüssiger Grundlagenumfang ist ein
Ermüdungsproblem mit niedrigen Kosten und hoher Toleranz. Eine gestrichene
Qualitätseinheit ist ein Reizverlust, der sich innerhalb der Woche nicht
kompensieren lässt, weil der Reiz nicht durch Umfang erzeugbar ist
(Abschnitt 2.1).

### 5.3 Wann eine Qualitätseinheit *doch* weichen darf

Die Invariante ist kein Freibrief. Drei Bedingungen rechtfertigen weiterhin einen
Eingriff, und alle drei sind reizunabhängig:

1. **Gemessene Krankheit.** Der Morgenbefund aus `morning_health_detector`
   (Ruhepuls ↑, HRV ↓, Atemfrequenz ↑) — bereits als Regel R7 umgesetzt.
   Ein Infekt ist kein Lastproblem.
2. **Selbstauskunft.** Der Fahrer meldet sich krank oder erschöpft.
3. **Echte Hochlast-Akkumulation.** `K_schwelle + K_hoch` über Budget — also
   Ermüdung aus *Qualitätsarbeit*, nicht aus Umfang. Das ist der Fall, für den
   die Absorption ursprünglich gedacht war.

Ausdrücklich **kein** Grund: ein gesunkener Bereitschaftswert, dessen Rückgang
sich vollständig aus Grundlagenvolumen erklärt.

### 5.4 Korrektur des Bereitschaftspfads

Pfad A braucht eine kleinere, aber ebenso grundsätzliche Korrektur. Die ACWR
bleibt als Kennzahl erhalten (sie ist im System verankert und ihre Schwächen sind
dokumentiert), bekommt aber einen **reizgewichteten Zähler**:

```
ATL_wirksam = Σ (TSS_i · w(Konto_i))     w_grundlage < w_schwelle ≤ w_hoch
```

Die Gewichtung ist keine Erfindung: Sie bildet ab, dass die Erholungskosten mit
der Intensität überproportional steigen — dieselbe Annahme, die der
Trainingsplanung ohnehin zugrunde liegt, wenn sie nach einer Intervalleinheit
einen leichten Tag vorsieht und nach einer lockeren Stunde nicht.

**Wichtig und ehrlich:** Die konkreten Gewichte sind *nicht* aus der Literatur
ableitbar. Sie sind ein Modellparameter, der kalibriert werden muss
(Abschnitt 8). Bis zur Kalibrierung ist der defensive Startwert
`w_grundlage = 0,65` zu wählen — spürbar, aber nicht so stark, dass echte
Überlastung unsichtbar wird.

### 5.5 Was mit der Grundlageneinheit passiert, wenn gependelt wurde

Die Regel „mehr Last → weniger Plan" bleibt also — nur auf dem richtigen Konto.
Wer diese Woche 120 TSS gependelt ist, dem werden Grundlagentage gekürzt oder
gestrichen. Das ist sogar *besser* als heute, denn es ist trennscharf begründbar:

> „Dein Arbeitsweg hat diese Woche 118 TSS Grundlage gebracht. Der lockere
> Mittwoch entfällt — deine Intervalle am Donnerstag bleiben."

Das ist die Aussage, die der Athlet aus der Klage hören will.

---

## 6. Kontexteingabe: das Alltagsprofil

Bisher erfährt der Plan von einer Pendelfahrt erst, wenn sie gefahren *und*
synchronisiert ist. Er reagiert also immer nachträglich. Ein Plan, der die
Wochenstruktur kennt, kann stattdessen *vorausplanen*.

### 6.1 Was erhoben wird

Das Profil muss in unter einer Minute ausfüllbar sein, sonst füllt es niemand
aus. Vier Angaben genügen:

| Angabe | Form | Wofür |
|---|---|---|
| Arbeitstage | Wochentage ankreuzen | Welche Tage tragen Pendellast |
| Arbeitsbeginn / -ende | zwei Uhrzeiten, je Tag überschreibbar | Trainingsfenster; Pendelzeitfenster |
| Pendelmodus | Rad / teilweise Rad / nicht mit dem Rad | Ob überhaupt Pendellast anfällt |
| Pendeldauer je Richtung | Minuten | Erwartete Last je Weg |

Optional und nur bei Bedarf: „fährst du den Arbeitsweg locker oder schnell?" —
die Antwort setzt lediglich den Startwert; die gemessene Intensität überschreibt
ihn.

### 6.2 Was daraus folgt

**Vorhersage statt Reaktion.** Aus Arbeitstagen × Modus × Dauer ergibt sich eine
erwartete Wochen-Grundlagenlast. Der Plan wird von vornherein mit diesem Budget
gebaut, statt jede Woche nachträglich beschnitten zu werden. Das beseitigt das
Grundproblem an der Wurzel: Es gibt keine Überraschung mehr zu absorbieren.

**Platzierung der Qualitätseinheiten.** Wer bis 17 Uhr arbeitet und 30 Minuten
heimfährt, hat dienstags kein 90-Minuten-Fenster. Die Schlüsseleinheit gehört
dann auf einen Tag mit Fenster — das ist eine Terminplanungs-, keine
Physiologiefrage, und sie wird heute gar nicht gestellt.

**Klassifikation.** Eine Fahrt, die werktags im erwarteten Zeitfenster startet
und die erwartete Dauer ±50 % trifft, ist mit hoher Wahrscheinlichkeit eine
Pendelfahrt. Zusammen mit der gemessenen Intensität ergibt das eine belastbare
Einordnung — und für Gruppe E (schnelles Pendeln) entscheidet die Intensität, nicht
das Zeitfenster.

### 6.3 Erkennung ohne Profil

Nicht jeder füllt ein Profil aus. Ohne Angaben bleibt eine schwächere, aber
nutzbare Heuristik. Die verfügbaren Felder sind `started_at`, `duration_seconds`,
`distance_meters`, `normalized_power`, `ftp_watts_at_scoring`, `title`, `bike_id`.

Wichtig: **`bike_id` ist in der Produktion durchgängig leer** und Garmin-Titel
lauten „*Stadt* Radfahren" — es gibt also keine vorhandene Pendelmarkierung, auf
die man sich stützen könnte. Nutzbar sind:

- **Paarung:** zwei Fahrten am selben Werktag, ähnliche Dauer (±25 %), durch
  4–12 Stunden getrennt → starkes Signal.
- **Wiederholung:** dieselbe Dauer-Distanz-Signatur an ≥ 3 Werktagen in 14 Tagen.
- **Niedrige Intensität:** IF < 0,75.
- **Kürze:** Dauer < 60 min.

Die Heuristik ist bewusst konservativ: Im Zweifel wird **nicht** als Pendelfahrt
klassifiziert, weil eine falsch als Pendeln eingestufte harte Fahrt den Fehler
umkehrt (Gruppe E) — und ein umgekehrter Fehler ist schlechter als der Status quo.

---

## 7. Umsetzungsarchitektur

### 7.1 Neue Bausteine

```
app/services/ride_classification.py   Fahrt → Konto (gemessen, nicht geraten)
app/models/work_rhythm.py             Alltagsprofil je Athlet
app/services/load_accounts.py         Wochenlast je Konto, statt eines Skalars
```

### 7.2 Änderungen an bestehenden Bausteinen

| Datei | Änderung |
|---|---|
| `plan_absorption.py` | `pool = filler_pool or fresh` → `pool = filler_pool`; ohne Füller kein Eingriff. Budgetprüfung gegen `K_grundlage`. |
| `plan_adaptation_engine.py` | `_rule_extra_load` prüft Kontoüberschreitung statt Gesamt-TSS |
| `readiness_score.py` | reizgewichtetes ATL im ACWR-Term |
| `plan_interview.py` | Alltagsprofil erheben |
| Planaufbau | erwartete Pendellast als Budgetposten einplanen |

### 7.3 Der Beleg

Die in dieser Sitzung gebaute Beleg-Komponente (`W3AdaptationReceipt`) zeigt
bereits „War geplant / Steht jetzt" mit Lastvergleich und die Gründe als Pillen.
Sie erhält zwei Ergänzungen:

- eine **Konto-Pille** („Grundlage 118 TSS · davon Arbeitsweg 84"), damit
  sichtbar ist, *welches* Konto die Änderung ausgelöst hat;
- die **Nicht-Änderung als Aussage**: „Dein Arbeitsweg zählt auf die Grundlage —
  deine Intervalle bleiben." Ein Plan, der eine Qualitätseinheit bewusst *nicht*
  antastet, sollte das sagen. Genau dieses Schweigen hat die Klage ausgelöst.

---

## 8. Validierung

Das Modell macht überprüfbare Vorhersagen. Es ist damit widerlegbar — und soll
es sein.

**V1 — Reizerhalt.** Bei Pendlern (≥ 3 Pendeltage/Woche) sinkt der Anteil der
Wochen, in denen eine geplante Einheit aus `K_hoch` oder `K_schwelle`
herabgestuft wurde, gegenüber dem Status quo deutlich. *Messbar direkt aus
`plan_adaptations`: Regel × Kategorie der Zieleinheit.*

**V2 — Keine Überlastung.** Die reizgewichtete ACWR darf nicht dazu führen, dass
echte Überlastung übersehen wird. Kontrollgröße: Häufigkeit von `illness_interlock`
und `morning_health_downgrade` vor/nach Einführung. Ein Anstieg widerlegt die
Gewichtung.

**V3 — Priming-Hypothese.** Bei Athleten mit Morgenpendelfahrt und abendlicher
Qualitätseinheit unterscheidet sich die erreichte Intervallleistung (mittlere
Leistung der Arbeitsintervalle, normiert auf FTP) **nicht** signifikant von
Tagen ohne Morgenfahrt. Die Daten dafür liegen bereits vor: Die Stream-Pipeline
speichert Intervallleistungen. *Widerlegt die Hypothese, wenn die Leistung an
Pendeltagen systematisch niedriger ausfällt — dann ist die heutige Absorption
näher an der Wahrheit als dieses Modell, und die Gewichte müssen zurück.*

**V4 — Profilnutzung.** Anteil der Athleten, die das Alltagsprofil vollständig
ausfüllen. Unter 40 % ist die Eingabe zu lang und muss gekürzt werden, nicht
beworben.

---

## 9. Grenzen dieser Arbeit

- **Die Priming-Übertragung ist eine Analogie.** Die zitierten Studien verwenden
  kurze Abstände und höhere Intensitäten als eine Pendelfahrt. V3 ist deshalb
  als Test formuliert, nicht als Bestätigung.
- **Die Kontogewichte sind nicht literaturgestützt.** Sie sind ein
  Modellparameter mit defensivem Startwert und Kalibrierungspflicht.
- **Zonengrenzen über IF sind eine Vereinfachung.** Die saubere Größe wäre die
  Zeit in Leistungszonen aus dem Leistungsstrom. Wo Streams vorliegen, ist die
  Verteilung zu verwenden; IF ist der Rückfall.
- **Die Klassifikationsheuristik ohne Profil bleibt unsicher.** Sie ist bewusst
  konservativ ausgelegt; der Preis ist, dass manche Pendelfahrt unerkannt bleibt
  und wie heute verrechnet wird.
- **Keine eigene Erhebung.** Diese Arbeit stützt sich auf publizierte Literatur
  und auf die Produktionsdaten dieses Systems, nicht auf eine eigene Studie.

---

## Literatur

Areta JL, et al. (2020). Achieving energy balance with a high-fat meal does not
enhance skeletal muscle adaptation and impairs glycaemic response in a sleep-low
training model.

Bailey SJ, et al. (2016). Effects of Priming and Pacing Strategy on
Oxygen-Uptake Kinetics and Cycling Performance. *Int J Sports Physiol Perform.*

Buchheit M, Laursen PB (2013). High-intensity interval training, solutions to
the programming puzzle. Part I: cardiopulmonary emphasis. *Sports Med.*

Buchheit M, Laursen PB (2013). High-intensity interval training, solutions to
the programming puzzle. Part II: anaerobic energy, neuromuscular load and
practical applications. *Sports Med.*

Campos Y, et al. (2022). Training-intensity Distribution on Middle- and
Long-distance Runners: A Systematic Review.

Caritá RAC, et al. (2014). The positive effects of priming exercise on oxygen
uptake kinetics and high-intensity exercise performance. *PLoS One.*

Fleckenstein D, Braunstein H, Walter N (2024). Faster intervals, faster
recoveries — intensified short VO2max running intervals are inferior to
traditional formats.

Gibala MJ, Jones AM (2013). Physiological and performance adaptations to
high-intensity interval training.

Hendriksen IJM, et al. (2000). Effect of commuter cycling on physical
performance of male and female employees.

Impellizzeri FM, Tenan MS, Kempton T, Novak A, Coutts AJ (2020). Acute:Chronic
Workload Ratio: Conceptual Issues and Fundamental Pitfalls.

Impey SG, et al. (2018). Fuel for the Work Required: A Theoretical Framework
for Carbohydrate Periodization and the Glycogen Threshold Hypothesis.

Ktenidis K, et al. (2021). Priming exercise increases Wingate cycling peak power
output. *Eur J Sport Sci.*

Lane SC, et al. (2015). Effects of sleeping with reduced carbohydrate
availability on acute training responses.

Matsumoto T, et al. (2023). Identifying the Optimal Arm Priming Exercise
Intensity to Improve Maximal Leg Sprint Cycling Performance. *J Sports Sci Med.*

McIntyre JPR, Kilding AE (2015). Effects of high-intensity intermittent priming
on physiology and cycling performance. *J Sports Sci.*

Novis BJ, Hargreaves EA, Jowett T, Rehrer NJ (2025). Effects of Commuter Cycling
on Physical Activity, Cardiometabolic Health and Body Composition.

Olsson KSE, Ceci R, Wahlgren L, Rosdahl H, Schantz P (2024). Perceived exertion
can be lower when exercising in field versus indoors.

Riiser A, Aadland E, Nordengen S (2025). The self-selected intensity of physical
activity during real-life e-bike commuting.

Rosenblat MA, et al. (2025). Training Intensity Distribution: A Network
Meta-analysis.

Stöggl TL, Sperlich B (2015). The training intensity distribution among
well-trained and elite endurance athletes.

Treff G, et al. (2019). The Polarization-Index: A Simple Calculation to
Distinguish Polarized From Non-polarized Training Intensity Distributions.
