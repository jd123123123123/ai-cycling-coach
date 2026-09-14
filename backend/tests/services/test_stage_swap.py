"""Eine Stage, viele Fahrer: die Welt bleibt, das Rad wechselt.

Die beiden Eigenschaften, die ein Kollektiv-Objekt ausmachen, und eine dritte,
die der Preis dafür ist:

  · ausserhalb der Maske ist das Bild BYTE-IDENTISCH mit der Vorlage,
  · in der Silhouette stehen die Pixel des Fahrers,
  · und die Maske deckt Maschine UND Schattenwurf, weil ein Schlagschatten
    laenger ist als die Silhouette. Genau das war der Fehler, den diese Tests
    festnageln: mit einem Band von 7 % des Radstands blieb der Schatten des
    Referenzrads stehen, und ein Flatbar bekam einen Rennlenker-Schatten.
"""
import numpy as np
import pytest

pytest.importorskip("PIL")
pytest.importorskip("numpy")
from PIL import Image, ImageDraw  # noqa: E402

from app.services import stage_swap as sw  # noqa: E402


def _cutout(sep=600, r=205, pad=70, colour=(196, 44, 38, 255)):
    """Ein seitliches Zweirad auf Transparenz, mit bekannter Geometrie."""
    w, h = sep + 2 * r + 2 * pad, 2 * r + 2 * pad
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cy = pad + r
    for cx in (pad + r, pad + r + sep):
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=colour, width=max(4, r // 11))
    d.line([(pad + r, cy), (pad + r + sep, cy)], fill=colour, width=max(4, r // 13))
    d.line([(pad + r + sep // 3, cy - r), (pad + r + sep, cy)], fill=colour, width=max(4, r // 13))
    return im


def _scene(sep=560, r=191, contact=0.735, size=(1080, 1935), tint=0):
    """Eine texturierte Welt mit einem Rad darin, an gewaehlter Stelle."""
    W, H = size
    rng = np.random.default_rng(19)
    a = (rng.random((H, W, 3)) * 44 + 92 + tint).clip(0, 255).astype("uint8")
    im = Image.fromarray(a)
    d = ImageDraw.Draw(im)
    cy = contact * H - r
    cx0 = W / 2 - sep / 2
    for cx in (cx0, cx0 + sep):
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(18, 18, 20), width=15)
    d.line([(cx0, cy), (cx0 + sep, cy)], fill=(18, 18, 20), width=11)
    return im


# ── die Eigenschaft, um die es geht ───────────────────────────────────────

def test_die_umgebung_bleibt_byte_identisch():
    """DAS VERSPRECHEN DES SAMMELOBJEKTS. Ausserhalb der Maske wird die Vorlage
    nicht restauriert, sondern nie angefasst — also exakt 100 %, nicht 98 %."""
    base = _scene()
    model = _scene(tint=9)          # das Modell hat die Welt leise mitgezeichnet
    img, res = sw.merge(base, model, _cutout(), ratio=560 / 191)
    assert img is not None, "Raeder im Modellergebnis nicht gefunden"
    assert res.env_identical == 1.0, f"nur {res.env_identical:.3%} identisch"


def test_der_feather_wird_hart_genullt():
    """Ohne die Schwelle laeuft ein Gauss-Feather mit winzigen Werten ueber das
    halbe Bild aus, `B*(1-m) + M*m` weicht um plus/minus eins ab, und aus 100 %
    werden 98 %. Die Schwelle ist der Unterschied zwischen fast und exakt."""
    assert sw.MASK_FLOOR > 0
    base, model = _scene(), _scene(tint=14)
    img, res = sw.merge(base, model, _cutout(), ratio=560 / 191)
    assert img is not None and res.env_identical == 1.0


def test_ein_dunkles_rad_wird_nicht_falsch_gemessen():
    """DER MESSFEHLER, DEN DAS FESTNAGELT. Gegen das Cut-out auf SCHWARZEM Grund
    gemessen hat ein mattschwarzes Rad im Hochpass kaum Struktur, und die
    Korrelation kippte auf -0,82, obwohl das Bild in Ordnung war. Referenz sind
    die Pixel des Fahrers in ihrem Umfeld."""
    dunkel = _cutout(colour=(30, 30, 34, 255))
    img, res = sw.merge(_scene(), _scene(tint=9), dunkel, ratio=560 / 191)
    assert img is not None
    assert res.bike_fidelity > 0.8, f"Rad-Treue nur {res.bike_fidelity}"


def test_das_rad_des_fahrers_steht_in_der_silhouette():
    """Nicht das des Referenzrads und nicht das vom Modell gemalte: die Pixel
    des Fahrers, die nur das LICHT des Modells uebernehmen."""
    base = _scene()
    model = _scene(tint=9)
    rider = _cutout(colour=(40, 190, 90, 255))    # deutlich andere Farbe
    img, res = sw.merge(base, model, rider, ratio=560 / 191)
    assert img is not None
    assert res.bike_fidelity > 0.8, f"Rad-Treue nur {res.bike_fidelity}"


# ── die Maske ─────────────────────────────────────────────────────────────

def test_die_maske_deckt_mehr_als_die_silhouette():
    """DER FEHLER, DEN DAS FESTNAGELT. Ein Band von 7 % des Radstands liess den
    Schatten der Vorlage stehen — sichtbar, sobald sich die Silhouetten
    unterscheiden. Die Maske muss den Schattenwurf mit umfassen, also deutlich
    mehr Flaeche haben als die Silhouette allein."""
    img, res = sw.merge(_scene(), _scene(tint=9), _cutout(), ratio=560 / 191)
    assert img is not None
    # Im GLEICHEN Bild verglichen, nicht gegen den Anteil im Cut-out-Rahmen:
    # das war die erste, ungueltige Fassung dieses Tests.
    assert res.mask_coverage > res.sil_coverage * 1.3, (
        f"Maske {res.mask_coverage:.1%} deckt kaum mehr als die Silhouette "
        f"{res.sil_coverage:.1%} — der Schattenwurf fehlt"
    )


def test_die_maske_bleibt_ein_knappes_fuenftel():
    """Und sie darf nicht das halbe Bild fressen: gemessen deckt 0,03 Aufweitung
    22-23 %, wo 0,30 auf 45 % ging und nichts dazu brachte. Die Flaeche ist
    genau Maschine und eigener Schatten — der pro Fahrer anders sein MUSS."""
    img, res = sw.merge(_scene(), _scene(tint=9), _cutout(), ratio=560 / 191)
    assert img is not None
    assert 0.05 < res.mask_coverage < 0.40, f"Maske deckt {res.mask_coverage:.1%}"


# ── die Vertraege, die dieses Repo ueberall haelt ────────────────────────

def test_zweimal_derselbe_input_gibt_dasselbe_bild():
    """Kein Sampling in diesem Modul. Zwei Fahrer auf einer Stage bekommen ein
    Bild, und dieselbe Eingabe zweimal dieselben Bytes."""
    base, model, cut = _scene(), _scene(tint=9), _cutout()
    a, ra = sw.merge(base, model, cut, ratio=560 / 191)
    b, rb = sw.merge(base, model, cut, ratio=560 / 191)
    assert a is not None and a.tobytes() == b.tobytes()
    assert ra == rb


def test_ein_unlesbares_ergebnis_gibt_none_statt_muell():
    """Derselbe Vertrag wie in `cutout` und `stage_frame`: findet der Detektor
    die Raeder nicht, behaelt der Aufrufer das rohe Modellergebnis — also genau
    das, was es ohne dieses Modul gaebe."""
    rng = np.random.default_rng(4)
    noise = Image.fromarray((rng.random((1935, 1080, 3)) * 255).astype("uint8"))
    img, res = sw.merge(noise, noise, _cutout(), ratio=560 / 191)
    assert img is None and res is None


def test_kaputte_eingaben_werfen_nie():
    """Ein gescheiterter Tausch kostet die Konsistenz und nie das Bild."""
    img, res = sw.merge(_scene(), _scene(), Image.new("RGBA", (8, 8)), ratio=2.9)
    assert img is None and res is None


# ── die Regler, mit den Messungen, die sie gesetzt haben ─────────────────

def test_die_sampling_regler_sind_gesetzt_und_dokumentiert():
    """`temperature=0` mit `top_k=1` senkte die Umgebungsdrift von 14,33 auf
    12,77 — elf Prozent fuer nichts. Determinismus bringt es NICHT: zwei Laeufe
    derselben Einstellung unterschieden sich weiter um 13 bis 15, was auch die
    Notiz in `cyclr_studio` sagt."""
    assert sw.SWAP_SAMPLING == {"temperature": 0.0, "top_k": 1.0}


def test_der_prompt_verbietet_nichts_sondern_beschreibt():
    """Die zweite Regel aus `cyclr_studio`: eine Negation muss benennen, was sie
    verbietet, und das Benennen ist selbst ein Signal. Eine fruehere Fassung
    sagte "do not re-render the world, do not move the horizon" und hatte damit
    alles davon im Kontextfenster."""
    p = sw.SWAP_PROMPT.lower()
    assert "do not" not in p
    assert "keep everything else in the image exactly the same" in p
    assert "1:1" in sw.SWAP_PROMPT
