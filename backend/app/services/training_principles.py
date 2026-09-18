"""Warum eine Anpassung trainingswissenschaftlich vertretbar ist — ein Satz je Signal.

WOFUER. Wenn der Plan sich von selbst aendert, schuldet er dem Fahrer mehr als
"deine Werte waren schlecht". Er schuldet ihm den Grundsatz, nach dem
entschieden wurde -- kurz genug, um ihn zu lesen, und konkret genug, um ihm zu
widersprechen.

KEIN SPRACHMODELL. Feste Saetze, nach Treiber-Schluessel. Ein generierter
Grundsatz waere jedes Mal ein anderer, und ein Trainingsprinzip, das sich
taeglich neu formuliert, ist keines.

DIE DOPPELUNG, DIE HIER BLEIBT — und das soll offen dastehen:
`adaptation_explainer.py` fuehrt dieselben Saetze als Literale in seinen
`add()`-Aufrufen. Sie gehoeren zusammengelegt. Ich habe den Explainer NICHT
angefasst, weil es fuer ihn keinen einzigen Test gibt (`tests/services/` kennt
kein `test_adaptation_explainer`) und eine Refaktorierung ohne Netz an der
Datei, die Trainingsaussagen formuliert, das falsche Risiko waere. Wer ihm
Tests gibt, sollte ihn hierauf umstellen; bis dahin sind die Saetze WORTGLEICH
zu halten.
"""
from __future__ import annotations

#: Treiber-Schluessel aus `readiness_decision.driver.key` → (de, en).
#: Wortgleich mit `adaptation_explainer.py`, wo es sich ueberschneidet.
_PRINCIPLES: dict[str, tuple[str, str]] = {
    "sleep_duration": (
        "Eine Nacht kurzer Schlaf senkt die Ausbelastungszeit und die Bereitschaft "
        "für harte Einheiten.",
        "One night of short sleep lowers time-to-exhaustion and readiness for "
        "high-intensity work.",
    ),
    # Tiefschlaf traegt die koerperliche Erholung; derselbe Grundsatz, enger gefasst.
    "sleep_deep": (
        "Tiefschlaf trägt die körperliche Erholung — fällt er aus, fehlt die "
        "Grundlage für harte Intervalle.",
        "Deep sleep carries physical recovery — without it the base for hard "
        "intervals is missing.",
    ),
    "hrv": (
        "Eine gedämpfte HRV zeigt unvollständige parasympathische Erholung; "
        "hartes Training bremst dann die Anpassung.",
        "A suppressed overnight HRV signals incomplete parasympathetic recovery; "
        "training hard through it blunts adaptation.",
    ),
    "rhr": (
        "Ein erhöhter Ruhepuls gegenüber deiner Basislinie ist ein frühes Zeichen "
        "unvollständiger Erholung oder eines beginnenden Infekts.",
        "A resting heart rate above your own baseline is an early sign of "
        "incomplete recovery or a starting infection.",
    ),
    "body_battery": (
        "Eine niedrige Körperbatterie am Morgen heißt, die Nacht hat die Reserven "
        "nicht aufgefüllt.",
        "A low morning body battery means the night did not refill the reserves.",
    ),
    "tsb": (
        "TSB unter −20 bis −25 markiert angesammelte Ermüdung, wo ohne Erholung "
        "Verletzungs-/Krankheitsrisiko steigt.",
        "TSB below −20 to −25 marks accumulated fatigue where injury/illness risk "
        "rises without recovery.",
    ),
}


def principle_for(driver_key: str | None, *, locale: str = "de") -> str | None:
    """Der Grundsatz zu einem Treiber, oder ``None``.

    ``None`` ist Absicht: fuer einen Treiber ohne hinterlegten Grundsatz wird
    KEINER erfunden. Eine ausgedachte Begruendung waere schlimmer als gar
    keine -- der Fahrer koennte ihr nicht widersprechen, weil sie nichts
    behauptet, wofuer jemand geradesteht.
    """
    if not driver_key:
        return None
    pair = _PRINCIPLES.get(driver_key)
    if pair is None:
        return None
    return pair[0] if locale.startswith("de") else pair[1]
