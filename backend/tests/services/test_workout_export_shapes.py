"""Der Export las nur eine von zwei gespeicherten Blockformen.

GEMELDET: Garmin lehnte die exportierte .fit-Datei ab -- "Einheit enthaelt
einen ungueltigen Zeitblock". Das stimmte woertlich: jeder Schritt war null
Sekunden lang.

URSACHE: `blocks_from_dicts` las `duration_s`, `target_watts_low/high` und
`target_pct_ftp`. In der Produktion stehen aber ZWEI Formen nebeneinander --
652 Bloecke in der Schreibweise `duration_seconds` / `power_target_pct_ftp`
und 56 in der Intervallform. Fuer die haeufigere lieferte jedes `row.get(...)`
None, und `or 0` machte daraus stillschweigend eine Null. 92 % aller Einheiten
exportierten als Schritte ohne Laenge, ohne Watt, ohne Prozent -- nur der Name
ueberlebte.
"""
import pytest

from app.services.workout_export import Block, blocks_from_dicts, to_fit

# WOERTLICH die Formen, wie sie in der Produktion gemessen wurden.
FORM_HAEUFIG = {"name": "Long endurance", "duration_seconds": 7200,
                "power_target_pct_ftp": 0.65, "zone": 2, "rpe": 4}
FORM_INTERVALL = {"name": "VO2 on", "duration_s": 240, "on_s": 240, "off_s": 180,
                  "reps": 5, "target_watts_low": 290, "target_watts_high": 300,
                  "target_pct_ftp": 1.15}


def test_die_haeufige_form_behaelt_ihre_dauer():
    # DER GEMELDETE FEHLER. Vorher: duration_s=0 -> "ungueltiger Zeitblock".
    b = blocks_from_dicts([FORM_HAEUFIG], ftp=250)[0]
    assert b.duration_s == 7200


def test_die_haeufige_form_wird_aus_dem_ftp_anteil_in_watt_aufgeloest():
    b = blocks_from_dicts([FORM_HAEUFIG], ftp=250)[0]
    assert b.pct_ftp == 0.65
    assert b.watts_low == b.watts_high == 162


def test_ohne_ftp_bleibt_der_schritt_offen_statt_erfunden():
    # Eine erfundene Wattzahl waere schlimmer als keine: der Schritt wird als
    # offener Block exportiert, die Dauer bleibt echt.
    b = blocks_from_dicts([FORM_HAEUFIG])[0]
    assert b.duration_s == 7200
    assert b.watts_low == 0 and b.watts_high == 0


def test_die_intervallform_bleibt_unveraendert():
    b = blocks_from_dicts([FORM_INTERVALL], ftp=250)[0]
    assert b.duration_s == 240
    assert (b.watts_low, b.watts_high) == (290, 300)
    assert b.pct_ftp == 1.15


def test_kein_schritt_ohne_laenge_erreicht_die_fit_datei():
    """Das Tor zum gemeldeten Fehler, am Ende der Kette gemessen."""
    from fit_tool.fit_file import FitFile

    rows = [
        {"name": "Warm-up", "duration_seconds": 600, "power_target_pct_ftp": 0.55},
        {"name": "Threshold", "duration_seconds": 900, "power_target_pct_ftp": 0.98},
        {"name": "Cool-down", "duration_seconds": 600, "power_target_pct_ftp": 0.5},
    ]
    blocks = blocks_from_dicts(rows, ftp=250)
    roh = to_fit(title="Test", description="", blocks=blocks, ftp=250)
    pfad = "/tmp/_export_gate.fit"
    open(pfad, "wb").write(roh)

    dauern = []
    for rec in FitFile.from_file(pfad).records:
        if type(rec.message).__name__ != "WorkoutStepMessage":
            continue
        for fld in rec.message.fields:
            if fld.name == "duration_value":
                dauern.append(fld.get_value())
    assert dauern, "die Datei enthaelt keine Schritte"
    assert all(d and d > 0 for d in dauern), f"Schritt ohne Laenge: {dauern}"
    # Millisekunden: 600 s -> 600000.
    assert dauern == [600000, 900000, 600000]


# ── Die Intensitaet ─────────────────────────────────────────────────────────

def _intensitaeten(rows, ftp=250):
    from fit_tool.fit_file import FitFile
    roh = to_fit(title="T", description="", blocks=blocks_from_dicts(rows, ftp=ftp),
                 ftp=ftp)
    pfad = "/tmp/_intensity_gate.fit"
    open(pfad, "wb").write(roh)
    out = []
    for rec in FitFile.from_file(pfad).records:
        if type(rec.message).__name__ != "WorkoutStepMessage":
            continue
        for fld in rec.message.fields:
            if fld.name == "intensity":
                out.append(fld.get_value())
    return out


def test_ein_wattbereich_macht_aus_einem_intervall_kein_aufwaermen():
    """`_block_kind` ist der ZWIFT-Klassifikator; seine letzte Regel lautet
    `watts_low < watts_high -> warmup`. Fuer FIT hiess das: jeder Block mit
    einem Wattbereich wurde zum Aufwaermen -- auf dem Geraet fuehrt die Uhr
    dann eine Schwellenwiederholung als Warmlaufen."""
    rows = [
        {"name": "Warm-up", "duration_s": 600, "target_watts_low": 130, "target_watts_high": 145},
        {"name": "Threshold", "duration_s": 900, "target_watts_low": 240, "target_watts_high": 250},
        {"name": "Recovery", "duration_s": 300, "target_watts_low": 110, "target_watts_high": 125,
         "target_pct_ftp": 0.5},
        {"name": "Cool-down", "duration_s": 600, "target_watts_low": 125, "target_watts_high": 110},
    ]
    # 2=WARMUP, 0=ACTIVE, 1=REST, 3=COOLDOWN
    assert _intensitaeten(rows) == [2, 0, 1, 3]


# ── Der offene LAP-Schritt fuer draussen ────────────────────────────────────
# GEMELDET: "bei outdoor rides funktioniert das setzen der startpunkte noch
# nicht". Der Schritt lag auf Index 0, VOR dem Aufwaermen -- die Uhr wartete
# sofort nach dem Start auf einen Tastendruck.

from fit_tool.fit_file import FitFile  # noqa: E402

from app.services.workout_export import _erster_hauptteil  # noqa: E402


def _schritte(rows, *, ftp=250, lap=True):
    roh = to_fit(title="D", description="", blocks=blocks_from_dicts(rows, ftp=ftp),
                 ftp=ftp, lap_start=lap)
    pfad = "/tmp/_lap_gate.fit"
    open(pfad, "wb").write(roh)
    out = []
    for rec in FitFile.from_file(pfad).records:
        if type(rec.message).__name__ != "WorkoutStepMessage":
            continue
        d = {f.name: f.get_value() for f in rec.message.fields}
        out.append((d.get("message_index"), d.get("wkt_step_name"), d.get("duration_type")))
    return out


EINHEIT = [
    {"name": "Warm-up", "duration_seconds": 900, "power_target_pct_ftp": 0.55},
    {"name": "Threshold", "duration_seconds": 900, "power_target_pct_ftp": 0.98},
    {"name": "Cool-down", "duration_seconds": 600, "power_target_pct_ftp": 0.5},
]


def test_der_lap_schritt_steht_vor_dem_hauptteil_nicht_am_anfang():
    schritte = _schritte(EINHEIT)
    namen = [n for _, n, _ in schritte]
    assert namen == ["Warm-up", "Start: LAP", "Threshold", "Cool-down"]
    # Fortlaufende Indizes -- eine Luecke macht die Einheit auf dem Geraet kaputt.
    assert [i for i, _, _ in schritte] == [0, 1, 2, 3]


def test_der_lap_schritt_ist_offen_und_wartet_auf_den_tastendruck():
    # duration_type 5 = OPEN: die Uhr geht erst bei LAP weiter.
    typ = next(t for _, n, t in _schritte(EINHEIT) if n == "Start: LAP")
    assert typ == 5


def test_ohne_draussen_gibt_es_keinen_lap_schritt():
    assert "Start: LAP" not in [n for _, n, _ in _schritte(EINHEIT, lap=False)]


def test_der_bindestrich_im_namen_kippt_die_platzierung_nicht():
    # Der alte Rueckfall verglich woertlich mit "Warmup"; gespeichert ist
    # "Warm-up". Deshalb landete der Schritt immer auf Index 0.
    assert _erster_hauptteil(blocks_from_dicts(EINHEIT, ftp=250)) == 1


def test_auch_ohne_harten_block_steht_der_schritt_nach_dem_aufwaermen():
    # Eine lange Grundlagenfahrt hat keinen Block ueber 75 % FTP -- und genau
    # die faehrt man draussen. Vorher fiel sie auf Index 0 zurueck.
    lang = [
        {"name": "Warm-up", "duration_seconds": 600, "power_target_pct_ftp": 0.5},
        {"name": "Long endurance", "duration_seconds": 7200, "power_target_pct_ftp": 0.65},
    ]
    assert _erster_hauptteil(blocks_from_dicts(lang, ftp=250)) == 1
    assert [n for _, n, _ in _schritte(lang)] == ["Warm-up", "Start: LAP", "Long endurance"]


def test_die_schrittzahl_zaehlt_den_lap_schritt_mit():
    roh = to_fit(title="D", description="", blocks=blocks_from_dicts(EINHEIT, ftp=250),
                 ftp=250, lap_start=True)
    open("/tmp/_count_gate.fit", "wb").write(roh)
    anzahl = None
    schritte = 0
    for rec in FitFile.from_file("/tmp/_count_gate.fit").records:
        n = type(rec.message).__name__
        if n == "WorkoutMessage":
            anzahl = next(f.get_value() for f in rec.message.fields
                          if f.name == "num_valid_steps")
        if n == "WorkoutStepMessage":
            schritte += 1
    assert anzahl == schritte == 4
