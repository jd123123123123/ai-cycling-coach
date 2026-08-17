# Bike-Individualisierung — warum Edit statt Compositing

Entscheidungsnotiz, 2026-08-17. Gemessen, nicht vermutet.

## Die Frage

Ein Fahrer wählt Rahmen, Laufräder, Lenker und Sattel; das Rad soll danach so
aussehen. Wie entsteht das Bild?

## Weg A — Ebenen zusammensetzen (verworfen)

Der klassische Paper-Doll-Ansatz aus dem Spielebau: transparente Teile, über
Ankerpunkte gestapelt. Wurde gebaut und ist an drei Stellen gescheitert:

1. **Chroma-Key frisst dünne Strukturen.** Teile werden auf Magenta gerendert
   und freigestellt. Bei Speichen ist fast jedes Pixel Mischpixel — die
   Kantenkorrektur behielt den Magenta-Farbwert und senkte nur die Deckkraft,
   also wurden Speichen rosa.
2. **Die Geometrie hängt am Seed.** Derselbe Rahmen-Prompt liefert mal mit,
   mal ohne Gabel. Für ein Katalogbild egal, für eine Ebene tödlich.
3. **Anker lassen sich nicht raten.** Sattel schwebte, Lenker saß daneben,
   Laufräder waren zu groß.

Der eigentliche Grund des Scheiterns ist strukturell: Paper-Doll-Systeme
funktionieren, weil die Teile *gegen eine Vorlage gezeichnet* werden. Anker
werden nicht nachträglich vermessen — die Art wird passend erzeugt. Ein
Bildmodell ohne Vorlage liefert diese Passgenauigkeit nicht.

## Weg B — bildkonditioniertes Editieren (gewählt)

Das Basisbild IST die Vorlage. Der Aufruf bekommt das gerenderte Rad als
Eingabebild plus „ändere nur X, lass alles andere pixelgleich".

**Gemessen** (`alloy-allez`, Anteil veränderter Pixel gegenüber dem Original):

| Änderung | verändert |
|---|---|
| nur Laufräder (Gold) | 5,4 % |
| nur Sattel (Leder) | 0,9 % |
| Laufräder + Sattel + Lenkerband, EIN Aufruf | 5,8 % |
| gestapelt, Schritt 1 | 5,3 % |
| gestapelt, Schritt 2 | 6,3 % |

Rahmen, Kamera, Position, Licht und Decals bleiben stehen. Kein Chroma-Key,
keine Anker, kein Compositing.

**Zwei Konsequenzen aus den Zahlen:**

- Drei Änderungen kosten nicht mehr als eine → **ein Aufruf pro Kombination**,
  nicht einer pro Teil.
- Stapeln driftet (5,3 → 6,3 %) → **immer vom Original ausgehen**, nie auf ein
  bereits editiertes Bild aufsetzen.

## Das Mengenproblem

6 Rahmen × 6 Laufräder × 6 Lenker × 6 Sättel = 1.296 Kombinationen pro Rad, bei
26 Rädern über 33.000. Nicht vorrendern.

Aber: eine Kombination ergibt für **jeden** Fahrer dasselbe Bild — der Seed
leitet sich deterministisch aus der Kombination ab. Der Cache ist deshalb
**global**, nicht pro Nutzer:

- Schlüssel = Hash aus (bike_id, frame, wheels, bars, saddle)
- Erster Fahrer überhaupt mit dieser Kombination: ein Render (~4 s)
- Alle weiteren: sofort und kostenlos, für immer
- Cache-Verlust ist harmlos, weil der Seed dasselbe Bild reproduziert

Beliebte Kombinationen sind nach kurzer Zeit alle im Cache; die lange Spitze
seltener Kombinationen zahlt je einmal vier Sekunden.

## Was mit den 24 Teilebildern passiert

Sie bleiben — als **Shop-Art**: das Teil isoliert, damit man sieht, was man
kauft. Sie sind nur nicht mehr der Mechanismus, der das Rad verändert.
