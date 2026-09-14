"""Eine Stage, viele Fahrer: das Rad tauschen, die Welt behalten.

WOZU. Eine Stage ist ein Kollektiv-Objekt — zwei Fahrer, die dieselbe verdient
haben, müssen dasselbe Bild sehen. Der Weg dahin, den `docs/w3-stage-rendering.md`
als Way A beschreibt, rendert pro Fahrer neu und liefert die schönsten Bilder;
gemessen über zwei Fahrer teilen zwei Renderings aus IDENTISCHEM Input 0,36 % der
Pixel und die Maschine korreliert mit −0,01 gegen das Cut-out des Fahrers. Das
ist kein Sammelobjekt, das sind zwei verschiedene Bilder.

WAS STATTDESSEN FUNKTIONIERT. Die Stage wird EINMAL gerendert — mit einem Rad
darin, damit die Welt um ein Rad herum komponiert und belichtet ist und die
Maschine der Held im Bild sein kann, wie `bike_build.LIGHT_CRAFT` es verlangt.
Danach wird pro Fahrer nur die Maschine getauscht, und zwar so:

  1 Das Modell bekommt die fertige Aufnahme und das Cut-out des Fahrers und
    liefert das Bild mit getauschtem Rad. Das kann es gut: Licht, Rim, Kontakt
    und Schatten passen danach zur Szene.
  2 Der Rad-Detektor aus `stage_frame` findet die Räder im Ergebnis, und das
    Cut-out des Fahrers wird auf genau diese Geometrie gelegt.
  3 Eine MASKE aus Silhouette UND projiziertem Schattenwurf trennt, was vom
    Modell kommt und was von der Vorlage.
  4 Außerhalb der Maske wird die Vorlage durchgereicht — nicht restauriert,
    NIE ANGEFASST. Innerhalb bleibt die Arbeit des Modells. In der Silhouette
    selbst stehen die echten Pixel des Fahrers, die nur die tiefen Frequenzen
    des Modells als Licht übernehmen.

GEMESSEN, an einer Mond-Stage mit zwei echten Prod-Rädern:

    rohes Modellergebnis          Umgebung  17,8 % identisch   Rad 0,27
    Maske sep x 0,07              Umgebung  98,7 % identisch   Rad 0,27
    Maske mit Schattenwurf        Umgebung 100,0 % identisch   Rad 0,98 / 0,95

Die Rad-Treue stand hier eine Fassung lang als 0,72, und das war ein Messfehler:
gemessen wurde gegen das Cut-out auf SCHWARZEM Grund, und ein mattschwarzes Rad
auf Schwarz hat im Hochpass kaum Struktur. Gegen die richtige Referenz — die
Pixel des Fahrers in ihrem Umfeld — sind es 0,95 bis 0,98. Ein synthetischer
dunkler Testkoerper kam mit der alten Messung auf -0,82, was den Fehler
aufgedeckt hat.

DIE MASKENGRÖSSE WAR DER GANZE FEHLER. Vorher umfasste das Band die Silhouette
mal 0,07 des Radstands. Ein Schlagschatten ist ein bis zwei Radlängen lang und
lag damit AUSSERHALB — die Vorlage reichte also den Schatten des Referenzrads
durch, und ein Flatbar-Hybrid bekam einen Rennlenker-Schatten. Sichtbar, sobald
sich die Silhouetten unterscheiden.

UND DIE SAMPLING-REGLER SIND NICHT DER HEBEL. Gemessen über vier Einstellungen,
je zwei Läufe: `temperature=0` mit `top_k=1` senkt die Umgebungsdrift von 14,33
auf 12,77 — elf Prozent, gratis, deshalb gesetzt. Die Lauf-zu-Lauf-Differenz
bleibt bei 13 bis 15, d. h. derselbe Seed liefert weiter ein anderes Bild. Die
Regler kaufen elf Prozent, die Maske die restlichen achtundachtzig.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)

#: Der Tausch-Prompt, als Regie-Brief.
#:
#: GESCHRIEBEN NACH DEN ZWEI REGELN DIESES REPOS (siehe `cyclr_studio`, "HOW
#: THESE PROMPTS ARE WRITTEN"): fließende Prosa statt geschriener Fragmente, und
#: positive Aussagen statt Negationen — eine Negation muss das benennen, was sie
#: verbietet, und das Benennen ist selbst ein starkes Signal. Eine frühere
#: Fassung sagte "do not re-render the world, do not move the horizon, do not
#: change the framing" und hatte damit alle drei im Kontextfenster.
#:
#: Der Erhaltungssatz ist Googles eigene dokumentierte Formulierung für diese
#: Modellfamilie: "Keep everything else in the image exactly the same,
#: preserving the original style, lighting, and composition."
#:
#: EHRLICH GEMESSEN: der Prompt ist nicht das, was die Umgebung rettet. Die
#: Umstellung von Fragmenten auf Prosa brachte über zwei Fahrer einmal eine
#: Verbesserung und einmal eine Verschlechterung — bei n = 2 also Rauschen. Er
#: steht so da, weil er dem Rest der Datei entspricht und weil das Modell das
#: RAD danach gut belichtet; die Umgebung rettet die Maske.
SWAP_PROMPT = "You are given two photographs. The FIRST is a finished picture of a bicycle standing in a place. The SECOND is a different bicycle, photographed alone against a plain background.\n\nReturn the FIRST photograph with its bicycle replaced by the bicycle from the SECOND photograph. Keep everything else in the image exactly the same, preserving the original style, lighting and composition: the same place, the same ground, the same sky, the same weather, the same objects in the same positions, the same colour grade, the same camera, the same crop and the same aspect ratio. The first photograph is the authority for the world.\n\nTHE MACHINE IS THE ONE FROM THE SECOND PHOTOGRAPH, REPRODUCED 1:1. Its frame geometry is copied exactly: the same frame shape and tube profiles, the same head and seat angles, the same wheelbase, the same stack and reach, the same saddle height and setback, the same handlebar shape, width and drop, the same crank length and chainring size, the same rim depth, the same tyre width and tread. Its finish is copied exactly: its own paint, its own gloss or matte, its own decals at their own size in their own places, its own components and their own colours. It carries exactly the parts the second photograph shows and no others. It is recognisably that exact bicycle, and a rider who owns it would identify it immediately.\n\nIT STANDS WHERE THE PREVIOUS BICYCLE STOOD: the same position in the frame, the same size, its tyres meeting the ground at the same contact points, upright on both wheels, seen from its drive side with the chainring and cassette facing the camera and pointing to the right of frame. Physically it rests on that surface with its own weight, both tyres in real contact.\n\nTHE SCENE'S OWN LIGHT FALLS ON IT, and that is the only thing about it that comes from the first photograph: the same key direction and hardness, the same colour temperature, the same rim light along its upper edges, the same bounce from this ground onto its underside, the same reflections this place would put on its paint, and its own cast shadow lying across this surface exactly where the previous shadow lay and shaped by this machine's own silhouette.\n\nITS SURFACES ARE IN THE SAME STATE AS THE BICYCLE IT REPLACES: as clean, or as dusty, or as wet, to the same degree and in the same places, reading the first photograph for that and matching it exactly."

#: Was dem Modell an Sampling mitgegeben wird.
#:
#: Gemessen an der Umgebungsdrift des Tauschs, je zwei Läufe:
#:     default                     14,33
#:     temperature 0               13,97
#:     temperature 0 + top_k 1     12,77   <- gesetzt
#:     temperature 0,35            12,86
#: Elf Prozent für nichts, also genommen. Determinismus bringt es NICHT: zwei
#: Läufe derselben Einstellung unterscheiden sich weiter um 13 bis 15.
SWAP_SAMPLING = {"temperature": 0.0, "top_k": 1.0}

#: Wie weit die Maske über Silhouette und Schattenwurf hinaus aufgeweitet wird,
#: als Anteil des Radstands. Gemessen: 0,03 deckt 22-23 % des Bildes und hält die
#: Umgebung bei 100,0 %; 0,30 deckt 45 % und bringt nichts dazu.
MASK_DILATE = 0.03

#: Unterhalb dieses Werts wird die Maske HART auf null gesetzt.
#:
#: Ein Gauß-Feather läuft mit winzigen Werten über das halbe Bild aus. Dann ist
#: `vorlage * (1 - m) + modell * m` um plus/minus eins daneben und die Umgebung
#: ist 98 % byte-identisch statt 100 %. Unter der Schwelle wird die Vorlage
#: unverändert durchgereicht, und aus 98 % werden exakt 100 %.
MASK_FLOOR = 0.02

#: Radius des Frequenz-Splits, als Anteil des Radstands.
#:
#: DER EINE REGLER, DER EINEN ECHTEN PREIS HAT. Ein schwerer Weichzeichner
#: trägt Beleuchtung und keine Geometrie, also übernimmt die Silhouette das Licht
#: des Modells, ohne dass eine Kante wandert oder ein Decal neu aufgelöst wird.
#: Größer heißt mehr Original und weniger Szenenlicht; kleiner heißt umgekehrt.
#: Durchgemessen von 1/12 bis 1/3 bewegt sich die Rad-Treue auf echten Bildern
#: nur zwischen 0,984 und 0,978 — der Regler ist also weit weniger scharf als
#: erwartet, und 1/12 ist das Beste davon. Ohne jede Relichtung wären es exakt
#: 1,0 — und es sähe aufgeklebt aus, was der ganze Punkt dieses Moduls ist.
SPLIT_RADIUS = 1.0 / 12.0


@dataclass(frozen=True)
class SwapResult:
    """Was der Tausch geliefert hat, in Zahlen, damit es prüfbar bleibt."""

    #: Anteil der Bildfläche, den die Maske abdeckt.
    mask_coverage: float
    #: Anteil byte-identischer Pixel außerhalb der Maske, gegen die Vorlage.
    env_identical: float
    #: Korrelation der Hochpass-Luminanz in der Silhouette gegen die Pixel des
    #: Fahrers in ihrem Umfeld. Gegen das Cut-out auf Schwarz gemessen wäre sie
    #: bedeutungslos — siehe die Notiz im Modulkopf.
    bike_fidelity: float
    #: Anteil der Bildfläche, den die Silhouette allein einnimmt. Nur zum
    #: Vergleich mit `mask_coverage`: die Maske MUSS größer sein, weil ein
    #: Schlagschatten länger ist als die Silhouette.
    sil_coverage: float


def _placed(cutout, wheels, size):
    """Das Cut-out des Fahrers, auf die im Ergebnis gefundenen Räder gelegt.

    Die Kontaktflecken des Cut-outs liefern Radstand und Mitte exakt, ohne
    Kreisanpassung — genau wie `stage_frame.geometry_from_cutout` es liest.
    """
    import numpy as np
    from PIL import Image

    a = (np.asarray(cutout.getchannel("A"), dtype="float32") / 255.0) > 0.55
    ys, xs = np.nonzero(a)
    x0, x1, y1 = int(xs.min()), int(xs.max()), int(ys.max())
    band = a[max(0, y1 - 3):y1 + 1, :]
    cols = np.nonzero(band.any(axis=0))[0]
    if len(cols) < 4:
        return None
    gap = max(6, (x1 - x0) // 40)
    runs, start, prev = [], int(cols[0]), int(cols[0])
    for c in cols[1:]:
        c = int(c)
        if c > prev + gap:
            runs.append((start, prev))
            start = c
        prev = c
    runs.append((start, prev))
    if len(runs) != 2:
        return None

    sep = ((runs[1][0] + runs[1][1]) - (runs[0][0] + runs[0][1])) / 2.0
    mid = (runs[0][0] + runs[0][1] + runs[1][0] + runs[1][1]) / 4.0
    k = wheels.sep / sep
    scaled = cutout.resize(
        (max(1, round(cutout.width * k)), max(1, round(cutout.height * k))), Image.LANCZOS
    )
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    canvas.alpha_composite(
        scaled, (int(round(wheels.mid_x - mid * k)), int(round(wheels.contact_y - y1 * k)))
    )
    return canvas


def _mask(placed, base, wheels, size):
    """Silhouette UND der Bereich, in den ihr Schatten fällt.

    Der Schattenwurf kommt aus derselben Projektion, die `stage_compositor._shadow`
    benutzt, mit dem an der Vorlage GEMESSENEN Licht — also mit der Richtung und
    Härte, die diese Szene wirklich hat, statt mit einer geratenen.
    """
    import numpy as np
    from PIL import ImageChops, ImageFilter

    from app.services import stage_compositor as sc

    w, h = size
    light = sc.read_light(base, sc.ground_line(base))
    box = (
        int(wheels.mid_x - wheels.sep / 2 - wheels.radius),
        int(wheels.contact_y - 2 * wheels.radius),
        int(wheels.mid_x + wheels.sep / 2 + wheels.radius),
        int(wheels.contact_y),
    )
    sil = placed.getchannel("A")
    both = ImageChops.lighter(sil, sc._shadow(placed, light, (w, h), box))
    r = min(199, max(9, int(wheels.sep * MASK_DILATE)) | 1)
    grown = both.filter(ImageFilter.MaxFilter(r)).filter(ImageFilter.GaussianBlur(r * 0.30))

    band = np.asarray(grown, dtype="float32") / 255.0
    band[band < MASK_FLOOR] = 0.0
    return band, np.asarray(sil, dtype="float32") / 255.0


def merge(base, model_out, cutout, ratio: float, *, locked_frame=False, clean_world=None):
    """Vorlage + Modellergebnis + Cut-out zu einem Bild. Returns (image, SwapResult).

    Gibt (None, None) zurück, wenn die Räder im Modellergebnis nicht zu finden
    sind. Der Aufrufer verwirft dann das Ergebnis; kein ungeprüfter Fallback.
    """
    import numpy as np
    from PIL import Image, ImageFilter

    from app.services import stage_frame

    try:
        size = base.size
        model_out = model_out.resize(size, Image.LANCZOS)
        wheels = stage_frame.find_wheels(model_out, ratio)
        if wheels is None:
            return None, None
        if locked_frame:
            # Whole-frame alignment first; no independent CSS position for the bike.
            target_sep = stage_frame.TARGET_SEP * size[0]
            k = wheels.sep / target_sep
            x = wheels.mid_x - stage_frame.TARGET_MID_X * size[0] * k
            y = wheels.contact_y - stage_frame.TARGET_CONTACT * size[1] * k
            # Refuse a different composition instead of stretching it into place.
            if not 0.85 < k < 1.15 or abs(x) > size[0] * .12 or abs(y) > size[1] * .12:
                return None, None
            model_out = model_out.transform(size, Image.AFFINE, (k, 0, x, 0, k, y), Image.BICUBIC)
            radius = target_sep / ratio
            wheels = stage_frame.Wheels(
                size[0] * .5 - target_sep / 2, size[0] * .5 + target_sep / 2,
                stage_frame.TARGET_CONTACT * size[1] - radius, radius,
            )
        placed = _placed(cutout, wheels, size)
        if placed is None:
            return None, None
        band, sil = _mask(placed, base, wheels, size)

        M = np.asarray(model_out, dtype="float32")
        B = np.asarray(base.convert("RGB"), dtype="float32")
        P = np.asarray(placed.convert("RGB"), dtype="float32")

        if clean_world is not None:
            # The candidate's painted frame is not the original's silhouette.
            # Recover the world in the entire bicycle envelope, including spoke
            # holes, before restoring original geometry. Otherwise two frames
            # survive despite an excellent high-pass fidelity score.
            from PIL import ImageDraw
            repair = Image.new("L", size)
            box = placed.getbbox()
            if box:
                x0, y0, x1, y1 = box
                margin = round(wheels.sep * .06)
                ImageDraw.Draw(repair).rectangle((x0-margin, y0-margin, x1+margin, y1), fill=255)
                repair = repair.filter(ImageFilter.GaussianBlur(6))
                recovery = np.asarray(repair, dtype="float32") / 255
                # Keep generated contact shadows beneath the exact contact line.
                recovery[int(wheels.contact_y)+1:, :] = 0
                recovery[recovery < MASK_FLOOR] = 0
                clean = np.asarray(clean_world.convert("RGB").resize(size, Image.LANCZOS), dtype="float32")
                band = np.maximum(band, recovery)
        # Außerhalb der Maske die Vorlage, innerhalb das Modell.
        out = B * (1 - band[..., None]) + M * band[..., None]

        if clean_world is not None and box:
            out = out * (1 - recovery[..., None]) + clean * recovery[..., None]

        # In der Silhouette die Pixel des Fahrers, die nur die TIEFEN Frequenzen
        # des Modells als Licht übernehmen: ein schwerer Weichzeichner trägt
        # Beleuchtung und keine Geometrie, also kann keine Kante wandern.
        s = max(3, int(wheels.sep * SPLIT_RADIUS)) | 1
        blur = lambda x: np.asarray(  # noqa: E731
            Image.fromarray(np.clip(x, 0, 255).astype("uint8")).filter(
                ImageFilter.GaussianBlur(s)
            ),
            dtype="float32",
        )
        comp = B * (1 - sil[..., None]) + P * sil[..., None]
        light_ratio = np.clip(blur(M) / np.maximum(blur(comp), 8.0), 0.5, 2.2)
        final = out * (1 - sil[..., None]) + comp * light_ratio * sil[..., None]
        # Float feathering must not change even one protected background pixel.
        final[band < MASK_FLOOR] = B[band < MASK_FLOOR]
        img = Image.fromarray(np.clip(final, 0, 255).astype("uint8"))

        outside = band < MASK_FLOOR
        b16 = np.asarray(base.convert("RGB"), dtype="int16")
        env = float((np.abs(np.asarray(img, dtype="int16") - b16).sum(axis=2)[outside] == 0).mean())

        def high_pass(im):
            a = np.asarray(im.convert("L"), dtype="float32")
            return a - np.asarray(
                im.convert("L").filter(ImageFilter.GaussianBlur(6)), dtype="float32"
            )

        # GEMESSEN GEGEN `comp`, NICHT GEGEN DAS CUT-OUT AUF SCHWARZ.
        #
        # `placed.convert("RGB")` macht aus Transparenz Schwarz, und ein
        # mattschwarzes Rad auf schwarzem Grund hat im Hochpass fast keine
        # Struktur — die Korrelation misst dann Rauschen und kippt ins Negative.
        # Ein synthetischer dunkler Testkoerper kam so auf -0,82, waehrend das
        # Bild vollkommen in Ordnung war. Die richtige Referenz ist das, was
        # gesetzt werden SOLLTE: die Pixel des Fahrers in ihrem Umfeld.
        m = sil > 0.75
        fid = 0.0
        if m.sum() > 400:
            ref, got = high_pass(Image.fromarray(comp.astype("uint8")))[m], high_pass(img)[m]
            if ref.std() > 1e-6 and got.std() > 1e-6:
                fid = float(np.corrcoef(ref, got)[0, 1])

        return img, SwapResult(
            mask_coverage=round(float((band > MASK_FLOOR).mean()), 4),
            env_identical=round(env, 5),
            bike_fidelity=round(fid, 3),
            sil_coverage=round(float((sil > 0.5).mean()), 4),
        )
    except Exception:
        # Ein gescheiterter Tausch kostet die Konsistenz und nie das Bild.
        logger.warning("stage swap merge failed; output rejected", exc_info=True)
        return None, None
