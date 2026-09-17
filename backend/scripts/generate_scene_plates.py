"""Rendert die fehlenden Kulissen-Vorschauen in den Hausstil.

WARUM ES DAS GIBT. Die Sammlung auf Erfolge zeigt vierzehn Kulissen, aber im
Container liegen drei Bilder: `mond`, `startrampe`, `waschanlage`. Sechs der
zehn offenen Kulissen -- darunter die Kuestenstrasse fuer 100 km -- haben gar
keins und stehen nur als Farbverlauf da. Der Verlauf ist als Platzhalter
gedacht ("shown while a personalised render is warming"); bei sechs von zehn
liest er sich als Defekt.

WAS ES SCHREIBT. `frontend/public/w3/scenes/<id>.webp` -- eine Kulisse je
Datei, mit einem REFERENZRAD darin, auf derselben fixierten Antriebsseiten-
Kamera wie die Garage. Die Kachel beschriftet das Bild selbst als
"Kulissenvorschau mit Referenzrad": es ist ausdruecklich NICHT das Rad des
Fahrers, sondern ein Versprechen, wie seines dort stehen wird.

    uv run python scripts/generate_scene_plates.py

Standardmaessig idempotent: vorhandene Dateien bleiben liegen, solange nicht
--force kommt. Das ist ausgelieferte Kunst, und sie bei jedem Deploy neu zu
wuerfeln hiesse, das Aussehen der App zu aendern, ohne dass jemand es
entschieden hat -- dieselbe Regel wie in `generate_starter_art.py`.
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.services import backdrops, cyclr_studio  # noqa: E402

SCENES = pathlib.Path(__file__).resolve().parents[2] / "frontend/public/w3/scenes"

#: Das Referenzrad. Bewusst neutral und markenlos: die Vorschau zeigt den ORT,
#: nicht die Maschine, und ein auffaelliges Rad wuerde die Kulisse erschlagen.
#: Dieselbe Beschreibung fuer alle Kulissen, damit die Sammlung wie ein Satz
#: aussieht und nicht wie vierzehn Einzelbilder.
REFERENZRAD = (
    "a clean modern road bicycle with a plain unbranded matte-charcoal frame, drop handlebars, "
    "deep black rims and no decals of any kind — a generic shape standing in for the rider's own "
    "machine, placed a little left of centre and small enough that the PLACE is the subject"
)


def _prompt(stage) -> str:
    return (
        f"A bicycle standing in a place: {REFERENZRAD}.\n\n"
        f"{cyclr_studio.BIKE_CAMERA}\n\n"
        f"BACKGROUND — this is the subject of the picture: {stage.prose}.\n\n"
        f"{cyclr_studio.GENERAL_STYLE} {cyclr_studio.NO_TEXT_AT_ALL}\n\n"
        "RENDER THE WHEELS CLEANLY: every spoke a single crisp line, both rims perfectly round, "
        "no doubled or ghosted wheel behind either one. Thin repeating structures are where this "
        "render fails, and a bicycle with two rear wheels is not a bicycle."
    )


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true", help="auch vorhandene Dateien neu rendern")
    ap.add_argument("--only", help="nur diese Kulissen-ID")
    ap.add_argument("--list", action="store_true", help="nur zeigen, was fehlt")
    args = ap.parse_args()

    fehlend = [
        b for b in backdrops._ALL
        if not (SCENES / f"{b.id}.webp").exists() and (args.only in (None, b.id))
    ]
    if args.list:
        for b in fehlend:
            print(f"  {b.id:<15} {b.name_de:<18} {b.unlock_de or '(Startkulisse)'}")
        print(f"\n{len(fehlend)} ohne Bild")
        return 0

    if not cyclr_studio._gemini_ready():
        print("Bildmodell nicht erreichbar — IMAGE_PROVIDER / GEMINI_API_KEY pruefen")
        return 1

    SCENES.mkdir(parents=True, exist_ok=True)
    fehler = 0
    for b in fehlend:
        out = SCENES / f"{b.id}.webp"
        if out.exists() and not args.force:
            print(f"{b.id}: existiert schon — --force zum Neurendern")
            continue
        # Auf der ID gesetzt, nicht auf dem Prompt: ausgelieferte Kunst soll
        # aus demselben Auftrag dasselbe Bild zurueckgeben.
        img = await cyclr_studio._generate(_prompt(b), f"w3:scene:{b.id}", aspect="1:1")
        if not img:
            print(f"{b.id}: kein Bild zurueckgekommen (Modell oder Kontingent)")
            fehler += 1
            continue
        out.write_bytes(base64.b64decode(img.split(",", 1)[1]))
        print(f"→ {out.name}  ({out.stat().st_size // 1024} KB)  {b.name_de}")
    return 1 if fehler else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
