"""The instrument that makes the validation study possible.

The audit's central finding was that nothing in the engine has ever been tested
against an outcome — and that study cannot be run on data nobody kept. These
tests pin the properties a study actually depends on.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.services.decision_log import ENGINE_VERSION, build_record
from app.services.hrv_state import estimate_hrv_state


@dataclass
class _Sig:
    evidence: str
    tone: str


@dataclass
class _Directive:
    directive: str = "push"
    intensity_ceiling: str = "hard"
    volume_modifier: float = 1.0
    hrv_state: str = "in"
    signals: list = None


@dataclass
class _Readiness:
    score: int | None = 72
    tier: str | None = "push"


DAY = date(2026, 8, 25)


def _hrv():
    from datetime import timedelta
    rows = [
        (DAY - timedelta(days=a), 50.0 + (2.0 if a % 2 else -2.0))
        for a in range(40)
    ]
    return estimate_hrv_state(rows, today=DAY)


class TestTheRecordCarriesWhatAStudyNeeds:
    def test_records_the_verdict(self):
        r = build_record(
            user_id=1, day=DAY,
            directive=_Directive(directive="escalate", intensity_ceiling="push", volume_modifier=1.12),
            readiness=_Readiness(), hrv=_hrv(),
        )
        assert r["directive"] == "escalate"
        assert r["intensity_ceiling"] == "push"
        assert r["volume_modifier"] == 1.12
        assert r["readiness_score"] == 72

    def test_stamps_the_engine_version(self):
        # A cohort mixing days from different rule sets is not a cohort, and
        # the mixing is invisible after the fact unless stamped at write time.
        r = build_record(user_id=1, day=DAY, directive=None, readiness=None, hrv=None)
        assert r["engine_version"] == ENGINE_VERSION

    def test_stores_both_hrv_verdicts_side_by_side(self):
        # The whole point of §4.2: the convention decides, the variance-correct
        # statistic is recorded next to it, and the disagreement becomes a
        # query rather than an argument.
        r = build_record(user_id=1, day=DAY, directive=_Directive(), readiness=None, hrv=_hrv())
        hrv = r["evidence"]["hrv"]
        assert hrv["state"] in {"below", "in", "above", "unknown"}
        assert hrv["z_mean"] is not None
        assert hrv["se_recent"] is not None

    def test_records_how_much_evidence_there_was(self):
        r = build_record(user_id=1, day=DAY, directive=_Directive(), readiness=None, hrv=_hrv())
        hrv = r["evidence"]["hrv"]
        assert hrv["n_recent"] > 0
        assert hrv["n_baseline"] > 0

    def test_keeps_push_intensity_for_stratification(self):
        # It shifts the escalation boundary, so a study that does not stratify
        # on it confounds preference with physiological response (§7.3).
        r = build_record(user_id=1, day=DAY, directive=_Directive(), readiness=None,
                         hrv=None, push_intensity="aggressive")
        assert r["push_intensity"] == "aggressive"

    def test_records_the_null_model_the_study_must_beat(self):
        # TSB alone is the comparison the multi-signal engine has to win.
        r = build_record(user_id=1, day=DAY, directive=_Directive(), readiness=None,
                         hrv=None, tsb=-12.0, ctl=60.0, atl=72.0)
        load = r["evidence"]["load"]
        assert load["tsb"] == -12.0
        assert load["ctl"] == 60.0
        assert load["acwr"] == 1.2   # descriptive only, but recorded


class TestAPartialRecordIsStillWorthKeeping:
    def test_survives_a_completely_empty_engine_state(self):
        r = build_record(user_id=1, day=DAY, directive=None, readiness=None, hrv=None)
        assert r["user_id"] == 1 and r["date"] == DAY
        assert r["directive"] is None
        assert r["evidence"]["load"]["tsb"] is None

    def test_no_chronic_load_does_not_produce_a_divide_by_zero(self):
        r = build_record(user_id=1, day=DAY, directive=None, readiness=None,
                         hrv=None, ctl=0.0, atl=30.0)
        assert r["evidence"]["load"]["acwr"] is None

    def test_junk_numbers_are_dropped_not_stored(self):
        r = build_record(user_id=1, day=DAY, directive=None, readiness=None,
                         hrv=None, tsb="not a number", sleep_score=float("nan"))
        assert r["evidence"]["load"]["tsb"] is None
        assert r["evidence"]["other"]["sleep_score"] is None


class TestEvidenceTieringSurvivesIntoTheRecord:
    def test_signal_provenance_is_kept(self):
        # The engine's best idea is that it says which claims are RCT-backed
        # and which are opinion. A study should be able to ask whether the
        # RCT-tiered days behaved differently.
        d = _Directive(signals=[_Sig("RCT", "good"), _Sig("expert", "warn")])
        r = build_record(user_id=1, day=DAY, directive=d, readiness=None, hrv=None)
        assert [s["evidence"] for s in r["evidence"]["signals"]] == ["RCT", "expert"]


class TestTheTableMatchesWhatTheRecorderWrites:
    """A record whose keys do not match the table is a silent write failure,
    and `log_decision` swallows its own exceptions by design — so this is the
    only place that mismatch can be caught."""

    def test_every_recorded_field_is_a_real_column(self):
        from app.models.engine_decision import EngineDecision

        columns = {c.name for c in EngineDecision.__table__.columns}
        record = build_record(
            user_id=1, day=DAY, directive=_Directive(), readiness=_Readiness(),
            hrv=_hrv(), tsb=-8.0, ctl=55.0, atl=63.0, push_intensity="balanced",
        )
        assert set(record) <= columns, f"not columns: {set(record) - columns}"

    def test_one_row_per_athlete_day(self):
        from app.models.engine_decision import EngineDecision

        constraints = {
            c.name for c in EngineDecision.__table__.constraints if c.name
        }
        assert "uq_engine_decisions_user_date" in constraints

    def test_evidence_survives_a_json_round_trip(self):
        # It is written to JSONB; anything not JSON-serialisable is a write
        # failure that the best-effort writer would hide.
        import json

        record = build_record(
            user_id=1, day=DAY, directive=_Directive(signals=[_Sig("RCT", "good")]),
            readiness=_Readiness(), hrv=_hrv(), tsb=-8.0, ctl=55.0, atl=63.0,
        )
        assert json.loads(json.dumps(record["evidence"])) == record["evidence"]
