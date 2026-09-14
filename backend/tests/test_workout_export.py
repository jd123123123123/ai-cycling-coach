"""Tests for workout_export — golden checks against known block sequences.
A regression in any of these breaks importable workouts for end users, so
the assertions are deliberately tight (exact substrings) rather than
structural-only."""
from app.services.workout_export import (
    Block,
    blocks_from_dicts,
    to_erg,
    to_mrc,
    to_zwo,
)


def _sample_blocks() -> list[Block]:
    """Classic 2x20 sweet-spot at FTP=240 — covers warmup, repeated steady
    intervals, recoveries, and cooldown."""
    return [
        Block(name="Warm-up", duration_s=600, watts_low=120, watts_high=180, pct_ftp=0.625),
        Block(name="SST 20min", duration_s=1200, watts_low=216, watts_high=216, pct_ftp=0.90),
        Block(name="Recovery", duration_s=300, watts_low=120, watts_high=120, pct_ftp=0.50),
        Block(name="SST 20min", duration_s=1200, watts_low=216, watts_high=216, pct_ftp=0.90),
        Block(name="Cool-down", duration_s=600, watts_low=150, watts_high=100, pct_ftp=0.52),
    ]


class TestZwo:
    def test_xml_root_and_metadata(self):
        out = to_zwo(
            title="Sweet Spot 2x20",
            description="2x20min @ 90% FTP",
            blocks=_sample_blocks(),
            ftp=240,
            category="sweet_spot",
        )
        assert out.startswith('<?xml version="1.0" encoding="UTF-8"?>')
        assert "<workout_file>" in out
        assert "<author>Frontier Coach</author>" in out
        assert "<name>Sweet Spot 2x20</name>" in out
        assert "<sportType>bike</sportType>" in out
        assert '<tag name="sweet_spot"/>' in out

    def test_warmup_block_emits_powerlow_high(self):
        out = to_zwo(
            title="t", description="d", blocks=_sample_blocks(), ftp=240,
        )
        # Warm-up: 120→180W at FTP 240 = 0.5 → 0.75
        assert '<Warmup Duration="600" PowerLow="0.5" PowerHigh="0.75"/>' in out

    def test_steady_state_uses_single_power(self):
        out = to_zwo(
            title="t", description="d", blocks=_sample_blocks(), ftp=240,
        )
        # 216W @ FTP 240 = 0.9
        assert '<SteadyState Duration="1200" Power="0.9"/>' in out

    def test_cooldown_block(self):
        out = to_zwo(
            title="t", description="d", blocks=_sample_blocks(), ftp=240,
        )
        # 150→100W at FTP 240 = 0.625 → 0.4167
        assert '<Cooldown Duration="600" PowerLow="0.625" PowerHigh="0.4167"/>' in out

    def test_special_characters_escaped(self):
        out = to_zwo(
            title="2x20 <tough>",
            description="A & B",
            blocks=_sample_blocks(),
            ftp=240,
        )
        assert "<name>2x20 &lt;tough&gt;</name>" in out
        assert "<description>A &amp; B</description>" in out


class TestErg:
    def test_header_block_present(self):
        out = to_erg(
            title="Sweet Spot 2x20",
            description="2x20",
            blocks=_sample_blocks(),
            ftp=240,
        )
        assert "[COURSE HEADER]" in out
        assert "MINUTES WATTS" in out
        assert "FTP = 240" in out
        assert "FILE NAME = Sweet Spot 2x20" in out
        assert "[COURSE DATA]" in out
        assert "[END COURSE DATA]" in out

    def test_data_uses_watts(self):
        out = to_erg(
            title="t", description="d", blocks=_sample_blocks(), ftp=240,
        )
        # First block (warmup) emits two points: 0min/120W → 10min/180W
        assert "0.00\t120" in out
        assert "10.00\t180" in out
        # SST steady block: 10min/216W → 30min/216W
        assert "10.00\t216" in out
        assert "30.00\t216" in out

    def test_total_duration_walks_forward(self):
        out = to_erg(
            title="t", description="d", blocks=_sample_blocks(), ftp=240,
        )
        # 10 + 20 + 5 + 20 + 10 = 65 min total
        assert "65.00\t" in out


class TestMrc:
    def test_data_uses_percent(self):
        out = to_mrc(
            title="t", description="d", blocks=_sample_blocks(), ftp=240,
        )
        assert "MINUTES PERCENT" in out
        # 120W @ 240 FTP = 50%
        assert "0.00\t50.0" in out
        # 216W @ 240 FTP = 90%
        assert "10.00\t90.0" in out


class TestFit:
    """FIT is binary, so we test structural invariants via the round-trip
    decoder (fit_tool can read what it wrote). This catches encoding bugs
    without us having to vendor the full FIT spec into assertions."""

    def _decode(self, fit_bytes: bytes):
        from fit_tool.fit_file import FitFile
        return FitFile.from_bytes(fit_bytes)

    def _data_records(self, ff):
        """FIT files alternate Definition + Data records; only data records
        carry a `name`. Filter so the assertions below talk about data only."""
        return [r for r in ff.records if hasattr(r.message, "name") and r.message.name]

    def test_emits_valid_fit_with_workout_messages(self):
        from app.services.workout_export import to_fit
        out = to_fit(
            title="2x20 SST",
            description="ignored — FIT has no description field",
            blocks=_sample_blocks(),
            ftp=240,
        )
        # Magic check: byte 8-11 of every FIT file is ".FIT"
        assert out[8:12] == b".FIT"
        # Round-trip — fit_tool must be able to parse what we wrote
        ff = self._decode(out)
        record_names = {r.message.name for r in self._data_records(ff)}
        assert "file_id" in record_names
        assert "workout" in record_names
        assert "workout_step" in record_names

    def test_step_count_matches_block_count(self):
        from app.services.workout_export import to_fit
        out = to_fit(
            title="t", description="", blocks=_sample_blocks(), ftp=240,
        )
        ff = self._decode(out)
        steps = [r for r in self._data_records(ff) if r.message.name == "workout_step"]
        assert len(steps) == len(_sample_blocks())

    def test_power_encoding_uses_offset_1000(self):
        """Per FIT spec: watts = encoded_value - 1000 when encoded >= 1000.
        216W must come out as 1216 in the file."""
        from app.services.workout_export import to_fit
        out = to_fit(
            title="t", description="", blocks=_sample_blocks(), ftp=240,
        )
        ff = self._decode(out)
        steps = [r for r in self._data_records(ff) if r.message.name == "workout_step"]
        # Second block in _sample_blocks is the SST 216W steady — find it by
        # message_index rather than position to avoid reorder fragility.
        sst = next(s for s in steps if s.message.message_index == 1)
        assert sst.message.custom_target_power_low == 1216
        assert sst.message.custom_target_power_high == 1216
        # Sanity-check ms encoding too: 20min = 1_200_000ms
        assert sst.message.get_field(2).encoded_values[0] == 1_200_000


class TestBlocksFromDicts:
    def test_resolved_block_naming_works(self):
        blocks = blocks_from_dicts([
            {"name": "SST", "duration_s": 1200, "target_watts_low": 216,
             "target_watts_high": 216, "target_pct_ftp": 0.9, "zone": 3, "rpe": 6},
        ])
        assert len(blocks) == 1
        assert blocks[0].duration_s == 1200
        assert blocks[0].watts_low == 216
        assert blocks[0].pct_ftp == 0.9

    def test_internal_naming_works(self):
        blocks = blocks_from_dicts([
            {"name": "X", "duration_s": 60, "watts_low": 100, "watts_high": 100,
             "target_pct_ftp": 0.5},
        ])
        assert blocks[0].watts_low == 100

    def test_skips_non_dict_rows(self):
        blocks = blocks_from_dicts([None, "garbage", {"name": "ok", "duration_s": 60,
                                                      "watts_low": 100, "watts_high": 100}])
        assert len(blocks) == 1
        assert blocks[0].name == "ok"
