"""Tests for the LLM user-message builder (coach_prompt.build_user_message)."""
from __future__ import annotations

from app.services.coach_prompt import build_user_message


def _snapshot(power_profile=None, **weekly_progress) -> dict:
    return {
        "language": "technical",
        "athlete": {},
        "pmc": {},
        "biometrics": {},
        "distribution": {},
        "activities_14d": {},
        "why_tired": {},
        "weekly_progress": weekly_progress,
        "power_profile": power_profile,
    }


class TestRecentLoadInPrompt:
    def test_rolling_recent_load_is_surfaced(self):
        """The LLM must see rolling recency load (yesterday / 48h / 7d) so it
        can't frame a Monday as 'fresh' after a hard weekend. The calendar-week
        total resets Monday; the rolling 7d figure does not."""
        msg = build_user_message(
            _snapshot(
                today_tss=0.0,
                yesterday_tss=250.0,
                last_48h_tss=250.0,
                rolling_7d_tss=600.0,
                total_tss_this_week=0.0,
            )
        )
        # Must be surfaced as a dedicated PROSE section (not just buried in the
        # raw-JSON reference fence at the end — the model reasons over prose).
        prose = msg.split("## Raw JSON reference")[0]
        assert "Recent training load" in prose
        assert "250" in prose   # yesterday / 48h
        assert "600" in prose   # rolling 7d
        assert "crosses the week boundary" in prose.lower() or "rolling" in prose.lower()


class TestPowerProfileInPrompt:
    def test_critical_power_surfaced_when_present(self):
        msg = build_user_message(
            _snapshot(power_profile={
                "cp_watts": 236.5, "w_prime_j": 9472.0, "eftp_watts": 239.1,
                "n_rides": 8, "r_squared": 0.98,
            })
        )
        prose = msg.split("## Raw JSON reference")[0]
        assert "Critical Power" in prose
        assert "236" in prose      # CP
        assert "239" in prose      # eFTP

    def test_absent_power_profile_omits_section(self):
        prose = build_user_message(_snapshot(power_profile=None)).split("## Raw JSON reference")[0]
        assert "Critical Power" not in prose
