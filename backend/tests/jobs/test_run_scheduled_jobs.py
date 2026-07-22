"""Tests for the Railway cron entrypoint — app.jobs.run_scheduled_jobs.

The entrypoint runs the four existing sweeps sequentially, each isolated in its
own try/except, so one failing sweep never blocks the rest and the process always
completes (exits 0). These tests monkeypatch the four sweeps to assert they are
all invoked and that an exception in one does not stop the others.
"""
from __future__ import annotations

from app.jobs import run_scheduled_jobs


async def test_all_four_sweeps_invoked(monkeypatch):
    """All four sweeps are called exactly once during a run."""
    calls: list[str] = []

    async def _make(name):
        async def _sweep():
            calls.append(name)

        return _sweep

    monkeypatch.setattr(run_scheduled_jobs, "run_all_user_syncs", await _make("sync"))
    monkeypatch.setattr(
        run_scheduled_jobs, "run_hourly_plan_adaptation", await _make("adapt")
    )
    monkeypatch.setattr(
        run_scheduled_jobs, "run_brief_refresh_sweep", await _make("brief")
    )
    monkeypatch.setattr(
        run_scheduled_jobs, "run_morning_push_briefs", await _make("push")
    )

    await run_scheduled_jobs.main()

    assert calls.count("sync") == 1
    assert calls.count("adapt") == 1
    assert calls.count("brief") == 1
    assert calls.count("push") == 1


async def test_failing_sweep_does_not_block_others(monkeypatch):
    """A sweep raising an exception is isolated — the remaining sweeps still run
    and main() completes without propagating the error."""
    calls: list[str] = []

    async def _ok(name):
        async def _sweep():
            calls.append(name)

        return _sweep

    async def _boom():
        calls.append("sync")
        raise RuntimeError("sync exploded")

    monkeypatch.setattr(run_scheduled_jobs, "run_all_user_syncs", _boom)
    monkeypatch.setattr(
        run_scheduled_jobs, "run_hourly_plan_adaptation", await _ok("adapt")
    )
    monkeypatch.setattr(run_scheduled_jobs, "run_brief_refresh_sweep", await _ok("brief"))
    monkeypatch.setattr(run_scheduled_jobs, "run_morning_push_briefs", await _ok("push"))

    # Must not raise despite the first sweep exploding.
    await run_scheduled_jobs.main()

    # The failing sweep ran, and so did all the others.
    assert calls == ["sync", "adapt", "brief", "push"]


def test_main_completes_cleanly_under_asyncio_run(monkeypatch):
    """asyncio.run(main()) — the exact call the `__main__` block makes — returns
    None and does not raise, so the script's implicit exit code is 0."""
    import asyncio

    async def _noop():
        return None

    monkeypatch.setattr(run_scheduled_jobs, "run_all_user_syncs", _noop)
    monkeypatch.setattr(run_scheduled_jobs, "run_hourly_plan_adaptation", _noop)
    monkeypatch.setattr(run_scheduled_jobs, "run_brief_refresh_sweep", _noop)
    monkeypatch.setattr(run_scheduled_jobs, "run_morning_push_briefs", _noop)

    assert asyncio.run(run_scheduled_jobs.main()) is None
